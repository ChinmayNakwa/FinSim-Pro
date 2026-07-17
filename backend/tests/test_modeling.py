"""Track 3 modeling realism: correlation, fat tails, probabilistic goals, reserves."""
import numpy as np
import pytest

from finance import (
    run_simulation,
    draw_asset_returns,
    build_correlation_cholesky,
    _pair_correlation,
)
from models import SimulationRequest, PortfolioHoldingIn, GoalIn, ASSET_DEFAULTS


# ── Correlation ───────────────────────────────────────────────────────────────

def test_correlation_cholesky_reconstructs_valid_matrix():
    acs = ["Indian Equity", "Nifty Bank", "Gold", "Debt/Bonds"]
    L = build_correlation_cholesky(acs)
    corr = L @ L.T
    assert np.allclose(np.diag(corr), 1.0, atol=1e-6)          # unit diagonal
    assert np.all(np.linalg.eigvalsh(corr) > 0)                # positive definite


def test_pair_correlation_signs():
    assert _pair_correlation("Indian Equity", "Nifty Bank") > 0.5   # equities co-move
    assert _pair_correlation("Indian Equity", "Gold") < 0.0         # gold hedges
    assert _pair_correlation("Indian Equity", "Indian Equity") == 1.0


def test_drawn_returns_are_correlated():
    rng = np.random.default_rng(0)
    mrba = {
        "Indian Equity": (0.12, 0.18),
        "Nifty Bank":    (0.14, 0.22),
        "Gold":          (0.08, 0.12),
    }
    rand = draw_asset_returns(rng, mrba, n_sims=4000, sim_years=10, t_dof=5)
    eq1 = rand["Indian Equity"].ravel()
    eq2 = rand["Nifty Bank"].ravel()
    gold = rand["Gold"].ravel()
    eq_corr = np.corrcoef(eq1, eq2)[0, 1]
    gold_corr = np.corrcoef(eq1, gold)[0, 1]
    assert eq_corr > 0.5, f"equities should be strongly correlated, got {eq_corr:.2f}"
    assert gold_corr < 0.1, f"gold should hedge equities, got {gold_corr:.2f}"


def test_drawn_returns_preserve_mean_and_vol():
    rng = np.random.default_rng(1)
    mrba = {"Indian Equity": (0.12, 0.18)}
    rand = draw_asset_returns(rng, mrba, n_sims=20000, sim_years=10, t_dof=8)
    r = rand["Indian Equity"].ravel()
    assert r.mean() == pytest.approx(0.12, abs=0.02)
    assert r.std() == pytest.approx(0.18, rel=0.10)


def test_fat_tails_have_excess_kurtosis():
    rng = np.random.default_rng(2)
    mrba = {"Indian Equity": (0.12, 0.18)}
    r = draw_asset_returns(rng, mrba, n_sims=20000, sim_years=10, t_dof=4)["Indian Equity"].ravel()
    z = (r - r.mean()) / r.std()
    kurtosis = (z ** 4).mean()          # 3.0 for a normal distribution
    assert kurtosis > 3.5, f"Student-t should be fat-tailed, kurtosis={kurtosis:.2f}"


# ── Probabilistic goals ───────────────────────────────────────────────────────

def _req(goals, **kw):
    base = dict(
        savings=500_000, income=100_000, expenses=40_000, age=28,
        portfolio_holdings=[
            PortfolioHoldingIn(asset_class="Indian Equity", current_value=300_000, purchase_price=240_000, monthly_sip=10_000),
            PortfolioHoldingIn(asset_class="Debt/Bonds",    current_value=100_000, purchase_price=100_000, monthly_sip=3_000),
        ],
        goals=goals, sim_years=10, n_sims=500, rng_seed=42,
    )
    base.update(kw)
    return SimulationRequest(**base)


def _mrba(req):
    return {h.asset_class: (ASSET_DEFAULTS[h.asset_class]["cagr"], ASSET_DEFAULTS[h.asset_class]["vol"])
            for h in req.portfolio_holdings}


def test_trivial_goal_almost_certainly_funded():
    req = _req([GoalIn(name="Tiny", target_amount=1_000, target_year=3, inflation_adjust=False)])
    sim = run_simulation(req, _mrba(req))
    assert sim["goal_funded_prob"]["Tiny"] == pytest.approx(1.0, abs=1e-9)


def test_impossible_goal_never_funded():
    req = _req([GoalIn(name="Moon", target_amount=1e12, target_year=3, inflation_adjust=False)])
    sim = run_simulation(req, _mrba(req))
    assert sim["goal_funded_prob"]["Moon"] == 0.0


def test_goal_prob_is_a_probability():
    req = _req([GoalIn(name="House", target_amount=3_000_000, target_year=7, inflation_adjust=False)])
    sim = run_simulation(req, _mrba(req))
    p = sim["goal_funded_prob"]["House"]
    assert 0.0 <= p <= 1.0


# ── Emergency-fund drawdown ───────────────────────────────────────────────────

def test_emergency_fund_is_drawn_under_deficit():
    """
    Under a severe cash-flow deficit the emergency fund must actually be
    consumable — at least some paths draw it below its target. The old model
    force-refilled it to >= target on every path, so this guards that fix.
    """
    req = _req(
        [],
        income=50_000, expenses=45_000,
        emi_loan_amount=5_000_000, emi_rate=12.0, emi_tenure_years=5,
        apply_tax=False, emergency_months=6,
    )
    sim = run_simulation(req, _mrba(req))
    emg_target = req.expenses * req.emergency_months      # 270,000 (year-0 nominal)
    # Old behavior: min >= target on every path. New behavior: it can be drained.
    assert sim["emergency_fund"].min() < emg_target
    assert np.all(sim["emergency_fund"] >= 0)


def test_reserves_stay_non_negative_and_finite():
    req = _req([GoalIn(name="House", target_amount=3_000_000, target_year=5, inflation_adjust=False)])
    sim = run_simulation(req, _mrba(req))
    assert np.all(sim["emergency_fund"] >= 0)
    assert np.all(np.isfinite(sim["net_worth"]))
