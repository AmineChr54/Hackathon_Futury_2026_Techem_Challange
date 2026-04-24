"""Four-signal anomaly / leak detector.

Produces structured signals that are both returned raw and fed to Gemini
for natural-language explanation.

Signal A — Abnormal β_hdd (insulation proxy)
    High temperature sensitivity compared to the peer cohort suggests
    poor insulation (windows, walls).

Signal B — Weather-controlled residual anomalies
    Consumption spikes not explained by weather (residual > 3×MAD).

Signal C — Room-vs-peers share anomaly
    A room's share of unit consumption has drifted significantly from
    its historical norm.

Signal D — Flatline / stuck sensor
    Room shows identical non-zero readings or zero readings during cold
    periods — likely a broken or stuck meter.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

from techem.config import DEFAULT_EMISSION_G_PER_KWH, DEFAULT_PRICE_EUR_PER_KWH

log = logging.getLogger(__name__)


@dataclass
class LeakSignal:
    kind: str
    room_id: int | None
    severity: str  # "high", "medium", "low"
    details: dict


def _signal_a_insulation(
    property_id: int,
    unit_id: int,
    room_sens: pd.DataFrame,
    z_threshold: float = 2.0,
) -> list[dict]:
    """Signal A: rooms with abnormally high β_hdd (insulation proxy)."""
    signals = []
    my_sens = room_sens[
        (room_sens["property_id"] == property_id)
        & (room_sens["unit_id"] == unit_id)
    ]
    if my_sens.empty or len(room_sens) < 10:
        return signals

    cohort_mean = float(room_sens["beta_hdd"].mean())
    cohort_std = float(room_sens["beta_hdd"].std())
    if cohort_std <= 0:
        return signals

    for _, row in my_sens.iterrows():
        z = (float(row["beta_hdd"]) - cohort_mean) / cohort_std
        if z > z_threshold:
            signals.append(asdict(LeakSignal(
                kind="high_temp_sensitivity",
                room_id=int(row["room_id"]),
                severity="high" if z > 3 else "medium",
                details={
                    "z_score": round(z, 2),
                    "beta_hdd": round(float(row["beta_hdd"]), 4),
                    "cohort_mean": round(cohort_mean, 4),
                    "likely_cause": "poor window insulation or wall thermal bridging",
                },
            )))
    return signals


def _signal_b_residual_spikes(
    property_id: int,
    unit_id: int,
    unit_daily: pd.DataFrame,
    lookback_days: int = 30,
    mad_threshold: float = 3.0,
) -> list[dict]:
    """Signal B: consumption spikes not explained by weather."""
    signals = []
    me = unit_daily[
        (unit_daily["property_id"] == property_id)
        & (unit_daily["unit_id"] == unit_id)
    ].copy().sort_values("date")

    if len(me) < 60:
        return signals

    # Simple residual: actual - simple HDD-based prediction.
    me["hdd_15"] = (15.0 - me["outside_temp"]).clip(lower=0)
    # Fit a simple linear model on the fly.
    X = me["hdd_15"].values.astype("float64")
    y = me["kwh"].values.astype("float64")
    if X.std() < 0.01:
        return signals

    slope = np.cov(X, y)[0, 1] / np.var(X) if np.var(X) > 0 else 0
    intercept = y.mean() - slope * X.mean()
    pred = intercept + slope * X
    residuals = y - pred

    # Last N days.
    recent_resid = residuals[-lookback_days:]
    mad = float(np.median(np.abs(recent_resid - np.median(recent_resid))))
    if mad <= 0:
        mad = float(np.std(recent_resid)) * 0.6745  # fallback

    if mad <= 0:
        return signals

    flagged_indices = np.where(np.abs(recent_resid) > mad_threshold * mad)[0]

    # Cluster consecutive flagged days.
    if len(flagged_indices) == 0:
        return signals

    recent_dates = me["date"].values[-lookback_days:]
    clusters = []
    current_cluster = [flagged_indices[0]]
    for i in range(1, len(flagged_indices)):
        if flagged_indices[i] == flagged_indices[i - 1] + 1:
            current_cluster.append(flagged_indices[i])
        else:
            clusters.append(current_cluster)
            current_cluster = [flagged_indices[i]]
    clusters.append(current_cluster)

    for cluster in clusters:
        dates = [str(pd.to_datetime(recent_dates[i]).date()) for i in cluster]
        max_resid = float(np.max(np.abs(recent_resid[cluster])))
        signals.append(asdict(LeakSignal(
            kind="unexpected_spike",
            room_id=None,
            severity="high" if len(cluster) >= 3 else "medium",
            details={
                "dates": dates,
                "max_residual_kwh": round(max_resid, 2),
                "consecutive_days": len(cluster),
                "is_ongoing": bool(cluster[-1] == len(recent_resid) - 1),
                "context": "consumption not explained by outdoor temperature",
            },
        )))

    return signals


def _signal_c_room_share_drift(
    property_id: int,
    unit_id: int,
    consumption: pd.DataFrame,
    recent_days: int = 14,
    history_days: int = 180,
    z_threshold: float = 2.0,
) -> list[dict]:
    """Signal C: room's share of unit consumption has drifted."""
    signals = []
    room_data = consumption[
        (consumption["property_id"] == property_id)
        & (consumption["unit_id"] == unit_id)
    ].copy()
    if room_data.empty:
        return signals

    room_data["date"] = pd.to_datetime(room_data["date"])
    max_date = room_data["date"].max()
    cutoff_recent = max_date - pd.Timedelta(days=recent_days)
    cutoff_history = max_date - pd.Timedelta(days=history_days)

    recent = room_data[room_data["date"] > cutoff_recent]
    history = room_data[(room_data["date"] > cutoff_history) & (room_data["date"] <= cutoff_recent)]

    if recent.empty or history.empty:
        return signals

    # Compute shares.
    recent_total = recent["kwh"].sum()
    history_total = history["kwh"].sum()
    if recent_total <= 0 or history_total <= 0:
        return signals

    recent_shares = recent.groupby("room_id", observed=True)["kwh"].sum() / recent_total
    history_shares = history.groupby("room_id", observed=True)["kwh"].sum() / history_total

    # Also compute historical daily share variance per room.
    daily_room = history.groupby(["date", "room_id"], observed=True)["kwh"].sum().reset_index()
    daily_total = history.groupby("date", observed=True)["kwh"].sum().rename("total")
    daily_room = daily_room.merge(daily_total, on="date")
    daily_room["share"] = daily_room["kwh"] / daily_room["total"].replace(0, np.nan)
    share_stats = daily_room.groupby("room_id", observed=True)["share"].agg(["mean", "std"])

    for rid in recent_shares.index:
        if rid not in share_stats.index:
            continue
        hist_mean = float(share_stats.loc[rid, "mean"])
        hist_std = float(share_stats.loc[rid, "std"])
        current = float(recent_shares[rid])

        if hist_std <= 0:
            continue
        z = abs(current - hist_mean) / hist_std
        if z > z_threshold:
            signals.append(asdict(LeakSignal(
                kind="room_share_drift",
                room_id=int(rid),
                severity="high" if z > 3 else "medium",
                details={
                    "historical_share": round(hist_mean, 3),
                    "current_share": round(current, 3),
                    "z_score": round(z, 2),
                    "direction": "increased" if current > hist_mean else "decreased",
                },
            )))

    return signals


