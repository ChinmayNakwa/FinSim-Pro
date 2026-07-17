"""
FinSim Pro — Pydantic models / data classes
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_LTCG_RATE             = 0.125
DEFAULT_STCG_RATE             = 0.20
DEFAULT_HOLIDAY_SPENDING_SPIKE = 0.15
DEFAULT_HOLIDAY_MONTHS        = [1, 3, 8, 9, 10, 11, 12]
DEFAULT_WITHDRAWAL_RATE       = 0.04
DEFAULT_RISK_FREE_RATE        = 0.065
DEFAULT_N_SIMS                = 500
DEFAULT_EMERGENCY_YIELD       = 0.065
DEFAULT_SAVINGS_YIELD         = 0.05
STANDARD_DEDUCTION_NEW        = 75_000
STANDARD_DEDUCTION_OLD        = 50_000
SECTION_80C                   = 150_000
DEFAULT_SECTION_80D           = 25_000

# ── Single source of truth for LTCG holding-period thresholds (days) ─────────
# Imported by both tax_engine.py and finance.py to eliminate duplication.
LTCG_HOLDING_DAYS: dict = {
    "Indian Equity":        365,
    "Nifty Bank":           365,
    "Nifty IT":             365,
    "International Equity": 730,
    "Gold":                 1095,
    "Real Estate":          730,
    "Debt/Bonds":           0,   # always STCG — taxed as income slab
}

ALL_MONTHS = {
    1: "Jan (Pongal/Lohri)", 2: "Feb (Valentine's)", 3: "Mar (Holi)",
    4: "Apr (Ugadi/Baisakhi)", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug (Independence Day)", 9: "Sep (Navratri)",
    10: "Oct (Dussehra)", 11: "Nov (Diwali)", 12: "Dec (Christmas/NYE)"
}

ASSET_DEFAULTS = {
    "Indian Equity":        {"ticker": "^NSEI",    "cagr": 0.12, "vol": 0.18, "color": "#00e676"},
    "Nifty Bank":           {"ticker": "^NSEBANK", "cagr": 0.14, "vol": 0.22, "color": "#40c4ff"},
    "Nifty IT":             {"ticker": "^CNXIT",   "cagr": 0.15, "vol": 0.25, "color": "#bb86fc"},
    "Gold":                 {"ticker": "GC=F",     "cagr": 0.08, "vol": 0.12, "color": "#ffc107"},
    "Real Estate":          {"ticker": None,        "cagr": 0.09, "vol": 0.08, "color": "#ff9800"},
    "International Equity": {"ticker": "^GSPC",    "cagr": 0.10, "vol": 0.15, "color": "#e91e63"},
    "Debt/Bonds":           {"ticker": None,        "cagr": 0.07, "vol": 0.04, "color": "#9e9e9e"},
}


# ─────────────────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE SCHEMAS  (Pydantic)
# ─────────────────────────────────────────────────────────────────────────────

class GoalIn(BaseModel):
    name: str
    target_amount: float = Field(0, ge=0)
    target_year: int = Field(1, ge=1, le=60)
    priority: str = "Important"       # "Critical" | "Important" | "Nice-to-have"
    # FIX: goals now optionally grow with CPI so ₹50L in year 10 stays realistic
    inflation_adjust: bool = True


class PortfolioHoldingIn(BaseModel):
    asset_class: str
    current_value: float = Field(0, ge=0)
    purchase_date: Optional[datetime] = None
    purchase_price: float = Field(0, ge=0)
    monthly_sip: float = Field(0.0, ge=0)
    ticker: Optional[str] = None


class TaxConfigIn(BaseModel):
    regime: str = "new"
    ltcg_rate: float = DEFAULT_LTCG_RATE
    stcg_rate: float = DEFAULT_STCG_RATE
    stcg_rebalance_fraction: float = 0.05
    section_80d: float = DEFAULT_SECTION_80D
    hra_exemption: float = 0.0
    home_loan_interest: float = 0.0
    ltcg_exempt_limit: float = 125_000.0
    gold_ltcg_rate: float = 0.20
    gold_stcg_rate: float = 0.30
    re_ltcg_rate: float = 0.20
    re_stcg_rate: float = 0.30
    debt_ltcg_rate: float = 0.30
    debt_stcg_rate: float = 0.30
    # FIX: International Equity rates were hardcoded 0.20/0.30 in tax_engine.py
    intl_ltcg_rate: float = 0.20
    intl_stcg_rate: float = 0.30


class SimulationRequest(BaseModel):
    # Personal
    savings: float = Field(500_000, ge=0)
    income: float = Field(100_000, ge=0)
    expenses: float = Field(40_000, ge=0)
    age: int = Field(28, ge=0, le=100)
    risk_tolerance: str = "Moderate"

    # Portfolio
    portfolio_holdings: List[PortfolioHoldingIn] = Field(default_factory=list)

    # Loan / EMI
    emi_loan_amount: float = Field(2_000_000, ge=0)
    emi_rate: float = Field(9.0, ge=0, le=50)
    emi_tenure_years: int = Field(10, ge=0, le=40)

    # Emergency fund
    emergency_months: int = Field(6, ge=0, le=120)

    # Simulation settings
    sim_years: int = Field(20, ge=1, le=50)
    apply_tax: bool = True
    # Cap paths to keep a single request from exhausting CPU/memory.
    n_sims: int = Field(DEFAULT_N_SIMS, ge=1, le=10_000)
    withdrawal_rate: float = Field(DEFAULT_WITHDRAWAL_RATE, gt=0, le=1)
    risk_free_rate: float = Field(DEFAULT_RISK_FREE_RATE, ge=0, le=1)
    savings_yield: float = Field(DEFAULT_SAVINGS_YIELD, ge=0, le=1)
    emergency_yield: float = Field(DEFAULT_EMERGENCY_YIELD, ge=0, le=1)
    include_holidays: bool = True
    holiday_spike_pct: float = Field(DEFAULT_HOLIDAY_SPENDING_SPIKE, ge=0, le=1)
    holiday_months: List[int] = Field(default_factory=lambda: DEFAULT_HOLIDAY_MONTHS)

    # FIX: rng_seed was hardcoded 42 inside run_simulation — now caller-controlled
    rng_seed: int = 42

    # Student-t degrees of freedom for asset-return marginals (fat tails).
    # Lower = fatter tails (more extreme crashes); higher → approaches Gaussian.
    t_dof: int = Field(5, ge=3, le=100)

    # FIX: drift threshold was hardcoded 0.05 inside suggest_rebalancing
    rebalance_drift_threshold: float = 0.05

    # Goals
    goals: List[GoalIn] = Field(default_factory=list)

    # Tax
    tax_cfg: TaxConfigIn = Field(default_factory=TaxConfigIn)


class TaxSnapshotResponse(BaseModel):
    annual_income: float
    taxable_income: float
    base_tax: float
    surcharge: float
    cess: float
    total_tax: float
    effective_rate: float
    regime: str


class AssetForecastItem(BaseModel):
    asset_class: str
    cagr: float
    vol: float
    weight: float
    data_source: str


class GoalResult(BaseModel):
    name: str
    target_amount: float
    target_year: int
    priority: str
    projected_nw_at_goal: float
    percent_funded: float
    # Probability (0–100) that this goal is fully funded across Monte Carlo paths.
    # Replaces the old mean-path `shortfall`/`on_track` pair with a real
    # probabilistic read of goal attainment.
    prob_funded_pct: float
    on_track: bool          # True when prob_funded_pct >= 50 (median path funds it)


class RebalanceSuggestion(BaseModel):
    asset_class: str
    action: str           # BUY or SELL
    amount: float
    current_pct: float
    target_pct: float
    drift: float


class RebalanceResult(BaseModel):
    needed: bool
    total_drift: float
    suggestions: List[RebalanceSuggestion]
    current_allocation: dict
    target_allocation: dict


class YearlyRow(BaseModel):
    year: int
    age: int
    net_worth_median: float
    net_worth_p10: float
    net_worth_p90: float
    annual_income: float
    annual_expenses: float
    est_income_tax: float
    fire_progress_pct: float
    goals_due: List[str]


class SimulationResponse(BaseModel):
    # KPIs
    median_net_worth_final: float
    p10_net_worth_final: float
    p90_net_worth_final: float
    prob_positive_pct: float
    prob_crore_pct: float
    # FIX: was a single scalar (worst path); now p50 + p90 for meaningful risk view
    max_drawdown_p50: float
    max_drawdown_p90: float
    sharpe_ratio: float
    fire_number: float
    fire_prob_pct: float
    years_to_fire: Optional[int]
    blended_cagr: float
    blended_vol: float
    emi_monthly: float

    # Tax
    tax_snapshot: TaxSnapshotResponse
    total_income_tax_avg: float
    total_ltcg_tax_avg: float
    total_stcg_tax_avg: float
    avg_effective_rate_pct: float

    # Time-series (lists of length sim_years+1)
    years_axis: List[int]
    p10_path: List[float]
    p25_path: List[float]
    p50_path: List[float]
    p75_path: List[float]
    p90_path: List[float]

    # Annual tax breakdown
    annual_income_tax: List[float]
    annual_ltcg_tax: List[float]
    annual_stcg_tax: List[float]

    # Asset-level
    asset_forecasts: List[AssetForecastItem]
    asset_final_values: dict
    asset_tax_summary: List[dict]

    # Goals
    goal_results: List[GoalResult]

    # Rebalancing
    rebalance: RebalanceResult

    # Year-by-year table
    yearly_table: List[YearlyRow]

    # Regime comparison
    regime_comparison: List[dict]


class OptimizeRequest(BaseModel):
    simulation: SimulationRequest


class RetirementPlanRequest(BaseModel):
    current_age: int
    current_net_worth: float
    annual_expenses: float
    annual_savings: float
    expected_cagr: float = 0.12
    inflation_rate: float = 0.06
    swr_rates: List[float] = [0.03, 0.035, 0.04, 0.045, 0.05]
    max_years: int = 40


class TaxHarvestRequest(BaseModel):
    holdings: List[PortfolioHoldingIn]
    tax_cfg: TaxConfigIn = Field(default_factory=TaxConfigIn)


# ─────────────────────────────────────────────────────────────────────────────
# STRESS TEST MODELS
# ─────────────────────────────────────────────────────────────────────────────

class StressTestRequest(BaseModel):
    simulation: SimulationRequest
    scenario_key: str = "market_crash_2008"
    shock_year: int = 3
    custom_scenario: Optional[dict] = None
    run_all: bool = False


class StressMetrics(BaseModel):
    base_drawdown: float
    shocked_drawdown: float
    drawdown_delta: float
    base_sharpe: float
    shocked_sharpe: float
    sharpe_delta: float
    median_nw_loss_pct: float
    prob_negative_pct: float


class StressTestResponse(BaseModel):
    scenario_key: str
    scenario_label: str
    scenario_desc: str
    shock_year: int
    recovery_year: Optional[int]
    years_to_recover: Optional[int]
    baseline: dict
    shocked: dict
    delta_p50: List[float]
    metrics: StressMetrics
    scenario_params: dict


class StressCompareResponse(BaseModel):
    """Returned when run_all=True — summary across all scenarios."""
    results: List[dict]
    worst_scenario: str
    most_resilient: str