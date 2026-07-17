"""Golden-value and parity tests for the tax engine.

Golden values are hand-computed from the FY2025-26 slabs encoded in
tax_engine.py. If a slab/rate/deduction changes, these are expected to
change too — update them deliberately.
"""
import numpy as np
import pytest

from models import TaxConfigIn
from tax_engine import (
    compute_tax_on_income,
    compute_tax_on_income_vec,
    compute_asset_tax,
    compute_asset_tax_vec,
)

NEW = TaxConfigIn(regime="new")
OLD = TaxConfigIn(regime="old")


# ── Income tax: known-value goldens ──────────────────────────────────────────

@pytest.mark.parametrize("income, expected_total", [
    (0,          0.0),         # no income → no tax
    (1_200_000,  0.0),         # new-regime rebate zeroes it out
    (1_500_000,  97_500.0),    # 93,750 base + 4% cess
])
def test_new_regime_golden(income, expected_total):
    res = compute_tax_on_income(income, NEW)
    assert res["total_tax"] == pytest.approx(expected_total, abs=1.0)


def test_new_regime_1_5m_breakdown():
    res = compute_tax_on_income(1_500_000, NEW)
    assert res["taxable_income"] == pytest.approx(1_425_000, abs=1.0)
    assert res["base_tax"] == pytest.approx(93_750, abs=1.0)
    assert res["surcharge"] == pytest.approx(0.0, abs=1.0)
    assert res["cess"] == pytest.approx(3_750, abs=1.0)
    assert res["effective_rate"] == pytest.approx(0.065, abs=1e-4)


def test_old_regime_golden():
    res = compute_tax_on_income(1_500_000, OLD)
    # deductions 225k → taxable 1,275,000 → base 195,000 → +4% cess = 202,800
    assert res["taxable_income"] == pytest.approx(1_275_000, abs=1.0)
    assert res["base_tax"] == pytest.approx(195_000, abs=1.0)
    assert res["total_tax"] == pytest.approx(202_800, abs=1.0)


def test_surcharge_kicks_in_above_5cr():
    # Base income well above ₹5Cr should attract a surcharge.
    low = compute_tax_on_income(4_000_000, NEW)
    high = compute_tax_on_income(60_000_000, NEW)
    assert low["surcharge"] == 0.0
    assert high["surcharge"] > 0.0


def test_effective_rate_monotonic():
    incomes = [500_000, 1_500_000, 3_000_000, 8_000_000, 25_000_000]
    rates = [compute_tax_on_income(i, NEW)["effective_rate"] for i in incomes]
    assert rates == sorted(rates), "effective tax rate should be non-decreasing in income"


# ── Income tax: scalar ↔ vectorized parity ───────────────────────────────────

@pytest.mark.parametrize("cfg", [NEW, OLD])
def test_income_tax_vec_matches_scalar(cfg):
    incomes = np.array([0, 300_000, 1_200_000, 1_500_000, 3_000_000, 12_000_000, 30_000_000], dtype=float)
    total_vec, eff_vec = compute_tax_on_income_vec(incomes, cfg)
    for i, inc in enumerate(incomes):
        scalar = compute_tax_on_income(float(inc), cfg)
        assert total_vec[i] == pytest.approx(scalar["total_tax"], abs=1.0)
        assert eff_vec[i] == pytest.approx(scalar["effective_rate"], abs=1e-6)


# ── Asset capital-gains tax ───────────────────────────────────────────────────

def test_equity_ltcg_exemption_applied():
    # Long-held equity: first ₹1.25L of gains is exempt.
    res = compute_asset_tax("Indian Equity", gains=200_000, holding_period_days=400, tax_cfg=NEW)
    taxable = 200_000 - NEW.ltcg_exempt_limit  # 75,000
    assert res["ltcg_tax"] == pytest.approx(taxable * NEW.ltcg_rate, abs=1.0)
    assert res["stcg_tax"] == 0.0


def test_equity_stcg_when_short_held():
    res = compute_asset_tax("Indian Equity", gains=100_000, holding_period_days=100, tax_cfg=NEW)
    assert res["stcg_tax"] == pytest.approx(100_000 * NEW.stcg_rate, abs=1.0)
    assert res["ltcg_tax"] == 0.0


def test_debt_always_stcg():
    long_held = compute_asset_tax("Debt/Bonds", gains=50_000, holding_period_days=2_000, tax_cfg=NEW)
    assert long_held["ltcg_tax"] == 0.0
    assert long_held["stcg_tax"] == pytest.approx(50_000 * NEW.debt_stcg_rate, abs=1.0)


def test_negative_gains_never_taxed():
    for ac in ["Indian Equity", "Gold", "Real Estate", "Debt/Bonds", "International Equity"]:
        res = compute_asset_tax(ac, gains=-100_000, holding_period_days=800, tax_cfg=NEW)
        assert res["total_tax"] == 0.0


@pytest.mark.parametrize("ac", [
    "Indian Equity", "Nifty Bank", "Nifty IT", "Gold",
    "Real Estate", "International Equity", "Debt/Bonds",
])
@pytest.mark.parametrize("days", [100, 400, 800, 1_200])
def test_asset_tax_vec_matches_scalar(ac, days):
    gains = np.array([-50_000, 0.0, 100_000, 500_000], dtype=float)
    ltcg_vec, stcg_vec = compute_asset_tax_vec(ac, gains, days, NEW)
    for i, g in enumerate(gains):
        scalar = compute_asset_tax(ac, float(g), days, NEW)
        assert ltcg_vec[i] == pytest.approx(scalar["ltcg_tax"], abs=1.0)
        assert stcg_vec[i] == pytest.approx(scalar["stcg_tax"], abs=1.0)
