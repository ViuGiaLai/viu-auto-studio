"""Optional OmniVoice adapter.

The dependency and model weights are intentionally optional because OmniVoice
requires a heavyweight PyTorch runtime. When it is not installed, this
provider reports an actionable unavailable state instead of pretending to
synthesize audio or silently falling back to another engine.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import subprocess
import threading
from pathlib import Path
from typing import Any, List

from backend.core.config import DATA_DIR, FFMPEG_BIN
from backend.schemas import TTSVoice
from backend.services.tts.base import TTSProvider


class OmniVoiceProvider(TTSProvider):
    """OmniVoice zero-shot TTS with optional reference-voice cloning."""

    _model_cache: dict[tuple[str, str], Any] = {}
    _voice_prompt_cache: dict[tuple[str, str, str], Any] = {}
    _lock = threading.Lock()
    sample_rate = 24_000

    def __init__(self, config: dict | None = None) -> None:
        self.config = config or {}
        self.model_name = str(self.config.get("model_name") or "k2-fsa/OmniVoice")
        self.model_dir = str(self.config.get("model_dir") or "")
        self.device = str(self.config.get("device") or "auto").lower()

    @property
    def name(self) -> str:
        return "omnivoice"

    @staticmethod
    def is_available() -> bool:
        return all(importlib.util.find_spec(name) is not None for name in ("omnivoice", "torch", "soundfile"))

    def _runtime(self):
        if not self.is_available():
            raise RuntimeError(
                "OmniVoice chưa được cài đặt. Đây là provider local tùy chọn, cần cài "
                "omnivoice cùng PyTorch/torchaudio trong môi trường riêng trước khi bật."
            )
        try:
            omnivoice = importlib.import_module("omnivoice")
            torch = importlib.import_module("torch")
            soundfile = importlib.import_module("soundfile")
            return omnivoice, torch, soundfile
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Không thể nạp runtime OmniVoice: {exc}") from exc

    def _load_model(self):
        omnivoice, torch, _ = self._runtime()
        device = self.device
        if device == "auto":
            device = "cuda:0" if bool(torch.cuda.is_available()) else "cpu"
        cache_key = (self.model_name, device)
        with self._lock:
            if cache_key in self._model_cache:
                return self._model_cache[cache_key], omnivoice, torch
            kwargs: dict[str, Any] = {"device_map": device}
            if device.startswith("cuda"):
                kwargs["dtype"] = torch.float16
            else:
                kwargs["dtype"] = torch.float32
            try:
                model = omnivoice.OmniVoice.from_pretrained(self.model_name, **kwargs)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(
                    f"Không tải được model OmniVoice '{self.model_name}' trên {device}: {exc}"
                ) from exc
            self._model_cache[cache_key] = model
            return model, omnivoice, torch

    def _clone_prompt(self, model, omnivoice, reference_audio: Path, reference_text: str):
        cache_path = str(self.config.get("voice_clone_prompt") or "")
        if not cache_path:
            fingerprint = hashlib.sha256(
                reference_audio.read_bytes() + b"\0" + reference_text.encode("utf-8")
            ).hexdigest()[:24]
            cache_path = str(DATA_DIR / "voices" / "omnivoice" / f"{fingerprint}.pt")
        cache_key = (str(reference_audio.resolve()), reference_text, cache_path)
        with self._lock:
            if cache_key in self._voice_prompt_cache:
                return self._voice_prompt_cache[cache_key]
        if cache_path:
            prompt_file = Path(cache_path).expanduser()
            if prompt_file.is_file():
                try:
                    prompt = omnivoice.VoiceClonePrompt.load(prompt_file)
                    with self._lock:
                        self._voice_prompt_cache[cache_key] = prompt
                    return prompt
                except Exception:
                    prompt_file.unlink(missing_ok=True)
        try:
            prompt = model.create_voice_clone_prompt(
                ref_audio=str(reference_audio),
                ref_text=reference_text or None,
            )
            if cache_path:
                prompt_file = Path(cache_path).expanduser()
                prompt_file.parent.mkdir(parents=True, exist_ok=True)
                prompt.save(prompt_file)
            with self._lock:
                self._voice_prompt_cache[cache_key] = prompt
            return prompt
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Không tạo được voice clone prompt OmniVoice: {exc}") from exc

    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        del voice  # OmniVoice uses clone prompt, design instruction, or auto voice.
        text = (text or "").strip()
        if not text:
            raise RuntimeError("OmniVoice không thể tổng hợp văn bản rỗng")
        model, omnivoice, _, = self._load_model()
        _, _, soundfile = self._runtime()
        reference_audio = Path(str(self.config.get("reference_audio") or "")).expanduser()
        reference_text = str(self.config.get("reference_text") or "").strip()
        voice_clone_prompt = None
        if reference_audio:
            if not reference_audio.is_file():
                raise RuntimeError(f"Không tìm thấy reference audio OmniVoice: {reference_audio}")
            voice_clone_prompt = self._clone_prompt(model, omnivoice, reference_audio, reference_text)

        kwargs: dict[str, Any] = {
            "speed": float(self.config.get("speed", speed) or speed or 1.0),
            "num_step": int(self.config.get("num_step", 32) or 32),
            "normalize_text": bool(self.config.get("normalize_text", False)),
            "postprocess_output": bool(self.config.get("postprocess_output", True)),
            "audio_chunk_duration": float(self.config.get("audio_chunk_duration", 15.0) or 15.0),
            "audio_chunk_threshold": float(self.config.get("audio_chunk_threshold", 30.0) or 30.0),
        }
        duration = self.config.get("duration")
        if duration is not None and float(duration) > 0:
            kwargs["duration"] = float(duration)
        design = str(self.config.get("voice_design") or "").strip()
        if voice_clone_prompt is not None:
            kwargs["voice_clone_prompt"] = voice_clone_prompt
        elif design:
            kwargs["instruct"] = design

        try:
            audio = model.generate(text=text, **kwargs)
            if not audio:
                raise RuntimeError("OmniVoice trả về audio rỗng")
            waveform = audio[0]
            destination = Path(output_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.suffix.lower() == ".wav":
                soundfile.write(str(destination), waveform, self.sample_rate)
            else:
                temp_wav = destination.with_suffix(destination.suffix + ".omnivoice.wav")
                try:
                    soundfile.write(str(temp_wav), waveform, self.sample_rate)
                    subprocess.run(
                        [FFMPEG_BIN, "-y", "-i", str(temp_wav), "-codec:a", "libmp3lame", str(destination)],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                        timeout=120,
                    )
                finally:
                    temp_wav.unlink(missing_ok=True)
            if not destination.is_file() or destination.stat().st_size == 0:
                raise RuntimeError("OmniVoice không tạo được file audio hợp lệ")
            return str(destination)
        except RuntimeError:
            raise
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("FFmpeg chuyển audio OmniVoice sang MP3 bị timeout") from exc
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"OmniVoice tổng hợp thất bại: {exc}") from exc

    def list_voices(self) -> List[TTSVoice]:
        if not self.is_available():
            return []
        return [
            TTSVoice(
                id="omnivoice:auto",
                name="OmniVoice Auto Voice",
                language="multi",
                description="Tự chọn voice; hoặc dùng reference audio/voice design trong cấu hình.",
            ),
            TTSVoice(
                id="omnivoice:designed",
                name="OmniVoice Voice Design",
                language="multi",
                description="Thiết kế voice bằng speaker attributes.",
            ),
        ]

    def test_connection(self) -> dict:
        if not self.is_available():
            return {
                "ok": False,
                "message": "OmniVoice chưa cài. Cài optional runtime trong môi trường Python riêng rồi thử lại.",
            }
        return {
            "ok": True,
            "message": f"OmniVoice runtime đã khả dụng; model sẽ load khi tổng hợp: {self.model_name}",
        }
