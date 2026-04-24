"""Tool declarations that bind internal Python helpers for the Gemini model.

Each tool is a thin wrapper around existing internal code paths (no HTTP
self-calls). The wrappers are pre-bound to a (property_id, unit_id) context
so the LLM cannot access other tenants' data.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

log = logging.getLogger(__name__)


def _safe_call(fn: Callable, **kwargs) -> dict:
    """Call *fn* and return a JSON-serialisable dict, or an error dict."""
    try:
        result = fn(**kwargs)
        if hasattr(result, "model_dump"):
            return result.model_dump()
        if hasattr(result, "__dict__"):
            return result.__dict__
        if isinstance(result, list):
            return {"items": [r.model_dump() if hasattr(r, "model_dump") else (r.__dict__ if hasattr(r, "__dict__") else r) for r in result]}
        return {"result": result}
    except Exception as exc:
        log.warning("Tool call %s failed: %s", fn.__name__, exc)
        return {"error": str(exc)}


def build_bound_tools(property_id: int, unit_id: int) -> dict[str, Callable]:
    """Return a name→callable mapping, each pre-bound to the tenant context.

    Imports are deferred so that the LLM package can be loaded even when
    heavy model artifacts haven't been initialised yet.
    """
    # Lazy imports to avoid circular deps and heavy startup cost.
    from techem.serve.api import (
        forecast_unit,
        drilldown_unit,
        whatif,
        peers,
        _unit_daily,
        _room_sens,
        _consumption,
    )
    from techem.models.today import compute_today
    from techem.models.leaks import detect_all
    from techem.models.recommendations import compute_recommendations
    from techem.serve.api import WhatIfRequest

    pid, uid = property_id, unit_id

    def get_forecast(horizon_days: int = 30) -> dict:
        """Get the energy consumption forecast for the tenant's unit."""
        resp = forecast_unit(pid, uid, horizon_days=horizon_days)
        return _safe_call(lambda: resp)

    def get_drilldown(horizon_days: int = 30) -> dict:
        """Get room-by-room consumption breakdown."""
        resp = drilldown_unit(pid, uid, horizon_days=horizon_days)
        return _safe_call(lambda: resp)

    def what_if(temp_delta_c: float, room_id: int | None = None, horizon_days: int = 30) -> dict:
        """Simulate the impact of changing the thermostat setpoint."""
        req = WhatIfRequest(temp_delta_c=temp_delta_c, room_id=room_id, horizon_days=horizon_days)
        return _safe_call(whatif, pid=pid, uid=uid, req=req)

    def get_peers() -> dict:
        """Compare this tenant's consumption with similar flats."""
        return _safe_call(peers, pid=pid, uid=uid)

    def get_today() -> dict:
        """Get today's consumption, cost and CO₂ so far."""
        return _safe_call(
            compute_today,
            property_id=pid,
            unit_id=uid,
            unit_daily=_unit_daily(),
        )

    def get_leak_signals() -> dict:
        """Check for anomalies: insulation issues, sensor faults, spikes."""
        return _safe_call(
            detect_all,
            property_id=pid,
            unit_id=uid,
            unit_daily=_unit_daily(),
            consumption=_consumption(),
            room_sens=_room_sens(),
        )

    def get_recommendations() -> dict:
        """Get ranked energy-saving recommendations."""
        return _safe_call(
            compute_recommendations,
            property_id=pid,
            unit_id=uid,
            unit_daily=_unit_daily(),
            consumption=_consumption(),
            room_sens=_room_sens(),
        )

    return {
        "get_forecast": get_forecast,
        "get_drilldown": get_drilldown,
        "what_if": what_if,
        "get_peers": get_peers,
        "get_today": get_today,
        "get_leak_signals": get_leak_signals,
        "get_recommendations": get_recommendations,
    }


# -- Gemini function declarations (the schema the model sees) ---------

TOOL_DECLARATIONS = [
    {
        "name": "get_forecast",
        "description": "Get the energy consumption forecast for the tenant's flat. Returns daily kWh, cost in EUR, and CO₂ in grams.",
        "parameters": {
            "type": "object",
            "properties": {
                "horizon_days": {
                    "type": "integer",
                    "description": "Number of days to forecast (1–90). Default 30.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_drilldown",
        "description": "Get room-by-room consumption breakdown of the forecast. Shows each room's share and kWh.",
        "parameters": {
            "type": "object",
            "properties": {
                "horizon_days": {
                    "type": "integer",
                    "description": "Forecast horizon in days (1–90). Default 30.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "what_if",
        "description": "Simulate the effect of changing the thermostat setpoint by a given number of degrees. Negative = turn down (saves energy). Returns baseline vs counterfactual kWh, cost, and CO₂.",
        "parameters": {
            "type": "object",
            "properties": {
                "temp_delta_c": {
                    "type": "number",
                    "description": "Setpoint change in °C. E.g. -1 means turning down by 1 degree.",
                },
                "room_id": {
                    "type": "integer",
                    "description": "Optional room ID. If omitted, applies to all rooms.",
                },
                "horizon_days": {
                    "type": "integer",
                    "description": "Simulation horizon in days. Default 30.",
                },
            },
            "required": ["temp_delta_c"],
        },
    },
    {
        "name": "get_peers",
        "description": "Compare this tenant with similar flats (same size, energy source, city). Returns percentile rank, badges, equivalents.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_today",
        "description": "Get today's consumption so far: kWh, cost in EUR, CO₂ in grams. Also compares to yesterday and the weekday average.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_leak_signals",
        "description": "Check for anomalies in the tenant's heating system: insulation problems, unexpected consumption spikes, room share drifts, stuck sensors.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_recommendations",
        "description": "Get ranked energy-saving recommendations with estimated monthly EUR and CO₂ savings per action.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]
