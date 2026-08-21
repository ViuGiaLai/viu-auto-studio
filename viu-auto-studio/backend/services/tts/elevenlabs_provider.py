"""ElevenLabs TTS Provider — Danh sách giọng tuyển chọn cao cấp kèm gợi ý mục đích sử dụng."""

from __future__ import annotations

import json
import logging
import urllib.request
from typing import List

from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

CURATED_ELEVENLABS_VOICES = [
    {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam (Nam · Commercial & Hot Trend)", "language": "Multilingual", "gender": "male", "description": "Nam, siêu biểu cảm — hợp mode Adam Hot Trend, kịch tính & quảng cáo"},
    {"id": "21m00Tcm4TlvDq8ikFAM", "name": "Rachel (Nữ · Điềm tĩnh, tự nhiên)", "language": "Multilingual", "gender": "female", "description": "Nữ, đĩnh đạc và chân thực — hợp video tài liệu, triết lý & giáo dục"},
    {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi (Nữ · Năng động, tự tin)", "language": "Multilingual", "gender": "female", "description": "Nữ, dứt khoát và thu hút — hợp video tạo động lực & marketing"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella (Nữ · Ngọt ngào, diễn cảm)", "language": "Multilingual", "gender": "female", "description": "Nữ, biểu cảm nhẹ nhàng — hợp truyện cổ tích & video hoạt hình"},
    {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni (Nam · Trầm ấm, truyền cảm)", "language": "Multilingual", "gender": "male", "description": "Nam, truyền cảm sâu lắng — hợp đọc truyện, recap & tiểu sử"},
    {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh (Nam · Trầm ấm, sâu lắng)", "language": "Multilingual", "gender": "male", "description": "Nam, tông giọng cực trầm — hợp phim kinh dị, bí ẩn & hồi hộp"},
    {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli (Nữ · Trẻ trung, kể chuyện)", "language": "Multilingual", "gender": "female", "description": "Nữ trẻ, tươi tắn — hợp video giải trí tuổi teen & podcast"},
    {"id": "VR6AewLTigWG4xSOukaG", "name": "Arnold (Nam · Quyết đoán, mạnh mẽ)", "language": "Multilingual", "gender": "male", "description": "Nam, dõng dạc — hợp video hành động & phân tích quân sự"},
    {"id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam (Nam · Năng động, podcast)", "language": "Multilingual", "gender": "male", "description": "Nam, hiện đại và sôi động — hợp phỏng vấn & podcast"},
]


class ElevenLabsTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "elevenlabs"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        if not self.api_key:
            return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=False) for v in CURATED_ELEVENLABS_VOICES]

        try:
            req = urllib.request.Request(
                f"{ELEVENLABS_API_BASE}/voices",
                headers={"xi-api-key": self.api_key, "Accept": "application/json", "User-Agent": "ViuAutoStudio/1.0"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                api_voices = data.get("voices", [])

            if not api_voices:
                return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=True) for v in CURATED_ELEVENLABS_VOICES]

            result: List[TTSVoice] = []
            for v in api_voices:
                v_id = v.get("voice_id", "")
                v_name = v.get("name", "Unknown")
                category = v.get("category", "premade")
                labels = v.get("labels") or {}
                gender = labels.get("gender", "female")
                desc = "Giọng Cloned riêng của bạn — chất lượng gốc" if category == "cloned" else labels.get("description", "Giọng AI chuyên nghiệp")
                full_name = f"{v_name} (⭐ Giọng Cloned)" if category == "cloned" else v_name
                result.append(TTSVoice(id=v_id, name=full_name, language="Multilingual", gender=gender, description=desc, downloaded=True))

            # Also prepend curated favorites if not in result
            for cur in CURATED_ELEVENLABS_VOICES:
                if not any(r.id == cur["id"] for r in result):
                    result.append(TTSVoice(id=cur["id"], name=cur["name"], language=cur["language"], gender=cur["gender"], description=cur["description"], downloaded=True))
            return result
        except Exception:
            return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=False) for v in CURATED_ELEVENLABS_VOICES]

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
        edge_voice = "vi-VN-NamMinhNeural" if "male" in voice or "Adam" in voice or "Antoni" in voice or "Josh" in voice else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
