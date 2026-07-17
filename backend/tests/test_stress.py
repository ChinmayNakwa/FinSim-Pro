"""Stress-test engine: Common Random Numbers + baseline-reuse correctness."""
import numpy as np
import pytest

from finance import run_simulation
from stress_test import run_stress_test, run_all_scenarios, _apply_shock, SCENARIOS


SHOCK_YEAR = 3


def test_crn_pre_shock_identical(sample_request, market_returns):
    """Baseline and shocked net worth must match exactly before the shock year."""
    baseline = run_simulation(sample_request, market_returns)
    shocked_returns = _apply_shock(
        baseline["asset_rand"], market_returns,
        SCENARIOS["market_crash_2008"], SHOCK_YEAR, sample_request.sim_years,
    )
    shocked = run_simulation(
        sample_request, market_returns,
        prebuilt_income_mult=np.ones(sample_request.sim_years),
        prebuilt_asset_rand=shocked_returns,
    )
    # Returns at index y affect net_worth[:, y+1]; shock starts at SHOCK_YEAR.
    pre = slice(0, SHOCK_YEAR + 1)
    assert np.allclose(baseline["net_worth"][:, pre], shocked["net_worth"][:, pre])


def test_shock_has_effect(sample_request, market_returns):
    res = run_stress_test(sample_request, market_returns, "market_crash_2008", SHOCK_YEAR)
    # A crash should not leave the median terminal net worth better than baseline.
    assert res["metrics"]["median_nw_loss_pct"] <= 0.5


def test_non_shock_years_untouched_by_apply_shock(sample_request, market_returns):
    baseline = run_simulation(sample_request, market_returns)
    base_rand = baseline["asset_rand"]
    scenario = SCENARIOS["covid_2020"]
    shocked = _apply_shock(base_rand, market_returns, scenario, SHOCK_YEAR, sample_request.sim_years)

    shock_dur = scenario["shock_duration_years"]
    rec_years = scenario["recovery_years"]
    touched = set(range(SHOCK_YEAR, SHOCK_YEAR + shock_dur + rec_years))
    for ac, arr in shocked.items():
        for y in range(sample_request.sim_years):
            if y not in touched:
                assert np.array_equal(arr[:, y], base_rand[ac][:, y]), f"{ac} year {y} changed unexpectedly"


def test_scenarios_produce_distinct_losses(sample_request, market_returns):
    """The headline loss is trough-based, so different scenarios must differ
    meaningfully (a terminal metric collapsed them all to ~0%)."""
    baseline = run_simulation(sample_request, market_returns)
    losses = {
        k: run_stress_test(sample_request, market_returns, k, SHOCK_YEAR, baseline_sim=baseline)
             ["metrics"]["median_nw_loss_pct"]
        for k in SCENARIOS
    }
    # Every scenario should show a real dip, and they shouldn't be identical.
    assert all(v < -1.0 for v in losses.values()), losses
    assert max(losses.values()) - min(losses.values()) > 5.0, losses


def test_shock_year_changes_result(sample_request, market_returns):
    baseline = run_simulation(sample_request, market_returns)
    a = run_stress_test(sample_request, market_returns, "market_crash_2008", 2, baseline_sim=baseline)
    b = run_stress_test(sample_request, market_returns, "market_crash_2008", 8, baseline_sim=baseline)
    assert a["delta_p50"] != b["delta_p50"]


def test_run_all_returns_all_scenarios(sample_request, market_returns):
    results = run_all_scenarios(sample_request, market_returns, SHOCK_YEAR)
    assert len(results) == len(SCENARIOS)
    assert {r["scenario_key"] for r in results} == set(SCENARIOS.keys())


def test_baseline_reuse_matches_independent(sample_request, market_returns):
    """Passing a precomputed baseline must yield identical results to computing it inline."""
    baseline = run_simulation(sample_request, market_returns)
    with_reuse = run_stress_test(
        sample_request, market_returns, "stagflation", SHOCK_YEAR, baseline_sim=baseline
    )
    without = run_stress_test(sample_request, market_returns, "stagflation", SHOCK_YEAR)
    assert with_reuse["metrics"] == without["metrics"]
    assert with_reuse["delta_p50"] == without["delta_p50"]
