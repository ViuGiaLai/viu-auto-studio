"""AI Model Catalog and Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs"


@lru_cache(maxsize=1)
def load_ai_models() -> List[Dict[str, Any]]:
    path = CATALOGS_DIR / "ai_models.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


class AIRegistry:
    @staticmethod
    def get_models() -> List[Dict[str, Any]]:
        return load_ai_models()

    @staticmethod
    def get_models_by_provider(provider: str) -> List[Dict[str, Any]]:
        return [m for m in load_ai_models() if m.get("provider") == provider]


ai_registry = AIRegistry()
