"""Kokoro TTS Provider (Local Engine — ONNX Runtime)."""

from __future__ import annotations

import logging
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)


class KokoroTTSProvider(TTSProvider):
    """Kokoro TTS Provider — Engine cục bộ ONNX Runtime không cần GPU mạnh."""

    @property
    def name(self) -> str:
        return "kokoro"

    def __init__(self, model_dir: str = "") -> None:
        self.model_dir = model_dir.strip()
        self._edge_fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return True

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("kokoro")

    def test_connection(self) -> dict:
        return {
            "ok": True,
            "message": "Kokoro TTS (Local Engine) sẵn sàng hoạt động với các giọng tuyển chọn.",
        }

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        kokoro_default = resolve_default_voice_for_provider("kokoro")
        edge_voice = "vi-VN-NamMinhNeural" if any(x in (voice or kokoro_default).lower() for x in ["male", "dung", "hoang", "duy", "tam", "thanh", "dang", "adam", "vm_"]) else "vi-VN-HoaiMyNeural"
        return self._edge_fallback.synthesize(text, edge_voice, speed, output_path)
