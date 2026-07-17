"""
FinSim Pro — FastAPI application
Run with:  uvicorn main:app --reload
Docs at:   http://localhost:8000/docs
"""
from __future__ import annotations

import sys
import os
import asyncio
import traceback
from functools import partial

# Allow importing sibling modules
sys.path.insert(0, os.path.dirname(__file__))

from typing import Dict, List, Optional
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import (
    ASSET_DEFAULTS,
    ALL_MONTHS,
    AssetForecastItem,
    GoalResult,
    RebalanceResult,
    RebalanceSuggestion,
    SimulationRequest,
    SimulationResponse,
    TaxConfigIn,
    TaxSnapshotResponse,
    YearlyRow,
    StressTestRequest, 
    StressTestResponse,
    StressCompareResponse,
    OptimizeRequest, 
    RetirementPlanRequest, 
    TaxHarvestRequest,
)
from tax_engine import compute_tax_on_income
from finance import (
    fire_number,
    get_age_based_allocation,
    get_blended_forecast,
    monthly_emi,
    run_simulation,
    sharpe_ratio,
    compute_drawdown,
    suggest_rebalancing,
    optimize_portfolio, 
    plan_retirement,
    harvest_tax_opportunities
)

from stress_test import (
    run_stress_test, 
    run_all_scenarios, 
    SCENARIOS)

import logging
# Log level configurable; default INFO (DEBUG is noisy/leaky for production).
logging.basicConfig(level=os.getenv("FINSIM_LOG_LEVEL", "INFO").upper())

# ─────────────────────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FinSim Pro",
    description=(
        "Multi-asset Indian financial simulation API. "
        "Provides Monte Carlo net-worth projections, tax analysis, "
        "goal tracking, and portfolio rebalancing recommendations."
    ),
    version="2.0.0",
)

