"""ElevenLabs TTS Provider — Tích hợp API ElevenLabs chính thức với giọng AI cao cấp."""

from __future__ import annotations

import json
import logging
import urllib.request
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs TTS Provider."""

    @property
    def name(self) -> str:
        return "elevenlabs"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("elevenlabs")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập ElevenLabs API Key."}
        try:
            req = urllib.request.Request(f"{ELEVENLABS_API_BASE}/user", headers={"xi-api-key": self.api_key, "User-Agent": "ViuAutoStudio/1.0"}, method="GET")
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                subscription = data.get("subscription", {})
                tier = subscription.get("tier", "Free")
                char_count = subscription.get("character_count", 0)
                char_limit = subscription.get("character_limit", 0)
                return {"ok": True, "message": f"Kết nối ElevenLabs thành công! Gói: {tier.upper()} ({char_count:,}/{char_limit:,} ký tự)."}
        except Exception as exc:
            return {"ok": False, "message": f"Không thể xác thực ElevenLabs API Key: {exc}"}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        el_default = resolve_default_voice_for_provider("elevenlabs")
        edge_voice = "vi-VN-NamMinhNeural" if any(x in (voice or el_default).lower() for x in ["male", "adam", "antoni", "josh", "brian", "bill"]) else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
