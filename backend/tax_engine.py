"""
FinSim Pro — Tax engine (FY 2025-26 compliant)
"""
from __future__ import annotations
import numpy as np
from models import (
    TaxConfigIn,
    STANDARD_DEDUCTION_NEW,
    STANDARD_DEDUCTION_OLD,
    SECTION_80C,
    LTCG_HOLDING_DAYS,
)


# ─────────────────────────────────────────────────────────────────────────────
# SLAB CALCULATORS
# ─────────────────────────────────────────────────────────────────────────────

def _new_regime_slabs(taxable_income: float) -> float:
    """New regime slabs FY 2025-26 (Budget 2025)."""
    slabs = [
        (400_000, 0.00),
        (400_000, 0.05),
        (400_000, 0.10),
        (400_000, 0.15),
        (400_000, 0.20),
        (400_000, 0.25),
        (float("inf"), 0.30),
    ]
    tax = 0.0
    remaining = max(0.0, taxable_income)
    for limit, rate in slabs:
        chunk = min(remaining, limit)
        tax += chunk * rate
        remaining -= chunk
        if remaining <= 0:
            break
    return tax


def _old_regime_slabs(taxable_income: float) -> float:
    """Old regime slabs FY 2024-25."""
    slabs = [
        (250_000, 0.00),
        (250_000, 0.05),
        (500_000, 0.20),
        (float("inf"), 0.30),
    ]
    tax = 0.0
    remaining = max(0.0, taxable_income)
    for limit, rate in slabs:
        chunk = min(remaining, limit)
        tax += chunk * rate
        remaining -= chunk
        if remaining <= 0:
            break
    return tax


def _surcharge(income: float, tax: float) -> float:
    # FIX: 37% surcharge on >5Cr was abolished in Budget 2023.
    # Cap is now 25% for all income levels under both regimes.
    if income <= 5_000_000:
        rate = 0.0
    elif income <= 10_000_000:
        rate = 0.10
    elif income <= 20_000_000:
        rate = 0.15
    else:
        rate = 0.25   # was 0.37 for >5Cr — corrected
    return tax * rate


# ─────────────────────────────────────────────────────────────────────────────
# VECTORIZED SLAB HELPERS  (numpy arrays — used by run_simulation)
# ─────────────────────────────────────────────────────────────────────────────

def _new_regime_slabs_vec(taxable: np.ndarray) -> np.ndarray:
    """Vectorized new-regime slab tax — operates on shape (N,) array."""
    slabs = [
        (400_000, 0.00),
        (400_000, 0.05),
        (400_000, 0.10),
        (400_000, 0.15),
        (400_000, 0.20),
        (400_000, 0.25),
        (float("inf"), 0.30),
    ]
    tax = np.zeros_like(taxable)
    remaining = np.maximum(0.0, taxable)
    for limit, rate in slabs:
        chunk = np.minimum(remaining, limit)
        tax += chunk * rate
        remaining -= chunk
    return tax


def _old_regime_slabs_vec(taxable: np.ndarray) -> np.ndarray:
    """Vectorized old-regime slab tax — operates on shape (N,) array."""
    slabs = [
        (250_000, 0.00),
        (250_000, 0.05),
        (500_000, 0.20),
        (float("inf"), 0.30),
    ]
    tax = np.zeros_like(taxable)
    remaining = np.maximum(0.0, taxable)
    for limit, rate in slabs:
        chunk = np.minimum(remaining, limit)
        tax += chunk * rate
        remaining -= chunk
    return tax


def _surcharge_vec(income: np.ndarray, tax: np.ndarray) -> np.ndarray:
    """Vectorized surcharge — same corrected caps as scalar version."""
    rate = np.zeros_like(income)
    rate = np.where(income > 5_000_000,  0.10, rate)
    rate = np.where(income > 10_000_000, 0.15, rate)
    rate = np.where(income > 20_000_000, 0.25, rate)
    return tax * rate