def _signal_d_sensor_suspect(
    property_id: int,
    unit_id: int,
    consumption: pd.DataFrame,
    unit_daily: pd.DataFrame,
    lookback_days: int = 14,
) -> list[dict]:
    """Signal D: flatline or stuck sensor detection."""
    signals = []
    room_data = consumption[
        (consumption["property_id"] == property_id)
        & (consumption["unit_id"] == unit_id)
    ].copy()
    if room_data.empty:
        return signals

    room_data["date"] = pd.to_datetime(room_data["date"])
    max_date = room_data["date"].max()
    cutoff = max_date - pd.Timedelta(days=lookback_days)
    recent = room_data[room_data["date"] > cutoff]

    # Get recent outdoor temp for cold-period check.
    me_daily = unit_daily[
        (unit_daily["property_id"] == property_id)
        & (unit_daily["unit_id"] == unit_id)
    ].copy()
    me_daily["date"] = pd.to_datetime(me_daily["date"])
    recent_daily = me_daily[me_daily["date"] > cutoff]
    avg_hdd = 0.0
    if not recent_daily.empty:
        avg_hdd = float((15.0 - recent_daily["outside_temp"]).clip(lower=0).mean())

    for rid, room in recent.groupby("room_id", observed=True):
        values = room["kwh"].values
        if len(values) < 7:
            continue

        # Check flatline: all identical non-zero values.
        unique_nonzero = np.unique(values[values > 0])
        if len(unique_nonzero) == 1 and len(values[values > 0]) >= 7:
            signals.append(asdict(LeakSignal(
                kind="sensor_suspect",
                room_id=int(rid),
                severity="high",
                details={
                    "pattern": "flatline",
                    "constant_value_kwh": round(float(unique_nonzero[0]), 3),
                    "days_observed": int(len(values[values > 0])),
                    "explanation": "Identical non-zero readings suggest a stuck meter.",
                },
            )))

        # Check zero-in-cold: all zeros during a cold period.
        if avg_hdd > 5 and (values <= 0).all():
            signals.append(asdict(LeakSignal(
                kind="sensor_suspect",
                room_id=int(rid),
                severity="high",
                details={
                    "pattern": "zero_in_cold",
                    "avg_hdd_15": round(avg_hdd, 1),
                    "days_zero": int(len(values)),
                    "explanation": "Zero readings during cold weather — device may be offline.",
                },
            )))

    return signals


