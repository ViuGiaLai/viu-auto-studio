"""EdgeTTSProvider — Tuyển chọn giọng đọc đa quốc gia với tên hiển thị chuẩn."""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List

from backend.core.config import FFMPEG_BIN
from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)

DEFAULT_VOICE = resolve_default_voice_for_provider("edge")
EDGE_VOICES = tts_registry.get_voices("edge")


def _edge_command() -> list[str]:
    executable = shutil.which("edge-tts") or shutil.which("edge_tts")
    return [executable] if executable else [sys.executable, "-m", "edge_tts"]


class EdgeTTSProvider(TTSProvider):
    """Edge TTS Provider (Offline / Cloud streaming không cần API key)."""

    @property
    def name(self) -> str:
        return "edge"

    def is_configured(self) -> bool:
        return True

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("edge")

    def test_connection(self) -> dict:
        cmd = _edge_command() + ["--version"]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
            if res.returncode == 0:
                return {"ok": True, "message": f"Kết nối Edge TTS thành công ({res.stdout.strip()})."}
            return {"ok": False, "message": f"edge-tts trả về mã lỗi {res.returncode}: {res.stderr}"}
        except FileNotFoundError:
            return {"ok": False, "message": "Không tìm thấy thư viện edge-tts. Vui lòng cài đặt: pip install edge-tts"}
        except Exception as exc:
            return {"ok": False, "message": f"Lỗi kiểm tra Edge TTS: {exc}"}

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        raw_mp3 = out.with_suffix(".raw.mp3") if out.suffix.lower() == ".wav" else out

        target_voice = voice or DEFAULT_VOICE
        rate_val = int(round((speed - 1.0) * 100))
        rate_arg = f"{rate_val:+d}%"

        cmd = _edge_command() + [
            f"--voice={target_voice}",
            f"--rate={rate_arg}",
            f"--text={text}",
            f"--write-media={raw_mp3}",
        ]

        logger.info("Chạy Edge TTS: voice=%s speed=%.2f text_len=%d", target_voice, speed, len(text))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"Edge TTS thất bại: {result.stderr}")

        if out.suffix.lower() == ".wav":
            ffmpeg = shutil.which(FFMPEG_BIN) or "ffmpeg"
            conv_cmd = [
                ffmpeg, "-y",
                "-i", str(raw_mp3),
                "-ar", "44100",
                "-ac", "2",
                str(out),
            ]
            conv_res = subprocess.run(conv_cmd, capture_output=True, text=True, timeout=30)
            try:
                raw_mp3.unlink(missing_ok=True)
            except Exception:
                pass
            if conv_res.returncode != 0:
                raise RuntimeError(f"Chuyển đổi WAV thất bại: {conv_res.stderr}")

        return str(out)