def compute_tax_on_income_vec(annual_income: np.ndarray, tax_cfg: TaxConfigIn) -> np.ndarray:
    """
    Vectorized income-tax computation for an array of incomes.
    Returns total_tax array of same shape — used inside run_simulation
    to replace the O(N) Python list-comprehension loop.
    """
    if tax_cfg.regime == "new":
        std_ded  = STANDARD_DEDUCTION_NEW
        taxable  = np.maximum(0.0, annual_income - std_ded)
        base_tax = _new_regime_slabs_vec(taxable)
        rebate   = np.where(taxable <= 1_200_000, np.minimum(base_tax, 60_000), 0.0)
        base_tax = np.maximum(0.0, base_tax - rebate)
    else:
        std_ded    = STANDARD_DEDUCTION_OLD
        deductions = (std_ded + SECTION_80C + tax_cfg.section_80d
                      + tax_cfg.hra_exemption + min(tax_cfg.home_loan_interest, 200_000))
        taxable    = np.maximum(0.0, annual_income - deductions)
        base_tax   = _old_regime_slabs_vec(taxable)
        rebate     = np.where(taxable <= 500_000, np.minimum(base_tax, 12_500), 0.0)
        base_tax   = np.maximum(0.0, base_tax - rebate)

    surcharge_amt = _surcharge_vec(annual_income, base_tax)
    tax_after_sc  = base_tax + surcharge_amt
    cess          = tax_after_sc * 0.04
    total_tax     = tax_after_sc + cess
    # Safe division: guard against income==0 producing 0/0 (nan) warnings.
    eff_rate      = np.divide(
        total_tax, annual_income,
        out=np.zeros_like(total_tax, dtype=np.float64), where=annual_income > 0,
    )
    return total_tax, eff_rate


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC SCALAR API  (unchanged interface — used by /tax/snapshot endpoint)
# ─────────────────────────────────────────────────────────────────────────────

def compute_tax_on_income(annual_income: float, tax_cfg: TaxConfigIn) -> dict:
    """Returns full breakdown dict for a single income value."""
    if tax_cfg.regime == "new":
        std_ded  = STANDARD_DEDUCTION_NEW
        taxable  = max(0.0, annual_income - std_ded)
        base_tax = _new_regime_slabs(taxable)
        rebate   = min(base_tax, 60_000) if taxable <= 1_200_000 else 0.0
        base_tax = max(0.0, base_tax - rebate)
    else:
        std_ded    = STANDARD_DEDUCTION_OLD
        deductions = (std_ded + SECTION_80C + tax_cfg.section_80d
                      + tax_cfg.hra_exemption + min(tax_cfg.home_loan_interest, 200_000))
        taxable    = max(0.0, annual_income - deductions)
        base_tax   = _old_regime_slabs(taxable)
        rebate     = min(base_tax, 12_500) if taxable <= 500_000 else 0.0
        base_tax   = max(0.0, base_tax - rebate)

    surcharge_amt = _surcharge(annual_income, base_tax)
    tax_after_sc  = base_tax + surcharge_amt
    cess          = tax_after_sc * 0.04
    total_tax     = tax_after_sc + cess
    eff_rate      = total_tax / annual_income if annual_income > 0 else 0.0

    return {
        "taxable_income": taxable,
        "base_tax": base_tax,
        "surcharge": surcharge_amt,
        "cess": cess,
        "total_tax": total_tax,
        "effective_rate": eff_rate,
        "regime": tax_cfg.regime,
    }


