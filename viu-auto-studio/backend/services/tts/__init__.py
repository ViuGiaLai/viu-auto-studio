"""TTS service layer: provider registry and settings persistence."""

from __future__ import annotations

from typing import List, Optional

from backend.core.config import TTS_MODEL_DIR, TTS_PROVIDER
from backend.schemas import TTSConfigRequest, TTSVoice
from backend.services.tts.base import TTSProvider
from backend.services.tts.local_provider import LocalTTSProvider
from backend.services.tts.cloud_provider import CloudTTSProvider
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
    return {
        "provider": provider,
        "voice": settings.get("voice", ""),
        "speed": float(settings.get("speed", 1.0)),
        "volume": float(settings.get("volume", 1.0)),
        "model_dir": settings.get("model_dir", TTS_MODEL_DIR),
        "cloud_api_key": settings.get("cloud_api_key", ""),
    }


def save_tts_config(db, config: TTSConfigRequest) -> dict:
    settings = {
        "provider": config.provider,
        "voice": config.voice,
        "speed": config.speed,
        "volume": config.volume,
        "model_dir": config.model_dir,
        "cloud_api_key": config.cloud_api_key,
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
    raise ValueError(
        f"TTS provider '{name}' không được hỗ trợ. Hỗ trợ: edge, local, cloud"
    )


def list_tts_providers() -> List[dict]:
    return [
        {"id": "edge", "name": "Edge TTS (giọng thật, miễn phí, không cần key)", "available": True},
        {"id": "revo", "name": "Revo Voice (chưa cài engine giọng thật)", "available": False},
        {"id": "kokoro", "name": "Kokoro TTS (Anh/Mỹ/Anh-Úc..., local)", "available": False},
        {"id": "kokoro_vi", "name": "Kokoro Việt Nam (local)", "available": False},
        {"id": "omnivoice", "name": "OmniVoice (clone đa ngữ, local)", "available": False},
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
