"""Input-bounds validation on the request models."""
import pytest
from pydantic import ValidationError

from models import SimulationRequest, GoalIn, PortfolioHoldingIn


def test_n_sims_capped():
    with pytest.raises(ValidationError):
        SimulationRequest(n_sims=1_000_000)   # above the 10k cap


def test_n_sims_floor():
    with pytest.raises(ValidationError):
        SimulationRequest(n_sims=0)


def test_sim_years_bounds():
    with pytest.raises(ValidationError):
        SimulationRequest(sim_years=0)
    with pytest.raises(ValidationError):
        SimulationRequest(sim_years=100)


def test_negative_savings_rejected():
    with pytest.raises(ValidationError):
        SimulationRequest(savings=-1)


def test_withdrawal_rate_must_be_positive_fraction():
    with pytest.raises(ValidationError):
        SimulationRequest(withdrawal_rate=0)
    with pytest.raises(ValidationError):
        SimulationRequest(withdrawal_rate=1.5)


def test_valid_defaults_still_construct():
    # The defaults the frontend actually sends must remain valid.
    req = SimulationRequest(n_sims=2000, sim_years=40, emergency_months=24, emi_rate=15, emi_tenure_years=30)
    assert req.n_sims == 2000


def test_goal_bounds():
    with pytest.raises(ValidationError):
        GoalIn(name="x", target_amount=-1, target_year=5)
    with pytest.raises(ValidationError):
        GoalIn(name="x", target_amount=100, target_year=0)


def test_holding_bounds():
    with pytest.raises(ValidationError):
        PortfolioHoldingIn(asset_class="Gold", current_value=-1, purchase_price=100)
