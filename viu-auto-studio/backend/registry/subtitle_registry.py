"""Subtitle Presets and Video Styles Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs"


@lru_cache(maxsize=1)
def load_subtitle_presets() -> Dict[str, Any]:
    path = CATALOGS_DIR / "subtitle_presets.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


@lru_cache(maxsize=1)
def load_video_styles() -> List[Dict[str, Any]]:
    path = CATALOGS_DIR / "video_styles.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


class SubtitleRegistry:
    @staticmethod
    def get_presets() -> Dict[str, Any]:
        return load_subtitle_presets()

    @staticmethod
    def get_video_styles() -> List[Dict[str, Any]]:
        return load_video_styles()


subtitle_registry = SubtitleRegistry()
