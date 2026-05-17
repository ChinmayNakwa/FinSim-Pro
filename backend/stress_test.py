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
        "description": "Complete income loss for 12 months.",
        "equity_shock_pct": 0.0,
        "shock_duration_years": 1,
        "recovery_years": 1,
        "inflation_delta": 0.0,
        "income_growth_delta": -1.0,   # wipes income for shock year
    },
    "stagflation": {
        "label": "Stagflation",
        "description": "High inflation (~12%) with stagnant income growth (~2%) for 3 years.",
        "equity_shock_pct": -0.15,
        "shock_duration_years": 3,
        "recovery_years": 2,
        "inflation_delta": +0.06,      # base 6% + 6% delta = 12%
        "income_growth_delta": -0.06,  # base 8% - 6% delta = 2%
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

EQUITY_CLASSES = {"Indian Equity", "Nifty Bank", "Nifty IT", "International Equity"}


# ─────────────────────────────────────────────────────────────────────────────
# CORE ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def _build_shocked_returns(
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    scenario: dict,
    shock_year: int,
    sim_years: int,
    n_sims: int,
    rng: np.random.Generator,
) -> Dict[str, np.ndarray]:
    """
    Build per-asset return matrices with shock injected at shock_year.
    Equity classes take the full equity_shock_pct hit.
    Non-equity takes a proportional spillover (30% of equity shock).
    Recovery is modelled as mean-reversion over recovery_years.
    """
    shocked: Dict[str, np.ndarray] = {}
    shock_dur = scenario["shock_duration_years"]
    rec_years = scenario["recovery_years"]
    eq_shock  = scenario["equity_shock_pct"]

    for ac, (cagr, vol) in market_returns_by_asset.items():
        returns = rng.normal(cagr, vol, (n_sims, sim_years))

        is_equity = ac in EQUITY_CLASSES
        shock_magnitude = eq_shock if is_equity else eq_shock * 0.30

        # Apply shock
        for d in range(shock_dur):
            yr = shock_year + d
            if yr < sim_years:
                returns[:, yr] = shock_magnitude + rng.normal(0, vol * 0.5, n_sims)

        # Apply recovery (mean-reversion overshoot)
        for r in range(rec_years):
            yr = shock_year + shock_dur + r
            if yr < sim_years:
                recovery_boost = -shock_magnitude * (0.6 / (r + 1))
                returns[:, yr] = (cagr + recovery_boost) + rng.normal(0, vol, n_sims)

        shocked[ac] = returns

    return shocked


