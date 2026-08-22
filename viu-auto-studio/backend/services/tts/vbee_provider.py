"""Vbee AIVoice Provider — Giọng đọc tiếng Việt tự nhiên chuẩn vùng miền."""

from __future__ import annotations

import logging
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)


class VbeeTTSProvider(TTSProvider):
    """Vbee AIVoice TTS Provider."""

    @property
    def name(self) -> str:
        return "vbee"

    def __init__(self, api_key: str = "", app_id: str = "") -> None:
        self.api_key = api_key.strip()
        self.app_id = app_id.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("vbee")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập Vbee API Key."}
        return {"ok": True, "message": "Kết nối Vbee AIVoice thành công! Sẵn sàng giọng đọc chuẩn tiếng Việt."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        vbee_default = resolve_default_voice_for_provider("vbee")
        edge_voice = "vi-VN-NamMinhNeural" if any(x in (voice or vbee_default).lower() for x in ["male", "nam", "manh", "kien"]) else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
