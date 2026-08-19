"""CloudTTSProvider — khung tích hợp TTS API online (chưa tích hợp nhà cung cấp thật).

Theo yêu cầu dự án: KHÔNG tự nhận là đã hỗ trợ một service nếu chưa tích hợp
thật. Khung này xác thực API key với các endpoint đã định nghĩa và sẽ gọi
tổng hợp thật ngay khi adapter cụ thể (ví dụ: ElevenLabs, OpenAI TTS) được
tích hợp và kiểm thử. Hiện tại trả về trạng thái rõ ràng.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import List

from backend.core.config import FFMPEG_BIN, TTS_CLOUD_API_KEY
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider


# Stub list showing intended future integrations; none are wired up yet.
INTENDED_ADAPTERS = [
    {"id": "elevenlabs", "name": "ElevenLabs", "status": "not_implemented"},
    {"id": "openai_tts", "name": "OpenAI TTS", "status": "not_implemented"},
    {"id": "edge_tts", "name": "Edge TTS (free)", "status": "not_implemented"},
]


class CloudTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "cloud"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key or TTS_CLOUD_API_KEY

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:  # noqa: ARG002
        raise RuntimeError(
            "CloudTTS chưa tích hợp nhà cung cấp nào thật. Vui lòng dùng provider "
            "Edge TTS hoặc chờ bản cập nhật tích hợp (ElevenLabs / "
            "OpenAI TTS / Edge TTS)."
        )

    def list_voices(self) -> List[TTSVoice]:
        # Only report voices whose adapters are truly implemented (none yet).
        return []

    def test_connection(self) -> dict:
        return {
            "ok": False,
            "message": "CloudTTS chưa tích hợp nhà cung cấp nào thật trong phiên bản này. "
                       "Các adapter dự kiến: " + ", ".join(a["name"] for a in INTENDED_ADAPTERS)
                       + " (đều chưa hoàn thành). Hãy dùng Edge TTS.",
        }
