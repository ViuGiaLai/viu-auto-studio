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
        {"id": "edge", "name": "Edge TTS (giọng thật, miễn phí, không cần key)", "available": True},
        {"id": "revo", "name": "Revo Voice (chưa cài engine giọng thật)", "available": False},
        {"id": "kokoro", "name": "Kokoro TTS (Anh/Mỹ/Anh-Úc..., local)", "available": False},
        {"id": "kokoro_vi", "name": "Kokoro Việt Nam (local)", "available": False},
        {"id": "omnivoice", "name": "OmniVoice (clone đa ngữ, local)", "available": OmniVoiceProvider.is_available()},
        {"id": "elevenlabs", "name": "ElevenLabs", "available": False},
        {"id": "google_cloud_tts", "name": "Google Cloud TTS (Studio 48kHz)", "available": False},
        {"id": "gemini_tts", "name": "Gemini TTS (AI Studio)", "available": False},
        {"id": "vbee", "name": "Vbee (giọng Việt)", "available": False},
        {"id": "azure_tts", "name": "Azure TTS", "available": False},
        {"id": "local", "name": "Local TTS (Piper framework)", "available": True},
        {"id": "cloud", "name": "Cloud TTS (framework)", "available": True},
    ]


def list_voices(config: Optional[dict] = None) -> List[TTSVoice]:
    cfg = config or {}
    return get_provider(cfg).list_voices()


def test_connection(config: Optional[dict] = None) -> dict:
    return get_provider(config).test_connection()


def synthesize(text: str, output_path: str, config: Optional[dict] = None) -> str:
    """Convenience wrapper used by the pipeline."""
    settings = config or {}
    provider = get_provider(settings)
    return provider.synthesize(
        text=text,
        voice=str(settings.get("voice", "")),
        speed=float(settings.get("speed", 1.0)),
        output_path=output_path,
    )
