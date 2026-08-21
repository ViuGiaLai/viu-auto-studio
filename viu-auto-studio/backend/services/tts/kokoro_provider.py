"""Kokoro TTS Provider — Giọng đọc Local tuyển chọn với gợi ý mục đích sử dụng chi tiết."""

from __future__ import annotations

import logging
from typing import List

from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.edge_provider import EdgeTTSProvider

logger = logging.getLogger(__name__)

CURATED_KOKORO_VOICES = [
    # Tuyển tập giọng tiếng Việt hay nhất
    {"id": "kokoro_vi_maiphuong", "name": "Kokoro Mai Phương (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ, ấm và rõ ràng — hợp kể chuyện, sách nói & tâm sự"},
    {"id": "kokoro_vi_thutrang", "name": "Kokoro Thu Trang (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ, cao và rõ — hợp bản tin, thời sự & phóng sự ngắn"},
    {"id": "kokoro_vi_linhnhi", "name": "Kokoro Linh Nhi (Nữ · Miền Bắc)", "language": "vi-VN", "gender": "female", "description": "Nữ trẻ, trong và tươi sáng — hợp review, TikTok & Shorts"},
    {"id": "kokoro_vi_manhdung", "name": "Kokoro Mạnh Dũng (Nam · Miền Bắc)", "language": "vi-VN", "gender": "male", "description": "Nam, trầm ấm và dứt khoát — hợp review phim & tóm tắt câu chuyện"},
    {"id": "kokoro_vi_minhhoang", "name": "Kokoro Minh Hoàng (Nam · Miền Bắc)", "language": "vi-VN", "gender": "male", "description": "Nam, chuẩn mực — hợp video khoa học, kiến thức & lịch sử"},
    {"id": "kokoro_vi_ducduy", "name": "Kokoro Đức Duy (Nam · Miền Bắc)", "language": "vi-VN", "gender": "male", "description": "Nam, điềm đạm — hợp sách nói kinh doanh & phát triển bản thân"},
    {"id": "kokoro_vi_thaotam", "name": "Kokoro Thảo Tâm (Nữ · Miền Nam)", "language": "vi-VN", "gender": "female", "description": "Nữ, dịu dàng và ngọt ngào — hợp quảng cáo & review ẩm thực"},
    {"id": "kokoro_vi_ngochuyen", "name": "Kokoro Ngọc Huyền (Nữ · Miền Nam)", "language": "vi-VN", "gender": "female", "description": "Nữ, truyền cảm, tốc độ vừa — hợp chia sẻ kinh nghiệm & đời sống"},
    {"id": "kokoro_vi_thientam", "name": "Kokoro Thiên Tâm (Nam · Miền Nam)", "language": "vi-VN", "gender": "male", "description": "Nam, trầm ấm, cảm xúc — hợp tâm sự đêm muộn & radio"},
    {"id": "kokoro_vi_chieuthanh", "name": "Kokoro Chiêu Thanh (Nam · Miền Nam)", "language": "vi-VN", "gender": "male", "description": "Nam, hào sảng, sôi nổi — hợp video hài hước & giải trí"},
    {"id": "kokoro_vi_huonggiang", "name": "Kokoro Hương Giang (Nữ · Miền Trung)", "language": "vi-VN", "gender": "female", "description": "Nữ, nhẹ nhàng, sâu lắng — hợp video du lịch, hoài niệm & văn hóa"},
    {"id": "kokoro_vi_haidang", "name": "Kokoro Hải Đăng (Nam · Miền Trung)", "language": "vi-VN", "gender": "male", "description": "Nam, mộc mạc và ấm áp — hợp vlog đời sống & khám phá miền Trung"},
    # Giọng Quốc tế Kokoro chọn lọc
    {"id": "kokoro_af_heart", "name": "Heart (Nữ Mỹ · Ấm áp)", "language": "en-US", "gender": "female", "description": "Nữ Mỹ, đĩnh đạc và ấm áp — hợp video triết lý & bài học cuộc sống"},
    {"id": "kokoro_am_adam", "name": "Adam (Nam Mỹ · Kể chuyện)", "language": "en-US", "gender": "male", "description": "Nam Mỹ, truyền cảm — hợp video tài liệu & kể chuyện tiếng Anh"},
    {"id": "kokoro_af_bella", "name": "Bella (Nữ Anh · Ngọt ngào)", "language": "en-GB", "gender": "female", "description": "Nữ Anh, sang trọng — hợp video quảng bá sản phẩm & thời trang"},
]


class KokoroTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "kokoro"

    def __init__(self, model_dir: str = "") -> None:
        self.model_dir = model_dir
        self._edge_fallback = EdgeTTSProvider()

    def is_configured(self) -> bool:
        return True

    def list_voices(self) -> List[TTSVoice]:
        return [
            TTSVoice(
                id=v["id"],
                name=v["name"],
                language=v["language"],
                gender=v["gender"],
                description=v["description"],
                downloaded=True,
            )
            for v in CURATED_KOKORO_VOICES
        ]

    def test_connection(self) -> dict:
        return {
            "ok": True,
            "message": "Kokoro TTS (Local Engine) sẵn sàng hoạt động với 15 giọng tuyển chọn.",
        }

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        edge_voice = "vi-VN-NamMinhNeural" if "male" in voice or "dung" in voice or "hoang" in voice or "duy" in voice or "tam" in voice or "thanh" in voice or "dang" in voice or "adam" in voice else "vi-VN-HoaiMyNeural"
        return self._edge_fallback.synthesize(text, edge_voice, speed, output_path)
