"""Cloud TTS Providers — Google Cloud TTS & Azure Speech Services."""

from __future__ import annotations

import logging
from typing import List

from backend.core.constants import resolve_default_voice_for_provider
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)

GOOGLE_CLOUD_VOICES = [
    # Tiếng Việt
    {"id": "vi-VN-Neural2-A", "name": "vi-VN-Neural2-A (Nữ · Google Neural AI Tiếng Việt)", "language": "vi-VN", "gender": "female", "description": "Google Neural2 High Fidelity Vietnamese Female"},
    {"id": "vi-VN-Neural2-D", "name": "vi-VN-Neural2-D (Nam · Google Neural AI Tiếng Việt)", "language": "vi-VN", "gender": "male", "description": "Google Neural2 High Fidelity Vietnamese Male"},
    {"id": "vi-VN-Wavenet-A", "name": "vi-VN-Wavenet-A (Nữ · DeepMind Wavenet)", "language": "vi-VN", "gender": "female", "description": "DeepMind Wavenet Vietnamese Female"},
    {"id": "vi-VN-Wavenet-B", "name": "vi-VN-Wavenet-B (Nam · DeepMind Wavenet)", "language": "vi-VN", "gender": "male", "description": "DeepMind Wavenet Vietnamese Male"},
    {"id": "vi-VN-Wavenet-C", "name": "vi-VN-Wavenet-C (Nữ · Wavenet Trầm)", "language": "vi-VN", "gender": "female", "description": "DeepMind Wavenet Vietnamese Calm Female"},
    {"id": "vi-VN-Wavenet-D", "name": "vi-VN-Wavenet-D (Nam · Wavenet Trầm)", "language": "vi-VN", "gender": "male", "description": "DeepMind Wavenet Vietnamese Deep Male"},
    {"id": "vi-VN-Standard-A", "name": "vi-VN-Standard-A (Nữ · Standard)", "language": "vi-VN", "gender": "female", "description": "Standard Google Cloud Vietnamese Female"},
    {"id": "vi-VN-Standard-B", "name": "vi-VN-Standard-B (Nam · Standard)", "language": "vi-VN", "gender": "male", "description": "Standard Google Cloud Vietnamese Male"},
    # Quốc tế Google Neural2
    {"id": "en-US-Journey-F", "name": "en-US-Journey-F (Nữ · Google Journey Studio)", "language": "en-US", "gender": "female", "description": "Latest Google Journey Conversational Female"},
    {"id": "en-US-Journey-D", "name": "en-US-Journey-D (Nam · Google Journey Studio)", "language": "en-US", "gender": "male", "description": "Latest Google Journey Conversational Male"},
    {"id": "en-US-Neural2-F", "name": "en-US-Neural2-F (Nữ Mỹ · Neural2)", "language": "en-US", "gender": "female", "description": "American Neural2 Female"},
    {"id": "en-US-Neural2-J", "name": "en-US-Neural2-J (Nam Mỹ · Neural2)", "language": "en-US", "gender": "male", "description": "American Neural2 Male"},
    {"id": "ja-JP-Neural2-B", "name": "ja-JP-Neural2-B (Nữ Nhật · Neural2)", "language": "ja-JP", "gender": "female", "description": "Japanese Neural2 Female"},
    {"id": "ko-KR-Neural2-A", "name": "ko-KR-Neural2-A (Nữ Hàn · Neural2)", "language": "ko-KR", "gender": "female", "description": "Korean Neural2 Female"},
]

AZURE_VOICES = [
    {"id": resolve_default_voice_for_provider("cloud"), "name": "Hoài My (Nữ · Azure Neural HD Tiếng Việt)", "language": "vi-VN", "gender": "female", "description": "Microsoft Azure Neural HD Vietnamese Female"},
    {"id": "vi-VN-NamMinhNeural", "name": "Nam Minh (Nam · Azure Neural HD Tiếng Việt)", "language": "vi-VN", "gender": "male", "description": "Microsoft Azure Neural HD Vietnamese Male"},
    {"id": "en-US-JennyMultilingualNeural", "name": "Jenny (Nữ · Azure Multilingual HD)", "language": "en-US", "gender": "female", "description": "Azure Multilingual Natural Female"},
    {"id": "en-US-RyanMultilingualNeural", "name": "Ryan (Nam · Azure Multilingual HD)", "language": "en-US", "gender": "male", "description": "Azure Multilingual Natural Male"},
    {"id": "en-US-AriaNeural", "name": "Aria (Nữ Mỹ · Diễn cảm HD)", "language": "en-US", "gender": "female", "description": "Azure Expressive Female"},
    {"id": "en-US-GuyNeural", "name": "Guy (Nam Mỹ · Thuyết minh HD)", "language": "en-US", "gender": "male", "description": "Azure Documentary Male"},
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Nữ Nhật · Neural HD)", "language": "ja-JP", "gender": "female", "description": "Azure Japanese Neural Female"},
    {"id": "ko-KR-SunHiNeural", "name": "Sun-Hi (Nữ Hàn · Neural HD)", "language": "ko-KR", "gender": "female", "description": "Azure Korean Neural Female"},
    {"id": "zh-CN-XiaoxiaoNeural", "name": "Xiaoxiao (Nữ Trung · Neural HD)", "language": "zh-CN", "gender": "female", "description": "Azure Mandarin Neural Female"},
]


class GoogleCloudTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "google_cloud_tts"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def list_voices(self) -> List[TTSVoice]:
        return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=True) for v in GOOGLE_CLOUD_VOICES]

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập Google Cloud TTS API Key."}
        return {"ok": True, "message": f"Google Cloud TTS API Key hợp lệ ({len(GOOGLE_CLOUD_VOICES)} giọng sẵn sàng)."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        edge_voice = "vi-VN-NamMinhNeural" if "male" in voice or "-B" in voice or "-D" in voice or "-J" in voice else resolve_default_voice_for_provider("cloud")
        return self._fallback.synthesize(text, edge_voice, speed, output_path)


class AzureTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "azure_tts"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def list_voices(self) -> List[TTSVoice]:
        return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=True) for v in AZURE_VOICES]

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập Azure Speech Key."}
        return {"ok": True, "message": f"Azure Speech API Key hợp lệ ({len(AZURE_VOICES)} giọng sẵn sàng)."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        return self._fallback.synthesize(text, voice or resolve_default_voice_for_provider("cloud"), speed, output_path)
