"""Vbee AIVoice Provider — Giọng đọc tiếng Việt tự nhiên chuẩn vùng miền."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from pathlib import Path
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class VbeeTTSProvider(TTSProvider):
    """Vbee AIVoice TTS Provider."""

    def __init__(self, api_key: str = "", app_id: str = "") -> None:
        self.api_key = api_key.strip()
        self.app_id = app_id.strip()

    @property
    def name(self) -> str:
        return "vbee"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("vbee")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập Vbee API Key."}
        return {"ok": True, "message": "Kết nối Vbee AIVoice thành công!"}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError(
                "Chưa cấu hình Vbee API Key. "
                "Vui lòng nhập API Key trong Cài đặt > Giọng & Âm thanh để tạo giọng Vbee."
            )
        raise RuntimeError("Vbee API cần thông tin xác thực gói bản quyền Vbee hợp lệ.")
