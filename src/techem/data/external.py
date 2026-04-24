"""Keyless external data: geocoding (pgeocode), weather (Meteostat).

Everything here is wrapped with `@resilient` so a live demo does not die
when Meteostat's server hiccups.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import pandas as pd

from techem.config import DATA_EXTERNAL, SIM_TODAY
from techem.serve.resilience import resilient

log = logging.getLogger(__name__)

MOCK_WEATHER = DATA_EXTERNAL / "mock_weather.json"
MOCK_GEOCODE = DATA_EXTERNAL / "mock_geocode.json"


@lru_cache(maxsize=1)
def _nomi():
    import pgeocode
    return pgeocode.Nominatim("de")


@resilient(fallback=MOCK_GEOCODE, ttl_seconds=60 * 60 * 24 * 30)
def geocode_zipcode(zipcode: str) -> dict:
    """Return {'zipcode', 'lat', 'lon', 'place'} for a German zipcode."""
    z = str(zipcode).zfill(5)
    info = _nomi().query_postal_code(z)
    if info is None or pd.isna(info.latitude):
        raise ValueError(f"No geocode for {z}")
    return {
        "zipcode": z,
        "lat": float(info.latitude),
        "lon": float(info.longitude),
        "place": str(info.place_name),
    }


@resilient(fallback=MOCK_WEATHER, ttl_seconds=60 * 60 * 6)
def fetch_weather_daily(
    lat: float,
    lon: float,
    start: str,
    end: str,
) -> list[dict]:
    """Daily mean temperature via Meteostat.

    Returns list of {'date': 'YYYY-MM-DD', 'tavg': float}.
    """
    from meteostat import Daily, Point

    loc = Point(float(lat), float(lon))
    s = datetime.fromisoformat(str(start))
    e = datetime.fromisoformat(str(end))
    df = Daily(loc, s, e).fetch()
    if df is None or df.empty:
        raise RuntimeError(f"Meteostat returned empty frame for ({lat},{lon})")
    df = df.reset_index().rename(columns={"time": "date"})
    out = [
        {"date": r["date"].date().isoformat(), "tavg": float(r["tavg"]) if pd.notna(r["tavg"]) else None}
        for _, r in df.iterrows()
    ]
    return out


def weather_forecast(zipcode: str, horizon_days: int = 14) -> pd.DataFrame:
    g = geocode_zipcode(zipcode)
    today = SIM_TODAY
    rows = fetch_weather_daily(
        g["lat"], g["lon"],
        (today - timedelta(days=1)).isoformat(),
        (today + timedelta(days=horizon_days)).isoformat(),
    )
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df[df["date"] >= pd.Timestamp(today)].reset_index(drop=True)
    return df


def ensure_mock_weather(n_days: int = 14) -> None:
    """Write a small deterministic fallback file if none exists.

    Lets the offline drill (`pytest -k offline`) and a no-network demo
    still return *something* sensible.
    """
    if MOCK_WEATHER.exists():
        return
    base = SIM_TODAY
    payload = [
        {"date": (base + timedelta(days=i)).isoformat(), "tavg": 2.0 + 0.2 * i}
        for i in range(0, n_days + 1)
    ]
    MOCK_WEATHER.write_text(json.dumps(payload), encoding="utf-8")
    log.info("wrote fallback %s", MOCK_WEATHER)


def ensure_mock_geocode() -> None:
    if MOCK_GEOCODE.exists():
        return
    payload = {"zipcode": "10115", "lat": 52.5320, "lon": 13.3846, "place": "Berlin"}
    MOCK_GEOCODE.write_text(json.dumps(payload), encoding="utf-8")
