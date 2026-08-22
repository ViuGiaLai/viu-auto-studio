"""ElevenLabs TTS Provider — Tích hợp API ElevenLabs chính thức với giọng AI cao cấp."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional

from backend.core.config import FFMPEG_BIN
from backend.core.constants import resolve_default_voice_for_provider
from backend.registry.tts_registry import tts_registry
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

VALID_ELEVEN_MODELS = {
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_turbo_v2_5",
    "eleven_monolingual_v1",
    "eleven_v3",
    "eleven_turbo_v2",
    "eleven_flash_v2",
}


class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs TTS Provider chính thức."""

    def __init__(self, api_key: str = "", model_id: str = "eleven_multilingual_v2") -> None:
        self.api_key = api_key.strip()
        m = model_id.strip() if model_id else "eleven_multilingual_v2"
        self.model_id = m if m in VALID_ELEVEN_MODELS or m.startswith("eleven_") else "eleven_multilingual_v2"

    @property
    def name(self) -> str:
        return "elevenlabs"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def list_voices(self) -> List[TTSVoice]:
        return tts_registry.get_voices("elevenlabs")

    def test_connection(self) -> dict:
        if not self.api_key:
            return {"ok": False, "message": "Chưa nhập ElevenLabs API Key."}
        try:
            req = urllib.request.Request(
                f"{ELEVENLABS_API_BASE}/user",
                headers={"xi-api-key": self.api_key, "User-Agent": "ViuAutoStudio/1.0"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                subscription = data.get("subscription", {})
                tier = subscription.get("tier", "Free")
                char_count = subscription.get("character_count", 0)
                char_limit = subscription.get("character_limit", 0)
                return {"ok": True, "message": f"Kết nối ElevenLabs thành công! Gói: {tier.upper()} ({char_count:,}/{char_limit:,} ký tự)."}
        except urllib.error.HTTPError as exc:
            try:
                err_data = json.loads(exc.read().decode("utf-8"))
                detail = err_data.get("detail", {}).get("message") or err_data.get("detail") or str(exc)
            except Exception:
                detail = str(exc)
            return {"ok": False, "message": f"Lỗi ElevenLabs API ({exc.code}): {detail}"}
        except Exception as exc:
            return {"ok": False, "message": f"Không thể kết nối đến ElevenLabs: {exc}"}

    def _resolve_voice_id(self, voice: str) -> str:
        if not voice:
            return resolve_default_voice_for_provider("elevenlabs")
        
        # If it's already an ElevenLabs ID
        known = {v.id: v.id for v in self.list_voices()}
        if voice in known:
            return voice
            
        # Match by name
        for v in self.list_voices():
            if voice.lower() in v.name.lower() or v.name.lower() in voice.lower():
                return v.id
                
        return voice

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        if not self.is_configured():
            raise RuntimeError(
                "Chưa cấu hình ElevenLabs API Key. "
                "Vui lòng nhập API Key tại Cài đặt > Giọng & Âm thanh để tạo giọng ElevenLabs."
            )

        voice_id = tts_registry.resolve_voice("elevenlabs", voice)
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)

        url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}"
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True
            }
        }
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": "ViuAutoStudio/1.0"
            },
            method="POST"
        )

        try:
            logger.info("Calling ElevenLabs API: voice_id=%s, text_len=%d", voice_id, len(text))
            with urllib.request.urlopen(req, timeout=60) as resp:
                audio_bytes = resp.read()
                if not audio_bytes:
                    raise RuntimeError("ElevenLabs API trả về dữ liệu audio rỗng")
                
                if abs(speed - 1.0) < 0.05:
                    out_file.write_bytes(audio_bytes)
                else:
                    # Apply speed tempo via FFmpeg
                    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                        tmp.write(audio_bytes)
                        tmp_path = tmp.name
                    try:
                        ffmpeg = shutil.which(FFMPEG_BIN) or "ffmpeg"
                        cmd = [ffmpeg, "-y", "-i", tmp_path, "-filter:a", f"atempo={speed:.2f}", str(out_file)]
                        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                        if res.returncode != 0:
                            out_file.write_bytes(audio_bytes)
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)

            return str(out_file)

        except urllib.error.HTTPError as exc:
            try:
                err_data = json.loads(exc.read().decode("utf-8"))
                detail = err_data.get("detail", {}).get("message") or err_data.get("detail") or str(exc)
            except Exception:
                detail = str(exc)
            raise RuntimeError(f"ElevenLabs API thất bại ({exc.code}): {detail}")
        except Exception as exc:
            raise RuntimeError(f"Lỗi tạo giọng ElevenLabs: {exc}")
