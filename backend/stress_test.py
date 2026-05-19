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

def _build_shocked_returns(
    market_returns_by_asset: Dict[str, Tuple[float, float]],
    scenario: dict,
    shock_year: int,
    sim_years: int,
    n_sims: int,
) -> Dict[str, np.ndarray]:
    """
    Build per-asset return matrices with shock injected at shock_year.
    Uses seed=42 to match the baseline for Common Random Numbers (CRN).
    """
    rng = np.random.default_rng(seed=42) 
    shocked: Dict[str, np.ndarray] = {}
    shock_dur = scenario["shock_duration_years"]
    rec_years = scenario["recovery_years"]
    eq_shock  = scenario["equity_shock_pct"]

    for ac, (cagr, vol) in market_returns_by_asset.items():
        # Baseline returns (what would have happened without the shock)
        returns = rng.normal(cagr, vol, (n_sims, sim_years))

        # Calculate specific shock for this asset class
        sensitivity = ASSET_SENSITIVITY.get(ac, 0.5)
        asset_shock = eq_shock * sensitivity

        # Apply shock + Volatility Spike (Panic factor)
        for d in range(shock_dur):
            yr = shock_year + d
            if yr < sim_years:
                # During shock, volatility increases by 1.5x
                returns[:, yr] = asset_shock + rng.normal(0, vol * 1.5, n_sims)

        # Apply recovery (Mean reversion)
        for r in range(rec_years):
            yr = shock_year + shock_dur + r
            if yr < sim_years:
                # Assets recover a portion of the lost value as a boost to CAGR
                recovery_boost = -asset_shock * (0.5 / (r + 1))
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
    """
    if scenario_key == "custom":
        scenario = custom_scenario or SCENARIOS["market_crash_2008"]
    else:
        scenario = SCENARIOS.get(scenario_key, SCENARIOS["market_crash_2008"])

    N, Y = req.n_sims, req.sim_years

    # 1. Baseline (No shock, seed 42)
    baseline_sim = run_simulation(req, market_returns_by_asset)
    baseline_nw  = baseline_sim["net_worth"]

    # 2. Build Shocked Returns (Flexible asset-wise calculation)
    shocked_returns = _build_shocked_returns(
        market_returns_by_asset, scenario, shock_year, Y, N
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
    for y in range(shock_year, Y + 1):
        if shocked_paths["p50"][y] >= base_paths["p50"][y]:
            recovery_year = y
            break

    # Metrics
    base_dd    = compute_drawdown(baseline_nw)
    shocked_dd = compute_drawdown(shocked_nw)
    base_sharpe    = sharpe_ratio(baseline_nw, req.risk_free_rate)
    shocked_sharpe = sharpe_ratio(shocked_nw,  req.risk_free_rate)
    
    median_loss_pct = (
        (shocked_paths["p50"][-1] - base_paths["p50"][-1])
        / max(abs(base_paths["p50"][-1]), 1)
        * 100
    )

    return {
        "scenario_key":   scenario_key,
        "scenario_label": scenario.get("label", scenario_key),
        "scenario_desc":  scenario.get("description", ""),
        "shock_year":     shock_year,
        "recovery_year":  recovery_year,
        "years_to_recover": (recovery_year - shock_year) if recovery_year else None,
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
            "prob_negative_pct":   round(float(np.mean(shocked_nw[:, -1] < 0) * 100), 2),
        },
        "scenario_params": scenario,
    }

def run_all_scenarios(req, market_returns_by_asset, shock_year=3):
    return [run_stress_test(req, market_returns_by_asset, k, shock_year) for k in SCENARIOS]