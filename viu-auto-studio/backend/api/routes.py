"""FastAPI routes for Viu Auto Studio."""

from __future__ import annotations

import json
import logging
import re
import shutil
import time

import requests

from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.core.config import PROJECTS_DIR, DATA_DIR
from backend.core.database import get_db
from backend.models import (
    AppSetting, AuditLog, Channel, Character, CharacterRef, ConnectorTask,
    FlowConnection, FlowFactoryRun, Idea, Job, JobStep, MediaAsset,
    PipelineState, Project, ProjectSetting, PublishMeta, RenderJob, Scene,
    Script, SkillRun, SubtitleCue, Timeline, TimelineClip, VoiceAsset,
)
from backend.pipeline.queue import pipeline
from backend.schemas import (
    ChannelCreate, ChannelRead, ChannelUpdate,
    DashboardStats, MediaInfo, PipelineStartRequest, ProjectCreate, ProjectCreateV2,
    ProjectDuplicate, ProjectRead, ProjectUpdate, RenderConfig,
    RenderJobRead, RenderStartRequest, SceneCreate, SceneMediaUpdate,
    SceneRead, SceneReorderRequest, SceneUpdate, SceneVoiceRequest,
    ScriptGenerateRequest, ScriptSchema, ScriptSplitRequest,
    ScriptSplitResponse, SubtitleConfig, TTSConfigRead, TTSConfigRequest,
    TTSTestConnectionRequest, TTSVoice,
    CharacterCreate, CharacterRead, CharacterUpdate,
    IdeaApproveRequest, IdeaCreateRequest, PipelineStateRead,
    StudioSettingsRead, StudioSettingsUpdate, TTSProviderRead,
    TTSSynthesizeRequest, TTSVoiceRead,
)
from backend.services.script_service import split_into_sentences
from backend.services.tts import (
    get_tts_config, list_tts_providers, list_voices, save_tts_config,
    synthesize as tts_synthesize, test_connection as tts_test_connection,
)
from backend.services.media import get_audio_duration, get_media_info

log = logging.getLogger("viu.api")
router = APIRouter()

MEDIA_SUFFIXES = {".mp4", ".webm", ".mov", ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".png", ".jpg", ".jpeg", ".webp"}


# ===========================================================================
# Health
# ===========================================================================
@router.get("/health")
def health():
    return {"status": "ok", "app": "viu-auto-studio", "time": datetime.utcnow().isoformat()}


@router.get("/system/stats")
def system_stats(db: Session = Depends(get_db)):
    """Return real-time system resource usage and service statuses."""
    try:
        import psutil
        cpu_pct = psutil.cpu_percent(interval=0.2)
        vm = psutil.virtual_memory()
        ram_total_gb = round(vm.total / (1024 ** 3), 1)
        ram_pct = vm.percent
        import sys as _sys
        _disk_path = _sys.executable[:3] if _sys.platform == "win32" else "/"
        disk = psutil.disk_usage(_disk_path)
        disk_free_gb = round(disk.free / (1024 ** 3), 1)
    except Exception:
        cpu_pct = 0.0
        ram_total_gb = 0.0
        ram_pct = 0.0
        disk_free_gb = 0.0

    # Count active render jobs
    from backend.models import RenderJob as RenderJobModel
    active_statuses = ["generating_voice", "preparing_media", "rendering", "building_scenes"]
    try:
        active_jobs = db.query(RenderJobModel).filter(RenderJobModel.status.in_(active_statuses)).count()
    except Exception:
        active_jobs = 0

    # FFmpeg check
    ffmpeg_ok = False
    try:
        import subprocess
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        ffmpeg_ok = r.returncode == 0
    except Exception:
        pass

    return {
        "cpu_percent": cpu_pct,
        "ram_total_gb": ram_total_gb,
        "ram_percent": ram_pct,
        "disk_free_gb": disk_free_gb,
        "active_jobs": active_jobs,
        "ffmpeg_ok": ffmpeg_ok,
    }




# ===========================================================================
# Dashboard
# ===========================================================================
# ===========================================================================
# Google Flow Integration
# ===========================================================================
@router.get("/flow/project-url")
def get_flow_project_url(project_id: int):
    """Returns the Google Flow project URL for auto-opening in browser."""
    # In a real Electron app, this would use the project's flow_id
    # For now, we return a generic URL
    return {"url": f"https://labs.google/fx/vi/tools/flow/project/{project_id}"}


@router.post("/flow/login")
def flow_login():
    """Open Google Flow login page."""
    return {"ok": True, "message": "Opening browser to login..."}


# ===========================================================================
# TTS (Studio v2)
# ===========================================================================

@router.get("/tts/voices", response_model=List[TTSVoice])
def tts_list_voices(provider: str = Query(""), db: Session = Depends(get_db)):
    """List voices for the given provider, falling back to the configured TTS provider."""
    cfg = get_tts_config(db)
    if provider:
        cfg = {**cfg, "provider": provider}
    return list_voices(cfg)


@router.post("/tts/synthesize")
def synthesize_tts(payload: TTSSynthesizeRequest = Body(...), db: Session = Depends(get_db)):
    """Tạo file giọng nói thật trong thư mục dữ liệu ứng dụng."""
    output_format = payload.output_format.lower().strip()
    if output_format not in {"mp3", "wav"}:
        raise HTTPException(422, "output_format chỉ hỗ trợ mp3 hoặc wav")
    output_dir = DATA_DIR / "tts"
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_path = output_dir / f"speech_{time.time_ns()}.{output_format}"
    settings = get_tts_config(db)
    settings.update({"provider": payload.provider, "voice": payload.voice, "speed": payload.speed})
    try:
        tts_synthesize(payload.text, str(audio_path), settings)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"audio_path": str(audio_path), "ok": True}


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db)):
    total = db.query(func.count(Project.id)).scalar() or 0
    completed = db.query(func.count(Project.id)).filter(Project.status == "completed").scalar() or 0
    failed = db.query(func.count(Project.id)).filter(Project.status == "failed").scalar() or 0
    processing = db.query(func.count(Project.id)).filter(
        Project.status.in_(["generating_voice", "voice_ready", "preparing_media",
                            "media_ready", "generating_subtitles", "rendering"])).scalar() or 0

    size_bytes = 0
    try:
        if PROJECTS_DIR.exists():
            size_bytes = sum(f.stat().st_size for f in PROJECTS_DIR.rglob("*") if f.is_file())
    except Exception:
        size_bytes = 0

    recent = []
    for project in db.query(Project).order_by(Project.updated_at.desc()).limit(10).all():
        recent.append({
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        })
    return DashboardStats(
        total_projects=total,
        completed_videos=completed,
        processing_videos=processing,
        failed_videos=failed,
        projects_folder_size_mb=round(size_bytes / (1024 * 1024), 2),
        recent_activities=recent,
    )


def _setting_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _tool_available(path: str) -> bool:
    return bool(shutil.which(path) or (Path(path).is_absolute() and Path(path).exists()))


@router.get("/settings", response_model=StudioSettingsRead)
def get_settings(db: Session = Depends(get_db)):
    """Fetch persisted settings without returning raw API secrets."""
    settings = {s.key: s.value_encrypted for s in db.query(AppSetting).all()}
    engine_ok = _tool_available("ffmpeg") and _tool_available("ffprobe")
    return StudioSettingsRead(
        engine_mode=settings.get("engine_mode", "balanced"),
        engine_installed=engine_ok,
        ai_provider=settings.get("ai_provider", "gemini"),
        ai_model=settings.get("ai_model", settings.get("gemini_model", "")),
        ai_api_key_set=bool(str(settings.get("ai_api_key", "")).strip()),
        ai_translation_provider=settings.get("ai_translation_provider", "chatgpt"),
        deepseek_api_key="",
        deepseek_api_key_set=bool(str(settings.get("deepseek_api_key", "")).strip()),
        gemini_model=settings.get("gemini_model", "3.5 Flash"),
        tts_provider=settings.get("tts_provider", "edge"),
        tts_voice=settings.get("tts_voice", "vi-VN-HoaiMyNeural"),
        output_folder=settings.get("output_folder", str(PROJECTS_DIR)),
        display_language=settings.get("display_language", "vi"),
        production_language=settings.get("production_language", "vi"),
        auto_refresh=_setting_bool(settings.get("auto_refresh"), True),
        dark_mode=_setting_bool(settings.get("dark_mode"), True),
        telegram_enabled=_setting_bool(settings.get("telegram_enabled")),
        telegram_configured=bool(str(settings.get("telegram_bot_token", "")).strip() and str(settings.get("telegram_chat_id", "")).strip()),
        flow_logged_in=_setting_bool(settings.get("flow_logged_in")),
    )


