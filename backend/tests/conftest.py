"""Shared pytest fixtures + import path setup for the backend test suite."""
import os
import sys

# Make the backend package importable (flat module layout: tax_engine, finance, …).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from models import (
    SimulationRequest,
    PortfolioHoldingIn,
    GoalIn,
    ASSET_DEFAULTS,
)


@pytest.fixture
def sample_request() -> SimulationRequest:
    """A small, deterministic simulation request (fast: few paths/years)."""
    return SimulationRequest(
        savings=500_000,
        income=100_000,
        expenses=40_000,
        age=28,
        portfolio_holdings=[
            PortfolioHoldingIn(asset_class="Indian Equity", current_value=300_000, purchase_price=240_000, monthly_sip=10_000),
            PortfolioHoldingIn(asset_class="Gold",          current_value=100_000, purchase_price=80_000,  monthly_sip=2_000),
            PortfolioHoldingIn(asset_class="Debt/Bonds",    current_value=100_000, purchase_price=100_000, monthly_sip=3_000),
        ],
        goals=[
            GoalIn(name="House", target_amount=5_000_000, target_year=5, priority="Critical"),
        ],
        sim_years=10,
        n_sims=200,
        rng_seed=42,
    )


@pytest.fixture
def market_returns(sample_request):
    """Deterministic per-asset (cagr, vol) built from defaults — bypasses Prophet/yfinance."""
    return {
        h.asset_class: (ASSET_DEFAULTS[h.asset_class]["cagr"], ASSET_DEFAULTS[h.asset_class]["vol"])
        for h in sample_request.portfolio_holdings
    }
