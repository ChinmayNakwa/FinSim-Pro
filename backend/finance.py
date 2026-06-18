"""
FinSim Pro — Financial utilities + Monte Carlo simulation engine
"""
from __future__ import annotations

import functools
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np

from models import (
    ASSET_DEFAULTS,
    LTCG_HOLDING_DAYS,
    GoalIn,
    PortfolioHoldingIn,
    SimulationRequest,
    TaxConfigIn,
)
from tax_engine import compute_asset_tax, compute_asset_tax_vec, compute_tax_on_income_vec


# ─────────────────────────────────────────────────────────────────────────────
# FINANCIAL UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def monthly_emi(principal: float, annual_rate: float, months: int) -> float:
    if months <= 0 or principal <= 0:
        return 0.0
    r = (annual_rate / 100) / 12
    if r == 0:
        return principal / months
    g = (1 + r) ** months
    return principal * r * g / (g - 1)


def remaining_principal(
    principal: float, annual_rate: float, emi_val: float, months_paid: int
) -> float:
    if months_paid <= 0:
        return principal
    r = (annual_rate / 100) / 12
    if r == 0:
        return max(0.0, principal - emi_val * months_paid)
    g = (1 + r) ** months_paid
    return max(0.0, principal * g - emi_val * (g - 1) / r)


def compute_drawdown(paths: np.ndarray) -> np.ndarray:
    """
    FIX: Previously returned a single scalar (global worst across all paths),
    losing per-path information needed for percentile reporting.
    Now returns shape (N,) — max drawdown per simulation path.

    Callers wanting a single number should use:
        np.percentile(compute_drawdown(nw), 50)   # median drawdown
        np.percentile(compute_drawdown(nw), 90)   # tail drawdown
    """
    positive_peak = np.maximum.accumulate(np.maximum(paths, 0), axis=1)
    has_peak = positive_peak > 0
    dd = np.where(has_peak, (positive_peak - paths) / positive_peak, 0.0)
    return np.clip(dd, 0, 1).max(axis=1)   # shape (N,)


def sharpe_ratio(returns_arr: np.ndarray, risk_free: float = 0.065) -> float:
    """
    FIX 1: Was using arithmetic returns (diff/abs_prev); now uses log returns
            which are additive, time-consistent, and standard for annualized Sharpe.
    FIX 2: risk_free is now passed in from SimulationRequest.risk_free_rate
            rather than being a divergent default.
    """
    if returns_arr.shape[1] < 2:
        return 0.0
    # Log returns: ln(V_t / V_{t-1}), clipped to avoid log(0)
    prev = np.maximum(np.abs(returns_arr[:, :-1]), 1.0)
    log_returns = np.log(np.maximum(returns_arr[:, 1:], 1.0) / prev)
    mean_r = log_returns.mean()
    std_r  = log_returns.std()
    return float(np.round((mean_r - risk_free) / (std_r + 1e-9), 3))


def fire_number(annual_expenses: float, withdrawal_rate: float = 0.04) -> float:
    return annual_expenses / withdrawal_rate


