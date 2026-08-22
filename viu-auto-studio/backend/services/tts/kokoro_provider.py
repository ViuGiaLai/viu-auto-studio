"""Kokoro TTS Provider (Local Engine — ONNX Runtime)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class KokoroTTSProvider(TTSProvider):
    """Kokoro TTS Provider — Engine cục bộ ONNX Runtime không cần GPU mạnh."""

    @property
    def name(self) -> str:
        return "kokoro"

    def __init__(self, model_dir: str = "") -> None:
        self.model_dir = model_dir.strip()

    def is_configured(self) -> bool:
        try:
            import kokoro_onnx  # noqa: F401
            return True
        except ImportError:
            return False

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("kokoro")

    def test_connection(self) -> dict:
        if self.is_configured():
            return {"ok": True, "message": "Kokoro ONNX Engine đã sẵn sàng trên máy."}
        return {
            "ok": False,
            "message": "Kokoro Engine chưa được tải gói ONNX cục bộ. Hãy bấm 'Tải & Cài đặt model' hoặc sử dụng Edge TTS.",
        }

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError(
                "Kokoro ONNX Model chưa được cài đặt cục bộ trên máy. "
                "Vui lòng tải model tại Cài đặt > Giọng & Âm thanh hoặc chọn Edge TTS để đọc ngay."
            )
        import kokoro_onnx
        kokoro = kokoro_onnx.Kokoro(str(self.model_dir or "kokoro-v0_19.onnx"), "voices.bin")
        samples, sample_rate = kokoro.create(text, voice=voice or "af_bella", speed=speed)
        import soundfile as sf
        sf.write(output_path, samples, sample_rate)
        return output_path