@router.patch("/settings")
def update_settings(payload: StudioSettingsUpdate, db: Session = Depends(get_db)):
    """Persist settings; blank secret fields keep the existing secret."""
    updated: list[str] = []
    kept_secret_fields = {"ai_api_key", "deepseek_api_key", "telegram_bot_token"}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in kept_secret_fields and value is None:
            continue
        if key in kept_secret_fields and isinstance(value, str) and not value.strip():
            continue
        if key == "output_folder" and value:
            folder = Path(str(value)).expanduser()
            try:
                folder.mkdir(parents=True, exist_ok=True)
                value = str(folder)
            except OSError as exc:
                raise HTTPException(422, f"Không thể tạo thư mục output: {exc}") from exc
        if isinstance(value, bool):
            stored = "true" if value else "false"
        else:
            stored = str(value)
        s = db.query(AppSetting).filter(AppSetting.key == key).first()
        if not s:
            s = AppSetting(key=key)
            db.add(s)
        s.value_encrypted = stored
        updated.append(key)
    db.commit()
    return {"ok": True, "updated": updated}


class AiBrowserRequest(BaseModel):
    provider: str = "gemini"


@router.post("/ai-browser/open")
def open_ai_browser_endpoint(payload: AiBrowserRequest):
    """Launch isolated standalone Chrome App window for AI login."""
    from backend.services.ai.browser_manager import open_isolated_browser

    res = open_isolated_browser(payload.provider.lower())
    if not res.get("ok"):
        raise HTTPException(422, res.get("message", "Không thể mở trình duyệt"))
    return res


@router.get("/ai-browser/status")
def get_ai_browser_status_endpoint(provider: str = "gemini"):
    """Get AI browser login session status."""
    from backend.services.ai.browser_manager import get_session_status

    return get_session_status(provider.lower())


@router.post("/ai-browser/logout")
def logout_ai_browser_endpoint(payload: AiBrowserRequest):
    """Logout and wipe AI browser profile data."""
    from backend.services.ai.browser_manager import logout_session

    return logout_session(payload.provider.lower())


class DeepSeekTestRequest(BaseModel):
    api_key: str = ""


@router.post("/settings/deepseek/test")
def test_deepseek(payload: DeepSeekTestRequest, db: Session = Depends(get_db)):
    """Test connection with DeepSeek API key."""
    from backend.services.ai.deepseek import DeepSeekProvider

    stored = db.query(AppSetting).filter(AppSetting.key == "deepseek_api_key").first()
    key = payload.api_key.strip() or (stored.value_encrypted if stored and stored.value_encrypted else "")
    if not key:
        raise HTTPException(422, "Chưa có API key DeepSeek để kiểm tra")
    provider = DeepSeekProvider(api_key=key)
    res = provider.test_connection(api_key=key)
    if not res.get("ok"):
        raise HTTPException(422, res.get("message", "Kết nối DeepSeek thất bại"))
    return res


class TelegramTestRequest(BaseModel):
    bot_token: str = ""
    chat_id: str = ""
    send_message: bool = False
    message: str = "Viu Auto Studio: kết nối Telegram hoạt động."


@router.post("/settings/telegram/test")
def test_telegram(payload: TelegramTestRequest, db: Session = Depends(get_db)):
    """Validate a Telegram bot and optionally send an explicit test message."""
    stored = {s.key: s.value_encrypted for s in db.query(AppSetting).filter(AppSetting.key.in_(["telegram_bot_token", "telegram_chat_id"])).all()}
    token = (payload.bot_token.strip() or str(stored.get("telegram_bot_token", "")).strip())
    chat_id = (payload.chat_id.strip() or str(stored.get("telegram_chat_id", "")).strip())
    if not token or not chat_id:
        raise HTTPException(422, "Cần nhập Bot Token và Chat ID")
    try:
        me = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10)
        data = me.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(502, f"Không kết nối được Telegram: {exc}") from exc
    if not me.ok or not data.get("ok"):
        description = data.get("description", "Bot Token không hợp lệ")
        raise HTTPException(422, description)
    bot = data.get("result") or {}
    result = {"ok": True, "bot": {"id": bot.get("id"), "username": bot.get("username"), "name": bot.get("first_name")}}
    if payload.send_message:
        try:
            sent = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": payload.message.strip() or "Viu Auto Studio"},
                timeout=10,
            )
            sent_data = sent.json()
        except (requests.RequestException, ValueError) as exc:
            raise HTTPException(502, f"Bot hợp lệ nhưng gửi tin nhắn thất bại: {exc}") from exc
        if not sent.ok or not sent_data.get("ok"):
            raise HTTPException(422, sent_data.get("description", "Không gửi được tin nhắn thử"))
        result["message_sent"] = True
    else:
        result["message_sent"] = False
    return result


