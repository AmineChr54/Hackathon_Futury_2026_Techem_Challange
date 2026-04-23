"""Consolidate the 20 per-property CSVs into a single tidy parquet.

Schema of the output (`consumption.parquet`):
    property_id : int        (1..20, from filename)
    unit_id     : int        (unitnumber column)
    room_id     : int        (roomnumber column)
    date        : date
    source      : category   (Erdgas | Fernwärme | Heizöl | ...)
    kwh         : float32    (energyusage)
    livingspace : float32    (m² for this room)
    outside_temp: float32    (°C, mean daily)
    emission_factor_g_per_kwh : float32
    zipcode     : string
    city        : string
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from techem.config import DATA_RAW, CONSUMPTION_PARQUET, UNIT_DAILY_PARQUET

_PROP_RE = re.compile(r"property_(\d+)\.csv$")

RENAME = {
    "date": "date",
    "zipcode": "zipcode",
    "energysource": "source",
    "city": "city",
    "energyusage [kWh]": "kwh",
    "livingspace [m²]": "livingspace",
    "mean outside temperature [°C]": "outside_temp",
    "roomnumber": "room_id",
    "emission factor [g/kWh]": "emission_factor_g_per_kwh",
    "unitnumber": "unit_id",
}


def _read_one(path: Path) -> pd.DataFrame:
    m = _PROP_RE.search(path.name)
    if not m:
        raise ValueError(f"Unrecognised file: {path}")
    property_id = int(m.group(1))

    df = pd.read_csv(path)
    df = df.rename(columns=RENAME)
    missing = set(RENAME.values()) - set(df.columns)
    if missing:
        raise ValueError(f"{path.name} missing columns: {missing}")

    df["property_id"] = property_id
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df["zipcode"] = df["zipcode"].astype(str).str.zfill(5)
    df["source"] = df["source"].astype("category")
    for col in ("kwh", "livingspace", "outside_temp", "emission_factor_g_per_kwh"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("float32")
    for col in ("property_id", "unit_id", "room_id"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("int32")
    return df[
        [
            "property_id", "unit_id", "room_id", "date", "source",
            "kwh", "livingspace", "outside_temp",
            "emission_factor_g_per_kwh", "zipcode", "city",
        ]
    ]


def build_consumption_parquet(raw_dir: Path = DATA_RAW) -> pd.DataFrame:
    files = sorted(raw_dir.glob("property_*.csv"))
    if not files:
        raise FileNotFoundError(f"No property CSVs under {raw_dir}")
    frames = [_read_one(p) for p in files]
    df = pd.concat(frames, ignore_index=True)
    df = df.dropna(subset=["date", "kwh"]).sort_values(
        ["property_id", "unit_id", "room_id", "date"], kind="stable"
    )
    df.to_parquet(CONSUMPTION_PARQUET, index=False)
    return df


def build_unit_daily(df: pd.DataFrame | None = None) -> pd.DataFrame:
    """Aggregate room-level rows to the unit level — the billing unit.

    Weather, source, zipcode, city, emission factor are shared across rooms
    within a unit on a given day, so we take first(). Living space is summed
    (the unit's total m² is the sum of its rooms).
    """
    if df is None:
        df = pd.read_parquet(CONSUMPTION_PARQUET)

    grp = df.groupby(["property_id", "unit_id", "date"], as_index=False)
    agg = grp.agg(
        kwh=("kwh", "sum"),
        livingspace=("livingspace", "sum"),
        n_rooms=("room_id", "nunique"),
        outside_temp=("outside_temp", "first"),
        emission_factor_g_per_kwh=("emission_factor_g_per_kwh", "first"),
        source=("source", "first"),
        zipcode=("zipcode", "first"),
        city=("city", "first"),
    )
    agg["date"] = pd.to_datetime(agg["date"])
    agg.to_parquet(UNIT_DAILY_PARQUET, index=False)
    return agg


def main() -> None:
    df = build_consumption_parquet()
    print(f"[consolidate] rows={len(df):,}  files={df['property_id'].nunique()}")
    print(f"[consolidate] wrote {CONSUMPTION_PARQUET}")

    unit = build_unit_daily(df)
    print(f"[consolidate] unit-level rows={len(unit):,}")
    print(f"[consolidate] wrote {UNIT_DAILY_PARQUET}")

    print("\n[audit] sources observed:")
    print(df["source"].value_counts(dropna=False).to_string())

    print("\n[audit] zero-usage share by source:")
    zshare = df.groupby("source", observed=True).apply(
        lambda s: (s["kwh"] <= 0).mean()
    )
    print(zshare.to_string())

    print("\n[audit] date coverage:")
    print(f"  min={df['date'].min()}  max={df['date'].max()}")


if __name__ == "__main__":
    main()