def detect_all(
    property_id: int,
    unit_id: int,
    unit_daily: pd.DataFrame,
    consumption: pd.DataFrame,
    room_sens: pd.DataFrame,
) -> dict:
    """Run all four signal detectors and return a consolidated report.

    Returns
    -------
    dict with keys:
        signals : list[dict]  — structured signals (always present)
        summary : dict — counts by kind and overall severity
    """
    signals: list[dict] = []

    try:
        signals.extend(_signal_a_insulation(property_id, unit_id, room_sens))
    except Exception as e:
        log.warning("Signal A failed for (%s,%s): %s", property_id, unit_id, e)

    try:
        signals.extend(_signal_b_residual_spikes(property_id, unit_id, unit_daily))
    except Exception as e:
        log.warning("Signal B failed for (%s,%s): %s", property_id, unit_id, e)

    try:
        signals.extend(_signal_c_room_share_drift(property_id, unit_id, consumption))
    except Exception as e:
        log.warning("Signal C failed for (%s,%s): %s", property_id, unit_id, e)

    try:
        signals.extend(_signal_d_sensor_suspect(property_id, unit_id, consumption, unit_daily))
    except Exception as e:
        log.warning("Signal D failed for (%s,%s): %s", property_id, unit_id, e)

    # Summary.
    by_kind: dict[str, int] = {}
    severities = []
    for s in signals:
        by_kind[s["kind"]] = by_kind.get(s["kind"], 0) + 1
        severities.append(s["severity"])

    overall = "healthy"
    if severities:
        if "high" in severities:
            overall = "attention_needed"
        elif "medium" in severities:
            overall = "monitor"

    return {
        "signals": signals,
        "summary": {
            "total_signals": len(signals),
            "by_kind": by_kind,
            "overall_status": overall,
        },
    }
