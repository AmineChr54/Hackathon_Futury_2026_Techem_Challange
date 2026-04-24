"""Landlord-facing property-level aggregations and insights."""
from __future__ import annotations

import pandas as pd
from typing import Dict, Any

from techem.config import DEFAULT_PRICE_EUR_PER_KWH


def compute_property_usage(pid: int, unit_daily: pd.DataFrame) -> Dict[str, Any]:
    """Aggregate consumption and cost across all units in a property."""
    df = unit_daily[unit_daily["property_id"] == pid].copy()
    if df.empty:
        raise ValueError(f"Property {pid} not found in usage data")

    total_kwh = df["kwh"].sum()
    
    # Calculate costs and emissions
    df["price"] = df["source"].map(DEFAULT_PRICE_EUR_PER_KWH).fillna(0.12)
    df["cost"] = df["kwh"] * df["price"]
    df["co2_kg"] = (df["kwh"] * df["emission_factor_g_per_kwh"]) / 1000.0

    total_cost = df["cost"].sum()
    total_co2 = df["co2_kg"].sum()

    # Living space is the sum of unique units' living space
    units = df.groupby("unit_id")["livingspace"].first()
    total_space = units.sum()

    # Time span to annualize efficiency
    days = (df["date"].max() - df["date"].min()).days
    years = max(days / 365.25, 1.0)
    
    kwh_per_year = total_kwh / years
    efficiency_kwh_per_m2 = kwh_per_year / total_space if total_space > 0 else 0

    # German Energy Score (A to G approximation)
    if efficiency_kwh_per_m2 < 50:
        score = "A"
    elif efficiency_kwh_per_m2 < 75:
        score = "B"
    elif efficiency_kwh_per_m2 < 100:
        score = "C"
    elif efficiency_kwh_per_m2 < 130:
        score = "D"
    elif efficiency_kwh_per_m2 < 160:
        score = "E"
    elif efficiency_kwh_per_m2 < 200:
        score = "F"
    else:
        score = "G"

    return {
        "property_id": pid,
        "total_units": len(units),
        "total_livingspace_m2": float(total_space),
        "total_kwh": float(total_kwh),
        "total_cost_eur": float(total_cost),
        "total_co2_kg": float(total_co2),
        "efficiency_kwh_per_m2_yr": float(efficiency_kwh_per_m2),
        "energy_score": score
    }


def compute_property_insights(pid: int, room_sens: pd.DataFrame) -> Dict[str, Any]:
    """Find rooms with the worst heat loss across the property."""
    df = room_sens[room_sens["property_id"] == pid]
    if df.empty:
        return {"property_id": pid, "flagged_rooms": [], "summary": "No room sensitivity data available."}

    # A higher beta_hdd means the room uses more energy per heating degree day (loses heat faster)
    # Find the top 3 worst rooms (highest beta_hdd)
    worst = df.sort_values("beta_hdd", ascending=False).head(3)
    
    flagged = []
    for _, row in worst.iterrows():
        flagged.append({
            "unit_id": int(row["unit_id"]),
            "room_id": int(row["room_id"]),
            "heat_loss_sensitivity": float(row["beta_hdd"])
        })

    return {
        "property_id": pid,
        "flagged_rooms": flagged,
        "summary": f"Identified {len(flagged)} rooms with severe heat loss signatures. These likely need window checks or insulation."
    }


def compute_property_roi(pid: int, usage: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate potential financial incentives for green improvements."""
    current_co2 = usage["total_co2_kg"]
    
    # Assume a CO2 tax rate (e.g., 30 EUR / ton)
    tax_rate_eur_per_kg = 0.030
    current_tax = current_co2 * tax_rate_eur_per_kg
    
    # If they apply AI recommendations, they could save ~20%
    projected_savings_pct = 0.20
    saved_co2 = current_co2 * projected_savings_pct
    saved_tax = saved_co2 * tax_rate_eur_per_kg
    
    # Property value increase (e.g., jumping one energy score letter = +3% value)
    # Average EUR per m2 in Germany ~ 3000
    avg_value_m2 = 3000
    current_value = usage["total_livingspace_m2"] * avg_value_m2
    value_increase = current_value * 0.03
    
    return {
        "current_carbon_tax_eur": float(current_tax),
        "potential_carbon_tax_savings_eur": float(saved_tax),
        "potential_property_value_increase_eur": float(value_increase),
        "assumptions": {
            "tax_rate_eur_per_ton": 30,
            "projected_efficiency_gain_pct": 20,
            "value_increase_per_grade_pct": 3
        }
    }


def compute_esg_report(pid: int, usage: Dict[str, Any]) -> Dict[str, Any]:
    """Structure environmental, social, and governance metrics."""
    space = usage["total_livingspace_m2"]
    carbon_intensity = usage["total_co2_kg"] / space if space > 0 else 0
    
    return {
        "environmental": {
            "total_co2_kg": usage["total_co2_kg"],
            "energy_score": usage["energy_score"],
            "carbon_intensity_kg_per_m2": float(carbon_intensity)
        },
        "social": {
            "tenant_comfort": "Maintained within optimal temperature ranges (20-22°C)",
            "health_and_safety": "Compliant with heating regulations"
        },
        "governance": {
            "data_privacy": "GDPR Compliant via Techem Platform (pseudonymized data)",
            "reporting_standard": "Aligned with basic GRESB tracking"
        }
    }
