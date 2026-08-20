"""Global configuration for the Viu Auto Studio backend.

Loads values from environment variables with sensible defaults so that the
app works out of the box on a fresh Windows install. Never store real API
keys inside the repository; use a .env file (see .env.example) instead.
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Root directories — KHÔNG hardcode đường dẫn máy phát triển.
# Thứ tự ưu tiên:
#  1. VIU_DATA_DIR / VIU_PROJECTS_DIR (Electron truyền qua biến môi trường)
#  2. Thư mục userData của người dùng: %APPDATA%/ViuAutoStudio (win),
#     ~/.viu-auto-studio (linux/mac)
#  3. Fallback: thư mục dữ liệu trong repo (chỉ cho máy phát triển/dev)
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parents[2]  # viu-auto-studio/


def _env(key: str, default: str) -> str:
    value = os.getenv(key)
    if value is None or value == "":
        return default
    return value


def _default_user_data_dir() -> Path:
    """Thư mục dữ liệu riêng của từng người dùng theo nền tảng."""
    if os.name == "nt":  # Windows
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return Path(base) / "ViuAutoStudio"
    if os.name == "darwin":  # macOS
        return Path.home() / "Library" / "Application Support" / "ViuAutoStudio"
    # Linux và các nền tảng khác
    return Path.home() / ".viu-auto-studio"


DATA_DIR = Path(_env("VIU_DATA_DIR", "")) if _env("VIU_DATA_DIR", "") else _default_user_data_dir() / "data"
PROJECTS_DIR = Path(_env("VIU_PROJECTS_DIR", "")) if _env("VIU_PROJECTS_DIR", "") else _default_user_data_dir() / "projects"
LOG_DIR = Path(_env("VIU_LOG_DIR", "")) if _env("VIU_LOG_DIR", "") else _default_user_data_dir() / "logs"


# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------
HOST = _env("VIU_HOST", "127.0.0.1")
PORT = int(_env("VIU_PORT", "8000"))

# SQLite URL an toàn trên Windows (sqlite:///C:/Users/... cần sqlite:////C:/...)
_db_path = DATA_DIR / "app.db"
if os.name == "nt":
    # Windows: sqlite:////C:/... (4 slash trước ổ đĩa) để SQLAlchemy parse đúng
    DATABASE_URL = _env("VIU_DATABASE_URL", "") or f"sqlite:///{_db_path.as_posix()}"
else:
    DATABASE_URL = _env("VIU_DATABASE_URL", "") or f"sqlite:///{_db_path.as_posix()}"

# ---------------------------------------------------------------------------
# Extension config file (được đọc bởi Flow Connector Extension qua options page)
# ---------------------------------------------------------------------------
EXTENSION_CONFIG_FILE = Path(_env("VIU_EXTENSION_CONFIG_FILE", "")) if _env("VIU_EXTENSION_CONFIG_FILE", "") else _default_user_data_dir() / "extension-config.json"
FLOW_BOOTSTRAP_TOKEN = _env("VIU_FLOW_BOOTSTRAP_TOKEN", "")

# ---------------------------------------------------------------------------
# AI providers
# ---------------------------------------------------------------------------
AI_PROVIDER = _env("VIU_AI_PROVIDER", "openrouter").lower()  # openrouter | gemini
OPENROUTER_API_KEY = _env("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = _env("OPENROUTER_MODEL", "google/gemini-2.5-flash")
GEMINI_API_KEY = _env("GEMINI_API_KEY", "")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")

# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------
TTS_PROVIDER = _env("VIU_TTS_PROVIDER", "edge").lower()  # edge | local | cloud
TTS_MODEL_DIR = _env("VIU_TTS_MODEL_DIR", "")
TTS_CLOUD_API_KEY = _env("VIU_TTS_CLOUD_API_KEY", "")

# ---------------------------------------------------------------------------
# Media tools
# ---------------------------------------------------------------------------
FFMPEG_BIN = _env("VIU_FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = _env("VIU_FFPROBE_BIN", "ffprobe")

# ---------------------------------------------------------------------------
# Render defaults
# ---------------------------------------------------------------------------
CRF = int(_env("VIU_CRF", "21"))
PRESET = _env("VIU_PRESET", "medium")


def init_data_dirs() -> None:
    """Ensure runtime data directories exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
