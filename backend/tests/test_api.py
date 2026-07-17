"""End-to-end API contract tests for /simulate and /stress-test.

The market-data forecast (Prophet/yfinance) is stubbed so tests are fast,
deterministic, and offline.
"""
import pytest

pytest.importorskip("httpx")          # TestClient dependency
main = pytest.importorskip("main")    # skips if heavy optional deps are missing

from fastapi.testclient import TestClient
from models import ASSET_DEFAULTS


@pytest.fixture
def client(monkeypatch):
    def fake_forecast(holdings, years):
        forecasts = {
            h.asset_class: {
                "cagr": ASSET_DEFAULTS[h.asset_class]["cagr"],
                "vol": ASSET_DEFAULTS[h.asset_class]["vol"],
                "weight": 1.0 / len(holdings),
                "success": False,
            }
            for h in holdings
        }
        blended_cagr = sum(f["cagr"] * f["weight"] for f in forecasts.values())
        blended_vol = sum(f["vol"] * f["weight"] for f in forecasts.values())
        return blended_cagr, blended_vol, forecasts

    # /simulate imports get_blended_forecast into the `main` namespace at module
    # load — patch it there so the endpoint skips Prophet/yfinance.
    monkeypatch.setattr(main, "get_blended_forecast", fake_forecast)
    return TestClient(main.app)


PAYLOAD = {
    "savings": 500_000, "income": 100_000, "expenses": 40_000, "age": 28,
    "portfolio_holdings": [
        {"asset_class": "Indian Equity", "current_value": 300_000, "purchase_price": 240_000, "monthly_sip": 10_000},
        {"asset_class": "Gold", "current_value": 100_000, "purchase_price": 80_000, "monthly_sip": 2_000},
        {"asset_class": "Debt/Bonds", "current_value": 100_000, "purchase_price": 100_000, "monthly_sip": 3_000},
    ],
    "goals": [
        {"name": "House", "target_amount": 3_000_000, "target_year": 5, "priority": "Critical", "inflation_adjust": False},
    ],
    "sim_years": 10, "n_sims": 300,
}


def test_health(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_simulate_returns_probabilistic_goals(client):
    r = client.post("/simulate", json=PAYLOAD)
    assert r.status_code == 200, r.text
    body = r.json()
    goal = body["goal_results"][0]
    assert "prob_funded_pct" in goal
    assert "shortfall" not in goal              # old field removed
    assert 0.0 <= goal["prob_funded_pct"] <= 100.0
    assert isinstance(goal["on_track"], bool)


def test_simulate_rejects_income_below_expenses(client):
    bad = {**PAYLOAD, "income": 30_000, "expenses": 40_000}
    r = client.post("/simulate", json=bad)
    assert r.status_code == 400


def test_simulate_rejects_out_of_bounds_n_sims(client):
    bad = {**PAYLOAD, "n_sims": 10_000_000}
    r = client.post("/simulate", json=bad)
    assert r.status_code == 422        # pydantic validation
