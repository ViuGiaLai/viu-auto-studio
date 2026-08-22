"""Single source of version truth for Viu Auto Studio backend."""
import json
from pathlib import Path

_version_file = Path(__file__).resolve().parent.parent / "version.json"
if _version_file.exists():
    try:
        __version__ = json.loads(_version_file.read_text(encoding="utf-8")).get("version", "1.0.0")
    except Exception:
        __version__ = "1.0.0"
else:
    __version__ = "1.0.0"
