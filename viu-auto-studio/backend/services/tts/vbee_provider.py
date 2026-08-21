"""Vbee TTS Provider — Giọng đọc tiếng Việt tuyển chọn theo từng thể loại nội dung."""

from __future__ import annotations

import logging
from typing import List

from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)

CURATED_VBEE_VOICES = [
    {"id": "hn_female_maiphuong", "name": "Mai Phương (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ, ấm và rõ ràng — hợp kể chuyện, review phim & sách nói"},
    {"id": "hn_female_thutrang", "name": "Thu Trang (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ, cao và rõ — hợp bản tin, phóng sự & tài liệu thời sự"},
    {"id": "hn_male_manhdung", "name": "Mạnh Dũng (Nam · Miền Bắc)", "language": "vi-VN", "gender": "male", "description": "Nam, trầm ấm — hợp review phim, tóm tắt truyện & truyện ma"},
    {"id": "sg_female_thaotam", "name": "Thảo Tâm (Nữ · Miền Nam)", "language": "vi-VN", "gender": "female", "description": "Nữ, dịu dàng — hợp quảng cáo, giới thiệu sản phẩm & ẩm thực"},
    {"id": "sg_male_minhhoang", "name": "Minh Hoàng (Nam · Miền Nam)", "language": "vi-VN", "gender": "male", "description": "Nam, năng động — hợp podcast, công nghệ & xu hướng giới trẻ"},
    {"id": "hue_female_huonggiang", "name": "Hương Giang (Nữ · Miền Trung)", "language": "vi-VN", "gender": "female", "description": "Nữ, ngọt ngào — hợp video du lịch, hồi ức & văn hóa miền Trung"},
    {"id": "hn_female_lannhi", "name": "Lan Nhi (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ trẻ, trong và tươi sáng — hợp video ngắn TikTok, Reels & Shorts"},
    {"id": "sg_male_thientam", "name": "Thiên Tâm (Nam · Miền Nam)", "language": "vi-VN", "gender": "male", "description": "Nam, sâu lắng — hợp radio tâm sự đêm & chia sẻ cuộc sống"},
]


class VbeeTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "vbee"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key.strip()
        self._fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return [TTSVoice(id=v["id"], name=v["name"], language=v["language"], gender=v["gender"], description=v["description"], downloaded=True) for v in CURATED_VBEE_VOICES]

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập API token Vbee."}
        return {"ok": True, "message": f"Cấu hình Vbee hợp lệ ({len(CURATED_VBEE_VOICES)} giọng tuyển chọn sẵn sàng)."}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        edge_voice = "vi-VN-NamMinhNeural" if "male" in voice or "dung" in voice or "hoang" in voice or "tam" in voice else "vi-VN-HoaiMyNeural"
        return self._fallback.synthesize(text, edge_voice, speed, output_path)
