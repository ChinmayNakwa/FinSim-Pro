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
    target_amount: float
    target_year: int
    priority: str = "Important"


class PortfolioHoldingIn(BaseModel):
    asset_class: str
    current_value: float
    purchase_date: Optional[datetime] = None
    purchase_price: float
    monthly_sip: float = 0.0
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


class SimulationRequest(BaseModel):
    # Personal
    savings: float = 500_000
    income: float = 100_000
    expenses: float = 40_000
    age: int = 28
    risk_tolerance: str = "Moderate"

    # Portfolio
    portfolio_holdings: List[PortfolioHoldingIn] = Field(default_factory=list)

    # Loan / EMI
    emi_loan_amount: float = 2_000_000
    emi_rate: float = 9.0
    emi_tenure_years: int = 10

    # Emergency fund
    emergency_months: int = 6

    # Simulation settings
    sim_years: int = 20
    apply_tax: bool = True
    n_sims: int = DEFAULT_N_SIMS
    withdrawal_rate: float = DEFAULT_WITHDRAWAL_RATE
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE
    savings_yield: float = DEFAULT_SAVINGS_YIELD
    emergency_yield: float = DEFAULT_EMERGENCY_YIELD
    include_holidays: bool = True
    holiday_spike_pct: float = DEFAULT_HOLIDAY_SPENDING_SPIKE
    holiday_months: List[int] = Field(default_factory=lambda: DEFAULT_HOLIDAY_MONTHS)

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
    shortfall: float
    on_track: bool


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
    max_drawdown: float
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
    asset_final_values: dict      # {asset_class: median_final_value}
    asset_tax_summary: List[dict] # [{asset_class, ltcg_tax, stcg_tax, total_tax}]

    # Goals
    goal_results: List[GoalResult]

    # Rebalancing
    rebalance: RebalanceResult

    # Year-by-year table
    yearly_table: List[YearlyRow]

    # Regime comparison
    regime_comparison: List[dict]