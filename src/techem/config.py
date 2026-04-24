"""Central configuration for paths and runtime knobs."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]

# Load .env from project root (works regardless of cwd).
load_dotenv(ROOT / ".env", override=False)

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

# Hierarchical reconciliation method. "proportions" is bottom-up share
# disaggregation (what we use today). "mint" routes through
# hierarchicalforecast.MinTrace but requires independent room-level
# forecasts to do anything useful — see l0_reconcile.reconcile().
RECONCILE_METHOD = "proportions"

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

# ---------- fun-equivalent constants (tenant peers UI) ----------
TREE_KG_CO2_PER_YEAR = 21.0       # 1 tree absorbs ~21 kg CO₂/year
KM_PER_KG_CO2 = 5.0               # average car: 1 kg CO₂ ≈ 5 km driven
PHONE_CHARGES_PER_KWH = 125.0     # 1 kWh ≈ 125 smartphone charges

# ---------- diurnal curve ----------
DIURNAL_CURVE_PATH = Path(__file__).resolve().parent / "data" / "diurnal_curve.json"
