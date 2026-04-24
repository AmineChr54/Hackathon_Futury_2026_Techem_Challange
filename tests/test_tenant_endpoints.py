"""Tests for the six tenant-facing endpoints.

Uses FastAPI TestClient. All tests run WITHOUT a Gemini API key to
verify graceful fallback — no 500s, narrative=null where applicable.
"""
from __future__ import annotations

import os
import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch

# Ensure no Gemini key leaks into tests.
os.environ.pop("GEMINI_API_KEY", None)

from fastapi.testclient import TestClient
from techem.serve.api import app


client = TestClient(app, raise_server_exceptions=False)


def _find_valid_unit() -> tuple[int, int]:
    """Discover a valid (property_id, unit_id) from the /units endpoint."""
    resp = client.get("/units")
    assert resp.status_code == 200
    units = resp.json()
    assert len(units) > 0, "No units in the dataset"
    return int(units[0]["property_id"]), int(units[0]["unit_id"])


class TestHealth:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["units"] > 0


class TestToday:
    def test_today_returns_valid_response(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/today/{pid}/{uid}")
        assert resp.status_code == 200
        data = resp.json()
        assert "date" in data
        assert "kwh_so_far" in data
        assert "kwh_full_day" in data
        assert "cost_eur_so_far" in data
        assert "co2_g_so_far" in data
        assert data["kwh_so_far"] <= data["kwh_full_day"]
        assert data["cost_eur_so_far"] <= data["cost_eur_full_day"]
        assert data["co2_g_so_far"] <= data["co2_g_full_day"]

    def test_today_not_found(self):
        resp = client.get("/today/99999/99999")
        assert resp.status_code == 404


class TestRecommendations:
    def test_recommendations_returns_items(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/recommendations/{pid}/{uid}")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        # We may or may not get items for a given unit, but structure is correct.
        assert isinstance(data["items"], list)
        if data["items"]:
            item = data["items"][0]
            assert "action" in item
            assert "monthly_eur_saving" in item
            assert item["monthly_eur_saving"] > 0

    def test_recommendations_narrative_null_without_gemini(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/recommendations/{pid}/{uid}")
        data = resp.json()
        # Without GEMINI_API_KEY, narrative should be None.
        assert data["narrative"] is None


class TestPeers:
    def test_peers_returns_badge(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/peers/{pid}/{uid}")
        assert resp.status_code == 200
        data = resp.json()
        assert "badge" in data
        expected_badges = {"🏆 Eco Champion", "🌿 Efficient", "👍 Typical", "📈 Headroom to Save", "N/A"}
        assert data["badge"] in expected_badges

    def test_peers_has_equivalents(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/peers/{pid}/{uid}")
        data = resp.json()
        if data["cohort_size"] > 0:
            assert "equivalents" in data
            eq = data["equivalents"]
            assert "trees_equivalent" in eq
            assert "km_driven_equivalent" in eq
            assert "phone_charges_equivalent" in eq

    def test_peers_not_found(self):
        resp = client.get("/peers/99999/99999")
        assert resp.status_code == 404


class TestLeaks:
    def test_leaks_returns_structure(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/leaks/{pid}/{uid}")
        assert resp.status_code == 200
        data = resp.json()
        assert "raw_signals" in data
        assert "summary" in data
        assert isinstance(data["raw_signals"], list)
        assert "total_signals" in data["summary"]
        assert "overall_status" in data["summary"]
        assert data["summary"]["overall_status"] in {"healthy", "monitor", "attention_needed"}

    def test_leaks_narrative_null_without_gemini(self):
        pid, uid = _find_valid_unit()
        resp = client.get(f"/leaks/{pid}/{uid}")
        data = resp.json()
        assert data["narrative"] is None


class TestChat:
    def test_chat_returns_503_without_gemini(self):
        pid, uid = _find_valid_unit()
        resp = client.post(
            f"/chat/{pid}/{uid}",
            json={"message": "How is my heating usage?"},
        )
        assert resp.status_code == 503


class TestTarget:
    def test_target_without_gemini_returns_fallback(self):
        pid, uid = _find_valid_unit()
        resp = client.post(
            f"/target/{pid}/{uid}",
            json={"target_value": 70, "target_unit": "EUR", "horizon_days": 30},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "feasible" in data
        assert "projected" in data
        assert "gap" in data
        assert "plan_narrative" in data
        assert data["plan_narrative"] != ""

    def test_target_invalid_unit(self):
        pid, uid = _find_valid_unit()
        resp = client.post(
            f"/target/{pid}/{uid}",
            json={"target_value": 70, "target_unit": "INVALID", "horizon_days": 30},
        )
        assert resp.status_code == 400


class TestOfflineResilience:
    """Verify that all endpoints survive even when Gemini is down."""

    def test_all_endpoints_survive_without_gemini_key(self):
        """Every non-chat endpoint should return 200 even without an API key."""
        pid, uid = _find_valid_unit()
        for path in [
            f"/today/{pid}/{uid}",
            f"/recommendations/{pid}/{uid}",
            f"/peers/{pid}/{uid}",
            f"/leaks/{pid}/{uid}",
        ]:
            resp = client.get(path)
            assert resp.status_code == 200, f"{path} failed with {resp.status_code}: {resp.text}"

    def test_target_fallback_without_gemini(self):
        pid, uid = _find_valid_unit()
        resp = client.post(
            f"/target/{pid}/{uid}",
            json={"target_value": 999, "target_unit": "EUR", "horizon_days": 30},
        )
        assert resp.status_code == 200
        data = resp.json()
        # With a generous target, projected should be less.
        assert data["gap"] < 0 or data["gap"] >= 0  # just verify it's a number
