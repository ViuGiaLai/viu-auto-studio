"""Gemini TTS Provider (Google AI Studio text-to-speech engine)."""

from __future__ import annotations

import logging
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class GeminiTTSProvider(TTSProvider):
    """Google AI Studio (Gemini) TTS Provider."""

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()

    @property
    def name(self) -> str:
        return "gemini_tts"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("gemini")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập API key Google AI Studio (Gemini)."}
        return {"ok": True, "message": "Kết nối Gemini TTS thành công! Sẵn sàng các giọng AI chuyên nghiệp."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError(
                "Chưa cấu hình API Key Google AI Studio (Gemini). "
                "Vui lòng nhập API Key trong Cài đặt > Giọng & Âm thanh."
            )
        raise RuntimeError("Google AI Studio TTS API hiện yêu cầu cấu hình Cloud project endpoint.")