# CORS: a wildcard origin combined with credentials is rejected by browsers,
# so use explicit origins (overridable via FINSIM_CORS_ORIGINS, comma-separated).
_cors_origins = [
    o.strip() for o in os.getenv(
        "FINSIM_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _safe_list(arr: np.ndarray) -> list:
    """Convert numpy array to plain Python list, replacing NaN/Inf with 0."""
    return [float(x) if np.isfinite(x) else 0.0 for x in arr.tolist()]


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

from fastapi.responses import Response as FastAPIResponse
from report_agent import report_executor, generate_pdf_report


@app.post("/generate-report", summary="Generate AI Financial Report")
async def generate_report(sim: SimulationResponse):
    try:
        loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(
            None, partial(report_executor.invoke, {"sim": sim})
        )
        return output["report"]
    except Exception as e:
        import traceback
        traceback.print_exc()          # logs full traceback to uvicorn console
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-report/pdf", summary="Download self-contained HTML report")
async def generate_report_pdf(sim: SimulationResponse):
    try:
        loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(
            None, partial(report_executor.invoke, {"sim": sim})
        )
        html_bytes = generate_pdf_report(output["report"])
        return FastAPIResponse(
            content=html_bytes,
            media_type="text/html",
            headers={"Content-Disposition": "attachment; filename=finsim-report.html"},
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/", summary="Health check")
def root():
    return {"status": "ok", "service": "FinSim Pro", "version": "2.0.0"}


@app.get("/meta/asset-classes", summary="List supported asset classes")
def list_asset_classes():
    return {
        ac: {"default_cagr": v["cagr"], "default_vol": v["vol"], "ticker": v["ticker"]}
        for ac, v in ASSET_DEFAULTS.items()
    }


@app.get("/meta/holiday-months", summary="List Indian holiday months")
def list_holiday_months():
    return ALL_MONTHS


@app.post(
    "/simulate",
    response_model=SimulationResponse,
    summary="Run full Monte Carlo simulation",
)
def simulate(req: SimulationRequest):
    """
    Run the full FinSim Pro Monte Carlo simulation.

    **Key inputs**
    - `savings`, `income`, `expenses`: personal finance baseline
    - `portfolio_holdings`: list of assets with current value, SIP, purchase info
    - `goals`: financial milestones (target amount + year)
    - `tax_cfg`: income-tax regime, LTCG/STCG rates, deductions
    - `sim_years`: projection horizon (5–40)
    - `n_sims`: number of Monte Carlo paths (100–2000)

    **Returns** KPIs, percentile paths, tax analysis, goal results, rebalancing suggestions.
    """
    if req.income <= req.expenses:
        raise HTTPException(400, "Monthly income must exceed monthly expenses.")
    if not req.portfolio_holdings:
        raise HTTPException(400, "At least one portfolio holding is required.")

    # ── Market data + Prophet forecasts ──
    blended_cagr, blended_vol, asset_forecasts = get_blended_forecast(
        req.portfolio_holdings, req.sim_years
    )

    # Apply holiday adjustments to effective expenses
    if req.include_holidays:
        effective_expenses = req.expenses * (
            1 + req.holiday_spike_pct * len(req.holiday_months) / 12
        )
    else:
        effective_expenses = req.expenses

    # Build per-asset market return params
    market_returns_by_asset: Dict[str, tuple] = {
        ac: (af["cagr"], af["vol"])
        for ac, af in asset_forecasts.items()
    }

    # Patch effective expenses into the request copy (avoid mutating caller's object)
    patched = req.model_copy(update={"expenses": effective_expenses})

    # ── Run simulation ──
    sim = run_simulation(patched, market_returns_by_asset)

    nw              = sim["net_worth"]
    income_tax      = sim["income_tax_paid"]
    ltcg_tax        = sim["ltcg_tax_paid"]
    stcg_tax        = sim["stcg_tax_paid"]
    eff_rate_path   = sim["eff_rate_path"]
    goal_funded_prob = sim["goal_funded_prob"]
    asset_balances  = sim["asset_balances"]
    asset_ltcg_tax  = sim["asset_ltcg_tax"]
    asset_stcg_tax  = sim["asset_stcg_tax"]

    # ── Percentile paths ──
    p10, p25, p50, p75, p90 = [
        np.percentile(nw, p, axis=0) for p in [10, 25, 50, 75, 90]
    ]

    ann_expenses = effective_expenses * 12
    fire_target  = fire_number(ann_expenses, req.withdrawal_rate)
    years_axis   = list(range(req.sim_years + 1))

    # ── KPIs ──
    final_p10, final_p50, final_p90 = p10[-1], p50[-1], p90[-1]
    prob_positive = float(np.mean(nw[:, -1] > 0) * 100)
    prob_crore    = float(np.mean(nw[:, -1] > 1e7) * 100)
    # compute_drawdown now returns per-path (N,) array; extract percentiles
    dd_per_path   = compute_drawdown(nw)
    max_dd_p50    = float(np.percentile(dd_per_path, 50))
    max_dd_p90    = float(np.percentile(dd_per_path, 90))
    sharpe        = sharpe_ratio(nw, risk_free=req.risk_free_rate)
    fire_prob     = float(np.mean(nw[:, -1] >= fire_target) * 100)
    years_to_fire = next(
        (y for y in range(req.sim_years + 1) if p50[y] >= fire_target), None
    )
    emi_payment   = monthly_emi(req.emi_loan_amount, req.emi_rate, req.emi_tenure_years * 12)

    # ── Tax summary ──
    total_income_tax_avg = float(income_tax.sum(axis=1).mean())
    total_ltcg_tax_avg   = float(ltcg_tax.sum(axis=1).mean())
    total_stcg_tax_avg   = float(stcg_tax.sum(axis=1).mean())
    avg_eff_rate_pct     = float(eff_rate_path.mean() * 100)

    snapshot_raw  = compute_tax_on_income(req.income * 12, req.tax_cfg)
    tax_snapshot  = TaxSnapshotResponse(
        annual_income=req.income * 12,
        **snapshot_raw,
    )

    # ── Asset forecasts ──
    asset_forecast_items = [
        AssetForecastItem(
            asset_class=ac,
            cagr=af["cagr"],
            vol=af["vol"],
            weight=af["weight"],
            data_source="Prophet" if af["success"] else "Default",
        )
        for ac, af in asset_forecasts.items()
    ]

    # ── Asset final values (median) ──
    asset_final_values = {
        ac: float(np.percentile(bal, 50))
        for ac, bal in asset_balances.items()
    }

    # ── Tax by asset ──
    asset_tax_summary = [
        {
            "asset_class": ac,
            "ltcg_tax":    float(asset_ltcg_tax[ac].sum(axis=1).mean()),
            "stcg_tax":    float(asset_stcg_tax[ac].sum(axis=1).mean()),
            "total_tax":   float(
                asset_ltcg_tax[ac].sum(axis=1).mean()
                + asset_stcg_tax[ac].sum(axis=1).mean()
            ),
        }
        for ac in asset_ltcg_tax
    ]

    # ── Goal results ──
    goal_results: List[GoalResult] = []
    for g in req.goals:
        idx             = min(g.target_year, req.sim_years)
        nw_at_goal      = float(p50[idx])
        pct_funded      = min(100.0, nw_at_goal / max(g.target_amount, 1) * 100)
        prob_funded     = round(goal_funded_prob.get(g.name, 0.0) * 100, 1)
        goal_results.append(
            GoalResult(
                name=g.name,
                target_amount=g.target_amount,
                target_year=g.target_year,
                priority=g.priority,
                projected_nw_at_goal=nw_at_goal,
                percent_funded=round(pct_funded, 2),
                prob_funded_pct=prob_funded,
                on_track=prob_funded >= 50.0,
            )
        )

    # ── Rebalancing ──
    total_value = sum(h.current_value for h in req.portfolio_holdings) or 1.0
    current_alloc = {
        h.asset_class: h.current_value / total_value
        for h in req.portfolio_holdings
    }
    target_alloc = get_age_based_allocation(req.age, req.risk_tolerance)
    reb_raw      = suggest_rebalancing(
        current_alloc, target_alloc, total_value,
        drift_threshold=req.rebalance_drift_threshold,
    )
    rebalance    = RebalanceResult(
        needed=reb_raw["needed"],
        total_drift=reb_raw["total_drift"],
        suggestions=[RebalanceSuggestion(**s) for s in reb_raw["suggestions"]],
        current_allocation={k: round(v * 100, 2) for k, v in current_alloc.items()},
        target_allocation={k: round(v * 100, 2) for k, v in target_alloc.items()},
    )

    # ── Year-by-year table ──
    yearly_table: List[YearlyRow] = []
    for y in range(1, req.sim_years + 1):
        med_income   = (req.income * 12) * (1.08 ** y)
        med_expenses = (effective_expenses * 12) * (1.06 ** y)
        med_tax      = float(income_tax[:, y - 1].mean())
        fire_prog    = round(p50[y] / max(fire_target, 1) * 100, 1)
        goals_due    = [g.name for g in req.goals if g.target_year == y]
        yearly_table.append(
            YearlyRow(
                year=y,
                age=req.age + y,
                net_worth_median=float(p50[y]),
                net_worth_p10=float(p10[y]),
                net_worth_p90=float(p90[y]),
                annual_income=med_income,
                annual_expenses=med_expenses,
                est_income_tax=med_tax,
                fire_progress_pct=fire_prog,
                goals_due=goals_due,
            )
        )

    # ── Regime comparison ──
    snap_new = compute_tax_on_income(
        req.income * 12,
        TaxConfigIn(**{**req.tax_cfg.model_dump(), "regime": "new"}),
    )
    snap_old = compute_tax_on_income(
        req.income * 12,
        TaxConfigIn(**{**req.tax_cfg.model_dump(), "regime": "old"}),
    )
    regime_comparison = [
        {
            "component":   "Taxable Income",
            "new_regime":  snap_new["taxable_income"],
            "old_regime":  snap_old["taxable_income"],
        },
        {
            "component":  "Total Tax",
            "new_regime": snap_new["total_tax"],
            "old_regime": snap_old["total_tax"],
        },
        {
            "component":  "Effective Rate (%)",
            "new_regime": round(snap_new["effective_rate"] * 100, 2),
            "old_regime": round(snap_old["effective_rate"] * 100, 2),
        },
    ]

    return SimulationResponse(
        # KPIs
        median_net_worth_final=final_p50,
        p10_net_worth_final=final_p10,
        p90_net_worth_final=final_p90,
        prob_positive_pct=prob_positive,
        prob_crore_pct=prob_crore,
        max_drawdown_p50=max_dd_p50,
        max_drawdown_p90=max_dd_p90,
        sharpe_ratio=sharpe,
        fire_number=fire_target,
        fire_prob_pct=fire_prob,
        years_to_fire=years_to_fire,
        blended_cagr=round(blended_cagr, 4),
        blended_vol=round(blended_vol, 4),
        emi_monthly=round(emi_payment, 2),
        # Tax
        tax_snapshot=tax_snapshot,
        total_income_tax_avg=total_income_tax_avg,
        total_ltcg_tax_avg=total_ltcg_tax_avg,
        total_stcg_tax_avg=total_stcg_tax_avg,
        avg_effective_rate_pct=avg_eff_rate_pct,
        # Paths
        years_axis=years_axis,
        p10_path=_safe_list(p10),
        p25_path=_safe_list(p25),
        p50_path=_safe_list(p50),
        p75_path=_safe_list(p75),
        p90_path=_safe_list(p90),
        # Tax time-series
        annual_income_tax=_safe_list(income_tax.mean(axis=0)),
        annual_ltcg_tax=_safe_list(ltcg_tax.mean(axis=0)),
        annual_stcg_tax=_safe_list(stcg_tax.mean(axis=0)),
        # Assets
        asset_forecasts=asset_forecast_items,
        asset_final_values=asset_final_values,
        asset_tax_summary=asset_tax_summary,
        # Goals
        goal_results=goal_results,
        # Rebalancing
        rebalance=rebalance,
        # Table
        yearly_table=yearly_table,
        # Regime comparison
        regime_comparison=regime_comparison,
    )


@app.post(
    "/tax/snapshot",
    response_model=TaxSnapshotResponse,
    summary="Quick income-tax snapshot",
)
def tax_snapshot(annual_income: float, tax_cfg: TaxConfigIn = None):
    """
    Compute income-tax breakdown for a given annual income without running the full simulation.
    Useful for regime comparison widgets.
    """
    cfg = tax_cfg or TaxConfigIn()
    result = compute_tax_on_income(annual_income, cfg)
    return TaxSnapshotResponse(annual_income=annual_income, **result)


@app.get(
    "/rebalance/target-allocation",
    summary="Age-based target asset allocation",
)
def target_allocation(
    age: int = Query(..., ge=18, le=80),
    risk_tolerance: str = Query("Moderate", pattern="^(Conservative|Moderate|Aggressive)$"),
):
    """Return a suggested target allocation based on age and risk tolerance."""
    alloc = get_age_based_allocation(age, risk_tolerance)
    return {k: round(v * 100, 2) for k, v in alloc.items()}


@app.post("/optimize", summary="Markowitz efficient frontier for current holdings")
def portfolio_optimize(req: OptimizeRequest):
    if len(req.simulation.portfolio_holdings) < 2:
        raise HTTPException(400, "At least 2 holdings required.")
    _, _, asset_forecasts = get_blended_forecast(
        req.simulation.portfolio_holdings, req.simulation.sim_years
    )
    return optimize_portfolio(
        req.simulation.portfolio_holdings,
        asset_forecasts,
        risk_free_rate=req.simulation.risk_free_rate,
    )
 
 
@app.post("/retirement/plan", summary="FIRE date estimator with SWR sensitivity")
def retirement_plan(req: RetirementPlanRequest):
    if req.annual_expenses <= 0:
        raise HTTPException(400, "annual_expenses must be > 0.")
    return plan_retirement(
        current_age=req.current_age,
        current_net_worth=req.current_net_worth,
        annual_expenses=req.annual_expenses,
        annual_savings=req.annual_savings,
        expected_cagr=req.expected_cagr,
        inflation_rate=req.inflation_rate,
        swr_rates=req.swr_rates,
        max_years=req.max_years,
    )
 
 
@app.post("/tax/harvest", summary="Flag holdings for tax-loss harvesting or low-tax gains")
def tax_harvest(req: TaxHarvestRequest):
    if not req.holdings:
        raise HTTPException(400, "At least one holding required.")
    # Build minimal asset_forecasts from ASSET_DEFAULTS for reference
    from models import ASSET_DEFAULTS
    asset_forecasts = {
        h.asset_class: ASSET_DEFAULTS.get(h.asset_class, ASSET_DEFAULTS["Indian Equity"])
        for h in req.holdings
    }
    return harvest_tax_opportunities(req.holdings, asset_forecasts, req.tax_cfg)

@app.post(
    "/stress-test",
    summary="Run macro shock stress test against simulation",
)
def stress_test(req: StressTestRequest):
    """
    Injects a macro shock (crash, income loss, stagflation, etc.)
    into the Monte Carlo simulation and compares against baseline.
 
    **scenario_key options:** market_crash_2008 | covid_2020 | income_loss | stagflation | rate_hike_cycle | custom
 
    Set **run_all=True** to get a comparative summary across all built-in scenarios.
    """
    sim_req = req.simulation
 
    if sim_req.income <= sim_req.expenses:
        raise HTTPException(400, "Monthly income must exceed monthly expenses.")
    if not sim_req.portfolio_holdings:
        raise HTTPException(400, "At least one portfolio holding is required.")
    if req.shock_year >= sim_req.sim_years:
        raise HTTPException(400, "shock_year must be less than sim_years.")
 
    # Reuse blended forecast from finance module
    from finance import get_blended_forecast
    _, _, asset_forecasts = get_blended_forecast(sim_req.portfolio_holdings, sim_req.sim_years)
    market_returns_by_asset = {
        ac: (af["cagr"], af["vol"]) for ac, af in asset_forecasts.items()
    }
 
    if req.run_all:
        results = run_all_scenarios(sim_req, market_returns_by_asset, req.shock_year)
        worst      = max(results, key=lambda r: abs(r["metrics"]["median_nw_loss_pct"]))
        resilient  = min(
            [r for r in results if r["years_to_recover"] is not None],
            key=lambda r: r["years_to_recover"],
            default=results[0],
        )
        return StressCompareResponse(
            results=results,
            worst_scenario=worst["scenario_key"],
            most_resilient=resilient["scenario_key"],
        )
 
    try:
        result = run_stress_test(
            sim_req,
            market_returns_by_asset,
            req.scenario_key,
            req.shock_year,
            req.custom_scenario,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
 
    return StressTestResponse(
        scenario_key=result["scenario_key"],
        scenario_label=result["scenario_label"],
        scenario_desc=result["scenario_desc"],
        shock_year=result["shock_year"],
        recovery_year=result["recovery_year"],
        years_to_recover=result["years_to_recover"],
        baseline=result["baseline"],
        shocked=result["shocked"],
        delta_p50=result["delta_p50"],
        metrics=result["metrics"],
        scenario_params=result["scenario_params"],
    )
 
 
# 3. Bonus: GET endpoint to list available scenarios
@app.get("/stress-test/scenarios", summary="List available stress test scenarios")
def list_scenarios():
    return {
        key: {
            "label": s["label"],
            "description": s["description"],
        }
        for key, s in SCENARIOS.items()
    }