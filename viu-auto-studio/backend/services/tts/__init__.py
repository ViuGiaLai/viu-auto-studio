"""TTS service layer: provider registry and settings persistence."""

from __future__ import annotations

from typing import List, Optional

from backend.core.config import TTS_MODEL_DIR, TTS_PROVIDER
from backend.schemas import TTSConfigRequest, TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.local_provider import LocalTTSProvider
from backend.services.tts.cloud_provider import CloudTTSProvider
from backend.services.tts.omnivoice_provider import OmniVoiceProvider
from backend.services.tts.edge_provider import EdgeTTSProvider, EDGE_VOICES, DEFAULT_VOICE as EDGE_DEFAULT_VOICE

# ---------------------------------------------------------------------------
# Runtime settings store (persists TTS/voice config to SQLite app_settings)
# ---------------------------------------------------------------------------
_TTS_KEY = "tts_config"


def _load_settings(db) -> dict:
    from backend.models import AppSetting

    row = db.query(AppSetting).filter(AppSetting.key == _TTS_KEY).first()
    if row is None:
        return {}
    try:
        import json

        return json.loads(row.value_encrypted)
    except (ValueError, TypeError):
        return {}


def _save_settings(db, settings: dict) -> None:
    import json

    from backend.models import AppSetting

    row = db.query(AppSetting).filter(AppSetting.key == _TTS_KEY).first()
    payload = json.dumps(settings, ensure_ascii=False)
    if row is None:
        db.add(AppSetting(key=_TTS_KEY, value_encrypted=payload))
    else:
        row.value_encrypted = payload
    db.commit()


def get_tts_config(db) -> dict:
    settings = _load_settings(db)
    provider = str(settings.get("provider", TTS_PROVIDER)).lower()
    # Cấu hình cũ từng lưu MockTTS chỉ dùng kiểm thử. Tự chuyển sang Edge TTS
    # để mọi lần tạo giọng trong ứng dụng đều tạo tiếng nói thật.
    if provider in {"mock", "revo", "revo_voice"}:
        provider = "edge"
    def _float(name: str, default: float) -> float:
        try:
            return float(settings.get(name, default))
        except (TypeError, ValueError):
            return default

    def _int(name: str, default: int) -> int:
        try:
            return int(settings.get(name, default))
        except (TypeError, ValueError):
            return default

    def _bool(name: str, default: bool) -> bool:
        value = settings.get(name, default)
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    return {
        "provider": provider,
        "voice": settings.get("voice", ""),
        "speed": _float("speed", 1.0),
        "pitch": _float("pitch", 0.0),
        "volume": _float("volume", 1.0),
        "model_dir": settings.get("model_dir", TTS_MODEL_DIR),
        "cloud_api_key": settings.get("cloud_api_key", ""),
        "reference_audio": settings.get("reference_audio", ""),
        "reference_text": settings.get("reference_text", ""),
        "voice_clone_prompt": settings.get("voice_clone_prompt", ""),
        "voice_design": settings.get("voice_design", ""),
        "model_name": settings.get("model_name", "k2-fsa/OmniVoice"),
        "device": settings.get("device", "auto"),
        "duration": settings.get("duration"),
        "num_step": _int("num_step", 32),
        "normalize_text": _bool("normalize_text", False),
        "postprocess_output": _bool("postprocess_output", True),
        "audio_chunk_duration": _float("audio_chunk_duration", 15.0),
        "audio_chunk_threshold": _float("audio_chunk_threshold", 30.0),
    }


def save_tts_config(db, config: TTSConfigRequest) -> dict:
    current = _load_settings(db)
    cloud_api_key = config.cloud_api_key if config.cloud_api_key is not None else current.get("cloud_api_key", "")
    settings = {
        "provider": config.provider,
        "voice": config.voice,
        "speed": config.speed,
        "pitch": config.pitch,
        "volume": config.volume,
        "model_dir": config.model_dir,
        "cloud_api_key": cloud_api_key,
        "reference_audio": config.reference_audio,
        "reference_text": config.reference_text,
        "voice_clone_prompt": config.voice_clone_prompt,
        "voice_design": config.voice_design,
        "model_name": config.model_name,
        "device": config.device,
        "duration": config.duration,
        "num_step": config.num_step,
        "normalize_text": config.normalize_text,
        "postprocess_output": config.postprocess_output,
        "audio_chunk_duration": config.audio_chunk_duration,
        "audio_chunk_threshold": config.audio_chunk_threshold,
    }
    _save_settings(db, settings)
    return get_tts_config(db)


