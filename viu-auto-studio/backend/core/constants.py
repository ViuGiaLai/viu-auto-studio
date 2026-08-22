"""Centralized constants for Viu Auto Studio.

This module centralizes domain defaults, provider-specific voice identifiers,
broadcast loudness standards, and engine parameters.
"""

from __future__ import annotations
from typing import Optional, Dict

# TTS Provider-specific Default Voices (Chuẩn hóa riêng cho từng Provider)
PROVIDER_DEFAULT_VOICES: Dict[str, str] = {
    "edge": "vi-VN-HoaiMyNeural",
    "elevenlabs": "pNInz6obpgDQGcFmaJgB",  # Adam (Nam · Commercial & Hot Trend)
    "gemini": "Puck",
    "gemini_tts": "Puck",
    "kokoro": "af_bella",
    "kokoro_vi": "af_bella",
    "vbee": "hn_male_manhdung",
    "google_cloud": "vi-VN-Standard-A",
    "google_cloud_tts": "vi-VN-Standard-A",
    "azure": "vi-VN-HoaiMyNeural",
    "azure_tts": "vi-VN-HoaiMyNeural",
    "omnivoice": "k2-fsa/OmniVoice",
    "local": "vi_VN-nam-medium",
}

DEFAULT_TTS_PROVIDER = "edge"
DEFAULT_TTS_SPEED = 1.0
DEFAULT_TTS_PITCH = 0
DEFAULT_TTS_VOLUME = 1.0


def resolve_default_voice_for_provider(provider: Optional[str]) -> str:
    """Resolve the default voice name specifically tailored for the given TTS provider."""
    prov = (provider or DEFAULT_TTS_PROVIDER).lower().strip()
    return PROVIDER_DEFAULT_VOICES.get(prov, PROVIDER_DEFAULT_VOICES.get("edge", "vi-VN-HoaiMyNeural"))


# Video & Render defaults
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080
DEFAULT_FPS = 30
DEFAULT_VIDEO_BITRATE = "8000k"
DEFAULT_AUDIO_BITRATE = "192k"
DEFAULT_AUDIO_SAMPLE_RATE = 44100
DEFAULT_CRF = 21

# Audio normalization & loudness standards (ITU-R BS.1770-4 / YouTube Broadcast)
STANDARD_TARGET_LUFS = -14.0
STANDARD_TRUE_PEAK_DBFS = -4.0
STANDARD_LOUDNESS_RANGE = 7.0

# AI Auto Edit Scoring Defaults
DEFAULT_SCORING_WEIGHTS = {
    "visual_relevance": 0.35,
    "voice_sync": 0.30,
    "composition": 0.20,
    "continuity": 0.15,
}
DEFAULT_AUTO_FIX_THRESHOLD = 85
DEFAULT_MIN_SHOT_DURATION = 1.2
DEFAULT_MAX_SHOT_DURATION = 8.0