# ===========================================================================
# Characters
# ===========================================================================
@router.get("/projects/{project_id}/characters", response_model=List[CharacterRead])
def list_project_characters(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    project_chars = db.query(Character).filter(Character.project_id == project_id).all()
    if not project.channel_id:
        return project_chars
    from backend.services.project_config import effective_project_config
    config = effective_project_config(db, project)
    if str(config.get("character_sync") or "channel") != "channel":
        return project_chars
    channel_chars = db.query(Character).filter(Character.channel_id == project.channel_id).all()
    known = {item.id for item in project_chars}
    return project_chars + [item for item in channel_chars if item.id not in known]


@router.get("/channels/{channel_id}/characters", response_model=List[CharacterRead])
def list_channel_characters(channel_id: int, db: Session = Depends(get_db)):
    return db.query(Character).filter(Character.channel_id == channel_id).all()


@router.post("/characters", response_model=CharacterRead)
def create_character(payload: CharacterCreate = Body(...), db: Session = Depends(get_db)):
    char = Character(**payload.model_dump())
    db.add(char)
    db.commit()
    db.refresh(char)
    return char


@router.patch("/characters/{char_id}", response_model=CharacterRead)
def update_character(char_id: int, payload: CharacterUpdate, db: Session = Depends(get_db)):
    char = db.query(Character).filter(Character.id == char_id).first()
    if not char:
        raise HTTPException(404, "Character not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(char, k, v)
    db.commit()
    db.refresh(char)
    return char


@router.delete("/characters/{char_id}")
def delete_character(char_id: int, db: Session = Depends(get_db)):
    db.query(Character).filter(Character.id == char_id).delete()
    db.commit()
    return {"ok": True}



# ===========================================================================
# Channels
# ===========================================================================
@router.get("/channels", response_model=List[ChannelRead])
def list_channels(db: Session = Depends(get_db)):
    return db.query(Channel).order_by(Channel.name).all()


@router.post("/channels", response_model=ChannelRead, status_code=201)
def create_channel(payload: ChannelCreate = Body(...), db: Session = Depends(get_db)):
    channel = Channel(**payload.model_dump())
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel


@router.patch("/channels/{channel_id}", response_model=ChannelRead)
def update_channel(channel_id: int, payload: ChannelUpdate, db: Session = Depends(get_db)):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None:
        raise HTTPException(404, "Channel không tồn tại")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(channel, field, value)
    db.commit()
    db.refresh(channel)
    return channel


@router.delete("/channels/{channel_id}")
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None:
        raise HTTPException(404, "Channel không tồn tại")
    db.delete(channel)
    db.commit()
    return {"ok": True}


# ===========================================================================
# Projects
# ===========================================================================
@router.get("/projects", response_model=List[ProjectRead])
def list_projects(
    search: str | None = None,
    status: str | None = None,
    include_sizes: bool = False,
    db: Session = Depends(get_db),
):

    query = db.query(Project)
    if search:
        query = query.filter(Project.name.ilike(f"%{search}%"))
    if status:
        query = query.filter(Project.status == status)
    projects = query.order_by(Project.updated_at.desc()).all()
    if include_sizes:
        for project in projects:
            try:
                dir_path = Path(project.project_directory) if project.project_directory else None
                project.size_bytes = sum(f.stat().st_size for f in dir_path.rglob("*") if f.is_file()) if dir_path and dir_path.exists() else 0
            except OSError:
                project.size_bytes = 0
    else:
        # Do not scan project trees during the normal list request. Large media
        # folders can otherwise keep the project screen on skeletons for tens of seconds.
        for project in projects:
            project.size_bytes = 0
    return projects


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(data: ProjectCreateV2 = Body(...), db: Session = Depends(get_db)):
    project = Project(
        channel_id=data.channel_id,
        name=data.name,
        topic=data.topic,
        project_type=data.project_type,
        video_type=data.video_type,
        aspect_ratio=data.aspect_ratio,
        language=data.language,
        target_duration=data.target_duration,
        status="draft",
        project_directory="",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Revo semantics: the selected output folder is a parent. Every project
    # owns a separate child folder, so media can never spill into Downloads or
    # collide with another Viu project.
    folder_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", (data.name or "").strip()).strip(" .")
    folder_name = folder_name[:80] or f"project_{project.id}"
    base = Path(data.output_folder).expanduser() if data.output_folder else Path(PROJECTS_DIR)
    path = base / folder_name
    if path.exists() and any(path.iterdir()):
        path = base / f"{folder_name}_{project.id}"
    path.mkdir(parents=True, exist_ok=True)
    (path / "assets").mkdir(exist_ok=True)
    (path / "scenes").mkdir(exist_ok=True)
    project.project_directory = str(path)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    return project


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    # Remove project folder from disk
    if project.project_directory and Path(project.project_directory).exists():
        shutil.rmtree(project.project_directory, ignore_errors=True)
    # Project deletion must also retire every project-scoped queue/run row.
    # Otherwise SQLite may reuse the project id and a new project can inherit
    # the deleted project's Flow Factory queue.
    timeline_ids = [row[0] for row in db.query(Timeline.id).filter(Timeline.project_id == project_id).all()]
    character_ids = [row[0] for row in db.query(Character.id).filter(Character.project_id == project_id).all()]
    if timeline_ids:
        db.query(TimelineClip).filter(TimelineClip.timeline_id.in_(timeline_ids)).delete(synchronize_session=False)
    if character_ids:
        db.query(CharacterRef).filter(CharacterRef.character_id.in_(character_ids)).delete(synchronize_session=False)
    for table in (
        ConnectorTask, FlowFactoryRun, PipelineState, ProjectSetting, SkillRun,
        PublishMeta, Timeline, JobStep, Job, MediaAsset, SubtitleCue, VoiceAsset,
        Idea, Character, Scene, Script, RenderJob,
    ):
        db.query(table).filter(table.project_id == project_id).delete(synchronize_session=False)
    connection = db.query(FlowConnection).filter(FlowConnection.factory_project_id == project_id).first()
    if connection:
        connection.factory_project_id = None
        connection.factory_session_id = ""
        connection.factory_state = "ready" if connection.status == "paired" else "waiting_login"
        connection.last_error = ""
    db.delete(project)
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/duplicate", response_model=ProjectRead, status_code=201)
def duplicate_project(project_id: int, payload: ProjectDuplicate = Body(...), db: Session = Depends(get_db)):
    source = db.query(Project).filter(Project.id == project_id).first()
    if source is None:
        raise HTTPException(404, "Project nguồn không tồn tại")
    new_project = Project(
        channel_id=source.channel_id,
        name=payload.name,
        topic=source.topic,
        video_type=source.video_type,
        aspect_ratio=source.aspect_ratio,
        language=source.language,
        target_duration=source.target_duration,
        status="draft",
    )
    db.add(new_project)
    db.flush()
    path = Path(PROJECTS_DIR) / f"project_{new_project.id}"
    path.mkdir(parents=True, exist_ok=True)
    (path / "assets").mkdir(exist_ok=True)
    new_project.project_directory = str(path)

    # Copy script
    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script:
        db.add(Script(
            project_id=new_project.id,
            title=script.title, hook=script.hook, angle=script.angle,
            outline_json=script.outline_json, full_script=script.full_script,
            thumbnail_concept=script.thumbnail_concept,
            thumbnail_prompt=script.thumbnail_prompt,
            seo_json=script.seo_json,
        ))
    # Copy scenes (without generated media/audio paths)
    for scene in db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index).all():
        db.add(Scene(
            project_id=new_project.id,
            order_index=scene.order_index,
            narration=scene.narration,
            visual_prompt=scene.visual_prompt,
            negative_prompt=scene.negative_prompt,
            style_prompt=scene.style_prompt,
            transition_description=scene.transition_description,
            media_path=scene.media_path,
            media_type=scene.media_type,
            subtitle_text=scene.subtitle_text,
            duration=scene.duration,
            effect=scene.effect,
            status="pending",
        ))
    db.commit()
    db.refresh(new_project)
    return new_project


@router.post("/projects/{project_id}/open-folder")
def open_project_folder(project_id: int, db: Session = Depends(get_db)):
    """Return the folder path; Electron uses this to open File Explorer."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    return {"path": project.project_directory or str(PROJECTS_DIR / f"project_{project_id}")}


# ===========================================================================
# Script generation (AI)
# ===========================================================================
@router.post("/ai/generate-script", response_model=ScriptSchema)
def ai_generate_script(payload: ScriptGenerateRequest = Body(...)):
    """Call the configured AI provider and return validated structured JSON."""
    from backend.services.ai.provider import get_provider

    try:
        provider = get_provider()
        return provider.generate_script(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))
    except Exception as exc:  # noqa: BLE001
        log.exception("AI generation failed")
        raise HTTPException(500, f"Lỗi khi gọi AI provider: {exc}")


@router.post("/ai/test-connection")
def ai_test_connection(provider_name: str | None = None):
    from backend.services.ai.provider import get_provider, list_providers

    if provider_name is None:
        return {"providers": [p for p in list_providers()]}
    try:
        provider = get_provider(provider_name)
        return {"provider": provider_name, **provider.test_connection()}
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # noqa: BLE001
        return {"provider": provider_name, "ok": False, "message": str(exc)}


# ===========================================================================
# Script persistence
# ===========================================================================
@router.get("/projects/{project_id}/script")
def get_script(project_id: int, db: Session = Depends(get_db)):
    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script is None:
        return {"project_id": project_id, "exists": False}
    seo = {}
    try:
        seo = json.loads(script.seo_json or "{}")
    except (ValueError, TypeError):
        seo = {}
    return {
        "project_id": project_id,
        "exists": True,
        "id": script.id,
        "title": script.title,
        "hook": script.hook,
        "angle": script.angle,
        "outline": json.loads(script.outline_json or "[]"),
        "full_script": script.full_script,
        "thumbnail_concept": script.thumbnail_concept,
        "thumbnail_prompt": script.thumbnail_prompt,
        "seo": seo,
        "approved": script.approved,
    }


@router.post("/projects/{project_id}/script")
def save_script(project_id: int, payload: ScriptSchema = Body(...), db: Session = Depends(get_db)):
    """Save or update the script for a project (lưu tự động)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")

    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script is None:
        script = Script(project_id=project_id)
        db.add(script)
    script.title = payload.title
    script.hook = payload.hook
    script.angle = payload.angle
    script.outline_json = json.dumps(payload.outline, ensure_ascii=False)
    script.full_script = payload.full_script
    script.thumbnail_concept = payload.thumbnail_concept
    script.thumbnail_prompt = payload.thumbnail_prompt
    script.seo_json = json.dumps(payload.seo.model_dump(), ensure_ascii=False)
    project.topic = payload.title or project.topic
    db.commit()
    db.refresh(script)
    return {"ok": True, "script_id": script.id}


@router.post("/projects/{project_id}/script/approve")
def approve_script(project_id: int, db: Session = Depends(get_db)):
    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script is None or not script.full_script:
        raise HTTPException(400, "Chưa có kịch bản để duyệt")
    script.approved = True
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        project.status = "script_approved"
    db.commit()
    return {"ok": True, "approved": True}


@router.post("/projects/{project_id}/generate-seo")
def generate_seo(project_id: int, db: Session = Depends(get_db)):
    """Sinh SEO thật (tiêu đề/hashtags/tags/mô tả) bằng AI provider đang cấu hình."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script is None or not script.full_script:
        raise HTTPException(400, "Chưa có kịch bản để sinh SEO")

    prompt = f"""Chủ đề video: {script.title or project.topic}
Kịch bản (tóm tắt): {(script.full_script or '')[:1500]}
Loại video: {'short' if project.video_type == 'short' else 'long'}
Tỷ lệ khung hình: {project.aspect_ratio}

Sinh JSON: {{"youtube_title": "...", "description": "...", "hashtags": ["#a", "#b", "#c"], "tags": ["..."]}}
YouTube title ≤ 70 ký tự, description ≤ 500 ký tự, tiếng Việt tự nhiên, tối ưu SEO."""
    system = "Bạn là chuyên gia SEO YouTube/TikTok. Luôn trả về ĐÚNG MỘT JSON, không văn bản thừa."
    try:
        from backend.services.ai.provider import get_provider

        provider = get_provider()
        if provider.name == "local":
            # Offline: sinh SEO thật theo quy tắc (không cần API key)
            raw_topic = (script.title or project.topic or "video").strip()
            topic = raw_topic.split("|")[0].split("—")[0].strip()
            video_type = project.video_type or "long"
            title = f"{topic} — Hướng dẫn đầy đủ từ A đến Z" if video_type == "long" else f"{topic} — Xem ngay! #Shorts"
            seo = {
                "youtube_title": title[:100],
                "description": (f"Video chia sẻ về {topic.lower()}. "
                                f"Nắm kiến thức quan trọng nhất chỉ trong vài phút. {script.hook[:200]}"
                                )[:1000],
                "hashtags": [f"#{w.lower()}" for w in topic.split()[:3] if w and w.isalnum()][:10],
                "tags": [raw_topic[:50], f"hướng dẫn {topic.split()[0].lower()}"] if topic.split() else [raw_topic[:50]],
            }
        else:
            from backend.services.ai.provider import generate_text
            from backend.services.ai.provider import _extract_json

            raw = generate_text(system, prompt)
            data = _extract_json(raw)
            seo = {
                "youtube_title": str(data.get("youtube_title", "")).strip()[:100],
                "description": str(data.get("description", "")).strip()[:1000],
                "hashtags": [str(h).strip() for h in (data.get("hashtags") or []) if str(h).strip()][:10],
                "tags": [str(t).strip() for t in (data.get("tags") or []) if str(t).strip()][:15],
            }
        if not seo["youtube_title"]:
            seo["youtube_title"] = (script.title or project.topic or "Video")[:100]
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Sinh SEO thất bại: {exc}")

    script.seo_json = json.dumps(seo, ensure_ascii=False)
    db.commit()
    return {"ok": True, "seo": seo}


@router.get("/projects/{project_id}/export-subtitles")
def export_subtitles(project_id: int, format: str = "srt", db: Session = Depends(get_db)):
    """Xuất phụ đề dự án dưới dạng SRT theo thời điểm thật của từng cảnh."""
    from backend.services.media import get_audio_duration

    scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index).all()
    if not scenes:
        raise HTTPException(400, "Chưa có phân cảnh")

    if format != "srt":
        raise HTTPException(400, "Chỉ hỗ trợ định dạng srt")

    def _fmt(ts: float) -> str:
        h = int(ts // 3600)
        m = int(ts % 3600 // 60)
        s = int(ts % 60)
        ms = int((ts - int(ts)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    lines: list[str] = []
    start = 0.0
    idx = 1
    for scene in scenes:
        dur = scene.duration or 3.0
        text = (scene.subtitle_text or scene.narration or "").strip()
        if not text:
            start += dur
            continue
        # Chia theo dấu ngắt câu, mỗi dòng ≤ ~42 ký tự
        segs = re.split(r"(?<=[.!?;])\s+|(?<=\n)", text)
        bucket = ""
        for seg in segs:
            seg = seg.strip()
            if not seg:
                continue
            if len(bucket) + len(seg) > 42 and bucket:
                lines.append(f"{idx}\n{_fmt(start)} --> {_fmt(start + dur * min(1.0, 0.6))}\n{bucket.strip()}")
                idx += 1
                start += dur
                bucket = seg
            else:
                bucket += (" " if bucket else "") + seg
        if bucket:
            lines.append(f"{idx}\n{_fmt(start)} --> {_fmt(start + dur)}\n{bucket.strip()}")
            idx += 1
        start += dur

    content = "\n\n".join(lines) + "\n"
    return Response(content, media_type="text/plain; charset=utf-8")


@router.post("/projects/{project_id}/script/split", response_model=ScriptSplitResponse)
def ai_split_script(project_id: int, payload: ScriptSplitRequest = Body(...)):
    """Split a script into sentences/lines for scene creation."""
    sentences = split_into_sentences(payload.full_script, payload.max_chars_per_line)
    return ScriptSplitResponse(sentences=sentences)


# ===========================================================================
# Workspace Pipeline (Studio v2)
# ===========================================================================
@router.post("/workspace/idea", response_model=ScriptSchema)
def create_idea(payload: IdeaCreateRequest = Body(...), db: Session = Depends(get_db)):
    """Generate a new idea for a channel."""
    from backend.services.ai.provider import get_provider
    
    channel = db.query(Channel).filter(Channel.id == payload.channel_id).first()
    if not channel:
        raise HTTPException(404, "Channel not found")
    
    provider = get_provider()
    idea = provider.generate_script(ScriptGenerateRequest(
        topic=channel.niche or "Kiến thức thú vị",
        video_type=payload.video_type
    ))
    
    # Create project for this idea
    project = Project(
        channel_id=payload.channel_id,
        name=idea.title,
        topic=idea.title,
        project_type="ai_studio",
        video_type=payload.video_type,
        status="draft"
    )
    db.add(project)
    db.flush()
    
    # Create script
    script = Script(
        project_id=project.id,
        title=idea.title,
        hook=idea.hook,
        angle=idea.angle,
        outline_json=json.dumps(idea.outline, ensure_ascii=False),
        full_script=idea.full_script,
        thumbnail_concept=idea.thumbnail_concept,
        thumbnail_prompt=idea.thumbnail_prompt,
        status="proposed"
    )
    db.add(script)
    
    # Init pipeline state
    pipeline_state = PipelineState(
        project_id=project.id,
        status="idle",
        step_data_json=json.dumps({
            "Thu thập dữ liệu": "pending",
            "Kịch bản": "pending",
            "Lồng tiếng": "pending",
            "Storyboard": "pending",
            "Ảnh/Video": "pending",
            "Dựng phim": "pending",
            "SEO": "pending"
        })
    )
    db.add(pipeline_state)
    
    db.commit()
    return idea


@router.post("/workspace/approve")
def approve_idea(payload: IdeaApproveRequest = Body(...), db: Session = Depends(get_db)):
    """Approve an idea and start production."""
    script = db.query(Script).filter(Script.project_id == payload.project_id).first()
    if not script:
        raise HTTPException(404, "Script not found")
    
    if payload.custom_script:
        script.full_script = payload.custom_script
        
    script.status = "producing"
    script.approved = True
    
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if project:
        project.status = "producing"
    
    # Update pipeline state
    state = db.query(PipelineState).filter(PipelineState.project_id == payload.project_id).first()
    if state:
        state.status = "processing"
        steps = json.loads(state.step_data_json)
        steps["Thu thập dữ liệu"] = "skipped"
        steps["Kịch bản"] = "skipped"
        steps["Lồng tiếng"] = "0%"
        state.step_data_json = json.dumps(steps)
    
    db.commit()

    # The project editor asks for preparation only, then starts one explicit,
    # project-bound Factory session. Older workspace callers can retain the
    # legacy all-in-one behavior by omitting prepare_only.
    started = pipeline.start_auto_production(payload.project_id, prepare_only=payload.prepare_only)
    if not started.get("ok", False):
        raise HTTPException(409, started.get("message", "Không thể khởi động pipeline"))
    return {"ok": True, "pipeline": started}


@router.get("/projects/{project_id}/pipeline", response_model=PipelineStateRead)
def get_pipeline_state(project_id: int, db: Session = Depends(get_db)):
    state = db.query(PipelineState).filter(PipelineState.project_id == project_id).first()
    if not state:
        raise HTTPException(404, "Pipeline state not found")
    return state


@router.post("/workspace/stop/{project_id}")
def stop_production(project_id: int, db: Session = Depends(get_db)):
    state = db.query(PipelineState).filter(PipelineState.project_id == project_id).first()
    if state:
        state.status = "stopped"
    db.commit()
    return {"ok": True}


@router.post("/workspace/scene-upload/{scene_id}")
def upload_scene_media(scene_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload verified user media for a scene and expose the asset in all media consumers."""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(404, "Scene not found")
    
    # Save to project folder
    from backend.core.config import PROJECTS_DIR
    project = db.query(Project).filter(Project.id == scene.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Create media folder
    media_dir = Path(project.project_directory) / "scene_media"
    media_dir.mkdir(parents=True, exist_ok=True)
    
    safe_name = Path(file.filename or "media").name
    if not safe_name or safe_name in {".", ".."}:
        safe_name = "media"
    file_path = media_dir / safe_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    media_type = "image" if file.content_type and file.content_type.startswith("image/") else "video"
    scene.media_path = str(file_path)
    scene.media_type = media_type
    if media_type == "image":
        scene.image_path = str(file_path)
    else:
        scene.video_path = str(file_path)
    scene.status = "media_ready"
    scene.error_message = None
    db.commit()

    return {"ok": True, "media_path": str(file_path), "media_type": media_type}



@router.post("/projects/{project_id}/build-scenes")
def build_scenes_from_script(
    project_id: int,
    payload: dict | None = None,
    db: Session = Depends(get_db),
):
    """Convert the approved script into scene records.

    - Mặc định: biên tập thành nhịp hình theo ngữ nghĩa; không ánh xạ 1 câu = 1 ảnh.
    - Body tùy chọn {"semantic_analysis": [{narration, visual_prompt, style_prompt}, ...]}:
      AI đã phân tích ngữ nghĩa — tạo cảnh theo phân cảnh của AI (không 1-1 câu-ảnh).
    """
    body = payload if isinstance(payload, dict) else {}
    script = db.query(Script).filter(Script.project_id == project_id).first()

    semantic = body.get("semantic_analysis") if isinstance(body, dict) else None
    if isinstance(semantic, list) and semantic:
        segments = [
            {
                "narration": str(s.get("narration") or ""),
                "visual_prompt": str(s.get("visual_prompt") or ""),
                "style_prompt": str(s.get("style_prompt") or ""),
                "transition_description": str(s.get("transition_description") or ""),
            }
            for s in semantic
            if str(s.get("narration") or "").strip()
        ]
        if not segments:
            raise HTTPException(400, "Phân tích ngữ nghĩa rỗng")
        sentences = [seg["narration"] for seg in segments]
        if script is None:
            script = Script(project_id=project_id, full_script="\n".join(sentences), status="approved")
            db.add(script)
            db.commit()
    else:
        if script is None or not script.full_script:
            raise HTTPException(400, "Chưa có kịch bản để xây dựng phân cảnh")
        from backend.services.ai.semantic_scenes import _heuristic_semantic_scenes

        fallback = _heuristic_semantic_scenes(script.full_script)
        segments = [
            {
                "narration": str(s.get("narration") or ""),
                "visual_prompt": str(s.get("visual_prompt") or ""),
                "style_prompt": str(s.get("style_prompt") or ""),
                "transition_description": str(s.get("transition_description") or ""),
            }
            for s in fallback.get("scenes", [])
            if str(s.get("narration") or "").strip()
        ]
        sentences = [seg["narration"] for seg in segments]
    if not sentences:
        raise HTTPException(400, "Kịch bản rỗng")

    # Preserve existing scenes when possible
    existing = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index).all()

    for idx, sentence in enumerate(sentences):
        scene = existing[idx] if idx < len(existing) else Scene(project_id=project_id)
        incoming_prompt = segments[idx]["visual_prompt"] if segments is not None and idx < len(segments) else ""
        content_changed = bool(
            idx < len(existing)
            and (
                (scene.narration or "").strip() != sentence.strip()
                or (scene.visual_prompt or "").strip() != incoming_prompt.strip()
            )
        )
        scene.project_id = project_id
        scene.order_index = idx
        scene.narration = sentence
        scene.subtitle_text = sentence
        if segments is not None and idx < len(segments):
            scene.visual_prompt = segments[idx]["visual_prompt"]
            scene.style_prompt = segments[idx]["style_prompt"]
            scene.transition_description = segments[idx]["transition_description"]
            movement = scene.transition_description.lower()
            if "right to left" in movement:
                scene.effect = "pan_left"
            elif "left to right" in movement or "right" in movement or "lateral" in movement:
                scene.effect = "pan_right"
            elif "left" in movement:
                scene.effect = "pan_left"
            elif "pull-back" in movement or "pull back" in movement or "zoom out" in movement:
                scene.effect = "zoom_out"
            else:
                scene.effect = "zoom_in"
        else:
            scene.visual_prompt = f"Visual illustration for: {sentence}"
        if content_changed:
            # Không tái sử dụng media/voice của nội dung cũ cho một nhịp hình mới.
            scene.media_path = ""
            scene.image_path = ""
            scene.video_path = ""
            scene.audio_path = ""
            scene.duration = 0.0
            scene.status = "pending"
            scene.error_message = None
        if idx >= len(existing):
            db.add(scene)
    # Remove extra scenes
    for scene in existing[len(sentences):]:
        db.delete(scene)
    db.commit()

    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        project.status = "script_ready"
        db.commit()
    return {"ok": True, "scene_count": len(sentences)}


# ===========================================================================
# Scenes
# ===========================================================================
@router.get("/projects/{project_id}/scenes", response_model=List[SceneRead])
def list_scenes(project_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Scene).filter(Scene.project_id == project_id)
        .order_by(Scene.order_index).all()
    )


@router.post("/projects/{project_id}/scenes", response_model=SceneRead, status_code=201)
def create_scene(project_id: int, payload: SceneCreate = Body(...), db: Session = Depends(get_db)):
    scene = Scene(project_id=project_id, **payload.model_dump())
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


@router.patch("/projects/{project_id}/scenes/{scene_id}", response_model=SceneRead)
def update_scene(project_id: int, scene_id: int, payload: SceneUpdate, db: Session = Depends(get_db)):
    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(scene, field, value)
    db.commit()
    db.refresh(scene)
    return scene


@router.delete("/projects/{project_id}/scenes/{scene_id}")
def delete_scene(project_id: int, scene_id: int, db: Session = Depends(get_db)):
    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    db.delete(scene)
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/scenes/reorder")
def reorder_scenes(project_id: int, payload: SceneReorderRequest = Body(...), db: Session = Depends(get_db)):
    for index, scene_id in enumerate(payload.scene_ids):
        scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
        if scene is None:
            raise HTTPException(404, f"Scene {scene_id} không tồn tại")
        scene.order_index = index
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/scenes/{scene_id}/merge")
def merge_scenes(project_id: int, scene_id: int, other_id: int, db: Session = Depends(get_db)):
    """Merge scene other_id INTO scene_id (narration combined, other deleted)."""
    base = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    other = db.query(Scene).filter(Scene.id == other_id, Scene.project_id == project_id).first()
    if base is None or other is None:
        raise HTTPException(404, "Một trong hai cảnh không tồn tại")
    base.narration = (base.narration + " " + other.narration).strip()
    base.subtitle_text = base.narration
    base.duration = (base.duration or 0.0) + (other.duration or 0.0)
    if other.audio_path and Path(other.audio_path).exists():
        base.audio_path = other.audio_path
    db.delete(other)
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/scenes/{scene_id}/split")
def split_scene(project_id: int, scene_id: int, payload: dict | None = None, db: Session = Depends(get_db)):
    """Split a scene into two halves at the midpoint of its narration."""
    payload = payload or {}
    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")

    split_at = payload.get("split_at")  # word index; default middle
    words = scene.narration.split()
    if not words:
        raise HTTPException(400, "Cảnh không có nội dung để chia")
    mid = split_at if isinstance(split_at, int) and 0 < split_at < len(words) else len(words) // 2
    first_half = " ".join(words[:mid])
    second_half = " ".join(words[mid:])

    scene.narration = first_half
    scene.subtitle_text = first_half
    half_duration = (scene.duration or 0.0) / 2
    scene.duration = half_duration

    new_scene = Scene(
        project_id=project_id,
        order_index=scene.order_index + 1,
        narration=second_half,
        subtitle_text=second_half,
        visual_prompt=scene.visual_prompt,
        negative_prompt=scene.negative_prompt,
        duration=half_duration,
        effect=scene.effect,
        status="pending",
    )
    db.add(new_scene)

    # Shift later scenes
    for s in db.query(Scene).filter(
        Scene.project_id == project_id,
        Scene.order_index > scene.order_index,
        Scene.id != new_scene.id,
    ).all():
        s.order_index += 1
    db.commit()
    return {"ok": True, "new_scene_id": new_scene.id}


@router.post("/projects/{project_id}/scenes/{scene_id}/media", response_model=SceneRead)
def set_scene_media(project_id: int, scene_id: int, payload: SceneMediaUpdate = Body(...), db: Session = Depends(get_db)):
    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    path = Path(payload.media_path)
    if not path.exists():
        raise HTTPException(400, "File media không tồn tại trên máy")
    scene.media_path = str(path.resolve())
    media_type = payload.media_type or "image"
    scene.media_type = media_type
    if media_type == "image":
        scene.image_path = scene.media_path
    elif media_type == "video":
        scene.video_path = scene.media_path
    info = get_media_info(scene.media_path)
    scene.status = "media_ready" if scene.audio_path else "pending"

    db.commit()
    db.refresh(scene)
    return scene


@router.post("/projects/{project_id}/scenes/{scene_id}/regenerate-voice")
def regenerate_scene_voice(project_id: int, scene_id: int, payload: SceneVoiceRequest = Body(...), db: Session = Depends(get_db)):
    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    if not scene.narration:
        raise HTTPException(400, "Cảnh chưa có lời thuyết minh")
    settings = get_tts_config(db)
    settings["voice"] = payload.voice or settings["voice"]
    settings["speed"] = payload.speed
    settings["volume"] = payload.volume
    if payload.provider:
        settings["provider"] = payload.provider
    audio_path = str((Path(PROJECTS_DIR) / f"project_{project_id}") / f"scene_{scene.order_index:03d}_voice.mp3")
    try:
        tts_synthesize(scene.narration, audio_path, settings)
        scene.audio_path = audio_path
        scene.duration = max(1.5, get_audio_duration(audio_path) + 0.3)
        scene.status = "voice_ready"
        scene.error_message = ""
        db.commit()
        return {"ok": True, "audio_path": audio_path}
    except RuntimeError as exc:
        scene.error_message = str(exc)
        scene.status = "error"
        db.commit()
        raise HTTPException(500, str(exc))


# ===========================================================================
# TTS configuration
# ===========================================================================
@router.get("/tts/config", response_model=TTSConfigRead)
def tts_get_config(db: Session = Depends(get_db)):
    cfg = get_tts_config(db)
    key = cfg.get("cloud_api_key", "")
    cfg["cloud_api_key_masked"] = ("*" * 8) + key[-4:] if len(key) > 8 else ""
    cfg.pop("cloud_api_key", None)
    return cfg


@router.post("/tts/config", response_model=TTSConfigRead)
def tts_save_config(payload: TTSConfigRequest = Body(...), db: Session = Depends(get_db)):
    return save_tts_config(db, payload)


@router.get("/tts/providers")
def tts_list_providers():
    return list_tts_providers()


@router.post("/tts/test-connection")
def tts_test(payload: TTSTestConnectionRequest | None = None):
    payload = payload or TTSTestConnectionRequest()
    return tts_test_connection(payload.model_dump())


@router.post("/tts/preview")
def tts_preview(payload: dict, db: Session = Depends(get_db)):
    """Synthesize a short sample text and return the audio file path."""
    text = payload.get("text", "Đây là đoạn giọng đọc mẫu của Viu Auto Studio.")
    settings = get_tts_config(db)
    settings.update({k: v for k, v in payload.items() if k in ("provider", "voice", "speed", "volume")})
    sample_path = str(DATA_DIR / "tts_preview.mp3")
    try:
        tts_synthesize(text, sample_path, settings)
        return {"ok": True, "audio_path": sample_path}
    except RuntimeError as exc:
        return {"ok": False, "message": str(exc)}


@router.get("/tts/preview-audio")
def tts_preview_audio():
    path = DATA_DIR / "tts_preview.mp3"
    if not path.exists():
        raise HTTPException(404, "Chưa có audio mẫu. Hãy nhấn 'Nghe thử' trước.")
    return FileResponse(str(path), media_type="audio/mpeg")

# ===========================================================================
# Google Labs image provider
# ===========================================================================
@router.get("/labs/config")
def labs_get_config(db: Session = Depends(get_db)):
    from backend.services.media.config import get_labs_config

    return get_labs_config(db)


@router.post("/labs/config")
def labs_save_config(payload: dict, db: Session = Depends(get_db)):
    from backend.services.media.config import get_labs_config, save_labs_config

    enabled = bool(payload.get("enabled", False))
    fields: dict = {}
    # Các trường mới cho Gemini: gemini_key, gemini_enabled, labs_enabled,
    # pollinations_fallback — truyền thẳng vào save_labs_config.
    for key in ("gemini_key", "gemini_enabled", "labs_enabled", "pollinations_fallback"):
        if key in payload:
            fields[key] = payload[key]
    return save_labs_config(db, enabled, **fields)


@router.post("/projects/{project_id}/scenes/{scene_id}/regenerate-media")
def regenerate_scene_media(project_id: int, scene_id: int, db: Session = Depends(get_db)):
    """Tạo lại media của 1 cảnh: gửi prompt sang UTO Flow (nguồn chính),
    Pollinations chỉ khi Labs không khả dụng VÀ người dùng bật fallback.
    Báo lỗi RÕ RÀNG — KHÔNG fallback Gemini/ảnh giả.
    """
    from backend.services.media.config import get_labs_config

    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    prompt = (scene.visual_prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "Cảnh chưa có prompt ảnh — hãy viết lại prompt AI trước")

    project = db.query(Project).filter(Project.id == project_id).first()
    portrait = bool(project and project.aspect_ratio == "9:16")
    cfg = get_labs_config(db)
    img_path = str(Path(PROJECTS_DIR) / f"project_{project_id}" / f"scene_{scene.order_index:03d}_ai.jpg")

    errors: list[str] = []
    made = False

    # 1) UTO Flow — nguồn tạo ảnh/video CHÍNH
    if cfg.get("labs_enabled"):
        try:
            from backend.services.media.google_labs import (
                UTOFlowAuthError,
                UTOFlowTimeoutError,
                generate_labs_image,
            )

            ok = generate_labs_image(prompt, img_path, portrait=portrait)
            if ok:
                scene.media_path = img_path
                scene.media_type = "image"
                scene.status = "media_ready"
                scene.error_message = ""
                made = True
        except UTOFlowAuthError as exc:
            errors.append(f"UTO Flow chưa đăng nhập Google: {exc}")
        except UTOFlowTimeoutError as exc:
            errors.append(f"UTO Flow timeout: {exc}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"UTO Flow thất bại: {exc}")

    # 2) Flow Connector (Chrome Extension) — nguồn tạo ảnh/video chính khi bật
    if not made and cfg.get("connector_enabled"):
        try:
            from backend.api.connector_routes import create_media_tasks_payload
            create_media_tasks_payload(db, project_id, scene, cfg)
            scene.status = "media_pending"
            scene.error_message = ""
            made = True
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Flow Connector tạo task thất bại: {exc}")
    # 3) Pollinations — CHỈ khi người dùng bật cho phép
    if not made and cfg.get("pollinations_fallback"):
        try:
            from backend.services.media import generate_ai_image

            width, height = (1080, 1920) if portrait else (1920, 1080)
            generate_ai_image(prompt, img_path, width=width, height=height)
            scene.media_path = img_path
            scene.media_type = "image"
            scene.status = "media_ready"
            scene.error_message = ""
            made = True
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Pollinations thất bại: {exc}")

    if not made:
        detail = "; ".join(errors) if errors else "Không có nguồn ảnh AI nào được bật"
        raise HTTPException(
            502,
            f"Sinh ảnh AI cảnh {scene.order_index} thất bại: {detail} — "
            "hãy đăng nhập Google Labs (UTO Flow) hoặc kiểm tra Cài đặt → AI",
        )
    db.commit()
    return scene


@router.get("/labs/check")
def labs_check():
    """Kiểm tra khả năng tự động hóa Google Labs trên máy này (chromium + playwright)."""
    import shutil

    has_chromium = shutil.which("chromium") or shutil.which("google-chrome") or shutil.which("chromium-browser")
    try:
        import playwright  # noqa: F401

        has_playwright = True
    except ImportError:
        has_playwright = False
    can_automate = bool(has_chromium and has_playwright)
    return {
        "ok": True,
        "can_automate": can_automate,
        "has_chromium": bool(has_chromium),
        "has_playwright": has_playwright,
        "note": (
            "Google Labs yêu cầu đăng nhập tài khoản Google trên máy. "
            "Khi chưa đăng nhập, hệ thống tự động chuyển sang Pollinations.ai miễn phí."
        ),
    }


# ===========================================================================
# Gemini AI media config & key check
# ===========================================================================
@router.post("/ai-media/check-key")
def ai_media_check_key(payload: dict):
    """Kiểm tra API key aistudio.google: hợp lệ không, model nào dùng được, quota có ổn."""
    from backend.services.media.gemini_provider import check_gemini_key

    return check_gemini_key(str(payload.get("key", "")))


# ===========================================================================
# Phân cảnh AI theo ngữ nghĩa (semantic scene analysis)
# ===========================================================================
@router.post("/projects/{project_id}/script/semantic-scenes")
def analyze_semantic_scenes(project_id: int, payload: dict, db: Session = Depends(get_db)):
    """AI phân tích TOÀN BỘ kịch bản → chia cảnh hình ảnh hợp lý (không 1-1 câu-ảnh).

    Body: {"full_script": "...", "existing_narrations": ["..."] (tùy chọn)}
    Trả: {"scenes": [{"narration", "visual_prompt", "style_prompt", "reason"}], "note": ...}
    """
    from backend.services.ai.semantic_scenes import analyze_semantic_scenes as _analyze

    script = db.query(Script).filter(Script.project_id == project_id).first()
    project = db.query(Project).filter(Project.id == project_id).first()
    full_script = str(payload.get("full_script") or "")
    if not full_script and script:
        full_script = script.full_script or ""
    if not full_script:
        raise HTTPException(400, "Chưa có kịch bản để phân tích")
    style_parts: list[str] = []
    project_cfg: dict = {}
    if project and project.config_json:
        try:
            project_cfg = json.loads(project.config_json) if isinstance(project.config_json, str) else dict(project.config_json)
        except (TypeError, ValueError):
            project_cfg = {}
    project_channel_cfg = project_cfg.get("channel") if isinstance(project_cfg.get("channel"), dict) else {}
    style_parts.extend(str(project_channel_cfg.get(key) or "") for key in ("niche", "script_style", "direction", "hook", "target_audience", "content_rating"))

    if project and project.channel_id:

        channel = db.query(Channel).filter(Channel.id == project.channel_id).first()
        if channel and channel.config_json:
            try:
                channel_cfg = json.loads(channel.config_json) if isinstance(channel.config_json, str) else dict(channel.config_json)
                style_parts.extend(str(channel_cfg.get(key) or "") for key in ("niche", "writing_style", "script_style", "channel_direction", "direction", "hook", "target_audience", "content_rating"))

            except (TypeError, ValueError):
                pass
    try:
        result = _analyze(
            full_script,
            existing_narrations=payload.get("existing_narrations"),
            style_memory="\n".join(part for part in style_parts if part.strip()),
        )
    except Exception as exc:
        log.warning("Semantic analyze error, using fallback: %s", exc)
        from backend.services.ai.semantic_scenes import _heuristic_semantic_scenes
        result = _heuristic_semantic_scenes(
            full_script,
            existing_narrations=payload.get("existing_narrations"),
            style_memory="\n".join(part for part in style_parts if part.strip()),
        )
    # Gộp style nhất quán chung (chuỗi dùng cho tất cả cảnh)
    styles = [s.get("style_prompt", "") for s in result.get("scenes", []) if s.get("style_prompt")]
    result["common_style"] = styles[-1] if styles else ""
    return result


@router.post("/projects/{project_id}/scenes/{scene_id}/regenerate-prompt", response_model=SceneRead)
def regenerate_scene_prompt(project_id: int, scene_id: int, payload: dict, db: Session = Depends(get_db)):
    """AI viết lại visual_prompt + style_prompt của 1 cảnh theo toàn bộ nội dung cảnh.

    Body: {"style_memory": "..." (tùy chọn — chuỗi nhất quán chung)}
    """
    from backend.services.ai.semantic_scenes import rewrite_scene_prompt

    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    if not scene.narration:
        raise HTTPException(400, "Cảnh chưa có lời đọc")
    neighbors = [
        s.narration
        for s in db.query(Scene)
        .filter(
            Scene.project_id == project_id,
            Scene.order_index.between(scene.order_index - 2, scene.order_index + 2),
            Scene.id != scene.id,
        )
        .order_by(Scene.order_index)
        .all()
    ]
    style_memory = str(payload.get("style_memory") or scene.style_prompt or "")
    try:
        new_prompt = rewrite_scene_prompt(
            scene.narration,
            current_prompt=scene.visual_prompt or "",
            neighboring_narrations=neighbors,
            style_memory=style_memory,
        )
    except RuntimeError as exc:
        raise HTTPException(502, f"AI viết lại prompt thất bại: {exc}") from exc
    scene.visual_prompt = new_prompt
    if style_memory:
        scene.style_prompt = style_memory
    # Xóa ảnh cũ để pipeline sinh lại ảnh theo prompt mới
    scene.media_path = ""
    scene.status = "pending"
    db.commit()
    db.refresh(scene)
    return scene


@router.post("/projects/{project_id}/scenes/{scene_id}/semantic-split")
def semantic_split_scene(project_id: int, scene_id: int, payload: dict, db: Session = Depends(get_db)):
    """AI chia 1 cảnh thành nhiều cảnh theo ngữ nghĩa (không chia máy móc ở giữa).

    Trả: {"ok": True, "new_scene_ids": [...]} — 1 cảnh cũ giữ nguyên nửa đầu,
    các cảnh mới chèn sau theo thứ tự.
    """
    from backend.services.ai.semantic_scenes import analyze_semantic_scenes as _analyze

    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.project_id == project_id).first()
    if scene is None:
        raise HTTPException(404, "Scene không tồn tại")
    if not scene.narration:
        raise HTTPException(400, "Cảnh không có nội dung để chia")
    try:
        result = _analyze(scene.narration)
    except RuntimeError as exc:
        raise HTTPException(502, f"AI phân tích thất bại: {exc}") from exc
    segments = result.get("scenes") or []
    if len(segments) <= 1:
        raise HTTPException(400, "AI không tìm được cách chia hợp lý — nội dung là một cảnh duy nhất")
    seg0 = segments[0]
    scene.narration = seg0["narration"]
    scene.subtitle_text = seg0["narration"]
    scene.visual_prompt = seg0.get("visual_prompt", scene.visual_prompt)
    scene.style_prompt = seg0.get("style_prompt", "")
    scene.duration = (scene.duration or 0.0) / len(segments)
    scene.media_path = ""

    new_ids = []
    base_index = scene.order_index
    for seg in segments[1:]:
        new_scene = Scene(
            project_id=project_id,
            order_index=base_index + 1,
            narration=seg["narration"],
            subtitle_text=seg["narration"],
            visual_prompt=seg.get("visual_prompt", ""),
            style_prompt=seg.get("style_prompt", ""),
            duration=(scene.duration or 0.0),
            effect=scene.effect,
            status="pending",
        )
        db.add(new_scene)
        new_ids.append(new_scene.id)
        base_index += 1
    for s in db.query(Scene).filter(
        Scene.project_id == project_id,
        Scene.order_index > base_index,
        Scene.id.notin_([scene.id, *new_ids]),
    ).all():
        s.order_index += len(segments) - 1
    db.commit()
    return {"ok": True, "new_scene_ids": new_ids}


# ===========================================================================
# Subtitles preview
# ===========================================================================
@router.post("/projects/{project_id}/subtitle-preview")
def subtitle_preview(project_id: int, payload: dict, db: Session = Depends(get_db)):
    """Generate a preview ASS file for the given text using real audio timing."""
    from backend.services.subtitles import compute_entries, write_ass_v2

    config = SubtitleConfig(**(payload.get("config") or {}))
    text = payload.get("text", "")
    audio_path = payload.get("audio_path", "")
    width = payload.get("width", 1920)
    height = payload.get("height", 1080)

    entries = compute_entries(text, audio_path, config)
    preview_dir = DATA_DIR / "subtitle_preview"
    preview_dir.mkdir(parents=True, exist_ok=True)
    ass_path = write_ass_v2(entries, str(preview_dir / "preview.ass"), config, width, height)
    return {"ok": True, "ass_path": ass_path, "entry_count": len(entries),
            "entries": [{"start": e.start, "end": e.end, "text": e.text} for e in entries]}


# ===========================================================================
# Media helpers
# ===========================================================================
@router.post("/media/info", response_model=MediaInfo)
def media_info(payload: dict):
    return get_media_info(payload.get("path", ""))


@router.get("/media/file")
def serve_media_file(path: str):
    """Serve a local media file to the frontend for preview playback."""
    clean_path = path.split("?")[0]
    resolved = Path(clean_path).expanduser().resolve()
    if resolved.suffix.lower() not in MEDIA_SUFFIXES or not resolved.is_file():
        raise HTTPException(404, "File media không tồn tại hoặc không được hỗ trợ")
    content_type = {
        ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
        ".ogg": "audio/ogg", ".m4a": "audio/mp4",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(resolved.suffix.lower(), "application/octet-stream")
    return FileResponse(str(resolved), media_type=content_type)


@router.post("/upload/media")
async def upload_media(project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a media file into the project's assets folder."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Project không tồn tại")
    dest_dir = Path(project.project_directory or str(PROJECTS_DIR / f"project_{project_id}")) / "assets"
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "upload").name or "upload"
    dest = dest_dir / safe_name
    with open(dest, "wb") as fh:
        while chunk := await file.read(1024 * 1024):
            fh.write(chunk)
    media_type = "image" if (file.content_type or "").startswith("image/") else "video" if (file.content_type or "").startswith("video/") else "unknown"
    return {"ok": True, "media_path": str(dest.resolve()), "media_type": media_type}


# ===========================================================================
# Render pipeline
# ===========================================================================
@router.get("/ffmpeg/check")
def ffmpeg_check():
    from backend.render.ffmpeg_engine import check_ffmpeg

    return check_ffmpeg()


@router.post("/render/start")
def render_start(payload: RenderStartRequest = Body(...), db: Session = Depends(get_db)):
    tts_cfg = get_tts_config(db)
    result = pipeline.start(payload.project_id, payload.config.model_dump(), tts_cfg)
    if not result["ok"]:
        raise HTTPException(409, result["message"])
    return result


@router.post("/pipeline/start")
def pipeline_start(payload: PipelineStartRequest = Body(...), db: Session = Depends(get_db)):
    tts_cfg = payload.tts_config.model_dump()
    render_cfg = payload.render_config.model_dump()
    result = pipeline.start(payload.project_id, render_cfg, tts_cfg)
    if not result["ok"]:
        raise HTTPException(409, result["message"])
    return result


@router.get("/render/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(RenderJob).order_by(RenderJob.created_at.desc()).limit(50).all()
    return [
        {
            "id": j.id,
            "project_id": j.project_id,
            "status": j.status,
            "progress": j.progress,
            "current_step": j.current_step,
            "error_message": j.error_message or "",
            "output_path": j.output_path or "",
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


@router.get("/render/jobs/{job_id}")
def job_status(job_id: int):
    return pipeline.status(job_id)


@router.post("/render/jobs/{job_id}/cancel")
def job_cancel(job_id: int):
    return pipeline.cancel(job_id)


@router.post("/render/jobs/{job_id}/retry")
def job_retry(job_id: int, payload: dict | None = None, db: Session = Depends(get_db)):
    payload = payload or {}
    config = RenderConfig(**(payload.get("config") or {}))
    tts_cfg = get_tts_config(db)
    result = pipeline.retry(job_id, config.model_dump(), tts_cfg)
    if not result["ok"]:
        raise HTTPException(409, result["message"])
    return result


@router.get("/render/jobs/{job_id}/log")
def job_log(job_id: int, lines: int = 100):
    return pipeline.read_tail_log(job_id, lines)


@router.get("/render/output/{project_id}")
def render_output(project_id: int, kind: str = "output", db: Session = Depends(get_db)):
    """Serve the rendered video or preview for playback."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project không tồn tại")
    project_dir = Path(project.project_directory) if project.project_directory else (Path(PROJECTS_DIR) / f"project_{project_id}")
    file_name = "preview.mp4" if kind == "preview" else "output.mp4"
    path = project_dir / file_name
    if not path.exists():
        raise HTTPException(404, "Video chưa được render")
    return FileResponse(str(path), media_type="video/mp4")


# ===========================================================================
# Channel config (Cấu hình kênh modal)
# ===========================================================================
@router.get("/channels/{channel_id}/config")
def get_channel_config(channel_id: int, db: Session = Depends(get_db)):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None:
        raise HTTPException(404, "Channel không tồn tại")
    try:
        config = json.loads(channel.config_json) if channel.config_json else {}
    except (ValueError, TypeError):
        config = {}
    return {"ok": True, "config": config}


@router.patch("/channels/{channel_id}/config")
def update_channel_config(channel_id: int, payload: dict, db: Session = Depends(get_db)):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None:
        raise HTTPException(404, "Channel không tồn tại")
    try:
        existing = json.loads(channel.config_json) if channel.config_json else {}
    except (ValueError, TypeError):
        existing = {}
    existing.update({k: v for k, v in payload.items() if v is not None})
    channel.config_json = json.dumps(existing, ensure_ascii=False)
    db.commit()
    db.refresh(channel)
    return {"ok": True, "config": existing}


# ===========================================================================
# AI video styles (Kiểu video — FREE / BASIC)
# ===========================================================================
VIDEO_STYLES = [
    {"key": "doodle", "name": "Hoạt hình Doodle vẽ tay", "desc": "Giải thích kiến thức", "tier": "FREE"},
    {"key": "toplist", "name": "Sự thật thú vị / Top-List", "desc": "Khơi tò mò", "tier": "FREE"},
    {"key": "finance", "name": "Tài chính cá nhân", "desc": "Giải thích đời thường", "tier": "FREE"},
    {"key": "psychology", "name": "Tâm lý học & Hành vi", "desc": "Khám phá bản thân", "tier": "FREE"},
    {"key": "fable", "name": "Truyện ngụ ngôn", "desc": "Thư giãn, êm dịu", "tier": "FREE"},
    {"key": "kids", "name": "Truyện thiếu nhi / Cổ tích", "desc": "Hoạt hình", "tier": "FREE"},
    {"key": "travel", "name": "Ẩm thực & Du lịch", "desc": "Phim tài liệu cảm quan", "tier": "BASIC"},
    {"key": "horror", "name": "Chuyện kinh dị / Huyền bí", "desc": "Căng thẳng, tò mò", "tier": "BASIC"},
    {"key": "news", "name": "Tin tức tổng hợp", "desc": "Nhanh, sắc gọn", "tier": "BASIC"},
    {"key": "biography", "name": "Tiểu sử / Nhân vật lịch sử", "desc": "Kể chuyện có chiều sâu", "tier": "BASIC"},
]


@router.get("/ai/video-styles")
def list_video_styles():
    return VIDEO_STYLES


# ===========================================================================
# Media library (Thư viện)
# ===========================================================================
@router.post("/upload/library")
async def upload_library_media(file: UploadFile = File(...)):
    """Upload a media file into the global assets folder for the media library."""
    assets_dir = DATA_DIR / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    dest = assets_dir / (file.filename or "upload")
    # Avoid collisions
    stem, ext = dest.stem, dest.suffix
    i = 1
    while dest.exists():
        dest = assets_dir / f"{stem}_{i}{ext}"
        i += 1
    with open(dest, "wb") as fh:
        while chunk := await file.read(1024 * 1024):
            fh.write(chunk)
    media_type = "image" if dest.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} else "audio" if dest.suffix.lower() in {".mp3", ".wav"} else "video"
    return {"ok": True, "path": str(dest.resolve()), "media_type": media_type}


@router.delete("/library")
def delete_library_media(path: str, db: Session = Depends(get_db)):
    """Delete a global library asset only when it is not referenced by production data."""
    assets_dir = (DATA_DIR / "assets").resolve()
    target = Path(path).expanduser().resolve()
    try:
        target.relative_to(assets_dir)
    except ValueError as exc:
        raise HTTPException(403, "Chỉ được xóa file trong thư viện assets") from exc
    if not target.is_file():
        raise HTTPException(404, "Không tìm thấy file media")
    target_str = str(target)
    scene_refs = db.query(Scene).filter(Scene.media_path == target_str).count()
    project_refs = db.query(Project).filter(Project.output_video_path == target_str).count()
    if scene_refs or project_refs:
        raise HTTPException(409, f"File đang được dùng bởi {scene_refs} cảnh và {project_refs} dự án")
    try:
        target.unlink()
    except OSError as exc:
        raise HTTPException(500, f"Không thể xóa file: {exc}") from exc
    return {"ok": True, "path": target_str}


@router.get("/library")
def list_library(search: str | None = None):

    """List uploaded media across the assets folder and project directories."""
    assets_dir = DATA_DIR / "assets"
    items: List[dict] = []
    if assets_dir.exists():
        for f in sorted(assets_dir.rglob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
            if not f.is_file() or f.suffix.lower() not in {
                ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm", ".mov", ".mp3", ".wav"
            }:
                continue
            media_type = "image" if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} \
                else "audio" if f.suffix.lower() in {".mp3", ".wav"} else "video"
            items.append({
                "path": str(f),
                "name": f.name,
                "media_type": media_type,
                "size_kb": round(f.stat().st_size / 1024, 1),
                "updated_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
    if search:
        low = search.lower()
        items = [it for it in items if low in it["name"].lower()]
    return {"ok": True, "items": items}


# ===========================================================================
# Pipeline step status (for Workspace tiến độ sản xuất panel)
# ===========================================================================
STEP_LABELS = [
    ("data", "Thu thập dữ liệu"),
    ("script", "Kịch bản"),
    ("voice", "Lồng tiếng"),
    ("storyboard", "Storyboard"),
    ("media", "Ảnh/Video"),
    ("render", "Dựng phim"),
    ("seo", "SEO"),
]


@router.get("/projects/{project_id}/pipeline-status")
@router.get("/projects/{project_id}/pipeline")
def project_pipeline_status(project_id: int, db: Session = Depends(get_db)):

    """Return per-step production status for the Workspace progress panel."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, "Dự án không tồn tại")
    job = db.query(RenderJob).filter(
        RenderJob.project_id == project_id
    ).order_by(RenderJob.id.desc()).first()
    steps: List[dict] = []
    job_status = "idle"
    job_error = ""
    job_progress = 0
    if job is not None:
        job_status = job.status
        job_error = job.error_message or ""
        job_progress = job.progress or 0
    step_order = ["data", "script", "voice", "storyboard", "media", "render", "seo"]
    # Map project current_step to pipeline progress
    current = (project.current_step or "").lower()
    for key, label in STEP_LABELS:
        if job is None:
            status = "pending"
            progress = 0
        elif job_status in ("completed",):
            status = "done"
            progress = 100
        elif job_status in ("failed", "cancelled"):
            if current == key:
                status = "failed"
                progress = job_progress
            else:
                cur_idx = step_order.index(current) if current in step_order else (len(step_order) - 1)
                status = "done" if (current and step_order.index(key) < cur_idx) else "pending"
                progress = 100 if status == "done" else 0
        else:  # running / pending
            if current == key:
                status = "running"
                progress = job_progress
            else:
                done_idx = step_order.index(current) if current in step_order else -1
                if done_idx >= step_order.index(key):
                    status = "done"
                    progress = 100
                else:
                    status = "pending"
                    progress = 0
        error = job_error if status == "failed" else ""
        steps.append({"key": key, "label": label, "status": status,
                      "progress": progress, "error": error})
    overall_status = "idle"
    if job is not None and job.status not in ("draft",):
        overall_status = job.status
    return {
        "ok": True,
        "status": overall_status,
        "project_status": project.status,
        "error": job_error,
        "steps": steps,
    }

@router.get("/projects/{project_id}/preview")
def project_preview(project_id: int, db: Session = Depends(get_db)):
    """Trả file video kết xuất (hoặc thumbnail) của project — không hardcode đường dẫn tuyệt đối."""
    from fastapi.responses import FileResponse
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "project không tồn tại")
    video = project.output_video_path or ""
    if video and Path(video).exists():
        return FileResponse(str(Path(video).resolve()), media_type="video/mp4")
    raise HTTPException(404, "video kết xuất chưa có")
