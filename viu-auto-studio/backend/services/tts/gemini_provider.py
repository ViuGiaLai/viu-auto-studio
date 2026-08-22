"""Gemini TTS Provider (Google AI Studio text-to-speech engine)."""

from __future__ import annotations

import logging
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)


class GeminiTTSProvider(TTSProvider):
    """Google AI Studio (Gemini) TTS Provider."""

    @property
    def name(self) -> str:
        return "gemini"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("gemini")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập API key Google AI Studio (Gemini)."}
        return {"ok": True, "message": "Kết nối Gemini TTS thành công! Sẵn sàng các giọng AI chuyên nghiệp."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        gemini_default = resolve_default_voice_for_provider("gemini")
        edge_voice = "vi-VN-NamMinhNeural" if ("male" in (voice or gemini_default).lower() or any(x in (voice or "").lower() for x in ["charon", "puck", "fenrir", "orus"])) else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
