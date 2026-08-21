"""EdgeTTSProvider — Bộ giọng đọc Microsoft Edge tuyển chọn chất lượng cao, có mục đích sử dụng rõ ràng."""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List

from backend.core.config import FFMPEG_BIN
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)

# Danh sách giọng tuyển chọn hay nhất và hữu ích nhất cho người dùng
CURATED_EDGE_VOICES = [
    TTSVoice(
        id="vi-VN-HoaiMyNeural",
        name="Hoài My (Nữ, vi-VN)",
        language="vi-VN",
        gender="female",
        description="Nữ trẻ, trong và tươi sáng — hợp review, tin tức ngắn & quảng cáo",
    ),
    TTSVoice(
        id="vi-VN-NamMinhNeural",
        name="Nam Minh (Nam, vi-VN)",
        language="vi-VN",
        gender="male",
        description="Nam, trầm ấm và rõ ràng — hợp review phim & tóm tắt câu chuyện",
    ),
    TTSVoice(
        id="en-US-JennyNeural",
        name="Jenny (Nữ, Tiếng Anh Mỹ)",
        language="en-US",
        gender="female",
        description="Nữ Mỹ, tự nhiên và trôi chảy — hợp video tiếng Anh quốc tế",
    ),
    TTSVoice(
        id="en-US-GuyNeural",
        name="Guy (Nam, Tiếng Anh Mỹ)",
        language="en-US",
        gender="male",
        description="Nam Mỹ, trầm và chuẩn — hợp video tài liệu, thuyết minh tiếng Anh",
    ),
    TTSVoice(
        id="en-US-AriaNeural",
        name="Aria (Nữ, Tiếng Anh Mỹ Diễn cảm)",
        language="en-US",
        gender="female",
        description="Nữ Mỹ, biểu cảm cao — hợp kể chuyện, kịch bản kịch tính",
    ),
    TTSVoice(
        id="en-GB-SoniaNeural",
        name="Sonia (Nữ, Tiếng Anh Anh)",
        language="en-GB",
        gender="female",
        description="Nữ Anh, sang trọng và lịch sự — hợp video giới thiệu sản phẩm & du lịch",
    ),
    TTSVoice(
        id="en-GB-RyanNeural",
        name="Ryan (Nam, Tiếng Anh Anh)",
        language="en-GB",
        gender="male",
        description="Nam Anh, điềm đạm — hợp podcast và sách nói tiếng Anh",
    ),
    TTSVoice(
        id="ja-JP-NanamiNeural",
        name="Nanami (Nữ, Tiếng Nhật)",
        language="ja-JP",
        gender="female",
        description="Nữ Nhật, trong trẻo và dễ thương — hợp video anime, văn hóa Nhật",
    ),
    TTSVoice(
        id="ko-KR-SunHiNeural",
        name="Sun-Hi (Nữ, Tiếng Hàn)",
        language="ko-KR",
        gender="female",
        description="Nữ Hàn, hiện đại và trẻ trung — hợp review phim Hàn & K-pop",
    ),
    TTSVoice(
        id="zh-CN-XiaoxiaoNeural",
        name="Xiaoxiao (Nữ, Tiếng Trung)",
        language="zh-CN",
        gender="female",
        description="Nữ Trung, chuẩn phổ thông — hợp tin tức và recap phim Trung",
    ),
]

DEFAULT_VOICE = "vi-VN-HoaiMyNeural"
EDGE_VOICES = CURATED_EDGE_VOICES


def _edge_command() -> list[str]:
    executable = shutil.which("edge-tts") or shutil.which("edge_tts")
    return [executable] if executable else [sys.executable, "-m", "edge_tts"]


class EdgeTTSProvider(TTSProvider):
    """Real speech via Microsoft Edge TTS (Curated top voices)."""

    @property
    def name(self) -> str:
        return "edge"

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        text = (text or "").strip()
        if not text:
            raise RuntimeError("Văn bản thuyết minh rỗng, không thể tạo audio")

        voice_id = voice or DEFAULT_VOICE

        effective_speed = max(0.5, min(2.0, float(speed or 1.0)))
        rate = f"{int((effective_speed - 1.0) * 100):+d}%"

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        mp3_tmp = str(Path(output_path).with_suffix(".raw.mp3"))
        cmd = _edge_command() + [
            "--voice", voice_id,
            "--rate", rate,
            "--text", text,
            "--write-media", mp3_tmp,
        ]
        mp3_ok = False
        for attempt in range(2):
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if result.returncode == 0 and Path(mp3_tmp).exists() and Path(mp3_tmp).stat().st_size >= 1000:
                    mp3_ok = True
                    break
            except subprocess.TimeoutExpired:
                pass
        if not mp3_ok:
            raise RuntimeError(
                "EdgeTTS tạo giọng nói thất bại: dịch vụ không phản hồi kịp. Vui lòng thử lại."
            )

        # Normalize: 44.1kHz, 128k MP3, trim only leading silence (keep speech intact)
        final_cmd = [
            FFMPEG_BIN, "-y", "-i", mp3_tmp,
            "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1",
            "-ar", "44100",
        ]
        if Path(output_path).suffix.lower() == ".wav":
            final_cmd += ["-c:a", "pcm_s16le"]
        else:
            final_cmd += ["-c:a", "libmp3lame", "-b:a", "128k"]
        final_cmd.append(output_path)
        res = subprocess.run(final_cmd, capture_output=True, text=True)
        if res.returncode != 0 or not Path(output_path).exists() or Path(output_path).stat().st_size < 1000:
            raise RuntimeError(f"EdgeTTS chuẩn hóa audio thất bại: {res.stderr[:300]}")
        if mp3_tmp != output_path:
            Path(mp3_tmp).unlink(missing_ok=True)
        return output_path

    def list_voices(self) -> List[TTSVoice]:
        return list(CURATED_EDGE_VOICES)

    def test_connection(self) -> dict:
        return {
            "ok": True,
            "message": "Edge TTS sẵn sàng hoạt động (đã chọn lọc 10 giọng hữu ích nhất).",
            "voices": len(CURATED_EDGE_VOICES),
        }
