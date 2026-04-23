"""Data audit — the diagnostic artefact replacing `notebooks/00_data_audit.ipynb`.

Prints:
  1. Source × zero-usage share matrix (why we chose Tweedie).
  2. Per-property date coverage + missingness.
  3. Histograms (text) of kWh per source.
  4. Temperature range sanity check vs Meteostat zone plausibility.

Run:
    python -m scripts.audit
"""
from __future__ import annotations

import pandas as pd

from techem.config import CONSUMPTION_PARQUET, UNIT_DAILY_PARQUET
from techem.data.consolidate import build_consumption_parquet, build_unit_daily


def _load() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not CONSUMPTION_PARQUET.exists():
        build_consumption_parquet()
    if not UNIT_DAILY_PARQUET.exists():
        build_unit_daily()
    c = pd.read_parquet(CONSUMPTION_PARQUET)
    u = pd.read_parquet(UNIT_DAILY_PARQUET)
    c["date"] = pd.to_datetime(c["date"])
    u["date"] = pd.to_datetime(u["date"])
    return c, u


def _ascii_hist(values: pd.Series, bins: int = 12, width: int = 40) -> str:
    import numpy as np
    h, edges = np.histogram(values.dropna(), bins=bins)
    if h.max() == 0:
        return "(empty)"
    scale = width / h.max()
    lines = []
    for count, lo, hi in zip(h, edges[:-1], edges[1:]):
        bar = "#" * int(round(count * scale))
        lines.append(f"  [{lo:6.2f}, {hi:6.2f}) {bar} {count}")
    return "\n".join(lines)


def main() -> None:
    c, u = _load()

    print("=" * 60)
    print("1. Source distribution")
    print("=" * 60)
    print(c["source"].value_counts(dropna=False).to_string())

    print("\n2. Zero-usage share by source (motivates Tweedie)")
    print((c.groupby("source", observed=True)["kwh"].apply(lambda s: (s <= 0).mean())).to_string())

    print("\n3. Per-property date coverage")
    cov = c.groupby("property_id").agg(
        n_rows=("date", "size"),
        first_date=("date", "min"),
        last_date=("date", "max"),
        n_unique_days=("date", "nunique"),
        n_units=("unit_id", "nunique"),
        n_rooms=("room_id", "nunique"),
    )
    print(cov.to_string())

    print("\n4. Temperature ranges (sanity vs German climate)")
    t = c.groupby("city")["outside_temp"].agg(["min", "max", "mean"]).round(2)
    print(t.to_string())

    print("\n5. kWh distribution by source (unit-level, daily)")
    for src, sub in u.groupby("source", observed=True):
        print(f"\n-- {src} (n={len(sub)}) --")
        print(_ascii_hist(sub["kwh"].clip(upper=sub["kwh"].quantile(0.99))))

    print("\n6. Missingness audit (rows expected vs rows present, per unit)")
    per_unit = c.groupby(["property_id", "unit_id"]).agg(
        first=("date", "min"),
        last=("date", "max"),
        n=("date", "nunique"),
    )
    per_unit["expected"] = (per_unit["last"] - per_unit["first"]).dt.days + 1
    per_unit["missing_days"] = per_unit["expected"] - per_unit["n"]
    worst = per_unit.sort_values("missing_days", ascending=False).head(10)
    print(worst.to_string())


if __name__ == "__main__":
    main()