# ---------------------------------------------------------------------------
# Provider resolution
# ---------------------------------------------------------------------------

def get_provider(config: Optional[dict] = None) -> TTSProvider:
    """Build the active TTS provider from settings (or a plain dict)."""
    settings = config or {"provider": TTS_PROVIDER}
    name = str(settings.get("provider", TTS_PROVIDER)).lower()

    if name == "edge":
        return EdgeTTSProvider()
    if name == "local":
        return LocalTTSProvider(model_dir=str(settings.get("model_dir", TTS_MODEL_DIR)))
    if name == "cloud":
        return CloudTTSProvider(api_key=str(settings.get("cloud_api_key", "")))
    if name == "omnivoice":
        return OmniVoiceProvider(settings)
    raise ValueError(
        f"TTS provider '{name}' không được hỗ trợ. Hỗ trợ: edge, local, cloud, omnivoice"
    )


def list_tts_providers() -> List[dict]:
    return [
        {"id": "edge", "name": "Edge TTS", "category": "main", "kind": "Cloud", "badge": "Mặc định", "available": True},
        {"id": "kokoro_vi", "name": "Kokoro Việt Nam", "category": "main", "kind": "Local", "badge": "Local chính", "available": False},
        {"id": "gemini_tts", "name": "Gemini TTS", "category": "main", "kind": "Cloud API", "badge": "AI / Cloud", "available": False},
        {"id": "elevenlabs", "name": "ElevenLabs", "category": "main", "kind": "Cloud API", "badge": "Cao cấp", "available": False},
        {"id": "vbee", "name": "Vbee", "category": "main", "kind": "Cloud API", "badge": "Giọng Việt", "available": False},
        # Thêm engine
        {"id": "google_cloud_tts", "name": "Google Cloud TTS", "category": "cloud", "kind": "Cloud", "available": False},
        {"id": "azure_tts", "name": "Azure TTS", "category": "cloud", "kind": "Cloud", "available": False},
        {"id": "kokoro", "name": "Kokoro TTS", "category": "local", "kind": "Local", "available": False},
        {"id": "omnivoice", "name": "OmniVoice", "category": "local", "kind": "Local", "available": OmniVoiceProvider.is_available()},
        {"id": "local", "name": "Piper / Local TTS", "category": "local", "kind": "Local", "available": True},
    ]


def list_voices(config: Optional[dict] = None) -> List[TTSVoice]:
    cfg = config or {}
    return get_provider(cfg).list_voices()


def test_connection(config: Optional[dict] = None) -> dict:
    return get_provider(config).test_connection()


def synthesize(text: str, output_path: str, config: Optional[dict] = None) -> str:
    """Synthesize speech and apply pitch with the app's FFmpeg when requested."""
    import math
    import os
    import subprocess
    import tempfile
    from pathlib import Path

    from backend.core.config import FFMPEG_BIN

    settings = config or {}
    provider = get_provider(settings)
    pitch = max(-12.0, min(12.0, float(settings.get("pitch", 0.0) or 0.0)))
    if abs(pitch) < 0.01:
        return provider.synthesize(
            text=text,
            voice=str(settings.get("voice", "")),
            speed=float(settings.get("speed", 1.0)),
            output_path=output_path,
        )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_fd, raw_name = tempfile.mkstemp(prefix="viu_tts_pitch_", suffix=output.suffix or ".mp3")
    os.close(raw_fd)
    raw = Path(raw_name)
    try:
        provider.synthesize(
            text=text,
            voice=str(settings.get("voice", "")),
            speed=float(settings.get("speed", 1.0)),
            output_path=str(raw),
        )
        ratio = math.pow(2.0, pitch / 12.0)
        result = subprocess.run([
            FFMPEG_BIN, "-y", "-i", str(raw),
            "-af", f"asetrate=44100*{ratio:.8f},aresample=44100",
            "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(output),
        ], capture_output=True, text=True, timeout=120)
        if result.returncode != 0 or not output.exists() or output.stat().st_size < 1000:
            raise RuntimeError(f"Không thể áp dụng cao độ bằng FFmpeg: {result.stderr[:300]}")
        return str(output)
    finally:
        raw.unlink(missing_ok=True)
