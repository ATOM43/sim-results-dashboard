import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

INPUTS_DIR = REPO_ROOT / "Inputs"
DB_PATH = Path(os.environ.get("SIM_DB_PATH", REPO_ROOT / "backend" / "data" / "app.db"))

# Engineering review rule: peak displacement at or below the cutoff must not exceed the limit.
DISPLACEMENT_LIMIT_MM = 15.0
FREQUENCY_CUTOFF_HZ = 50.0

# Vite dev server
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
