"""Determinism + structural invariants for the Monte Carlo engine."""
import numpy as np
import pytest

from finance import run_simulation, monthly_emi, remaining_principal, compute_drawdown, fire_number


def test_shapes_and_keys(sample_request, market_returns):
    sim = run_simulation(sample_request, market_returns)
    N, Y = sample_request.n_sims, sample_request.sim_years
    assert sim["net_worth"].shape == (N, Y + 1)
    assert sim["income_tax_paid"].shape == (N, Y)
    for key in ("asset_rand", "asset_balances", "asset_ltcg_tax", "asset_stcg_tax"):
        assert set(sim[key].keys()) == {h.asset_class for h in sample_request.portfolio_holdings}


def test_no_nan_or_inf(sample_request, market_returns):
    sim = run_simulation(sample_request, market_returns)
    assert np.all(np.isfinite(sim["net_worth"]))
    assert np.all(np.isfinite(sim["income_tax_paid"]))


def test_determinism_same_seed(sample_request, market_returns):
    a = run_simulation(sample_request, market_returns)
    b = run_simulation(sample_request, market_returns)
    assert np.array_equal(a["net_worth"], b["net_worth"])


def test_different_seed_differs(sample_request, market_returns):
    a = run_simulation(sample_request, market_returns)
    other = sample_request.model_copy(update={"rng_seed": 1234})
    b = run_simulation(other, market_returns)
    assert not np.array_equal(a["net_worth"], b["net_worth"])


def test_initial_net_worth_matches_balance_sheet(sample_request, market_returns):
    sim = run_simulation(sample_request, market_returns)
    expected_t0 = (
        sample_request.savings
        + sum(h.current_value for h in sample_request.portfolio_holdings)
        - sample_request.emi_loan_amount
    )
    assert sim["net_worth"][:, 0] == pytest.approx(expected_t0, abs=1.0)


def test_taxes_non_negative(sample_request, market_returns):
    sim = run_simulation(sample_request, market_returns)
    assert np.all(sim["income_tax_paid"] >= 0)
    assert np.all(sim["ltcg_tax_paid"] >= 0)
    assert np.all(sim["stcg_tax_paid"] >= 0)


def test_apply_tax_false_zeroes_income_tax(sample_request, market_returns):
    no_tax = sample_request.model_copy(update={"apply_tax": False})
    sim = run_simulation(no_tax, market_returns)
    assert np.all(sim["income_tax_paid"] == 0)


# ── Pure financial helpers ────────────────────────────────────────────────────

def test_monthly_emi_known_value():
    # ₹20L @ 9% for 120 months ≈ ₹25,335/month
    emi = monthly_emi(2_000_000, 9.0, 120)
    assert emi == pytest.approx(25_335, abs=5)


def test_emi_zero_when_no_loan():
    assert monthly_emi(0, 9.0, 120) == 0.0
    assert monthly_emi(2_000_000, 9.0, 0) == 0.0


def test_remaining_principal_declines_to_zero():
    emi = monthly_emi(2_000_000, 9.0, 120)
    assert remaining_principal(2_000_000, 9.0, emi, 0) == pytest.approx(2_000_000, abs=1.0)
    assert remaining_principal(2_000_000, 9.0, emi, 120) == pytest.approx(0.0, abs=1.0)
    mid = remaining_principal(2_000_000, 9.0, emi, 60)
    assert 0 < mid < 2_000_000


def test_fire_number():
    assert fire_number(1_000_000, 0.04) == pytest.approx(25_000_000)


def test_drawdown_shape_and_range(sample_request, market_returns):
    sim = run_simulation(sample_request, market_returns)
    dd = compute_drawdown(sim["net_worth"])
    assert dd.shape == (sample_request.n_sims,)
    assert np.all((dd >= 0) & (dd <= 1))
