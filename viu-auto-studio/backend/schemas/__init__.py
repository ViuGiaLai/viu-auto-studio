"""Pydantic request/response schemas for the Viu Auto Studio API."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------
class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    niche: str = ""
    script_style: str = ""
    default_voice: str = ""
    default_aspect_ratio: str = "16:9"
    logo_path: str = ""


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    niche: Optional[str] = None
    script_style: Optional[str] = None
    default_voice: Optional[str] = None
    default_aspect_ratio: Optional[str] = None
    logo_path: Optional[str] = None
    config_json: Optional[dict] = None


class ChannelConfig(BaseModel):
    """Full Cấu hình kênh configuration (reference UI: modal Cấu hình kênh)."""
    image_source: str = "ai_flow"  # ai_flow | meta | local | stock
    video_style: str = ""
    niche: str = ""
    episode_mode: str = "anthology"  # anthology | recurring
    channel_narrative: str = ""
    channel_direction: str = ""
    writing_style: str = ""
    quick_style_presets: List[str] = []
    writing_axioms: Optional[List[dict]] = None  # 5 axes cards
    hook: str = ""
    long_duration_preset: str = "3-5 phút"
    short_duration_preset: str = "90-120 giây"
    tts_provider_override: str = "default"  # default (inherit app setting) | provider key
    voice_override: str = ""
    character_sync: str = "channel"  # channel | episode | none
    image_gen_tool: str = "google_flow"
    image_mode: str = "mixed"  # mixed (trộn ảnh + video) | images | video
    static_image_seconds: float = 5.0
    video_model: str = "omni_flash"
    review_mode: str = "draft_review"  # draft_review | auto
    suggestion_time: str = "07:00"
    production_language: str = "vi"


class PipelineStepStatus(BaseModel):
    key: str
    label: str
    status: str  # done | skipped | running | failed | pending
    progress: int = 0  # 0-100
    error: str = ""


class ChannelRead(ChannelCreate):
    id: int
    config_json: dict = {}
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("config_json", mode="before")
    @classmethod
    def parse_config_json(cls, value):
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value) if value else {}
            except (ValueError, TypeError):
                return {}
        return {}


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    channel_id: Optional[int] = None
    topic: str = ""
    video_type: str = "long"  # long | short
    aspect_ratio: str = "16:9"
    language: str = "vi"
    target_duration: int = Field(default=60, ge=5, le=3600)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    channel_id: Optional[int] = None

    topic: Optional[str] = None
    video_type: Optional[str] = None
    aspect_ratio: Optional[str] = None

    topic: Optional[str] = None
    video_type: Optional[str] = None
    aspect_ratio: Optional[str] = None
    language: Optional[str] = None
    target_duration: Optional[int] = None
    config_json: Optional[str] = None
    project_directory: Optional[str] = None


class ProjectRead(BaseModel):
    size_bytes: Optional[int] = 0
    id: int
    channel_id: Optional[int] = None
    name: str
    topic: str
    project_type: str
    video_type: str
    aspect_ratio: str
    language: str
    target_duration: int
    status: str
    progress: int
    current_step: str
    project_directory: str
    output_video_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    error_message: Optional[str] = None
    config_json: Optional[str] = None
    created_at: datetime

    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDuplicate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


# ---------------------------------------------------------------------------
# Script generation
# ---------------------------------------------------------------------------
class SeoSchema(BaseModel):
    youtube_title: str = ""
    description: str = ""
    hashtags: List[str] = []
    tags: List[str] = []


class ScriptSchema(BaseModel):
    title: str = ""
    hook: str = ""
    angle: str = ""
    outline: List[str] = []
    full_script: str = ""
    thumbnail_concept: str = ""
    thumbnail_prompt: str = ""
    series_link: str = ""
    visual_style: str = ""
    viral_reason: str = ""
    status: str = "proposed"
    seo: SeoSchema = SeoSchema()


class ScriptGenerateRequest(BaseModel):
    topic: str = Field(min_length=1)
    video_type: str = "long"
    aspect_ratio: str = "16:9"
    language: str = "vi"
    target_duration: int = Field(default=60, ge=5, le=3600)
    hook: str = ""
    angle: str = ""
    outline: List[str] = []
    writing_style: str = ""
    audience: str = ""
    niche: str = ""
    thumbnail_concept: str = ""
    thumbnail_prompt_en: str = ""


class ScriptSplitRequest(BaseModel):
    full_script: str = Field(min_length=1)
    max_chars_per_line: int = Field(default=60, ge=10, le=200)


class ScriptSplitResponse(BaseModel):
    sentences: List[str]


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------
class ShotItem(BaseModel):
    id: str = ""
    order_index: int = 0
    media_path: str = ""
    image_path: str = ""
    video_path: str = ""
    media_type: str = "image"
    visual_prompt: str = ""
    transition_description: str = ""
    effect: str = "zoom_in"
    duration: float = 0.0
    start_time: float = 0.0
    end_time: float = 0.0

class SceneCreate(BaseModel):
    narration: str = ""
    visual_prompt: str = ""
    negative_prompt: str = ""
    style_prompt: str = ""
    transition_description: str = ""
    media_path: str = ""
    media_type: str = "none"
    audio_path: str = ""
    subtitle_text: str = ""
    duration: float = 0.0
    effect: str = "zoom_in"
    order_index: int = 0


class SceneUpdate(BaseModel):
    narration: Optional[str] = None
    visual_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    style_prompt: Optional[str] = None
    transition_description: Optional[str] = None
    media_path: Optional[str] = None
    image_path: Optional[str] = None
    video_path: Optional[str] = None
    media_type: Optional[str] = None
    audio_path: Optional[str] = None
    subtitle_text: Optional[str] = None
    duration: Optional[float] = None
    effect: Optional[str] = None
    order_index: Optional[int] = None
    status: Optional[str] = None
    error_message: Optional[str] = None


class SceneRead(BaseModel):
    id: int
    project_id: int
    order_index: int
    narration: str
    visual_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    style_prompt: Optional[str] = None
    transition_description: Optional[str] = None
    media_path: Optional[str] = None
    image_path: Optional[str] = None
    video_path: Optional[str] = None
    media_type: Optional[str] = None
    audio_path: Optional[str] = None
    subtitle_text: Optional[str] = None
    duration: float
    start_time: float
    end_time: float
    effect: str
    status: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneReorderRequest(BaseModel):
    scene_ids: List[int]


class SceneVoiceRequest(BaseModel):
    voice: str = ""
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    pitch: float = Field(default=0.0, ge=-12.0, le=12.0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    provider: Optional[str] = None


class SceneMediaUpdate(BaseModel):
    media_path: str = Field(min_length=1)
    media_type: str = "image"  # image | video


# ---------------------------------------------------------------------------
# TTS configuration
# ---------------------------------------------------------------------------
class TTSConfigRequest(BaseModel):
    provider: str = "edge"
    voice: str = ""
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    pitch: float = Field(default=0.0, ge=-12.0, le=12.0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    model_dir: str = ""
    cloud_api_key: Optional[str] = None
    api_key: Optional[str] = None
    api_keys: Optional[Dict[str, str]] = None
    # Optional OmniVoice controls; ignored by other providers.
    reference_audio: str = ""
    reference_text: str = ""
    voice_clone_prompt: str = ""
    voice_design: str = ""
    model_name: str = "k2-fsa/OmniVoice"
    device: str = "auto"
    duration: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    num_step: int = Field(default=32, ge=4, le=128)
    normalize_text: bool = False
    postprocess_output: bool = True
    audio_chunk_duration: float = Field(default=15.0, ge=5.0, le=120.0)
    audio_chunk_threshold: float = Field(default=30.0, ge=10.0, le=600.0)


class TTSConfigRead(BaseModel):
    provider: str
    voice: str
    speed: float
    pitch: float = 0.0
    volume: float
    model_dir: str
    cloud_api_key_masked: str = ""
    api_key: str = ""
    api_keys: Dict[str, str] = {}
    api_keys_masked: Dict[str, str] = {}
    reference_audio: str = ""
    reference_text: str = ""
    voice_clone_prompt: str = ""
    voice_design: str = ""
    model_name: str = "k2-fsa/OmniVoice"
    device: str = "auto"
    duration: Optional[float] = None
    num_step: int = 32
    normalize_text: bool = False
    postprocess_output: bool = True
    audio_chunk_duration: float = 15.0
    audio_chunk_threshold: float = 30.0


class TTSVoice(BaseModel):
    id: str
    name: str
    language: str
    gender: str = ""
    description: str = ""
    download_size_mb: int = 0
    downloaded: bool = False


class TTSTestConnectionRequest(BaseModel):
    provider: str = "edge"
    api_key: str = ""
    model_dir: str = ""


class SubtitleConfig(BaseModel):
    font: str = "DejaVuSans"
    font_size: int = Field(default=48, ge=8, le=400)
    primary_color: str = "#FFFFFF"
    border_color: str = "#000000"
    border_width: int = Field(default=2, ge=0, le=10)
    position: str = "bottom"  # bottom | center | top
    bottom_margin: int = Field(default=50, ge=0, le=500)
    max_chars_per_line: int = Field(default=60, ge=10, le=200)
    granularity: str = "sentence"  # sentence | phrase


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------
class RenderConfig(BaseModel):
    output_preset: str = "youtube"  # youtube | shorts | square | 4k | custom
    voice_volume: float = Field(default=1.0, ge=0.0, le=2.0)
    enable_ducking: bool = True
    normalize_audio: bool = True
    subtitle_style: str = "highlight"  # highlight | basic | karaoke
    subtitle_output_format: str = "embed"  # embed | srt | ass
    fps: int = Field(default=30, ge=15, le=60)

    crf: int = Field(default=21, ge=15, le=40)
    preset: str = "medium"
    video_encoder: str = "libx264"  # libx264 | h264_nvenc (future)
    audio_bitrate: str = "192k"
    background_music_path: str = ""
    music_volume: float = Field(default=0.25, ge=0.0, le=1.0)
    logo_path: str = ""
    logo_position: str = "top_right"  # top_right | top_left | bottom_right | bottom_left
    logo_opacity: float = Field(default=0.9, ge=0.0, le=1.0)
    intro_path: str = ""
    outro_path: str = ""
    enable_subtitles: bool = True
    subtitle_config: SubtitleConfig = SubtitleConfig()
    transition_duration: float = Field(default=0.5, ge=0.0, le=3.0)


class RenderStartRequest(BaseModel):
    project_id: int
    config: RenderConfig = RenderConfig()


class RenderJobRead(BaseModel):
    id: int
    project_id: int
    status: str
    progress: int
    current_step: str
    process_id: Optional[int] = None
    log_path: Optional[str] = None
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pipeline (full automatic pipeline)
# ---------------------------------------------------------------------------
class PipelineStartRequest(BaseModel):
    project_id: int
    render_config: RenderConfig = RenderConfig()
    tts_config: TTSConfigRequest = TTSConfigRequest()


# ---------------------------------------------------------------------------
# Media helpers
# ---------------------------------------------------------------------------
class MediaInfo(BaseModel):
    path: str
    duration: float = 0.0
    width: int = 0
    height: int = 0
    media_type: str = "unknown"  # image | video | audio | unknown


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class DashboardStats(BaseModel):
    total_projects: int = 0
    completed_videos: int = 0
    processing_videos: int = 0
    failed_videos: int = 0
    projects_folder_size_mb: float = 0.0
    recent_activities: List[dict] = []


# ---------------------------------------------------------------------------
# Studio v2 — Characters, Pipeline, TTS, Settings
# ---------------------------------------------------------------------------
class CharacterCreate(BaseModel):
    project_id: Optional[int] = None
    channel_id: Optional[int] = None
    name: str = Field(min_length=1)
    description: str = ""
    image_path: str = ""
    is_host: bool = False
    is_fixed: bool = False
    ai_tag: str = ""


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_path: Optional[str] = None
    is_host: Optional[bool] = None
    is_fixed: Optional[bool] = None


class CharacterRead(BaseModel):
    id: int
    project_id: Optional[int] = None
    channel_id: Optional[int] = None
    name: str
    description: str
    image_path: str
    is_host: bool
    is_fixed: bool
    ai_tag: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineStateRead(BaseModel):
    id: int
    project_id: int
    status: str
    step_data_json: dict
    error_step: str
    last_log: str

    model_config = {"from_attributes": True}

    @field_validator("step_data_json", mode="before")
    @classmethod
    def parse_step_json(cls, value):
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value) if value else {}
            except (ValueError, TypeError):
                return {}
        return {}


class TTSVoiceRead(BaseModel):
    id: str
    name: str
    language: str
    gender: str = ""
    description: str = ""
    download_size_mb: int = 0
    downloaded: bool = False


class TTSSynthesizeRequest(BaseModel):
    provider: str = "edge"
    voice: str = ""
    text: str = Field(min_length=1)
    project_id: Optional[int] = Field(default=None, ge=1)
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    output_format: str = "mp3"  # mp3 | wav
    reference_audio: str = ""
    reference_text: str = ""
    voice_clone_prompt: str = ""
    voice_design: str = ""
    duration: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    num_step: int = Field(default=32, ge=4, le=128)
    normalize_text: bool = False
    postprocess_output: bool = True
    audio_chunk_duration: float = Field(default=15.0, ge=5.0, le=120.0)
    audio_chunk_threshold: float = Field(default=30.0, ge=10.0, le=600.0)


class TTSProviderRead(BaseModel):
    id: str
    name: str
    description: str
    is_local: bool = True
    supports_vietnamese: bool = True


class StudioSettingsRead(BaseModel):
    engine_mode: str = "balanced"
    engine_installed: bool = False
    ai_provider: str = "gemini"
    ai_model: str = ""
    ai_api_key_set: bool = False
    ai_translation_provider: str = "chatgpt"
    deepseek_api_key: str = ""
    deepseek_api_key_set: bool = False
    gemini_model: str = "3.5 Flash"
    tts_provider: str = "edge"
    tts_voice: str = "vi-VN-HoaiMyNeural"
    output_folder: str = ""
    display_language: str = "vi"
    production_language: str = "vi"
    auto_refresh: bool = True
    dark_mode: bool = True
    telegram_enabled: bool = False
    telegram_configured: bool = False
    flow_logged_in: bool = False
    output_preset: str = "youtube"
    voice_volume: float = Field(default=1.0, ge=0.0, le=2.0)
    music_volume: float = Field(default=0.25, ge=0.0, le=2.0)
    enable_ducking: bool = True
    normalize_audio: bool = True
    subtitle_style: str = "highlight"
    subtitle_output_format: str = "embed"


class StudioSettingsUpdate(BaseModel):

    engine_mode: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_translation_provider: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    tts_provider: Optional[str] = None
    tts_voice: Optional[str] = None
    output_folder: Optional[str] = None
    display_language: Optional[str] = None
    production_language: Optional[str] = None
    auto_refresh: Optional[bool] = None
    dark_mode: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_enabled: Optional[bool] = None
    output_preset: Optional[str] = None
    voice_volume: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    music_volume: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    enable_ducking: Optional[bool] = None
    normalize_audio: Optional[bool] = None
    subtitle_style: Optional[str] = None
    subtitle_output_format: Optional[str] = None


class IdeaCreateRequest(BaseModel):
    channel_id: int
    video_type: str = "long"


class IdeaApproveRequest(BaseModel):
    project_id: int
    custom_script: Optional[str] = None
    prepare_only: bool = False


class ProjectCreateV2(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    channel_id: Optional[int] = None
    topic: str = ""
    project_type: str = "ai_studio"  # ai_studio | recap
    video_type: str = "long"
    aspect_ratio: str = "16:9"
    language: str = "vi"
    target_duration: int = Field(default=720, ge=5, le=3600)
    output_folder: str = ""


# ---------------------------------------------------------------------------
# Skill Lab
# ---------------------------------------------------------------------------
class SkillCatalogItem(BaseModel):
    id: str
    name: str
    category: str
    execution: str
    description: str
    requires_manus_api: bool = False


class SkillRunCreate(BaseModel):
    skill_id: str = Field(min_length=2, max_length=128)
    prompt: str = ""
    project_id: Optional[int] = None
    input: Dict[str, Any] = Field(default_factory=dict)
    use_manus: bool = True


class SkillRunRead(BaseModel):
    id: int
    project_id: Optional[int] = None
    skill_id: str
    mode: str
    status: str
    input_json: str
    output_text: str
    external_task_id: str
    error_message: str
    created_at: datetime
    updated_at: datetime