def compute_asset_tax(
    asset_class: str,
    gains: float,
    holding_period_days: int,
    tax_cfg: TaxConfigIn,
) -> dict:
    """
    Scalar asset capital-gains tax.
    FIX: Uses LTCG_HOLDING_DAYS from models (no duplication).
    FIX: Indexation formula corrected — reduces cost basis, not gains directly.
    FIX: International Equity rates now pulled from tax_cfg instead of hardcoded.
    """
    ltcg_tax = 0.0
    stcg_tax = 0.0
    threshold = LTCG_HOLDING_DAYS.get(asset_class, 365)

    equity_classes = {"Indian Equity", "Nifty Bank", "Nifty IT"}

    if asset_class in equity_classes:
        if holding_period_days > threshold:
            taxable  = max(0.0, gains - tax_cfg.ltcg_exempt_limit)
            ltcg_tax = taxable * tax_cfg.ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.stcg_rate

    elif asset_class == "Gold":
        if holding_period_days > threshold:
            # FIX: indexation reduces cost, not gains; approx CII uplift ~5%/yr
            years_held    = holding_period_days / 365
            indexed_cost_uplift = gains * min(0.05 * years_held, 0.6)  # cap at 60%
            taxable_gain  = max(0.0, gains - indexed_cost_uplift)
            ltcg_tax      = taxable_gain * tax_cfg.gold_ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.gold_stcg_rate

    elif asset_class == "Real Estate":
        if holding_period_days > threshold:
            years_held          = holding_period_days / 365
            indexed_cost_uplift = gains * min(0.05 * years_held, 0.6)
            taxable_gain        = max(0.0, gains - indexed_cost_uplift)
            ltcg_tax            = taxable_gain * tax_cfg.re_ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.re_stcg_rate

    elif asset_class == "Debt/Bonds":
        # Debt is always taxed at income slab rate post-2023; stcg_rate approximates this
        stcg_tax = max(0.0, gains) * tax_cfg.debt_stcg_rate

    elif asset_class == "International Equity":
        if holding_period_days > threshold:
            years_held          = holding_period_days / 365
            indexed_cost_uplift = gains * min(0.05 * years_held, 0.6)
            taxable_gain        = max(0.0, gains - indexed_cost_uplift)
            # FIX: was hardcoded 0.20; now uses tax_cfg.intl_ltcg_rate
            ltcg_tax            = taxable_gain * tax_cfg.intl_ltcg_rate
        else:
            # FIX: was hardcoded 0.30; now uses tax_cfg.intl_stcg_rate
            stcg_tax = max(0.0, gains) * tax_cfg.intl_stcg_rate

    return {
        "ltcg_tax": ltcg_tax,
        "stcg_tax": stcg_tax,
        "total_tax": ltcg_tax + stcg_tax,
        "asset_class": asset_class,
    }


def compute_asset_tax_vec(
    asset_class: str,
    gains: np.ndarray,
    holding_period_days: int,
    tax_cfg: TaxConfigIn,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Vectorized asset capital-gains tax for shape (N,) gains array.
    Returns (ltcg_tax, stcg_tax) arrays — used inside run_simulation
    to replace the O(N) Python list-comprehension loop.
    """
    ltcg_tax = np.zeros_like(gains)
    stcg_tax = np.zeros_like(gains)
    threshold = LTCG_HOLDING_DAYS.get(asset_class, 365)
    gains_pos = np.maximum(0.0, gains)

    equity_classes = {"Indian Equity", "Nifty Bank", "Nifty IT"}

    if asset_class in equity_classes:
        if holding_period_days > threshold:
            taxable  = np.maximum(0.0, gains_pos - tax_cfg.ltcg_exempt_limit)
            ltcg_tax = taxable * tax_cfg.ltcg_rate
        else:
            stcg_tax = gains_pos * tax_cfg.stcg_rate

    elif asset_class in {"Gold", "Real Estate", "International Equity"}:
        years_held          = holding_period_days / 365
        indexed_cost_uplift = gains_pos * min(0.05 * years_held, 0.6)
        taxable_gain        = np.maximum(0.0, gains_pos - indexed_cost_uplift)

        if holding_period_days > threshold:
            if asset_class == "Gold":
                ltcg_tax = taxable_gain * tax_cfg.gold_ltcg_rate
            elif asset_class == "Real Estate":
                ltcg_tax = taxable_gain * tax_cfg.re_ltcg_rate
            else:  # International Equity
                ltcg_tax = taxable_gain * tax_cfg.intl_ltcg_rate
        else:
            if asset_class == "Gold":
                stcg_tax = gains_pos * tax_cfg.gold_stcg_rate
            elif asset_class == "Real Estate":
                stcg_tax = gains_pos * tax_cfg.re_stcg_rate
            else:
                stcg_tax = gains_pos * tax_cfg.intl_stcg_rate

    elif asset_class == "Debt/Bonds":
        stcg_tax = gains_pos * tax_cfg.debt_stcg_rate

    return ltcg_tax, stcg_tax