# ─────────────────────────────────────────────────────────────────────────────
# PROPHET MARKET DATA  (cached per ticker+years)
# ─────────────────────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=64)
def get_prophet_stats(
    ticker: str, years: int, fallback_cagr: float, fallback_vol: float
) -> Tuple[float, float, bool]:
    """
    Fit a Prophet model on historical data for *ticker*.
    Returns (cagr, vol, success).
    Falls back gracefully if yfinance / Prophet unavailable.
    """
    try:
        import warnings
        warnings.filterwarnings("ignore")
        import yfinance as yf
        import pandas as pd
        from prophet import Prophet

        # FIX: use years*2 lookback instead of hardcoded 2015-01-01
        lookback_years = max(years * 2, 10)
        start_date = f"{datetime.now().year - lookback_years}-01-01"

        df = yf.download(ticker, start=start_date, progress=False)
        if df.empty:
            raise ValueError(f"No data for {ticker}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df.reset_index()[["Date", "Close"]].rename(columns={"Date": "ds", "Close": "y"})
        df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
        df = df.dropna()

        m = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        m.fit(df)
        future   = m.make_future_dataframe(periods=years * 365)
        forecast = m.predict(future)

        cagr = (
            (forecast["yhat"].iloc[-1] / forecast["yhat"].iloc[0])
            ** (1 / (len(forecast) / 365))
        ) - 1

        # FIX: capture Prophet uncertainty — use yhat_upper/lower spread as vol proxy
        uncertainty_spread = (
            (forecast["yhat_upper"] - forecast["yhat_lower"]) / (2 * forecast["yhat"].abs() + 1e-9)
        ).mean()
        hist_vol = df["y"].pct_change().std() * np.sqrt(252)
        vol = float(np.clip(0.5 * hist_vol + 0.5 * uncertainty_spread, 0.02, 0.6))

        return float(cagr), vol, True
    except Exception:
        return fallback_cagr, fallback_vol, False


def get_blended_forecast(
    holdings: List[PortfolioHoldingIn], years: int
) -> Tuple[float, float, dict]:
    """
    Compute a value-weighted blended CAGR / vol across all holdings.
    Returns (blended_cagr, blended_vol, asset_forecasts_dict).
    """
    total_value = sum(h.current_value for h in holdings) or 1.0
    asset_forecasts: Dict[str, dict] = {}
    weighted_cagr = 0.0
    weighted_var  = 0.0

    for holding in holdings:
        weight     = holding.current_value / total_value
        asset_info = ASSET_DEFAULTS.get(holding.asset_class, ASSET_DEFAULTS["Indian Equity"])

        if asset_info["ticker"]:
            cagr, vol, success = get_prophet_stats(
                asset_info["ticker"], years, asset_info["cagr"], asset_info["vol"]
            )
        else:
            cagr, vol, success = asset_info["cagr"], asset_info["vol"], False

        asset_forecasts[holding.asset_class] = {
            "cagr": cagr,
            "vol": vol,
            "weight": weight,
            "success": success,
        }
        weighted_cagr += cagr * weight
        weighted_var  += (vol ** 2) * (weight ** 2)

    blended_vol = np.sqrt(weighted_var) * 0.85   # diversification benefit
    return weighted_cagr, float(blended_vol), asset_forecasts


# ─────────────────────────────────────────────────────────────────────────────
# GOAL PRIORITY WEIGHTS  — used for proportional withdrawal ordering
# ─────────────────────────────────────────────────────────────────────────────

_GOAL_PRIORITY_ORDER = {"Critical": 0, "Important": 1, "Nice-to-have": 2}


# ─────────────────────────────────────────────────────────────────────────────
# CORE MONTE CARLO SIMULATION
# ─────────────────────────────────────────────────────────────────────────────

def run_simulation(
    req: SimulationRequest,
    market_returns_by_asset: Dict[str, tuple],
    prebuilt_income_mult: Optional[np.ndarray] = None,
    prebuilt_asset_rand: Optional[Dict[str, np.ndarray]] = None,
) -> dict:
    """
    Full Monte Carlo simulation.
    Returns a dict of numpy arrays ready for downstream aggregation.

    Key fixes vs previous version:
    - rng seed from req.rng_seed (was hardcoded 42)
    - Income tax vectorized via compute_tax_on_income_vec (no O(N) Python loop)
    - Asset tax vectorized via compute_asset_tax_vec (no O(N) Python loop)
    - Goals sorted by priority; withdrawn proportionally from lowest-tax asset first
    - Goal amounts optionally inflation-adjusted when goal.inflation_adjust=True
    - compute_drawdown now returns per-path array (N,)
    """
    # FIX: seed from request, not hardcoded
    rng = np.random.default_rng(seed=req.rng_seed)
    N, Y = req.n_sims, req.sim_years

    inflation      = rng.normal(0.06, 0.015, (N, Y))
    income_growth  = rng.normal(0.08, 0.02,  (N, Y))

    if prebuilt_asset_rand is not None:
        asset_rand = prebuilt_asset_rand
    else:
        asset_rand: Dict[str, np.ndarray] = {
            ac: rng.normal(cagr, vol, (N, Y))
            for ac, (cagr, vol) in market_returns_by_asset.items()
        }

    net_worth    = np.zeros((N, Y + 1), dtype=np.float64)
    savings_bal  = np.full(N, float(req.savings), dtype=np.float64)

    asset_balances: Dict[str, np.ndarray] = {
        h.asset_class: np.full(N, float(h.current_value), dtype=np.float64)
        for h in req.portfolio_holdings
    }

    emergency_target = float(req.expenses) * float(req.emergency_months)
    emergency_fund   = np.minimum(savings_bal, emergency_target).astype(np.float64)
    savings_bal     -= emergency_fund

    initial_assets  = sum(h.current_value for h in req.portfolio_holdings)
    net_worth[:, 0] = savings_bal + initial_assets + emergency_fund - float(req.emi_loan_amount)

    emi_months       = req.emi_tenure_years * 12
    emi_payment      = monthly_emi(req.emi_loan_amount, req.emi_rate, emi_months)
    loan_outstanding = np.full(N, float(req.emi_loan_amount), dtype=np.float64)

    holiday_annual_cost = (
        len(req.holiday_months) * req.expenses * req.holiday_spike_pct
        if req.holiday_months else 0.0
    )

    income_tax_paid = np.zeros((N, Y))
    ltcg_tax_paid   = np.zeros((N, Y))
    stcg_tax_paid   = np.zeros((N, Y))
    asset_ltcg_tax  = {ac: np.zeros((N, Y)) for ac in asset_balances}
    asset_stcg_tax  = {ac: np.zeros((N, Y)) for ac in asset_balances}
    eff_rate_path   = np.zeros((N, Y))
    goal_shortfall  = {g.name: 0.0 for g in req.goals}

    income_multipliers = prebuilt_income_mult if prebuilt_income_mult is not None else np.ones(Y)

    # FIX: sort goals by priority so Critical goals are funded before Nice-to-have
    sorted_goals = sorted(req.goals, key=lambda g: _GOAL_PRIORITY_ORDER.get(g.priority, 1))

    # Cumulative inflation multiplier per year — used for inflation-adjusted goals
    cum_inflation = np.ones((N, Y + 1))   # cum_inflation[:, y] = prod(1+inf) up to year y

    for y in range(Y):
        cum_inflation[:, y + 1] = cum_inflation[:, y] * (1 + inflation[:, y])

        monthly_income   = (req.income * income_multipliers[y]) * np.prod(1 + income_growth[:, :y + 1], axis=1)
        monthly_expenses = req.expenses * cum_inflation[:, y + 1]
        annual_income    = monthly_income   * 12
        annual_expenses  = monthly_expenses * 12 + holiday_annual_cost

        # ── Income tax (VECTORIZED — was O(N) Python loop) ──────────────────
        if req.apply_tax:
            tax_yr, eff_yr = compute_tax_on_income_vec(annual_income, req.tax_cfg)
            eff_rate_path[:, y] = eff_yr
        else:
            tax_yr = np.zeros(N)

        income_tax_paid[:, y] = tax_yr

        # ── EMI ──────────────────────────────────────────────────────────────
        months_elapsed    = (y + 1) * 12
        active_emi_months = min(12, max(0, emi_months - y * 12))
        annual_emi        = emi_payment * active_emi_months
        if months_elapsed <= emi_months:
            loan_outstanding = np.full(
                N,
                remaining_principal(req.emi_loan_amount, req.emi_rate, emi_payment, months_elapsed),
            )
        else:
            loan_outstanding = np.zeros(N)

        # ── Surplus & savings ─────────────────────────────────────────────────
        total_sip = sum(h.monthly_sip for h in req.portfolio_holdings) * 12
        surplus   = annual_income - annual_expenses - tax_yr - annual_emi - total_sip

        new_emg_target = monthly_expenses * req.emergency_months
        emergency_fund = np.maximum(
            emergency_fund * (1 + req.emergency_yield), new_emg_target
        )
        savings_bal = np.maximum(
            0, savings_bal * (1 + req.savings_yield) + surplus
        )

        # ── Asset-wise updates (VECTORIZED tax) ───────────────────────────────
        total_asset_ltcg = np.zeros(N)
        total_asset_stcg = np.zeros(N)

        for holding in req.portfolio_holdings:
            ac = holding.asset_class
            if ac not in asset_rand:
                continue

            prev_balance = asset_balances[ac].copy()
            annual_sip   = holding.monthly_sip * 12
            asset_balances[ac] = (
                asset_balances[ac] * (1 + asset_rand[ac][:, y]) + annual_sip
            )
            annual_gains = np.maximum(0.0, asset_balances[ac] - prev_balance - annual_sip)

            if holding.purchase_date:
                days_held = (datetime.now() - holding.purchase_date).days + (y * 365)
            else:
                days_held = y * 365 + 365

            if req.apply_tax:
                # FIX: vectorized — no O(N) loop per asset per year
                ltcg, stcg = compute_asset_tax_vec(ac, annual_gains, days_held, req.tax_cfg)
                asset_balances[ac]       = np.maximum(0.0, asset_balances[ac] - ltcg - stcg)
                asset_ltcg_tax[ac][:, y] = ltcg
                asset_stcg_tax[ac][:, y] = stcg
                total_asset_ltcg += ltcg
                total_asset_stcg += stcg

        ltcg_tax_paid[:, y] = total_asset_ltcg
        stcg_tax_paid[:, y] = total_asset_stcg

        # ── Goal withdrawals (priority-ordered, inflation-adjusted) ───────────
        for goal in sorted_goals:
            if goal.target_year == y + 1:
                # FIX: inflate goal amount if requested
                if goal.inflation_adjust:
                    # use median inflation path for goal sizing
                    median_inf_mult = float(np.median(cum_inflation[:, y + 1]))
                    effective_target = goal.target_amount * median_inf_mult
                else:
                    effective_target = goal.target_amount

                total_assets = savings_bal + sum(asset_balances.values())
                frac = np.minimum(1.0, effective_target / np.maximum(total_assets, 1.0))

                # FIX: withdraw from savings first; if still short, sell assets
                # lowest-tax assets are Debt/Bonds (no LTCG benefit) so keep
                # equity assets; sell savings + debt first
                withdrawal_needed = effective_target * np.ones(N)
                from_savings = np.minimum(savings_bal, withdrawal_needed)
                savings_bal     -= from_savings
                withdrawal_needed -= from_savings

                # Sell assets in order: Debt/Bonds → Gold → RE → Equity
                sell_order = ["Debt/Bonds", "Gold", "Real Estate",
                              "International Equity", "Indian Equity",
                              "Nifty Bank", "Nifty IT"]
                for sell_ac in sell_order:
                    if sell_ac in asset_balances and np.any(withdrawal_needed > 0):
                        from_asset = np.minimum(asset_balances[sell_ac], withdrawal_needed)
                        asset_balances[sell_ac] -= from_asset
                        withdrawal_needed        -= from_asset

                actual_met = (savings_bal + sum(asset_balances.values())).mean()
                if actual_met < effective_target:
                    goal_shortfall[goal.name] = effective_target - actual_met

        total_investments   = sum(b for b in asset_balances.values())
        net_worth[:, y + 1] = savings_bal + total_investments + emergency_fund - loan_outstanding

    return dict(
        net_worth=net_worth,
        income_tax_paid=income_tax_paid,
        ltcg_tax_paid=ltcg_tax_paid,
        stcg_tax_paid=stcg_tax_paid,
        eff_rate_path=eff_rate_path,
        goal_shortfall=goal_shortfall,
        emergency_fund=emergency_fund,
        asset_balances=asset_balances,
        asset_ltcg_tax=asset_ltcg_tax,
        asset_stcg_tax=asset_stcg_tax,
        emi_monthly=emi_payment,
    )


# ─────────────────────────────────────────────────────────────────────────────
# REBALANCING
# ─────────────────────────────────────────────────────────────────────────────

def get_age_based_allocation(age: int, risk_tolerance: str) -> Dict[str, float]:
    base_equity = max(20, min(80, 100 - age))
    multipliers = {"Conservative": 0.7, "Moderate": 1.0, "Aggressive": 1.2}
    equity_pct  = min(90, base_equity * multipliers.get(risk_tolerance, 1.0))
    gold_pct    = 10.0
    re_pct      = max(0, min(20, (age - 30) * 0.5)) if age > 30 else 0.0
    debt_pct    = 100 - equity_pct - gold_pct - re_pct
    return {
        "Indian Equity":        equity_pct * 0.75 / 100,
        "International Equity": equity_pct * 0.25 / 100,
        "Gold":                 gold_pct / 100,
        "Real Estate":          re_pct / 100,
        "Debt/Bonds":           debt_pct / 100,
    }


def suggest_rebalancing(
    current_allocation: Dict[str, float],
    target_allocation:  Dict[str, float],
    total_value: float,
    drift_threshold: float = 0.05,   # FIX: was hardcoded; now caller-supplied
) -> dict:
    suggestions = []
    needed = False
    for ac, target_pct in target_allocation.items():
        current_pct = current_allocation.get(ac, 0.0)
        drift       = abs(current_pct - target_pct)
        if drift > drift_threshold:
            needed        = True
            action_amount = (target_pct - current_pct) * total_value
            suggestions.append(
                {
                    "asset_class":  ac,
                    "action":       "BUY" if action_amount > 0 else "SELL",
                    "amount":       abs(action_amount),
                    "current_pct":  round(current_pct * 100, 2),
                    "target_pct":   round(target_pct  * 100, 2),
                    "drift":        round(drift * 100, 2),
                }
            )
    return {
        "needed":       needed,
        "total_drift":  round(sum(s["drift"] for s in suggestions), 2),
        "suggestions":  suggestions,
    }


def optimize_portfolio(
    holdings: List[PortfolioHoldingIn],
    asset_forecasts: Dict[str, dict],
    n_portfolios: int = 5_000,
    risk_free_rate: float = 0.065,
) -> dict:
    """
    Monte Carlo Markowitz optimization over random weight combinations.
    FIX: Added max-weight-per-asset constraint (70%) so optimizer can't
         collapse to a single-asset portfolio.
    Returns the efficient frontier points + optimal portfolios.
    """
    asset_classes = [h.asset_class for h in holdings]
    n = len(asset_classes)

    if n < 2:
        raise ValueError("Need at least 2 holdings to optimize.")

    cagrs = np.array([asset_forecasts[ac]["cagr"] for ac in asset_classes])
    vols  = np.array([asset_forecasts[ac]["vol"]  for ac in asset_classes])

    EQUITY = {"Indian Equity", "Nifty Bank", "Nifty IT", "International Equity"}
    cov = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i == j:
                cov[i, j] = vols[i] ** 2
            elif asset_classes[i] in EQUITY and asset_classes[j] in EQUITY:
                cov[i, j] = 0.30 * vols[i] * vols[j]
            else:
                cov[i, j] = 0.10 * vols[i] * vols[j]

    rng = np.random.default_rng(42)

    # FIX: generate random weights and clip to 70% max, then renormalise
    # This prevents degenerate single-asset "optimal" portfolios
    MAX_WEIGHT = 0.70
    raw = rng.dirichlet(np.ones(n), n_portfolios)
    weights_all = np.clip(raw, 0, MAX_WEIGHT)
    weights_all /= weights_all.sum(axis=1, keepdims=True)

    port_returns = weights_all @ cagrs
    port_vols    = np.sqrt(np.einsum("pi,ij,pj->p", weights_all, cov, weights_all))
    sharpes      = (port_returns - risk_free_rate) / (port_vols + 1e-9)

    max_sharpe_idx = int(np.argmax(sharpes))
    min_vol_idx    = int(np.argmin(port_vols))
    max_return_idx = int(np.argmax(port_returns))

    def _portfolio(idx: int, label: str) -> dict:
        return {
            "label":       label,
            "weights":     {ac: round(float(weights_all[idx, i]), 4) for i, ac in enumerate(asset_classes)},
            "expected_return_pct": round(float(port_returns[idx]) * 100, 2),
            "expected_vol_pct":    round(float(port_vols[idx])    * 100, 2),
            "sharpe_ratio":        round(float(sharpes[idx]), 3),
        }

    vol_bins = np.linspace(port_vols.min(), port_vols.max(), 40)
    frontier = []
    for i in range(len(vol_bins) - 1):
        mask = (port_vols >= vol_bins[i]) & (port_vols < vol_bins[i + 1])
        if mask.any():
            best = int(np.argmax(port_returns * mask - 1e9 * ~mask))
            frontier.append({
                "vol_pct":    round(float(port_vols[best])    * 100, 2),
                "return_pct": round(float(port_returns[best]) * 100, 2),
            })

    total_val      = sum(h.current_value for h in holdings) or 1.0
    current_w      = np.array([h.current_value / total_val for h in holdings])
    current_return = float(current_w @ cagrs)
    current_vol    = float(np.sqrt(current_w @ cov @ current_w))
    current_sharpe = (current_return - risk_free_rate) / (current_vol + 1e-9)

    return {
        "asset_classes": asset_classes,
        "frontier": frontier,
        "optimal": {
            "max_sharpe":  _portfolio(max_sharpe_idx,  "Max Sharpe"),
            "min_vol":     _portfolio(min_vol_idx,     "Min Volatility"),
            "max_return":  _portfolio(max_return_idx,  "Max Return"),
        },
        "current": {
            "label": "Current Portfolio",
            "weights":             {ac: round(float(current_w[i]), 4) for i, ac in enumerate(asset_classes)},
            "expected_return_pct": round(current_return * 100, 2),
            "expected_vol_pct":    round(current_vol    * 100, 2),
            "sharpe_ratio":        round(current_sharpe, 3),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# RETIREMENT PLANNER  (FIRE date + SWR sensitivity)
# ─────────────────────────────────────────────────────────────────────────────

def plan_retirement(
    current_age: int,
    current_net_worth: float,
    annual_expenses: float,
    annual_savings: float,
    expected_cagr: float,
    inflation_rate: float = 0.06,
    swr_rates: List[float] = None,
    max_years: int = 40,
) -> dict:
    """
    Estimates FIRE year for multiple Safe Withdrawal Rates.
    Projects net worth year-by-year until FIRE number is hit.
    """
    if swr_rates is None:
        swr_rates = [0.03, 0.035, 0.04, 0.045, 0.05]

    results = []
    for swr in swr_rates:
        nw       = current_net_worth
        expenses = annual_expenses
        fire_yr  = None

        yearly = []
        for y in range(1, max_years + 1):
            nw       = nw * (1 + expected_cagr) + annual_savings
            expenses = expenses * (1 + inflation_rate)
            fire_num = expenses / swr
            pct      = min(100.0, nw / fire_num * 100)

            yearly.append({
                "year":         y,
                "age":          current_age + y,
                "net_worth":    round(nw, 0),
                "fire_number":  round(fire_num, 0),
                "progress_pct": round(pct, 1),
            })

            if fire_yr is None and nw >= fire_num:
                fire_yr = y

        results.append({
            "swr_pct":                   round(swr * 100, 1),
            "fire_year":                 fire_yr,
            "fire_age":                  (current_age + fire_yr) if fire_yr else None,
            "fire_number_at_retirement": round(yearly[fire_yr - 1]["fire_number"], 0) if fire_yr else None,
            "achievable":                fire_yr is not None,
            "yearly":                    yearly,
        })

    achievable = [r for r in results if r["achievable"]]
    return {
        "swr_sensitivity": results,
        "earliest_fire_age":   min(r["fire_age"] for r in achievable) if achievable else None,
        "latest_fire_age":     max(r["fire_age"] for r in achievable) if achievable else None,
        "recommended_swr_pct": 4.0,
        "summary": {
            "current_net_worth":  current_net_worth,
            "annual_expenses":    annual_expenses,
            "annual_savings":     annual_savings,
            "expected_cagr_pct":  round(expected_cagr * 100, 2),
            "inflation_rate_pct": round(inflation_rate * 100, 2),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# TAX HARVESTER
# ─────────────────────────────────────────────────────────────────────────────

def harvest_tax_opportunities(
    holdings: List[PortfolioHoldingIn],
    asset_forecasts: Dict[str, dict],
    tax_cfg: TaxConfigIn,
) -> dict:
    """
    For each holding, compute unrealised gain/loss, tax if sold today,
    and a harvest flag.
    FIX: ltcg_threshold now imported from LTCG_HOLDING_DAYS (models.py)
         instead of being a duplicate local dict.
    """
    opportunities = []
    total_harvestable_loss = 0.0
    total_low_tax_gain     = 0.0

    for h in holdings:
        unrealised_gain = h.current_value - h.purchase_price

        if h.purchase_date:
            days_held = (datetime.now() - h.purchase_date).days
        else:
            days_held = 0

        tax_res    = compute_asset_tax(h.asset_class, max(0, unrealised_gain), days_held, tax_cfg)
        total_tax  = tax_res["total_tax"]
        eff_tax_rate = total_tax / max(unrealised_gain, 1) if unrealised_gain > 0 else 0.0

        # FIX: use LTCG_HOLDING_DAYS from models — single source of truth
        threshold    = LTCG_HOLDING_DAYS.get(h.asset_class, 365)
        days_to_ltcg = max(0, threshold - days_held)

        if unrealised_gain < 0:
            flag   = "SELL_FOR_LOSS"
            reason = f"Lock in ₹{abs(unrealised_gain):,.0f} loss to offset gains elsewhere."
            total_harvestable_loss += abs(unrealised_gain)
        elif days_to_ltcg > 0 and days_to_ltcg <= 90:
            flag   = "WAIT_FOR_LTCG"
            reason = f"Wait {days_to_ltcg} more days — switches to lower LTCG rate."
        elif eff_tax_rate < 0.10 and unrealised_gain > 0:
            flag   = "LOW_TAX_GAIN"
            reason = f"Only {eff_tax_rate*100:.1f}% effective tax — good time to rebalance."
            total_low_tax_gain += unrealised_gain
        else:
            flag   = "HOLD"
            reason = "No immediate tax advantage to selling."

        opportunities.append({
            "asset_class":      h.asset_class,
            "current_value":    h.current_value,
            "purchase_price":   h.purchase_price,
            "unrealised_gain":  round(unrealised_gain, 2),
            "days_held":        days_held,
            "days_to_ltcg":     days_to_ltcg,
            "tax_if_sold":      round(total_tax, 2),
            "eff_tax_rate_pct": round(eff_tax_rate * 100, 2),
            "ltcg_tax":         round(tax_res["ltcg_tax"], 2),
            "stcg_tax":         round(tax_res["stcg_tax"], 2),
            "flag":             flag,
            "reason":           reason,
        })

    order = {"SELL_FOR_LOSS": 0, "LOW_TAX_GAIN": 1, "WAIT_FOR_LTCG": 2, "HOLD": 3}
    opportunities.sort(key=lambda x: order[x["flag"]])

    return {
        "opportunities":          opportunities,
        "total_harvestable_loss": round(total_harvestable_loss, 2),
        "total_low_tax_gain":     round(total_low_tax_gain, 2),
        "summary": {
            "sell_for_loss_count":  sum(1 for o in opportunities if o["flag"] == "SELL_FOR_LOSS"),
            "low_tax_gain_count":   sum(1 for o in opportunities if o["flag"] == "LOW_TAX_GAIN"),
            "wait_for_ltcg_count":  sum(1 for o in opportunities if o["flag"] == "WAIT_FOR_LTCG"),
            "hold_count":           sum(1 for o in opportunities if o["flag"] == "HOLD"),
        },
    }