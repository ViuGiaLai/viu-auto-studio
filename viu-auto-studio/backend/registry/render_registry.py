"""Render Presets and Encoder Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs"


@lru_cache(maxsize=1)
def load_render_presets() -> Dict[str, Any]:
    path = CATALOGS_DIR / "render_presets.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


class RenderRegistry:
    @staticmethod
    def get_presets() -> Dict[str, Any]:
        return load_render_presets()

    @staticmethod
    def get_preset(preset_id: str) -> Optional[Dict[str, Any]]:
        return load_render_presets().get(preset_id)


render_registry = RenderRegistry()
