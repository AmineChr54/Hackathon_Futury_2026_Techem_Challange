"""Extended peer comparison with badges, fun equivalents, and trends.

Enhances the existing /peers endpoint with:
  • Badge tiers (Eco Champion, Efficient, Typical, Headroom to Save)
  • Signed € and CO₂ deltas vs cohort median
  • Fun equivalents (trees, km driven, phone charges)
  • 30-day trend (percentile change)
  • Aspirational target for bottom-50% tenants
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from techem.config import DEFAULT_EMISSION_G_PER_KWH, DEFAULT_PRICE_EUR_PER_KWH

# Fun equivalents constants
TREE_KG_CO2_PER_YEAR = 21.0  # 1 tree absorbs ~21 kg CO₂/year
KM_PER_KG_CO2 = 5.0  # average car: 1 kg CO₂ ≈ 5 km driven
PHONE_CHARGES_PER_KWH = 125.0  # 1 kWh ≈ 125 smartphone charges

BADGE_TIERS = {
    (90, 101): "🏆 Eco Champion",
    (75, 90): "🌿 Efficient",
    (25, 75): "👍 Typical",
    (0, 25): "📈 Headroom to Save",
}


def _badge(percentile: float) -> str:
    """Return a badge string based on the percentile rank."""
    for (lo, hi), label in BADGE_TIERS.items():
        if lo <= percentile < hi:
            return label
    return "👍 Typical"


def compute_extended_peers(
    property_id: int,
    unit_id: int,
    unit_daily: pd.DataFrame,
) -> dict:
    """Compute the extended peers response for a single tenant."""
    me = unit_daily[
        (unit_daily["property_id"] == property_id)
        & (unit_daily["unit_id"] == unit_id)
    ].copy()
    if me.empty:
        raise ValueError(f"Unit ({property_id},{unit_id}) not found")

    me = me.sort_values("date")
    my_m2 = float(me["livingspace"].median())
    my_source = str(me["source"].iloc[0])
    my_city = str(me["city"].iloc[0])

    price = DEFAULT_PRICE_EUR_PER_KWH.get(my_source, 0.12)
    emission = float(me["emission_factor_g_per_kwh"].iloc[0]) or DEFAULT_EMISSION_G_PER_KWH.get(my_source, 250.0)

    # Build cohort (±20% m², same source, same city, exclude self).
    lo, hi = 0.8 * my_m2, 1.2 * my_m2
    cohort = unit_daily[
        (unit_daily["livingspace"].between(lo, hi))
        & (unit_daily["source"].astype(str) == my_source)
        & (unit_daily["city"].astype(str) == my_city)
        & ~(
            (unit_daily["property_id"] == property_id)
            & (unit_daily["unit_id"] == unit_id)
        )
    ].copy()
    cohort_keys = cohort[["property_id", "unit_id"]].drop_duplicates()
    cohort_size = len(cohort_keys)

    unit_mean = float(me["kwh"].mean())
    cohort_means = cohort.groupby(
        ["property_id", "unit_id"], observed=True
    )["kwh"].mean()

    if cohort_means.empty:
        return {
            "cohort_size": 0,
            "cohort_definition": {
                "m2_range": [round(lo, 1), round(hi, 1)],
                "source": my_source,
                "city": my_city,
            },
            "percentile_rank_better_than": float("nan"),
            "badge": "N/A",
            "unit_avg_daily_kwh": unit_mean,
            "cohort_avg_daily_kwh": float("nan"),
            "vs_median_pct": float("nan"),
            "monthly_eur_vs_peers": float("nan"),
            "monthly_co2_g_vs_peers": float("nan"),
            "trend_30d_percentile_delta": float("nan"),
            "equivalents": {},
            "aspirational_target_kwh_per_m2": float("nan"),
            "aspirational_saving_eur": float("nan"),
        }

    pct_better = float((cohort_means > unit_mean).mean() * 100)
    cohort_median = float(cohort_means.median())

    # -- vs median --
    vs_median_pct = float("nan")
    if cohort_median > 0:
        vs_median_pct = round((unit_mean / cohort_median - 1.0) * 100, 1)

    # Monthly deltas (assume ~30 days).
    delta_kwh_daily = unit_mean - cohort_median
    monthly_delta_kwh = delta_kwh_daily * 30
    monthly_eur = round(monthly_delta_kwh * price, 2)
    monthly_co2_g = round(monthly_delta_kwh * emission, 1)

    # -- Fun equivalents (annual scale for trees, monthly for the rest) --
    annual_co2_delta_kg = abs(monthly_delta_kwh * 12 * emission / 1000)
    monthly_co2_delta_kg = abs(monthly_delta_kwh * emission / 1000)

    equivalents = {
        "trees_equivalent": round(annual_co2_delta_kg / TREE_KG_CO2_PER_YEAR, 1) if TREE_KG_CO2_PER_YEAR > 0 else 0,
        "km_driven_equivalent": round(monthly_co2_delta_kg * KM_PER_KG_CO2, 1),
        "phone_charges_equivalent": round(abs(monthly_delta_kwh) * PHONE_CHARGES_PER_KWH, 0),
    }

    # -- 30-day trend --
    me["date"] = pd.to_datetime(me["date"])
    max_date = me["date"].max()
    cutoff_30 = max_date - pd.Timedelta(days=30)
    cutoff_60 = max_date - pd.Timedelta(days=60)

    me_recent = me[me["date"] > cutoff_30]["kwh"].mean()
    me_prior = me[(me["date"] > cutoff_60) & (me["date"] <= cutoff_30)]["kwh"].mean()

    trend_delta = float("nan")
    if not np.isnan(me_recent) and not np.isnan(me_prior) and cohort_median > 0:
        pct_recent = float((cohort_means > me_recent).mean() * 100)
        pct_prior = float((cohort_means > me_prior).mean() * 100)
        trend_delta = round(pct_recent - pct_prior, 1)

    # -- Aspirational target (for tenants in bottom 50%) --
    aspirational_kwh_per_m2 = float("nan")
    aspirational_saving_eur = float("nan")
    if pct_better < 50 and my_m2 > 0:
        top10_threshold = float(cohort_means.quantile(0.1))  # lower = better
        if top10_threshold < unit_mean:
            aspirational_kwh_per_m2 = round(top10_threshold / my_m2 * 365, 2)  # annual per m²
            gap = (unit_mean - top10_threshold) * 30
            aspirational_saving_eur = round(gap * price, 2)

    badge = _badge(pct_better)

    return {
        "cohort_size": cohort_size,
        "cohort_definition": {
            "m2_range": [round(lo, 1), round(hi, 1)],
            "source": my_source,
            "city": my_city,
        },
        "percentile_rank_better_than": round(pct_better, 1),
        "badge": badge,
        "unit_avg_daily_kwh": round(unit_mean, 3),
        "cohort_avg_daily_kwh": round(float(cohort_means.mean()), 3),
        "vs_median_pct": vs_median_pct,
        "monthly_eur_vs_peers": monthly_eur,
        "monthly_co2_g_vs_peers": monthly_co2_g,
        "trend_30d_percentile_delta": trend_delta,
        "equivalents": equivalents,
        "aspirational_target_kwh_per_m2": aspirational_kwh_per_m2,
        "aspirational_saving_eur": aspirational_saving_eur,
    }
