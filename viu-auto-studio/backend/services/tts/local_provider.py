"""LocalTTSProvider — khung tích hợp TTS local (chưa tích hợp model thật).

Theo yêu cầu dự án: KHÔNG tự nhận là đã hỗ trợ một model nếu model đó chưa
được tích hợp thật. Provider này hoạt động khi người dùng trỏ model_dir tới
một model Piper (tts .onnx + config.json) và sẽ nâng cấp sau khi tích hợp
Piper thật; hiện tại trả về trạng thái "chưa tích hợp" rõ ràng.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import List

from backend.core.config import FFMPEG_BIN
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider


class LocalTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "local"

    def is_configured(self) -> bool:
        return self._discover_piper_model() is not None

    def __init__(self, model_dir: str = "") -> None:
        self.model_dir = Path(model_dir) if model_dir else Path()

    # ------------------------------------------------------------------
    def _discover_piper_model(self) -> dict | None:
        """Look for a Piper-style model (model.onnx + config.json) in model_dir."""
        if not self.model_dir.exists() or not self.model_dir.is_dir():
            return None
        candidates = []
        for onnx in self.model_dir.rglob("*.onnx"):
            cfg = onnx.with_suffix(".json")
            if cfg.exists():
                candidates.append({"onnx": onnx, "config": cfg})
        return candidates[0] if candidates else None

    def _load_voice_from_config(self, config_path: Path) -> TTSVoice | None:
        try:
            with open(config_path, encoding="utf-8") as fh:
                cfg = json.load(fh)
            voice = cfg.get("voice", {})
            return TTSVoice(
                id=self.model_dir.name,
                name=voice.get("name", self.model_dir.name),
                language=voice.get("language", {}).get("code", "vi"),
                gender=voice.get("gender", ""),
            )
        except (OSError, ValueError, KeyError):
            return None

    # ------------------------------------------------------------------
    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:  # noqa: ARG002
        model = self._discover_piper_model()
        if model is None:
            raise RuntimeError(
                "LocalTTS chưa tích hợp model nào. Hãy trỏ 'model_dir' tới thư mục "
                "chứa model Piper (.onnx + config.json). Hiện chưa có voice thật nào "
                "được hỗ trợ — đừng nhận nhầm trạng thái này là đã hoạt động."
            )
        # NOTE: real Piper CLI integration would go here:
        # piper --model <onnx> --output_file <wav>, then convert to mp3 with ffmpeg.
        # Until piper binary is packaged and tested, do not fake success.
        raise RuntimeError(
            "LocalTTSProvider: binary Piper chưa được tích hợp thật trong phiên bản này. "
            "Piper chưa được cài đặt. Hãy dùng Edge TTS hoặc cài engine Piper thật."
        )

    def list_voices(self) -> List[TTSVoice]:
        model = self._discover_piper_model()
        if model is None:
            return []
        voice = self._load_voice_from_config(model["config"])
        return [voice] if voice else []

    def test_connection(self) -> dict:
        if not self.model_dir.exists():
            return {"ok": False, "message": "Chưa chọn thư mục model (model_dir trống)"}
        model = self._discover_piper_model()
        if model is None:
            return {
                "ok": False,
                "message": f"Không tìm thấy model Piper hợp lệ trong {self.model_dir} "
                           "(cần file .onnx + config.json). Binary Piper cũng chưa được "
                           "tích hợp thật trong phiên bản này.",
            }
        return {"ok": True, "message": f"Đã tìm thấy model: {model['onnx'].name} (tổng hợp thật chưa khả dụng)"}
