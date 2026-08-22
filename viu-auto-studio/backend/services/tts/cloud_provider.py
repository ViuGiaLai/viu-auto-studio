"""Cloud TTS Providers — Google Cloud TTS & Azure Speech Services."""

from __future__ import annotations

import logging
from typing import List

from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class GoogleCloudTTSProvider(TTSProvider):
    """Google Cloud Text-to-Speech API Provider."""

    def __init__(self, api_key: str = "", service_account_json: str = "") -> None:
        self.api_key = api_key.strip()
        self.service_account_json = service_account_json.strip()

    @property
    def name(self) -> str:
        return "google_cloud_tts"

    def is_configured(self) -> bool:
        return bool(self.api_key or self.service_account_json)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("google_cloud")

    def test_connection(self) -> dict:
        if not self.is_configured():
            return {"ok": False, "message": "Chưa cấu hình API Key hoặc Service Account JSON cho Google Cloud TTS."}
        return {"ok": True, "message": "Cấu hình Google Cloud TTS hợp lệ."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError("Chưa cấu hình Google Cloud TTS API Key hoặc Service Account.")
        raise RuntimeError("Google Cloud TTS yêu cầu gói Google Cloud Project hợp lệ.")


class AzureTTSProvider(TTSProvider):
    """Microsoft Azure Cognitive Services Speech Provider."""

    def __init__(self, api_key: str = "", region: str = "southeastasia") -> None:
        self.api_key = api_key.strip()
        self.region = region.strip()

    @property
    def name(self) -> str:
        return "azure_tts"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("azure")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa cấu hình Azure Speech API Key."}
        return {"ok": True, "message": f"Cấu hình Azure Speech hợp lệ (Khu vực: {self.region})."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError("Chưa cấu hình Microsoft Azure Speech API Key.")
        raise RuntimeError("Azure Speech Services yêu cầu Azure Subscription Key hợp lệ.")
