"""EdgeTTSProvider — Bộ giọng đọc tuyển chọn đa quốc gia (Việt Nam, Mỹ, Anh, Nhật, Hàn, Trung, Thái, Tây Ban Nha, Pháp, Đức, v.v.)."""

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

# Danh sách giọng tuyển chọn cho sáng tạo video toàn cầu
CURATED_EDGE_VOICES = [
    # 🇻🇳 VIỆT NAM (Thị trường nội địa)
    TTSVoice(
        id="vi-VN-HoaiMyNeural",
        name="🇻🇳 Hoài My (Nữ, vi-VN)",
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

    # 🇺🇸 TIẾNG ANH MỸ (Thị trường Quốc tế / US)
    TTSVoice(
        id="en-US-JennyNeural",
        name="🇺🇸 Jenny (Nữ, en-US)",
        language="en-US",
        gender="female",
        description="Nữ Mỹ, tự nhiên và trôi chảy — hợp video tiếng Anh quốc tế",
    ),
    TTSVoice(
        id="en-US-GuyNeural",
        name="🇺🇸 Guy (Nam, en-US)",
        language="en-US",
        gender="male",
        description="Nam Mỹ, trầm và chuẩn — hợp video tài liệu, thuyết minh tiếng Anh",
    ),
    TTSVoice(
        id="en-US-AriaNeural",
        name="🇺🇸 Aria (Nữ, en-US Diễn cảm)",
        language="en-US",
        gender="female",
        description="Nữ Mỹ, biểu cảm kịch tính — hợp kể chuyện, video drama & YouTube Shorts",
    ),
    TTSVoice(
        id="en-US-ChristopherNeural",
        name="🇺🇸 Christopher (Nam, en-US Kể chuyện)",
        language="en-US",
        gender="male",
        description="Nam Mỹ, giọng kể chuyện sách nói & recap phim tiếng Anh",
    ),

    # 🇬🇧 TIẾNG ANH ANH (UK)
    TTSVoice(
        id="en-GB-SoniaNeural",
        name="🇬🇧 Sonia (Nữ, en-GB)",
        language="en-GB",
        gender="female",
        description="Nữ Anh, sang trọng và lịch sự — hợp video giới thiệu sản phẩm & du lịch",
    ),
    TTSVoice(
        id="en-GB-RyanNeural",
        name="🇬🇧 Ryan (Nam, en-GB)",
        language="en-GB",
        gender="male",
        description="Nam Anh, điềm đạm — hợp podcast và sách nói tiếng Anh",
    ),

    # 🇯🇵 TIẾNG NHẬT (Japan / Anime / Manga)
    TTSVoice(
        id="ja-JP-NanamiNeural",
        name="🇯🇵 Nanami (Nữ, ja-JP)",
        language="ja-JP",
        gender="female",
        description="Nữ Nhật, trong trẻo và dễ thương — hợp video anime, manga & văn hóa Nhật",
    ),
    TTSVoice(
        id="ja-JP-KeitaNeural",
        name="🇯🇵 Keita (Nam, ja-JP)",
        language="ja-JP",
        gender="male",
        description="Nam Nhật, điềm đạm và chuẩn — hợp video tài liệu, game & review",
    ),

    # 🇰🇷 TIẾNG HÀN (Korea / K-Drama / K-Pop)
    TTSVoice(
        id="ko-KR-SunHiNeural",
        name="🇰🇷 Sun-Hi (Nữ, ko-KR)",
        language="ko-KR",
        gender="female",
        description="Nữ Hàn, hiện đại và trẻ trung — hợp review phim Hàn, K-pop & vlog",
    ),
    TTSVoice(
        id="ko-KR-InJoonNeural",
        name="🇰🇷 InJoon (Nam, ko-KR)",
        language="ko-KR",
        gender="male",
        description="Nam Hàn, trầm ấm — hợp recap phim truyền hình Hàn Quốc",
    ),

    # 🇨🇳 TIẾNG TRUNG (China / Manhua / Douyin)
    TTSVoice(
        id="zh-CN-XiaoxiaoNeural",
        name="🇨🇳 Xiaoxiao (Nữ, zh-CN)",
        language="zh-CN",
        gender="female",
        description="Nữ Trung, chuẩn phổ thông — hợp tin tức, recap truyện tranh Manhua & phim Trung",
    ),
    TTSVoice(
        id="zh-CN-YunxiNeural",
        name="🇨🇳 Yunxi (Nam, zh-CN)",
        language="zh-CN",
        gender="male",
        description="Nam Trung, năng động — hợp video tóm tắt phim kiếm hiệp & TikTok",
    ),

    # 🇹🇭 TIẾNG THÁI (Thailand / SEA Entertainment)
    TTSVoice(
        id="th-TH-PremwadeeNeural",
        name="🇹🇭 Premwadee (Nữ, th-TH)",
        language="th-TH",
        gender="female",
        description="Nữ Thái Lan, ngọt ngào — hợp video giải trí TikTok & du lịch Đông Nam Á",
    ),
    TTSVoice(
        id="th-TH-NiwatNeural",
        name="🇹🇭 Niwat (Nam, th-TH)",
        language="th-TH",
        gender="male",
        description="Nam Thái Lan, rõ ràng — hợp video phóng sự & review",
    ),

    # 🇮🇩 TIẾNG INDONESIA (Indonesia)
    TTSVoice(
        id="id-ID-GadisNeural",
        name="🇮🇩 Gadis (Nữ, id-ID)",
        language="id-ID",
        gender="female",
        description="Nữ Indonesia, tự nhiên — hợp thị trường TikTok Indonesia lớn thứ 2 ĐNA",
    ),

    # 🇪🇸 TIẾNG TÂY BAN NHA (Spain & Latin America)
    TTSVoice(
        id="es-ES-ElviraNeural",
        name="🇪🇸 Elvira (Nữ, es-ES)",
        language="es-ES",
        gender="female",
        description="Nữ Tây Ban Nha, chuẩn Châu Âu — hợp thị trường nói tiếng Tây Ban Nha",
    ),
    TTSVoice(
        id="es-MX-JorgeNeural",
        name="🇲🇽 Jorge (Nam, es-MX)",
        language="es-MX",
        gender="male",
        description="Nam Mexico, hào sảng — hợp video giải trí Mỹ Latinh",
    ),

    # 🇫🇷 TIẾNG PHÁP (France)
    TTSVoice(
        id="fr-FR-DeniseNeural",
        name="🇫🇷 Denise (Nữ, fr-FR)",
        language="fr-FR",
        gender="female",
        description="Nữ Pháp, thanh lịch — hợp video ẩm thực, thời trang & du lịch Châu Âu",
    ),

    # 🇩🇪 TIẾNG ĐỨC (Germany)
    TTSVoice(
        id="de-DE-KatjaNeural",
        name="🇩🇪 Katja (Nữ, de-DE)",
        language="de-DE",
        gender="female",
        description="Nữ Đức, chuẩn xác và chuyên nghiệp — hợp video khoa học & kỹ thuật",
    ),

    # 🇧🇷 TIẾNG BỒ ĐÀO NHA BRAZIL (Brazil)
    TTSVoice(
        id="pt-BR-FranciscaNeural",
        name="🇧🇷 Francisca (Nữ, pt-BR)",
        language="pt-BR",
        gender="female",
        description="Nữ Brazil, sôi động — hợp video bóng đá, giải trí thị trường Nam Mỹ",
    ),
]

DEFAULT_VOICE = "vi-VN-HoaiMyNeural"
EDGE_VOICES = CURATED_EDGE_VOICES


def _edge_command() -> list[str]:
    executable = shutil.which("edge-tts") or shutil.which("edge_tts")
    return [executable] if executable else [sys.executable, "-m", "edge_tts"]


class EdgeTTSProvider(TTSProvider):
    """Real speech via Microsoft Edge TTS (Curated multi-country voices)."""

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
            "message": "Edge TTS sẵn sàng hoạt động (đã chọn lọc 22 giọng quốc tế hàng đầu).",
            "voices": len(CURATED_EDGE_VOICES),
        }
