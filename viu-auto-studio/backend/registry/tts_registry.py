"""TTS Voice and Provider Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from backend.schemas import TTSVoice

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs" / "tts_voices"


@lru_cache(maxsize=16)
def _load_voice_catalog(provider: str) -> List[Dict[str, str]]:
    """Load JSON catalog for a given provider."""
    file_map = {
        "edge": "edge_voices.json",
        "gemini": "gemini_voices.json",
        "elevenlabs": "elevenlabs_voices.json",
        "kokoro": "kokoro_voices.json",
        "vbee": "vbee_voices.json",
        "google_cloud": "google_cloud_voices.json",
        "azure": "azure_voices.json",
    }
    filename = file_map.get(provider.lower())
    if not filename:
        return []
    path = CATALOGS_DIR / filename
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


class TTSRegistry:
    """Registry managing voice catalogs and capabilities across all TTS providers."""

    @staticmethod
    def get_voices(provider: str) -> List[TTSVoice]:
        raw = _load_voice_catalog(provider)
        return [
            TTSVoice(
                id=item["id"],
                name=item["name"],
                language=item.get("language", "vi-VN"),
                gender=item.get("gender", "neutral"),
                description=item.get("description", ""),
                downloaded=item.get("downloaded", True),
            )
            for item in raw
        ]

    @staticmethod
    def get_all_voices() -> Dict[str, List[TTSVoice]]:
        providers = ["edge", "gemini", "elevenlabs", "kokoro", "vbee", "google_cloud", "azure"]
        return {p: TTSRegistry.get_voices(p) for p in providers}


tts_registry = TTSRegistry()
