"""EdgeTTSProvider — giọng nói THẬT (Microsoft Edge TTS, miễn phí, không cần API key).

EdgeTTS tạo giọng nói tự nhiên, khớp nội dung văn bản với phụ đề — đúng yêu cầu "âm thanh phải
nói đúng theo phụ đề".

Sử dụng CLI `edge-tts` (pip package edge-tts). Hỗ trợ tiếng Việt:
- vi-VN-HoaiMyNeural   (Nữ)
- vi-VN-NamMinhNeural  (Nam)
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import List

from backend.core.config import FFMPEG_BIN
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

EDGE_VOICES = [
    TTSVoice(id="vi-VN-HoaiMyNeural", name="Hoài My (Nữ, vi-VN)", language="vi", gender="female"),
    TTSVoice(id="vi-VN-NamMinhNeural", name="Nam Minh (Nam, vi-VN)", language="vi", gender="male"),
    TTSVoice(id="en-US-JennyNeural", name="Jenny (Female, en-US)", language="en", gender="female"),
    TTSVoice(id="en-US-GuyNeural", name="Guy (Male, en-US)", language="en", gender="male"),
]

DEFAULT_VOICE = "vi-VN-HoaiMyNeural"


def _edge_command() -> list[str]:
    executable = shutil.which("edge-tts") or shutil.which("edge_tts")
    return [executable] if executable else [sys.executable, "-m", "edge_tts"]


class EdgeTTSProvider(TTSProvider):
    """Real speech via Microsoft Edge TTS (no API key required)."""

    @property
    def name(self) -> str:
        return "edge"

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        text = (text or "").strip()
        if not text:
            raise RuntimeError("Văn bản thuyết minh rỗng, không thể tạo audio")

        voice_id = voice or DEFAULT_VOICE
        if voice_id not in {v.id for v in EDGE_VOICES}:
            voice_id = DEFAULT_VOICE

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
        return list(EDGE_VOICES)

    def test_connection(self) -> dict:
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                tmp = f.name
            self.synthesize("Xin chào, đây là kiểm tra kết nối Edge TTS.", DEFAULT_VOICE, 1.0, tmp)
            ok = Path(tmp).stat().st_size > 1000
            Path(tmp).unlink(missing_ok=True)
            return {
                "ok": ok,
                "message": "Kết nối Edge TTS thành công — giọng nói thật (Microsoft Edge, miễn phí).",
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "message": f"Edge TTS không khả dụng: {e}"}
