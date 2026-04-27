"""
FinSim Pro — Tax engine (FY 2024-25 compliant)
"""
from __future__ import annotations
from models import TaxConfigIn, STANDARD_DEDUCTION_NEW, STANDARD_DEDUCTION_OLD, SECTION_80C


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
    if income <= 5_000_000:
        rate = 0.0
    elif income <= 10_000_000:
        rate = 0.10
    elif income <= 20_000_000:
        rate = 0.15
    elif income <= 50_000_000:
        rate = 0.25
    else:
        rate = 0.37
    return tax * rate


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def compute_tax_on_income(annual_income: float, tax_cfg: TaxConfigIn) -> dict:
    """Returns full breakdown dict."""
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
    """Asset-class and holding-period aware capital-gains tax."""
    ltcg_tax = 0.0
    stcg_tax = 0.0

    equity_classes = {"Indian Equity", "Nifty Bank", "Nifty IT"}

    if asset_class in equity_classes:
        if holding_period_days > 365:
            taxable  = max(0.0, gains - tax_cfg.ltcg_exempt_limit)
            ltcg_tax = taxable * tax_cfg.ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.stcg_rate

    elif asset_class == "Gold":
        if holding_period_days > 1095:
            years_held    = holding_period_days / 365
            indexed_gains = gains * (1 - 0.05 * years_held)
            ltcg_tax      = max(0.0, indexed_gains) * tax_cfg.gold_ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.gold_stcg_rate

    elif asset_class == "Real Estate":
        if holding_period_days > 730:
            years_held    = holding_period_days / 365
            indexed_gains = gains * (1 - 0.05 * years_held)
            ltcg_tax      = max(0.0, indexed_gains) * tax_cfg.re_ltcg_rate
        else:
            stcg_tax = max(0.0, gains) * tax_cfg.re_stcg_rate

    elif asset_class == "Debt/Bonds":
        stcg_tax = max(0.0, gains) * tax_cfg.debt_stcg_rate

    elif asset_class == "International Equity":
        if holding_period_days > 730:
            years_held    = holding_period_days / 365
            indexed_gains = gains * (1 - 0.05 * years_held)
            ltcg_tax      = max(0.0, indexed_gains) * 0.20
        else:
            stcg_tax = max(0.0, gains) * 0.30

    return {
        "ltcg_tax": ltcg_tax,
        "stcg_tax": stcg_tax,
        "total_tax": ltcg_tax + stcg_tax,
        "asset_class": asset_class,
    }