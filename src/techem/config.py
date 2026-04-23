"""Central configuration for paths and runtime knobs."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DATA_RAW = ROOT / "data" / "properties"
DATA_PROCESSED = ROOT / "data" / "processed"
DATA_CACHE = ROOT / "data" / "cache"
DATA_EXTERNAL = ROOT / "data" / "external"
MODELS_DIR = ROOT / "models" / "artifacts"

for d in (DATA_PROCESSED, DATA_CACHE, DATA_EXTERNAL, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)

CONSUMPTION_PARQUET = DATA_PROCESSED / "consumption.parquet"
UNIT_DAILY_PARQUET = DATA_PROCESSED / "unit_daily.parquet"
ROOM_SENSITIVITIES = DATA_PROCESSED / "room_sensitivities.parquet"

HDD_BASES_C = (12.0, 15.0, 18.0)
LAG_WINDOWS_DAYS = (1, 3, 7)
ROOM_CLUSTERS_K = 5

CV_INITIAL_DAYS = 180
CV_STEP_DAYS = 30
CV_HORIZON_DAYS = 30
EVAL_HORIZONS_DAYS = (1, 7, 14, 30)

QUANTILES = (0.1, 0.5, 0.9)

EWMA_SPAN_DAYS = 30
DRIFT_BASELINE_DAYS = 180
DRIFT_P_THRESHOLD = 0.01

DEFAULT_PRICE_EUR_PER_KWH = {
    "Erdgas": 0.11,
    "Fernwärme": 0.14,
    "Heizöl": 0.12,
}

DEFAULT_EMISSION_G_PER_KWH = {
    "Erdgas": 201.0,
    "Fernwärme": 280.0,
    "Heizöl": 266.0,
}
