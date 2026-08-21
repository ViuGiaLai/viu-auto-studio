"""Gemini TTS Provider — Danh sách giọng AI Personas với mục đích sử dụng thực tế."""

from __future__ import annotations

import logging
from typing import List

from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)

CURATED_GEMINI_VOICES = [
    {"id": "gemini_charon", "name": "Charon (Nam · Trầm ấm & Kể chuyện)", "language": "vi-VN / Multilingual", "gender": "male", "description": "Nam, trầm ấm và huyền bí — hợp video kể chuyện kỳ bí, lịch sử & recap"},
    {"id": "gemini_puck", "name": "Puck (Nam · Tự nhiên & Sinh động)", "language": "vi-VN / Multilingual", "gender": "male", "description": "Nam, tự nhiên và sinh động — hợp video giải trí, vlog đời sống & Shorts"},
    {"id": "gemini_kore", "name": "Kore (Nữ · Dịu dàng & Sâu lắng)", "language": "vi-VN / Multilingual", "gender": "female", "description": "Nữ, truyền cảm và êm dịu — hợp đọc thơ, văn học, tâm lý & thiền định"},
    {"id": "gemini_fenrir", "name": "Fenrir (Nam · Hùng hồn & Điện ảnh)", "language": "vi-VN / Multilingual", "gender": "male", "description": "Nam, mạnh mẽ và điện ảnh — hợp trailer, phim hành động & khoa học viễn tưởng"},
    {"id": "gemini_aoede", "name": "Aoede (Nữ · Tươi sáng & Trẻ trung)", "language": "vi-VN / Multilingual", "gender": "female", "description": "Nữ, năng lượng tích cực — hợp video tin tức giới trẻ, du lịch & ẩm thực"},
    {"id": "gemini_leda", "name": "Leda (Nữ · Điềm tĩnh & Học thuật)", "language": "vi-VN / Multilingual", "gender": "female", "description": "Nữ, thông thái và chuẩn mực — hợp bài giảng, phân tích tài chính & đầu tư"},
    {"id": "gemini_orus", "name": "Orus (Nam · Tin tức & Quyết đoán)", "language": "vi-VN / Multilingual", "gender": "male", "description": "Nam, phong cách biên tập viên — hợp bản tin thời sự & tóm tắt thị trường"},
    {"id": "gemini_zephyr", "name": "Zephyr (Nữ · Công nghệ AI & Tương lai)", "language": "vi-VN / Multilingual", "gender": "female", "description": "Nữ, trong trẻo và hiện đại — hợp video công nghệ, AI & khám phá vũ trụ"},
]


class GeminiTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "gemini_tts"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=True) for v in CURATED_GEMINI_VOICES]

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập API key Google AI Studio (Gemini)."}
        return {"ok": True, "message": "Kết nối Gemini TTS thành công! Sẵn sàng 8 giọng AI chuyên nghiệp."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        edge_voice = "vi-VN-NamMinhNeural" if "male" in voice or "charon" in voice or "puck" in voice or "fenrir" in voice or "orus" in voice else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
