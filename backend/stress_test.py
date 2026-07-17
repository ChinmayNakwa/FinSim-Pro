"""
FinSim Pro — Stress Testing Engine
Injects macro shocks into Monte Carlo paths and compares against baseline.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import numpy as np

from models import SimulationRequest
from finance import run_simulation, compute_drawdown, sharpe_ratio


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO DEFINITIONS
# ─────────────────────────────────────────────────────────────────────────────

# Mapping of how different asset categories react to a "Market Shock"
# 1.0 = Full impact, 0.3 = 30% of the equity crash impact, etc.
ASSET_SENSITIVITY = {
    "Indian Equity": 1.0,
    "Nifty Bank": 1.2,      # Financials usually crash harder
    "Nifty IT": 1.1,
    "International Equity": 0.9,
    "Real Estate": 0.4,     # RE is slower to react/crash
    "Gold": -0.2,           # Gold often moves inversely to crashes (Safe Haven)
    "Debt/Bonds": 0.1,      # Low sensitivity
}

SCENARIOS: Dict[str, dict] = {
    "market_crash_2008": {
        "label": "2008 Global Financial Crisis",
        "description": "Equity markets collapse ~45%. 3-year recovery cycle.",
        "equity_shock_pct": -0.45,
        "shock_duration_years": 1,
        "recovery_years": 3,
        "inflation_delta": +0.02,
        "income_growth_delta": -0.04,
    },
    "covid_2020": {
        "label": "COVID-19 Market Crash",
        "description": "Sharp ~35% equity drop with fast V-shaped recovery.",
        "equity_shock_pct": -0.35,
        "shock_duration_years": 1,
        "recovery_years": 1,
        "inflation_delta": +0.01,
        "income_growth_delta": -0.03,
    },
    "income_loss": {
        "label": "Job Loss / Income Disruption",
        "description": "95% income loss for 1 year, followed by 70% recovery in year 2.",
        "equity_shock_pct": -0.05, # Minor market dip
        "shock_duration_years": 1,
        "recovery_years": 1,
        "inflation_delta": 0.0,
        "income_growth_delta": -1.0, 
    },
    "stagflation": {
        "label": "Stagflation",
        "description": "High inflation (~12%) with stagnant income growth (~2%) for 3 years.",
        "equity_shock_pct": -0.15,
        "shock_duration_years": 3,
        "recovery_years": 2,
        "inflation_delta": +0.06,      
        "income_growth_delta": -0.06,  
    },
    "rate_hike_cycle": {
        "label": "Aggressive Rate Hike Cycle",
        "description": "RBI-style hikes crush debt/RE valuations, equity corrects ~20%.",
        "equity_shock_pct": -0.20,
        "shock_duration_years": 2,
        "recovery_years": 2,
        "inflation_delta": +0.03,
        "income_growth_delta": -0.02,
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# CORE ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def _apply_shock(
    baseline_asset_rand: Dict[str, np.ndarray],
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    scenario: dict,
    shock_year: int,
    sim_years: int,
) -> Dict[str, np.ndarray]:
    """
    Derive shocked return matrices *from the baseline's own random draws* so
    that the baseline and shocked simulations share Common Random Numbers.

    Previously this drew a fresh ``default_rng(42)`` sequence which did NOT
    match the baseline (baseline draws inflation + income_growth *before* its
    asset returns, so the underlying normals differ). That contaminated every
    reported delta with RNG noise. By copying the baseline draws and only
    overwriting the shock/recovery years, every non-shock year is now
    byte-for-byte identical between the two runs — the delta reflects the
    shock alone.

    Shock/recovery years reuse the baseline's per-path noise (re-centred, and
    amplified 1.5x during the shock to model a volatility spike).
    """
    shock_dur = scenario["shock_duration_years"]
    rec_years = scenario["recovery_years"]
    eq_shock  = scenario["equity_shock_pct"]

    shocked: Dict[str, np.ndarray] = {
        ac: arr.copy() for ac, arr in baseline_asset_rand.items()
    }

    for ac, (cagr, vol) in market_returns_by_asset.items():
        if ac not in shocked:
            continue
        noise = baseline_asset_rand[ac] - cagr   # baseline per-(path,year) shock
        sensitivity = ASSET_SENSITIVITY.get(ac, 0.5)
        asset_shock = eq_shock * sensitivity

        # Shock years: collapse the mean to the shock level, amplify the vol.
        for d in range(shock_dur):
            yr = shock_year + d
            if yr < sim_years:
                shocked[ac][:, yr] = asset_shock + noise[:, yr] * 1.5

        # Recovery years: mean-revert with a decaying boost, keep baseline noise.
        for r in range(rec_years):
            yr = shock_year + shock_dur + r
            if yr < sim_years:
                recovery_boost = -asset_shock * (0.5 / (r + 1))
                shocked[ac][:, yr] = (cagr + recovery_boost) + noise[:, yr]

    return shocked


def run_stress_test(
    req: SimulationRequest,
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    scenario_key: str,
    shock_year: int = 3,
    custom_scenario: Optional[dict] = None,
    baseline_sim: Optional[dict] = None,
) -> dict:
    """
    Run baseline + shocked simulation for a given scenario.

    ``baseline_sim`` may be supplied by callers (e.g. ``run_all_scenarios``)
    to avoid recomputing the identical baseline for every scenario.
    """
    if scenario_key == "custom":
        scenario = custom_scenario or SCENARIOS["market_crash_2008"]
    else:
        scenario = SCENARIOS.get(scenario_key, SCENARIOS["market_crash_2008"])

    N, Y = req.n_sims, req.sim_years

    # 1. Baseline (no shock) — compute once, reuse if provided.
    if baseline_sim is None:
        baseline_sim = run_simulation(req, market_returns_by_asset)
    baseline_nw  = baseline_sim["net_worth"]

    # 2. Build shocked returns from the baseline draws (CRN-preserving).
    shocked_returns = _apply_shock(
        baseline_sim["asset_rand"], market_returns_by_asset, scenario, shock_year, Y
    )

    # 3. Setup Income Multipliers (Temporary disruption)
    income_mults = np.ones(Y)
    if scenario_key == "income_loss" or scenario.get("income_growth_delta", 0) <= -0.5:
        income_mults[shock_year] = 0.05        # 95% loss
        if shock_year + 1 < Y:
            income_mults[shock_year + 1] = 0.70 # Partial recovery

    # 4. Run Shocked Simulation
    shocked_sim = run_simulation(
        req, 
        market_returns_by_asset, 
        prebuilt_income_mult=income_mults, 
        prebuilt_asset_rand=shocked_returns
    )
    shocked_nw  = shocked_sim["net_worth"]

    # ── Analytics ──
    def pct_paths(nw):
        return {
            "p10": np.percentile(nw, 10, axis=0).tolist(),
            "p50": np.percentile(nw, 50, axis=0).tolist(),
            "p90": np.percentile(nw, 90, axis=0).tolist(),
        }

    base_paths    = pct_paths(baseline_nw)
    shocked_paths = pct_paths(shocked_nw)

    # Recovery Year: First year shocked median >= baseline median
    recovery_year = None
    # Portfolio value before crash
    pre_crash_level = shocked_paths["p50"][max(shock_year - 1, 0)]

    for y in range(shock_year, Y + 1):
        if shocked_paths["p50"][y] >= pre_crash_level:
            recovery_year = y
            break

    # Metrics
    # compute_drawdown now returns per-path (N,) array — take p50 for a
    # representative scalar, matching how main.py now handles this
    base_dd    = float(np.percentile(compute_drawdown(baseline_nw), 50))
    shocked_dd = float(np.percentile(compute_drawdown(shocked_nw),  50))
    base_sharpe    = sharpe_ratio(baseline_nw, req.risk_free_rate)
    shocked_sharpe = sharpe_ratio(shocked_nw,  req.risk_free_rate)
    
    # Headline loss = the WORST dip of the shocked median vs baseline over the
    # whole horizon (the trough), not the terminal difference. For high-income
    # profiles the shock fully recovers by the final year, so a terminal metric
    # reads ~0% for every scenario and makes them look identical — the trough is
    # what actually distinguishes a 45% crash from a job loss.
    base_arr   = np.asarray(base_paths["p50"], dtype=np.float64)
    shocked_arr = np.asarray(shocked_paths["p50"], dtype=np.float64)
    dev_pct    = (shocked_arr - base_arr) / np.maximum(np.abs(base_arr), 1.0) * 100
    trough_idx = int(np.argmin(dev_pct))
    median_loss_pct = float(dev_pct[trough_idx])   # most-negative deviation
    trough_year     = trough_idx

    # Probability the shock pushes net worth below its pre-shock level at the
    # trough year — a meaningful "did the shock actually hurt" gauge (the old
    # terminal < 0 test was ~0% for anyone with strong income).
    pre_shock_nw   = np.percentile(shocked_nw[:, max(shock_year - 1, 0)], 50)
    prob_below_pct = float(np.mean(shocked_nw[:, trough_idx] < pre_shock_nw) * 100)

    return {
        "scenario_key":   scenario_key,
        "scenario_label": scenario.get("label", scenario_key),
        "scenario_desc":  scenario.get("description", ""),
        "shock_year":     shock_year,
        "recovery_year":  recovery_year,
        "years_to_recover": (recovery_year - shock_year) if recovery_year else None,
        "trough_year":    trough_year,
        "baseline": base_paths,
        "shocked":  shocked_paths,
        "delta_p50": [s - b for s, b in zip(shocked_paths["p50"], base_paths["p50"])],
        "metrics": {
            "base_drawdown":       round(base_dd * 100, 2),
            "shocked_drawdown":    round(shocked_dd * 100, 2),
            "drawdown_delta":      round((shocked_dd - base_dd) * 100, 2),
            "base_sharpe":         base_sharpe,
            "shocked_sharpe":      shocked_sharpe,
            "sharpe_delta":        round(shocked_sharpe - base_sharpe, 3),
            "median_nw_loss_pct":  round(median_loss_pct, 2),
            "prob_negative_pct":   round(prob_below_pct, 2),
        },
        "scenario_params": scenario,
    }

def run_all_scenarios(req, market_returns_by_asset, shock_year=3):
    # Baseline is identical across scenarios — compute it once and reuse.
    baseline_sim = run_simulation(req, market_returns_by_asset)
    return [
        run_stress_test(
            req, market_returns_by_asset, k, shock_year, baseline_sim=baseline_sim
        )
        for k in SCENARIOS
    ]