def run_stress_test(
    req: SimulationRequest,
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    scenario_key: str,
    shock_year: int = 3,
    custom_scenario: Optional[dict] = None,
) -> dict:
    """
    Run baseline + shocked simulation for a given scenario.

    Returns a dict with:
      - baseline paths (p10/p50/p90)
      - shocked paths
      - delta (shocked - baseline) at each year
      - recovery_year: first year shocked p50 >= baseline p50
      - drawdown comparison
      - sharpe comparison
      - scenario metadata
    """
    if scenario_key == "custom":
        if not custom_scenario:
            raise ValueError("custom_scenario dict required for scenario_key='custom'")
        scenario = custom_scenario
    else:
        if scenario_key not in SCENARIOS:
            raise KeyError(f"Unknown scenario '{scenario_key}'. Valid: {list(SCENARIOS)}")
        scenario = SCENARIOS[scenario_key]

    N, Y = req.n_sims, req.sim_years
    rng  = np.random.default_rng(seed=42)

    # ── Baseline ──
    baseline_sim = run_simulation(req, market_returns_by_asset)
    baseline_nw  = baseline_sim["net_worth"]

    # ── Shocked returns ──
    shocked_returns = _build_shocked_returns(
        market_returns_by_asset, scenario, shock_year, Y, N, rng
    )

    # ── Patch income/inflation for shock years ──
    # We pass a modified req with adjusted income for income_loss scenario
    patched_req = req
    if scenario["income_growth_delta"] <= -1.0:
        # Income loss: zero income for shock year handled inside shocked sim
        # We clone and zero income for shock_year by reducing it
        patched_req = req.copy(update={"income": req.income * 0.01})

    shocked_sim = run_simulation(patched_req, shocked_returns)
    shocked_nw  = shocked_sim["net_worth"]

    # ── Percentile paths ──
    def pct_paths(nw):
        return {
            "p10": np.percentile(nw, 10, axis=0).tolist(),
            "p50": np.percentile(nw, 50, axis=0).tolist(),
            "p90": np.percentile(nw, 90, axis=0).tolist(),
        }

    base_paths    = pct_paths(baseline_nw)
    shocked_paths = pct_paths(shocked_nw)

    # ── Delta (₹ difference at each year) ──
    delta_p50 = [
        shocked_paths["p50"][y] - base_paths["p50"][y]
        for y in range(Y + 1)
    ]

    # ── Recovery year: first year shocked p50 >= 95% of baseline p50 ──
    recovery_year = None
    for y in range(shock_year, Y + 1):
        b = base_paths["p50"][y]
        s = shocked_paths["p50"][y]
        if b > 0 and s >= b * 0.95:
            recovery_year = y
            break

    # ── Max drawdown comparison ──
    base_dd    = compute_drawdown(baseline_nw)
    shocked_dd = compute_drawdown(shocked_nw)

    # ── Sharpe comparison ──
    base_sharpe    = sharpe_ratio(baseline_nw, req.risk_free_rate)
    shocked_sharpe = sharpe_ratio(shocked_nw,  req.risk_free_rate)

    # ── Worst-case final NW loss ──
    median_loss_pct = (
        (shocked_paths["p50"][-1] - base_paths["p50"][-1])
        / max(abs(base_paths["p50"][-1]), 1)
        * 100
    )

    # ── Probability of negative NW in shocked scenario ──
    prob_negative_shocked = float(np.mean(shocked_nw[:, -1] < 0) * 100)

    return {
        "scenario_key":   scenario_key,
        "scenario_label": scenario.get("label", scenario_key),
        "scenario_desc":  scenario.get("description", ""),
        "shock_year":     shock_year,
        "recovery_year":  recovery_year,
        "years_to_recover": (recovery_year - shock_year) if recovery_year else None,
        "baseline": base_paths,
        "shocked":  shocked_paths,
        "delta_p50": delta_p50,
        "metrics": {
            "base_drawdown":       round(base_dd * 100, 2),
            "shocked_drawdown":    round(shocked_dd * 100, 2),
            "drawdown_delta":      round((shocked_dd - base_dd) * 100, 2),
            "base_sharpe":         base_sharpe,
            "shocked_sharpe":      shocked_sharpe,
            "sharpe_delta":        round(shocked_sharpe - base_sharpe, 3),
            "median_nw_loss_pct":  round(median_loss_pct, 2),
            "prob_negative_pct":   round(prob_negative_shocked, 2),
        },
        "scenario_params": scenario,
    }


def run_all_scenarios(
    req: SimulationRequest,
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    shock_year: int = 3,
) -> List[dict]:
    """
    Run all built-in scenarios and return a list of stress test results.
    Useful for comparative stress dashboard.
    """
    results = []
    for key in SCENARIOS:
        result = run_stress_test(req, market_returns_by_asset, key, shock_year)
        # Slim down for comparison view — only summary metrics
        results.append({
            "scenario_key":      result["scenario_key"],
            "scenario_label":    result["scenario_label"],
            "shock_year":        result["shock_year"],
            "recovery_year":     result["recovery_year"],
            "years_to_recover":  result["years_to_recover"],
            "median_nw_loss_pct": result["metrics"]["median_nw_loss_pct"],
            "shocked_drawdown":  result["metrics"]["shocked_drawdown"],
            "sharpe_delta":      result["metrics"]["sharpe_delta"],
            "prob_negative_pct": result["metrics"]["prob_negative_pct"],
        })
    return results