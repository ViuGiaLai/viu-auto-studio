"""TTS service layer: provider registry and settings persistence."""

from __future__ import annotations

from typing import List, Optional

from backend.core.config import TTS_MODEL_DIR, TTS_PROVIDER
from backend.schemas import TTSConfigRequest, TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.local_provider import LocalTTSProvider
from backend.services.tts.omnivoice_provider import OmniVoiceProvider
from backend.services.tts.edge_provider import EdgeTTSProvider, EDGE_VOICES, DEFAULT_VOICE as EDGE_DEFAULT_VOICE
from backend.services.tts.elevenlabs_provider import ElevenLabsTTSProvider
from backend.services.tts.gemini_provider import GeminiTTSProvider
from backend.services.tts.vbee_provider import VbeeTTSProvider
from backend.services.tts.kokoro_provider import KokoroTTSProvider
from backend.services.tts.cloud_provider import GoogleCloudTTSProvider, AzureTTSProvider

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

    api_keys = settings.get("api_keys", {})
    if not isinstance(api_keys, dict):
        api_keys = {}

    # Migrate legacy single cloud_api_key if present
    legacy_key = str(settings.get("cloud_api_key", ""))
    if legacy_key and "elevenlabs" not in api_keys:
        api_keys["elevenlabs"] = legacy_key

    return {
        "provider": provider,
        "voice": settings.get("voice", ""),
        "speed": _float("speed", 1.0),
        "pitch": _float("pitch", 0.0),
        "volume": _float("volume", 1.0),
        "model_dir": settings.get("model_dir", TTS_MODEL_DIR),
        "cloud_api_key": settings.get("cloud_api_key", ""),
        "api_keys": api_keys,
        "api_key": str(api_keys.get(provider, "") or settings.get("cloud_api_key", "")),
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
    api_keys = current.get("api_keys", {})
    if not isinstance(api_keys, dict):
        api_keys = {}

    if config.api_keys:
        api_keys.update(config.api_keys)
    if config.api_key is not None:
        api_keys[config.provider] = config.api_key
    if config.cloud_api_key is not None and config.cloud_api_key:
        api_keys[config.provider] = config.cloud_api_key

    cloud_api_key = api_keys.get(config.provider, "") or config.cloud_api_key or current.get("cloud_api_key", "")

    settings = {
        "provider": config.provider,
        "voice": config.voice,
        "speed": config.speed,
        "pitch": config.pitch,
        "volume": config.volume,
        "model_dir": config.model_dir,
        "cloud_api_key": cloud_api_key,
        "api_keys": api_keys,
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
    """Build the active TTS provider from settings with strict provider isolation."""
    settings = config or {"provider": TTS_PROVIDER}
    name = str(settings.get("provider", TTS_PROVIDER)).lower().strip()

    api_keys = settings.get("api_keys", {})
    api_key = str(
        settings.get("api_key")
        or api_keys.get(name)
        or api_keys.get("elevenlabs" if name == "elevenlabs" else "")
        or api_keys.get("gemini_tts" if "gemini" in name else "")
        or api_keys.get("vbee" if name == "vbee" else "")
        or settings.get("cloud_api_key")
        or ""
    ).strip()

    if name == "edge":
        return EdgeTTSProvider()
    if name == "elevenlabs":
        raw_model = str(settings.get("model_id") or settings.get("elevenlabs_model") or (settings.get("model_name") if str(settings.get("model_name", "")).startswith("eleven_") else "") or "eleven_multilingual_v2")
        model_id = raw_model if raw_model.startswith("eleven_") else "eleven_multilingual_v2"
        return ElevenLabsTTSProvider(api_key=api_key, model_id=model_id)
    if name in {"gemini_tts", "gemini"}:
        return GeminiTTSProvider(api_key=api_key)
    if name == "vbee":
        app_id = str(settings.get("app_id") or "")
        return VbeeTTSProvider(api_key=api_key, app_id=app_id)
    if name in {"kokoro", "kokoro_vi"}:
        return KokoroTTSProvider(model_dir=str(settings.get("model_dir", "")))
    if name == "google_cloud_tts":
        return GoogleCloudTTSProvider(api_key=api_key)
    if name == "azure_tts":
        return AzureTTSProvider(api_key=api_key)
    if name == "omnivoice":
        return OmniVoiceProvider(settings)
    if name == "local":
        return LocalTTSProvider(model_dir=str(settings.get("model_dir", TTS_MODEL_DIR)))

    # Explicit Edge provider when explicitly selected or fallback
    return EdgeTTSProvider()


def list_tts_providers(config: Optional[dict] = None) -> List[dict]:
    cfg = config or {}
    api_keys = cfg.get("api_keys", {})
    cloud_key = cfg.get("cloud_api_key", "")

    return [
        {"id": "edge", "name": "Edge TTS", "category": "main", "kind": "Cloud", "badge": "Mặc định", "available": True, "requires_key": False},
        {"id": "kokoro_vi", "name": "Kokoro Việt Nam", "category": "main", "kind": "Local", "badge": "Local chính", "available": True, "requires_key": False},
        {"id": "gemini_tts", "name": "Gemini TTS", "category": "main", "kind": "Cloud API", "badge": "AI / Cloud", "available": bool(api_keys.get("gemini_tts") or cloud_key), "requires_key": True},
        {"id": "elevenlabs", "name": "ElevenLabs", "category": "main", "kind": "Cloud API", "badge": "Cao cấp", "available": bool(api_keys.get("elevenlabs") or cloud_key), "requires_key": True},
        {"id": "vbee", "name": "Vbee", "category": "main", "kind": "Cloud API", "badge": "Giọng Việt", "available": bool(api_keys.get("vbee") or cloud_key), "requires_key": True},
        # Thêm engine
        {"id": "google_cloud_tts", "name": "Google Cloud TTS", "category": "cloud", "kind": "Cloud", "available": bool(api_keys.get("google_cloud_tts")), "requires_key": True},
        {"id": "azure_tts", "name": "Azure TTS", "category": "cloud", "kind": "Cloud", "available": bool(api_keys.get("azure_tts")), "requires_key": True},
        {"id": "kokoro", "name": "Kokoro TTS", "category": "local", "kind": "Local", "available": True, "requires_key": False},
        {"id": "omnivoice", "name": "OmniVoice", "category": "local", "kind": "Local", "available": OmniVoiceProvider.is_available(), "requires_key": False},
        {"id": "local", "name": "Piper / Local TTS", "category": "local", "kind": "Local", "available": True, "requires_key": False},
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

    cfg = config or {}
    provider = get_provider(cfg)
    voice = str(cfg.get("voice", ""))
    speed = float(cfg.get("speed", 1.0))
    pitch = float(cfg.get("pitch", 0.0))

    if abs(pitch) < 0.05:
        return provider.synthesize(text, voice, speed, output_path)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
        raw_path = tf.name

    try:
        provider.synthesize(text, voice, speed, raw_path)
        if not os.path.exists(raw_path) or os.path.getsize(raw_path) == 0:
            raise RuntimeError(f"TTS provider {provider.name} không tạo được audio tạm")

        pitch_scale = math.pow(2.0, pitch / 12.0)
        sample_rate = 24000
        new_rate = int(sample_rate * pitch_scale)
        tempo_comp = 1.0 / pitch_scale
        af_filter = f"asetrate={new_rate},atempo={tempo_comp:.4f},aresample={sample_rate}"

        cmd = [
            FFMPEG_BIN,
            "-y",
            "-i",
            raw_path,
            "-af",
            af_filter,
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg pitch shift thất bại: {result.stderr}")
        return output_path
    finally:
        if os.path.exists(raw_path):
            try:
                os.unlink(raw_path)
            except OSError:
                pass
