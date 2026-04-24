"""Offline drill — the live demo's failsafe must work with no network.

If this test passes, we can cut the venue's ethernet and the forecast
engine still answers. That's the whole point of the resilience layer.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from techem.data import external as ext
from techem.data.external import (
    MOCK_GEOCODE,
    MOCK_WEATHER,
    ensure_mock_geocode,
    ensure_mock_weather,
    fetch_weather_daily,
    geocode_zipcode,
)
from techem.serve import resilience
from techem.serve.api import app


def _break_network(monkeypatch) -> None:
    """Make every live external call raise ConnectionError."""

    def boom_nomi():
        raise ConnectionError("offline drill: pgeocode disabled")

    class BoomDaily:
        def __init__(self, *a, **kw):
            raise ConnectionError("offline drill: Meteostat disabled")

        def fetch(self):
            raise ConnectionError("offline drill: Meteostat disabled")

    monkeypatch.setattr(ext, "_nomi", boom_nomi)

    import meteostat

    # meteostat may not expose `Daily` at module top-level (import-time
    # error is one of the failure modes @resilient catches). Inject one
    # so `from meteostat import Daily` binds to our raising stub.
    monkeypatch.setattr(meteostat, "Daily", BoomDaily, raising=False)


def test_mock_fixtures_are_present():
    # The ensure_* helpers write tiny fallback files on startup. If they
    # aren't on disk, the whole offline story is vapourware.
    ensure_mock_geocode()
    ensure_mock_weather()
    assert MOCK_GEOCODE.exists()
    assert MOCK_WEATHER.exists()


def test_geocode_falls_back_when_network_down(monkeypatch):
    ensure_mock_geocode()
    resilience.clear_cache()
    _break_network(monkeypatch)
    result = geocode_zipcode("06112")  # Halle in the training data
    assert isinstance(result, dict)
    assert "lat" in result and "lon" in result


def test_weather_falls_back_when_network_down(monkeypatch):
    ensure_mock_weather()
    resilience.clear_cache()
    _break_network(monkeypatch)
    result = fetch_weather_daily(52.5, 13.4, "2024-01-01", "2024-01-07")
    # The fallback payload is a list of {date, tavg} dicts.
    assert isinstance(result, list) and len(result) > 0
    assert "date" in result[0] and "tavg" in result[0]


def test_forecast_endpoint_survives_offline(monkeypatch):
    """/forecast?use_live_weather=true must not 5xx with the network down."""
    ensure_mock_geocode()
    ensure_mock_weather()
    resilience.clear_cache()
    _break_network(monkeypatch)

    client = TestClient(app)
    resp = client.get("/forecast/unit/1/1", params={"horizon_days": 7, "use_live_weather": True})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["horizon_days"] == 7
    assert len(body["series"]) == 7
    assert body["total_point_kwh"] > 0
