"""Render Presets and Encoder Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
    def get_preset_list() -> List[Dict[str, Any]]:
        return list(load_render_presets().values())

    @staticmethod
    def get_preset(preset_id: str) -> Optional[Dict[str, Any]]:
        return load_render_presets().get(preset_id)

    @staticmethod
    def get_dimensions(preset_id: str) -> Tuple[int, int, int]:
        preset = load_render_presets().get(preset_id)
        if isinstance(preset, dict):
            return (preset.get("width", 1920), preset.get("height", 1080), preset.get("fps", 30))
        elif isinstance(preset, (list, tuple)) and len(preset) >= 3:
            return (preset[0], preset[1], preset[2])
        return (1920, 1080, 30)


render_registry = RenderRegistry()
