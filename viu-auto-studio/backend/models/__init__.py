"""SQLAlchemy ORM models for Viu Auto Studio."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
)

from backend.core.database import Base


class Channel(Base):  # noqa: ANN001 - declarative style
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    niche = Column(String(255), default="")
    script_style = Column(String(255), default="")
    default_voice = Column(String(255), default="")
    default_aspect_ratio = Column(String(10), default="16:9")
    logo_path = Column(String(512), default="")
    config_json = Column(Text, default="{}")  # full channel config (JSON) for Cấu hình kênh
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Project(Base):  # noqa: ANN001
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, nullable=True)
    name = Column(String(255), nullable=False)
    topic = Column(Text, default="")
    project_type = Column(String(64), default="ai_studio")  # ai_studio | recap
    video_type = Column(String(64), default="long")  # long | short
    aspect_ratio = Column(String(10), default="16:9")
    language = Column(String(32), default="vi")
    target_duration = Column(Integer, default=60)  # seconds
    status = Column(String(64), default="draft")
    progress = Column(Integer, default=0)
    current_step = Column(String(128), default="")
    project_directory = Column(String(512), default="")
    output_video_path = Column(String(512), default="")
    thumbnail_path = Column(String(512), default="")
    error_message = Column(Text, default="")
    config_json = Column(Text, default="{}")  # cấu hình kênh/tham số dự án (JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Script(Base):  # noqa: ANN001
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    title = Column(Text, default="")
    hook = Column(Text, default="")
    angle = Column(Text, default="")
    outline_json = Column(Text, default="[]")  # JSON list of outline strings
    full_script = Column(Text, default="")
    thumbnail_concept = Column(Text, default="")
    thumbnail_prompt = Column(Text, default="")
    series_link = Column(String(512), default="")
    visual_style = Column(Text, default="")
    viral_reason = Column(Text, default="")
    seo_json = Column(Text, default="{}")  # JSON: {youtube_title, description, hashtags, tags}
    approved = Column(Boolean, default=False)
    status = Column(String(64), default="proposed")  # proposed | producing | failed | ready
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Scene(Base):  # noqa: ANN001
    __tablename__ = "scenes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    order_index = Column(Integer, default=0)
    narration = Column(Text, default="")
    visual_prompt = Column(Text, default="")
    negative_prompt = Column(Text, default="")
    style_prompt = Column(Text, default="")  # chuỗi nhất quán phong cách/nhân vật/bối cảnh của cảnh
    transition_description = Column(Text, default="")  # chuyển động/trạng thái xuyên suốt clip
    media_path = Column(String(512), default="")
    image_path = Column(String(512), default="")
    video_path = Column(String(512), default="")

    media_type = Column(String(32), default="")  # image | video | none

    audio_path = Column(String(512), default="")
    subtitle_text = Column(Text, default="")
    duration = Column(Float, default=0.0)  # seconds
    start_time = Column(Float, default=0.0)
    end_time = Column(Float, default=0.0)
    effect = Column(String(64), default="zoom_in")  # zoom_in | zoom_out | pan_left | pan_right | none
    status = Column(String(64), default="pending")  # pending | voice_ready | media_ready | subtitle_ready | done | error
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RenderJob(Base):  # noqa: ANN001
    __tablename__ = "render_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    status = Column(String(64), default="draft")
    progress = Column(Integer, default=0)
    current_step = Column(String(128), default="")
    process_id = Column(Integer, nullable=True)
    log_path = Column(String(512), default="")
    output_path = Column(String(512), default="")
    error_message = Column(Text, default="")
    retry_count = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Character(Base):  # noqa: ANN001
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=True)
    channel_id = Column(Integer, nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    image_path = Column(String(512), default="")
    is_host = Column(Boolean, default=False)
    is_fixed = Column(Boolean, default=False)
    ai_tag = Column(String(64), default="")
    code = Column(String(32), default="")          # mã hiển thị: MCR / SC1 ...
    role = Column(String(128), default="")          # vai trò: Người dẫn chuyện
    appearance = Column(Text, default="")           # diện mạo, tóc, trang phục
    negative_prompt = Column(Text, default="")
    identity_prompt = Column(Text, default="")      # prompt nhận diện English
    face_lock = Column(Integer, default=95)
    outfit_lock = Column(Integer, default=90)
    seed = Column(String(32), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):  # noqa: ANN001
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, nullable=False)
    value_encrypted = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PipelineState(Base):  # noqa: ANN001
    __tablename__ = "pipeline_states"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, unique=True, nullable=False)
    status = Column(String(64), default="idle")
    step_data_json = Column(Text, default="{}")  # JSON status of each step: {script: skipped, audio: 0%, ...}
    error_step = Column(String(64), default="")
    last_log = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class ConnectorTask(Base):  # noqa: ANN001
    """Task media từng cảnh gửi tới Flow Connector (Chrome Extension).
    Cảnh hoàn thành được gắn media_path vào scene và KHÔNG tạo lại task.
    Cảnh lỗi được retry riêng (status=retrying khi attempts < max)."""
    __tablename__ = "connector_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, nullable=False)
    project_id = Column(Integer, nullable=False)
    scene_id = Column(Integer, nullable=True)
    scene_order = Column(Integer, default=0)
    status = Column(String(32), default="pending")  # pending | assigned | in_progress | completed | failed | retrying
    stage = Column(String(16), default="image")  # image | video
    attempts = Column(Integer, default=0)

    prompt = Column(Text, default="")
    media_type = Column(String(32), default="image")
    aspect = Column(String(10), default="16:9")
    model = Column(String(64), default="Nano Banana 2")
    phase = Column(String(64), default="")
    progress = Column(Integer, default=0)
    progress_message = Column(Text, default="")
    assigned_to = Column(String(64), default="")
    file_path = Column(String(512), default="")
    error = Column(Text, default="")
    result_json = Column(Text, default="")
    factory_session_id = Column(String(64), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Mở rộng theo đặc tả UI tham chiếu (VIU-Auto-Studio-UI-Full)
# Định danh dùng chung: project_id / scene_id / asset_id / job_id / job_step_id /
# flow_task_id / timeline_id / clip_id / render_id
# Trạng thái chuẩn: pending running waiting_for_review completed failed
#                    skipped cancelled paused
# ---------------------------------------------------------------------------

class Idea(Base):  # noqa: ANN001 — 3 ý tưởng A/B/C mỗi lần sinh, chọn 1
    __tablename__ = "ideas"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    batch = Column(Integer, default=1)            # số lần sinh (để giữ lịch sử)
    letter = Column(String(8), default="A")       # A | B | C
    title = Column(Text, default="")
    hook = Column(Text, default="")
    angle = Column(Text, default="")
    outline_json = Column(Text, default="[]")     # JSON list
    duration_estimate = Column(Text, default="")  # "2:05"
    thumbnail_concept = Column(Text, default="")
    thumbnail_prompt = Column(Text, default="")
    status = Column(String(32), default="pending")  # pending approved rejected
    selected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class VoiceAsset(Base):  # noqa: ANN001
    __tablename__ = "voice_assets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    script_version = Column(Integer, default=1)
    provider = Column(String(64), default="edge")
    voice = Column(String(128), default="")
    file_path = Column(String(512), default="")
    duration = Column(Float, default=0.0)
    checksum = Column(String(64), default="")
    verify_state = Column(String(32), default="pending")  # pending verified failed
    created_at = Column(DateTime, default=datetime.utcnow)


class SubtitleCue(Base):  # noqa: ANN001 — độc lập với scene
    __tablename__ = "subtitle_cues"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    start = Column(Float, default=0.0)
    end = Column(Float, default=0.0)
    text = Column(Text, default="")
    style = Column(String(64), default="default")


class MediaAsset(Base):  # noqa: ANN001
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    scene_id = Column(Integer, nullable=True)
    kind = Column(String(32), default="media")    # media | voice | subtitle | thumbnail | logo | output
    file_path = Column(String(512), default="")
    provider = Column(String(64), default="")     # flow | pollinations | local
    codec = Column(String(64), default="")
    resolution = Column(String(32), default="")
    size_bytes = Column(Integer, default=0)
    duration = Column(Float, default=0.0)
    checksum = Column(String(64), default="")
    verify_state = Column(String(32), default="pending")
    active = Column(Boolean, default=True)
    reference_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Job(Base):  # noqa: ANN001
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=True)
    kind = Column(String(64), default="")        # tts media render idea normalize export ...
    status = Column(String(32), default="pending")
    progress = Column(Integer, default=0)
    checkpoint = Column(Text, default="")        # JSON step checkpoint
    lock_kind = Column(String(32), default="")   # render_main lease
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JobStep(Base):  # noqa: ANN001
    __tablename__ = "job_steps"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False)
    project_id = Column(Integer, nullable=True)
    scene_id = Column(Integer, nullable=True)
    step = Column(String(64), default="")
    dependency = Column(String(64), default="")
    attempt = Column(Integer, default=1)
    log = Column(Text, default="")
    error = Column(Text, default="")
    error_code = Column(String(64), default="")
    status = Column(String(32), default="pending")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Timeline(Base):  # noqa: ANN001
    __tablename__ = "timelines"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    version = Column(Integer, default=1)
    duration = Column(Float, default=0.0)
    settings_json = Column(Text, default="{}")
    checkpoint_json = Column(Text, default="{}")
    autosave = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TimelineClip(Base):  # noqa: ANN001
    __tablename__ = "timeline_clips"

    id = Column(Integer, primary_key=True, index=True)
    timeline_id = Column(Integer, nullable=False)
    track = Column(String(32), default="visual")  # visual voice subtitle music logo overlay
    asset_id = Column(Integer, nullable=True)
    source_path = Column(String(512), default="")
    scene_id = Column(Integer, nullable=True)
    clip_start = Column(Float, default=0.0)       # trên timeline
    clip_end = Column(Float, default=0.0)
    in_point = Column(Float, default=0.0)         # trong source
    out_point = Column(Float, default=0.0)
    volume = Column(Float, default=1.0)
    transform_json = Column(Text, default="{}")   # scale/position/effect
    group_id = Column(String(64), default="")
    locked = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class PublishMeta(Base):  # noqa: ANN001
    __tablename__ = "publish_metadata"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    title = Column(Text, default="")
    description = Column(Text, default="")
    hashtags = Column(Text, default="")
    keywords = Column(Text, default="")
    category = Column(String(64), default="")
    visibility = Column(String(32), default="unlisted")
    thumbnail_path = Column(String(512), default="")
    platform = Column(String(32), default="youtube")
    publish_state = Column(String(32), default="draft")  # draft scheduled publishing published failed
    scheduled_at = Column(DateTime, nullable=True)
    platform_url = Column(String(512), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CharacterRef(Base):  # noqa: ANN001 — ảnh tham chiếu cho character (toàn cục & dự án)
    __tablename__ = "character_refs"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, nullable=False)
    file_path = Column(String(512), default="")
    ref_kind = Column(String(32), default="face")  # face threequarter fullbody expression
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlowConnection(Base):  # noqa: ANN001
    __tablename__ = "flow_connections"

    id = Column(Integer, primary_key=True, index=True)
    extension_id = Column(String(128), default="")
    extension_version = Column(String(32), default="")
    extension_name = Column(String(128), default="")
    google_account = Column(String(128), default="")
    profile_name = Column(String(128), default="")
    token_hash = Column(String(128), default="")
    pairing_code = Column(String(32), default="")
    pairing_expires_at = Column(DateTime, nullable=True)
    paired_at = Column(DateTime, nullable=True)
    heartbeat_at = Column(DateTime, nullable=True)
    status = Column(String(32), default="unpaired")  # unpaired pairing paired lost
    factory_state = Column(String(32), default="waiting_login")  # waiting_login ready processing generate_image generate_video completed failed
    factory_mode = Column(Boolean, default=True)
    include_video = Column(Boolean, default=True)
    factory_stage = Column(String(16), default="image")  # image | video
    factory_project_id = Column(Integer, nullable=True)
    factory_session_id = Column(String(64), default="")
    browser_profile_path = Column(String(512), default="")
    last_error = Column(Text, default="")
    last_state_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditLog(Base):  # noqa: ANN001
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor = Column(String(64), default="user")
    action = Column(String(128), default="")
    target_kind = Column(String(64), default="")
    target_id = Column(Integer, nullable=True)
    before_json = Column(Text, default="")
    after_json = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ProjectSetting(Base):  # noqa: ANN001 — cài đặt riêng từng dự án
    __tablename__ = "project_settings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False)
    setting_json = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SkillRun(Base):  # noqa: ANN001
    __tablename__ = "skill_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    skill_id = Column(String(128), nullable=False, index=True)
    mode = Column(String(32), default="local")  # local_prompt | manus_task
    status = Column(String(32), default="pending")  # pending | completed | failed
    input_json = Column(Text, default="{}")
    output_text = Column(Text, default="")
    external_task_id = Column(String(255), default="")
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FlowFactoryRun(Base):  # noqa: ANN001
    """One project-bound Flow pipeline run, equivalent to Revo's pipeline job.

    The browser connection is global because one Chrome/Flow worker is serialized,
    while runs and their task history remain isolated per project/session.
    """
    __tablename__ = "flow_factory_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(32), default="queued")  # queued | running | completed | failed | cancelled
    factory_mode = Column(Boolean, default=True)
    include_video = Column(Boolean, default=True)
    stage = Column(String(16), default="image")
    error = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
