"""TTS Voice Catalog and Registry for Viu Auto Studio."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from backend.core.constants import resolve_default_voice_for_provider
from backend.schemas import TTSVoice

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs" / "tts_voices"

PROVIDER_CATALOG_MAP: Dict[str, str] = {
    "edge": "edge_voices.json",
    "elevenlabs": "elevenlabs_voices.json",
    "gemini": "gemini_voices.json",
    "gemini_tts": "gemini_voices.json",
    "kokoro": "kokoro_voices.json",
    "kokoro_vi": "kokoro_voices.json",
    "vbee": "vbee_voices.json",
    "google_cloud": "google_cloud_voices.json",
    "google_cloud_tts": "google_cloud_voices.json",
    "azure": "azure_voices.json",
    "azure_tts": "azure_voices.json",
}


@lru_cache(maxsize=32)
def load_provider_catalog(catalog_name: str) -> List[dict]:
    path = CATALOGS_DIR / catalog_name
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


class TTSRegistry:
    @staticmethod
    def get_voices(provider: str) -> List[TTSVoice]:
        prov_key = provider.lower().strip()
        catalog_name = PROVIDER_CATALOG_MAP.get(prov_key, "edge_voices.json")
        raw_list = load_provider_catalog(catalog_name)
        return [
            TTSVoice(
                id=item["id"],
                name=item["name"],
                language=item.get("language", "vi-VN"),
                gender=item.get("gender", "neutral"),
                provider=prov_key,
                description=item.get("description", ""),
            )
            for item in raw_list
        ]

    @staticmethod
    def get_all_voices() -> Dict[str, List[TTSVoice]]:
        return {
            prov: TTSRegistry.get_voices(prov)
            for prov in set(PROVIDER_CATALOG_MAP.values())
        }

    @staticmethod
    def resolve_voice(provider: str, voice: Optional[str]) -> str:
        """Strictly resolve and validate a voice ID for a specific provider.
        
        If the given voice ID belongs to a different provider or is invalid,
        it automatically returns the valid default voice for this provider.
        """
        prov_key = (provider or "edge").lower().strip()
        voices = TTSRegistry.get_voices(prov_key)
        
        if not voice:
            return resolve_default_voice_for_provider(prov_key)
            
        voice_clean = voice.strip()
        
        # 1. Exact ID match
        for v in voices:
            if v.id == voice_clean:
                return v.id
                
        # 2. Case-insensitive ID match
        for v in voices:
            if v.id.lower() == voice_clean.lower():
                return v.id
                
        # 3. Name match
        for v in voices:
            if voice_clean.lower() in v.name.lower() or v.name.lower() in voice_clean.lower():
                return v.id

        # 4. Fallback strictly to THIS provider's default voice
        return resolve_default_voice_for_provider(prov_key)


tts_registry = TTSRegistry()
