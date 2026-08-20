"""API cho các màn hình mới theo đặc tả UI tham chiếu:
Ý tưởng (A/B/C), Media assets, Hàng đợi (jobs/job_steps), Timeline/Dựng phim,
Xuất bản (publish_metadata), Nhân vật toàn cục + ảnh tham chiếu, Flow Connection,
Cài đặt ứng dụng (app_settings toàn cục), Phân tích KPI.
"""

from __future__ import annotations

import hashlib
import json
import os

import platform
import secrets
import shutil

import threading
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query

from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.core.config import FLOW_BOOTSTRAP_TOKEN, LOG_DIR, PROJECTS_DIR, FFMPEG_BIN, FFPROBE_BIN

from backend.core.database import get_db
from backend.models import (
    AppSetting,
    AuditLog,

    Character,
    CharacterRef,
    Channel,
    ConnectorTask,

    FlowConnection,
    Idea,
    Job,
    JobStep,
    MediaAsset,
    PipelineState,
    Project,
    ProjectSetting,
    PublishMeta,
    RenderJob,
    Scene,
    Script,
    SubtitleCue,
    Timeline,
    TimelineClip,
    VoiceAsset,
)
from backend.services.ai.provider import generate_text
from backend.services.flow_factory import connection_payload, get_or_create_connection, new_factory_session_id, set_factory_state

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic
# ---------------------------------------------------------------------------

class IdeaCreate(BaseModel):
    project_id: int
    batch: int = 1
    letter: str = "A"
    title: str = ""
    hook: str = ""
    angle: str = ""
    outline: list[str] = []
    duration_estimate: str = ""
    thumbnail_concept: str = ""
    thumbnail_prompt: str = ""
    selected: bool = False


class IdeaRead(BaseModel):
    id: int
    project_id: int
    batch: int
    letter: str
    title: str
    hook: str
    angle: str
    outline: list[str]
    duration_estimate: str
    thumbnail_concept: str
    thumbnail_prompt: str
    status: str
    selected: bool
    created_at: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class IdeaGenerateRequest(BaseModel):
    project_id: int
    topic: str = ""


class MediaAssetRead(BaseModel):
    id: int
    project_id: int
    scene_id: Optional[int]
    kind: str
    file_path: str
    provider: str
    codec: str
    resolution: str
    size_bytes: int
    duration: float
    checksum: str
    verify_state: str
    active: bool
    reference_count: int
    created_at: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class TimelineCreate(BaseModel):
    project_id: int
    duration: float = 0.0
    settings: dict = {}


class TimelineRead(BaseModel):
    id: int
    project_id: int
    version: int
    duration: float
    settings: dict
    autosave: bool
    created_at: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class ClipCreate(BaseModel):
    timeline_id: int
    track: str
    asset_id: Optional[int] = None
    source_path: str = ""
    scene_id: Optional[int] = None
    clip_start: float = 0.0
    clip_end: float = 0.0
    in_point: float = 0.0
    out_point: float = 0.0
    volume: float = 1.0
    transform: dict = {}
    group_id: str = ""
    locked: bool = False
    order_index: int = 0


class ClipRead(BaseModel):
    id: int
    timeline_id: int
    track: str
    asset_id: Optional[int]
    source_path: str
    scene_id: Optional[int]
    clip_start: float
    clip_end: float
    in_point: float
    out_point: float
    volume: float
    transform: dict
    group_id: str
    locked: bool
    order_index: int
    created_at: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class TimelineClipPayload(BaseModel):
    track: str = "visual"
    asset_id: Optional[int] = None
    source_path: str = ""
    scene_id: Optional[int] = None
    clip_start: float = 0.0
    clip_end: float = 0.0
    in_point: float = 0.0
    out_point: float = 0.0
    volume: float = 1.0
    transform: dict = {}
    group_id: str = ""
    locked: bool = False
    order_index: int = 0


class TimelineProjectPayload(BaseModel):
    """Canonical JSON document edited by the Desktop timeline editor."""
    duration: float = 0.0
    settings: dict = {}
    clips: list[TimelineClipPayload] = []
    expected_version: Optional[int] = None


class PublishMetaCreate(BaseModel):

    project_id: int
    title: str = ""
    description: str = ""
    hashtags: str = ""
    keywords: str = ""
    category: str = ""
    visibility: str = "unlisted"
    thumbnail_path: str = ""
    platform: str = "youtube"
    publish_state: str = "draft"
    scheduled_at: Optional[str] = None


class PublishMetaRead(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    hashtags: str
    keywords: str
    category: str
    visibility: str
    thumbnail_path: str
    platform: str
    publish_state: str
    scheduled_at: Optional[str]
    platform_url: str
    created_at: Optional[str]
    updated_at: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class CharacterGlobalCreate(BaseModel):
    name: str
    code: str = ""
    role: str = ""
    appearance: str = ""
    negative: str = ""
    identity_prompt: str = ""
    face_lock: int = 95
    outfit_lock: int = 90
    seed: str = ""


class CharacterGlobalRead(BaseModel):
    id: int
    project_id: Optional[int]
    channel_id: Optional[int]
    name: str
    description: str
    image_path: str
    is_host: bool
    is_fixed: bool
    ai_tag: str
    code: str = ""
    role: str = ""
    appearance: str = ""
    negative_prompt: str = ""
    identity_prompt: str = ""
    face_lock: int = 95
    outfit_lock: int = 90
    seed: str = ""
    created_at: Optional[str]
    refs: list[dict] = []

    model_config = ConfigDict(from_attributes=True)


class FlowConnectionRead(BaseModel):
    id: int
    extension_id: str = ""
    extension_version: str = ""
    extension_name: str = ""
    google_account: str = ""
    profile_name: str = ""
    paired_at: Optional[datetime] = None
    heartbeat_at: Optional[datetime] = None
    status: str = "unpaired"
    factory_state: str = "waiting_login"
    factory_project_id: Optional[int] = None
    factory_session_id: str = ""
    browser_profile_path: str = ""
    last_error: str = ""
    last_state_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FlowPairRequest(BaseModel):
    pairing_code: str
    extension_id: str
    extension_version: str = ""
    extension_name: str = "Viu Flow Connector"


class FactoryStartRequest(BaseModel):
    project_id: int
    media_type: str = "image"
    aspect: str = "16:9"
    model: str = ""
    factory_mode: bool = True
    include_video: bool = True


class GlobalSettingsRead(BaseModel):

    settings: dict

    model_config = ConfigDict(from_attributes=True)


class GlobalSettingsUpdate(BaseModel):
    settings: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha(file_path: str) -> str:
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return ""


def _ffprobe_info(file_path: str) -> dict:
    import subprocess
    out: dict = {}
    if not file_path or not os.path.isfile(file_path):
        return out
    try:
        p = subprocess.run(
            [FFPROBE_BIN, "-v", "error", "-show_entries",
             "format=duration,size:stream=codec_name,width,height",
             "-of", "json", file_path],
            capture_output=True, text=True, timeout=30,
        )
        import json
        data = json.loads(p.stdout or "{}")
        fmt = data.get("format") or {}
        out["size_bytes"] = int(fmt.get("size", 0) or 0)
        out["duration"] = float(fmt.get("duration", 0) or 0.0)
        streams = data.get("streams") or []
        if streams:
            out["codec"] = streams[0].get("codec_name", "")
            w, h = streams[0].get("width", 0), streams[0].get("height", 0)
            out["resolution"] = f"{w}x{h}" if (w and h) else ""
    except Exception:
        pass
    return out


def _get_global_settings(db: Session) -> dict:
    import json
    data: dict = {}
    try:
        row = db.query(AppSetting).filter(AppSetting.key == "global_ui_settings").first()
        if row and row.value_encrypted:
            data = json.loads(row.value_encrypted) or {}
    except Exception:
        data = {}
    if not str(data.get("operator_name") or "").strip():
        data["operator_name_suggested"] = (
            os.environ.get("USERNAME") or os.environ.get("USER") or ""
        ).strip()
    return data


def _save_global_settings(db: Session, data: dict) -> None:
    import json
    row = db.query(AppSetting).filter(AppSetting.key == "global_ui_settings").first()
    if not row:
        row = AppSetting(key="global_ui_settings")
        db.add(row)
    row.value_encrypted = json.dumps(data, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Ý tưởng (A/B/C)
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/ideas")
def list_ideas(project_id: int, db: Session = Depends(get_db)):
    ideas = db.query(Idea).filter(Idea.project_id == project_id).order_by(
        Idea.batch.desc(), Idea.letter.asc()).all()
    return [
        {**IdeaRead.model_validate(i).model_dump(),
         "outline": __import__("json").loads(i.outline_json or "[]")}
        for i in ideas
    ]


@router.post("/projects/{project_id}/ideas/generate")
def generate_ideas(payload: IdeaGenerateRequest = Body(...),
                   project_id: int = 0, db: Session = Depends(get_db)):
    """Sinh 3 ý tưởng A/B/C bằng AI từ chủ đề/thông tin kênh."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Không tìm thấy dự án")
    script = db.query(Script).filter(Script.project_id == project_id).first()
    channel_cfg = __import__("json").loads(proj.config_json or "{}") if hasattr(proj, "config_json") and getattr(proj, "config_json", None) else {}
    if isinstance(proj.config_json, str):
        try:
            channel_cfg = __import__("json").loads(proj.config_json or "{}")
        except Exception:
            channel_cfg = {}
    topic = payload.topic or proj.topic or channel_cfg.get("niche", "")
    batch = (db.query(func.max(Idea.batch)).filter(Idea.project_id == project_id).scalar() or 0) + 1
    prompt = (
        f"Bạn là biên tập viên nội dung video. Dựa trên chủ đề '{topic}', "
        f"kiểu video '{channel_cfg.get('video_kind', 'Documentary Explainer')}', "
        f"ngách '{channel_cfg.get('niche', '')}', đối tượng '{channel_cfg.get('target_audience') or channel_cfg.get('audience', '18-35 tuổi')}', "
        f"phân loại '{channel_cfg.get('content_rating', 'general')}', kiểu thumbnail '{channel_cfg.get('thumbnail_style', 'auto')}', "
        f"và hook style '{channel_cfg.get('hook_style') or channel_cfg.get('hook', '')}', hãy đề xuất 3 ý tưởng video "
        f"khác nhau về góc nhìn và hook. Trả JSON: {{ideas: [{{title, hook, angle, outline: [5 mục], duration_estimate, thumbnail_concept, thumbnail_prompt}}]}}. "
        "Trả bằng tiếng Việt."
    )

    try:
        import json
        resp = generate_text(
            "Bạn là biên tập viên nội dung. Trả về đúng JSON.", prompt)
        data = json.loads(resp)
        ideas_list = data.get("ideas") or [] if isinstance(data, dict) else []
    except Exception as exc:
        raise HTTPException(422, f"AI sinh ý tưởng thất bại: {exc}") from exc
    created = []
    letters = ["A", "B", "C"]
    for i, item in enumerate(ideas_list[:3]):
        idea = Idea(
            project_id=project_id, batch=batch, letter=letters[i],
            title=item.get("title", ""), hook=item.get("hook", ""),
            angle=item.get("angle", ""), outline_json=__import__("json").dumps(item.get("outline") or []),
            duration_estimate=item.get("duration_estimate", ""),
            thumbnail_concept=item.get("thumbnail_concept", ""),
            thumbnail_prompt=item.get("thumbnail_prompt", ""),
            status="pending",
        )
        db.add(idea)
        db.flush()
        created.append(idea.id)
    db.commit()
    return {"batch": batch, "idea_ids": created,
            "note": "Duyệt ý tưởng sẽ mở khóa bước Kịch bản & Giọng"}


@router.post("/projects/{project_id}/ideas/{idea_id}/select")
def select_idea(project_id: int, idea_id: int, db: Session = Depends(get_db)):
    idea = db.query(Idea).filter(Idea.id == idea_id, Idea.project_id == project_id).first()
    if not idea:
        raise HTTPException(404, "Không tìm thấy ý tưởng")
    db.query(Idea).filter(Idea.project_id == project_id).update({Idea.selected: False})
    idea.selected = True
    idea.status = "approved"
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/ideas/{idea_id}/reject")
def reject_idea(project_id: int, idea_id: int, db: Session = Depends(get_db)):
    idea = db.query(Idea).filter(Idea.id == idea_id, Idea.project_id == project_id).first()
    if not idea:
        raise HTTPException(404, "Không tìm thấy ý tưởng")
    idea.status = "rejected"
    idea.selected = False
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/ideas/approve-batch")
def approve_idea_batch(project_id: int, db: Session = Depends(get_db)):
    """Duyệt ý tưởng đang chọn → mở khóa bước 2 (ghi status kịch bản sẵn sàng)."""
    idea = db.query(Idea).filter(Idea.project_id == project_id, Idea.selected == True).first()  # noqa: E712
    if not idea:
        raise HTTPException(422, "Chưa chọn ý tưởng nào")
    script = db.query(Script).filter(Script.project_id == project_id).first()
    if script:
        script.approved = True
        script.status = "producing"
    proj = db.query(Project).filter(Project.id == project_id).first()
    if proj:
        proj.current_step = "idea_approved"
        if proj.status == "draft":
            proj.status = "in_progress"
    db.query(Idea).filter(Idea.project_id == project_id).update({Idea.status: "pending"})
    idea.status = "approved"
    db.commit()
    return {"ok": True, "idea_id": idea.id}


# ---------------------------------------------------------------------------
# Media assets (thư viện media + inspector)
# ---------------------------------------------------------------------------

def _to_media_read(m: MediaAsset) -> dict:
    d = MediaAssetRead.model_validate(m).model_dump()
    if m.file_path:
        if os.path.isfile(m.file_path):
            d["file_name"] = os.path.basename(m.file_path)
            d["file_exists"] = True
        else:
            d["file_exists"] = False
    else:
        d["file_exists"] = False
    return d


@router.get("/media-assets")
def list_media_assets(project_id: Optional[int] = None,
                      kind: Optional[str] = None,
                      search: Optional[str] = None,
                      db: Session = Depends(get_db)):
    q = db.query(MediaAsset).filter(MediaAsset.active == True)  # noqa: E712
    if project_id is not None:
        q = q.filter(MediaAsset.project_id == project_id)
    if kind:
        q = q.filter(MediaAsset.kind == kind)
    if search:
        q = q.filter(MediaAsset.file_path.like(f"%{search}%"))
    q = q.order_by(MediaAsset.created_at.desc())
    return [_to_media_read(m) for m in q.all()]


@router.post("/media-assets")
def create_media_asset(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Ghi nhận asset sau khi kiểm tra file bằng FFprobe (FFprobe verified)."""
    file_path = payload.get("file_path", "")
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(422, "File không tồn tại trên máy")
    info = _ffprobe_info(file_path)
    asset = MediaAsset(
        project_id=payload.get("project_id", 0),
        scene_id=payload.get("scene_id"),
        kind=payload.get("kind", "media"),
        file_path=file_path,
        provider=payload.get("provider", "local"),
        checksum=_sha(file_path),
        codec=info.get("codec", ""),
        resolution=info.get("resolution", ""),
        size_bytes=info.get("size_bytes", 0),
        duration=info.get("duration", 0.0),
        verify_state="verified" if info else "failed",
        active=True,
        reference_count=0,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"ok": True, "asset": _to_media_read(asset)}


@router.get("/media-assets/{asset_id}")
def get_media_asset(asset_id: int, db: Session = Depends(get_db)):
    m = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not m:
        raise HTTPException(404, "Không tìm thấy asset")
    return _to_media_read(m)


@router.post("/media-assets/{asset_id}/reverify")
def reverify_asset(asset_id: int, db: Session = Depends(get_db)):
    m = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not m:
        raise HTTPException(404, "Không tìm thấy asset")
    info = _ffprobe_info(m.file_path)
    if not info:
        m.verify_state = "failed"
    else:
        m.checksum = _sha(m.file_path)
        m.codec = info.get("codec", m.codec)
        m.resolution = info.get("resolution", m.resolution)
        m.size_bytes = info.get("size_bytes", m.size_bytes)
        m.duration = info.get("duration", m.duration)
        m.verify_state = "verified"
    db.commit()
    return {"ok": True, "asset": _to_media_read(m)}


@router.delete("/media-assets/{asset_id}")
def delete_media_asset(asset_id: int, db: Session = Depends(get_db)):
    m = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not m:
        raise HTTPException(404, "Không tìm thấy asset")
    # Chặn xóa file đang được cảnh/dự án tham chiếu
    scene_using = db.query(Scene).filter(Scene.media_path == m.file_path).count()
    project_using = db.query(Project).filter(Project.output_video_path == m.file_path).count()
    if (scene_using + project_using) > 0:
        raise HTTPException(
            409,
            f"Không thể xóa: file đang được sử dụng bởi {scene_using} cảnh và {project_using} dự án",
        )
    m.active = False
    if os.path.isfile(m.file_path) and m.kind != "output":
        try:
            os.remove(m.file_path)
        except OSError:
            pass
    db.commit()
    return {"ok": True}


@router.get("/media-assets/references/{asset_id}")
def count_references(asset_id: int, db: Session = Depends(get_db)):
    m = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not m:
        raise HTTPException(404, "Không tìm thấy asset")
    ref = (db.query(Scene).filter(Scene.media_path == m.file_path).count()
           + db.query(Project).filter(Project.output_video_path == m.file_path).count())
    m.reference_count = ref
    db.commit()
    return {"asset_id": asset_id, "reference_count": ref}


# ---------------------------------------------------------------------------
# Hàng đợi tổng (jobs + job_steps) — server-side filter/pagination
# ---------------------------------------------------------------------------

@router.get("/queue/jobs")
def list_jobs(status: Optional[str] = None,
              kind: Optional[str] = None,
              project_id: Optional[int] = None,
              search: Optional[str] = None,
              page: int = Query(1, ge=1),
              page_size: int = Query(20, ge=1, le=100),
              db: Session = Depends(get_db)):
    q = db.query(Job)
    if status:
        q = q.filter(Job.status == status)
    if kind:
        q = q.filter(Job.kind == kind)
    if project_id is not None:
        q = q.filter(Job.project_id == project_id)
    total = q.count()
    jobs = q.order_by(Job.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for j in jobs:
        step = (db.query(JobStep).filter(JobStep.job_id == j.id)
                .order_by(JobStep.id.desc()).first())
        items.append({
            "id": j.id, "project_id": j.project_id, "kind": j.kind,
            "status": j.status, "progress": j.progress,
            "current_step": step.step if step else "",
            "started_at": str(j.created_at),
        })
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/queue/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    j = db.query(Job).filter(Job.id == job_id).first()
    if not j:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    steps = db.query(JobStep).filter(JobStep.job_id == job_id).order_by(JobStep.id.asc()).all()
    return {
        "job": {"id": j.id, "project_id": j.project_id, "kind": j.kind,
                "status": j.status, "progress": j.progress,
                "checkpoint": j.checkpoint, "created_at": str(j.created_at)},
        "steps": [{"id": s.id, "step": s.step, "dependency": s.dependency,
                   "attempt": s.attempt, "status": s.status, "log": s.log,
                   "error": s.error, "started_at": str(s.started_at),
                   "finished_at": str(s.finished_at)} for s in steps],
    }


@router.post("/queue/jobs")
def create_job(payload: dict = Body(...), db: Session = Depends(get_db)):
    j = Job(project_id=payload.get("project_id"), kind=payload.get("kind", ""),
            status=payload.get("status", "pending"))
    db.add(j)
    db.flush()
    for s in payload.get("steps") or []:
        db.add(JobStep(job_id=j.id, project_id=j.project_id, scene_id=s.get("scene_id"),
                       step=s.get("step", ""), dependency=s.get("dependency", "")))
    db.commit()
    return {"job_id": j.id}


@router.post("/queue/jobs/{job_id}/step/{step_id}/complete")
def complete_job_step(job_id: int, step_id: int,
                      payload: dict = Body(...), db: Session = Depends(get_db)):
    s = db.query(JobStep).filter(JobStep.id == step_id, JobStep.job_id == job_id).first()
    if not s:
        raise HTTPException(404, "Không tìm thấy bước")
    s.status = payload.get("status", "completed")
    s.log = payload.get("log", s.log)
    s.error = payload.get("error", "")
    s.finished_at = datetime.utcnow()
    job = db.query(Job).filter(Job.id == job_id).first()
    if job:
        done = db.query(JobStep).filter(JobStep.job_id == job_id,
                                        JobStep.status == "completed").count()
        total = db.query(JobStep).filter(JobStep.job_id == job_id).count()
        job.progress = int(100 * done / total) if total else 0
        if total and done >= total:
            job.status = "completed"
        elif s.status == "failed":
            job.status = "failed"
    db.commit()
    return {"ok": True}


@router.post("/queue/jobs/{job_id}/pause")
def pause_job(job_id: int, db: Session = Depends(get_db)):
    j = db.query(Job).filter(Job.id == job_id).first()
    if not j:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    if j.status in ("running", "pending", "waiting_for_review"):
        j.status = "paused"
        db.commit()
    return {"ok": True}


@router.post("/queue/jobs/{job_id}/resume")
def resume_job(job_id: int, db: Session = Depends(get_db)):
    j = db.query(Job).filter(Job.id == job_id).first()
    if not j:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    if j.status == "paused":
        j.status = "pending"
        db.commit()
    return {"ok": True}


@router.post("/queue/jobs/{job_id}/retry")
def retry_job(job_id: int, db: Session = Depends(get_db)):
    j = db.query(Job).filter(Job.id == job_id).first()
    if not j:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    j.status = "pending"
    j.progress = 0
    db.query(JobStep).filter(JobStep.job_id == job_id,
                             JobStep.status == "failed").update(
        {JobStep.status: "pending", JobStep.attempt: JobStep.attempt + 1})
    db.commit()
    return {"ok": True}


@router.post("/queue/jobs/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    j = db.query(Job).filter(Job.id == job_id).first()
    if not j:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    j.status = "cancelled"
    db.query(JobStep).filter(JobStep.job_id == job_id,
                             JobStep.status.in_(["pending", "running"])).update(
        {JobStep.status: "cancelled"})
    db.commit()
    return {"ok": True}


@router.get("/queue/summary")
def queue_summary(db: Session = Depends(get_db)):
    def c(status):
        return db.query(Job).filter(Job.status == status).count()
    return {
        "running": c("running"), "pending": c("pending"),
        "waiting_for_review": c("waiting_for_review"),
        "completed": c("completed"), "paused": c("paused"),
        "failed": c("failed"),
    }


# ---------------------------------------------------------------------------
# Timeline / Dựng phim
# ---------------------------------------------------------------------------


def _clip_dict(c: TimelineClip) -> dict:
    try:
        transform = json.loads(c.transform_json or "{}")
    except (TypeError, ValueError):
        transform = {}
    return {
        "id": c.id,
        "timeline_id": c.timeline_id,
        "track": c.track,
        "asset_id": c.asset_id,
        "source_path": c.source_path or "",
        "scene_id": c.scene_id,
        "clip_start": float(c.clip_start or 0.0),
        "clip_end": float(c.clip_end or 0.0),
        "in_point": float(c.in_point or 0.0),
        "out_point": float(c.out_point or 0.0),
        "volume": float(c.volume if c.volume is not None else 1.0),
        "transform": transform if isinstance(transform, dict) else {},
        "group_id": c.group_id or "",
        "locked": bool(c.locked),
        "order_index": int(c.order_index or 0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _timeline_dict(t: Timeline, clips: list[TimelineClip]) -> dict:
    try:
        settings = json.loads(t.settings_json or "{}")
    except (TypeError, ValueError):
        settings = {}
    return {
        "id": t.id,
        "project_id": t.project_id,
        "version": t.version,
        "duration": float(t.duration or 0.0),
        "settings": settings if isinstance(settings, dict) else {},
        "autosave": bool(t.autosave),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "clips": [_clip_dict(c) for c in clips],
    }


def _ensure_project_timeline(project_id: int, db: Session) -> Timeline:
    t = db.query(Timeline).filter(
        Timeline.project_id == project_id,
        Timeline.autosave == True,  # noqa: E712
    ).order_by(Timeline.version.desc()).first()
    if t:
        return t
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Không tìm thấy dự án")
    scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index).all()
    duration = 0.0
    t = Timeline(project_id=project_id, version=1, autosave=True, settings_json=json.dumps({
        "aspect_ratio": project.aspect_ratio or "16:9",
        "fps": 30,
        "background_color": "#000000",
    }))
    db.add(t)
    db.flush()
    for index, scene in enumerate(scenes):
        start = duration
        scene_duration = max(float(scene.duration or 0.0), 0.1)
        end = start + scene_duration
        source = scene.video_path or scene.image_path or scene.media_path or ""
        if source:
            db.add(TimelineClip(
                timeline_id=t.id,
                track="visual",
                source_path=source,
                scene_id=scene.id,
                clip_start=start,
                clip_end=end,
                in_point=0.0,
                out_point=scene_duration,
                order_index=index,
                transform_json=json.dumps({"effect": scene.effect or "zoom_in"}),
            ))
        if scene.audio_path:
            db.add(TimelineClip(
                timeline_id=t.id,
                track="voice",
                source_path=scene.audio_path,
                scene_id=scene.id,
                clip_start=start,
                clip_end=end,
                in_point=0.0,
                out_point=scene_duration,
                order_index=index,
            ))
        duration = end
    t.duration = duration
    db.commit()
    db.refresh(t)
    return t


@router.get("/projects/{project_id}/timeline")
def get_timeline_project(project_id: int, db: Session = Depends(get_db)):
    t = _ensure_project_timeline(project_id, db)
    clips = db.query(TimelineClip).filter(TimelineClip.timeline_id == t.id).order_by(
        TimelineClip.track, TimelineClip.order_index, TimelineClip.clip_start,
    ).all()
    return _timeline_dict(t, clips)


@router.put("/projects/{project_id}/timeline")
def save_timeline_project(project_id: int, payload: TimelineProjectPayload = Body(...), db: Session = Depends(get_db)):
    t = _ensure_project_timeline(project_id, db)
    if payload.expected_version is not None and payload.expected_version != t.version:
        raise HTTPException(409, "Timeline đã được cập nhật ở phiên khác; hãy tải lại trước khi lưu")
    if payload.duration < 0 or payload.duration > 24 * 60 * 60:
        raise HTTPException(422, "Thời lượng timeline không hợp lệ")
    for clip in payload.clips:
        if clip.clip_start < 0 or clip.clip_end <= clip.clip_start:
            raise HTTPException(422, "Khoảng thời gian clip không hợp lệ")
        if clip.clip_end > 24 * 60 * 60:
            raise HTTPException(422, "Clip vượt giới hạn timeline 24 giờ")
        if clip.in_point < 0 or clip.out_point < clip.in_point:
            raise HTTPException(422, "Khoảng source của clip không hợp lệ")
    db.query(TimelineClip).filter(TimelineClip.timeline_id == t.id).delete(synchronize_session=False)
    t.version = int(t.version or 0) + 1
    t.duration = float(payload.duration)
    t.settings_json = json.dumps(payload.settings or {}, ensure_ascii=False)
    t.autosave = True
    for index, clip in enumerate(payload.clips):
        db.add(TimelineClip(
            timeline_id=t.id,
            track=clip.track.strip() or "visual",
            asset_id=clip.asset_id,
            source_path=clip.source_path.strip(),
            scene_id=clip.scene_id,
            clip_start=clip.clip_start,
            clip_end=clip.clip_end,
            in_point=clip.in_point,
            out_point=clip.out_point,
            volume=max(0.0, min(2.0, clip.volume)),
            transform_json=json.dumps(clip.transform or {}, ensure_ascii=False),
            group_id=clip.group_id,
            locked=clip.locked,
            order_index=clip.order_index if clip.order_index >= 0 else index,
        ))
    db.commit()
    clips = db.query(TimelineClip).filter(TimelineClip.timeline_id == t.id).order_by(
        TimelineClip.track, TimelineClip.order_index, TimelineClip.clip_start,
    ).all()
    return _timeline_dict(t, clips)


@router.post("/projects/{project_id}/timelines")
def create_timeline(project_id: int, payload: TimelineCreate = Body(...),
                    db: Session = Depends(get_db)):

    t = Timeline(project_id=project_id, duration=payload.duration,
                 settings_json=__import__("json").dumps(payload.settings or {}))
    db.add(t)
    db.commit()
    db.refresh(t)
    return TimelineRead.model_validate(t).model_dump()


@router.get("/projects/{project_id}/timelines")
def list_timelines(project_id: int, db: Session = Depends(get_db)):
    return [TimelineRead.model_validate(t).model_dump()
            for t in db.query(Timeline).filter(
                Timeline.project_id == project_id).order_by(Timeline.version.desc()).all()]


@router.post("/projects/{project_id}/timelines/{timeline_id}/clips")
def create_clip(project_id: int, timeline_id: int,
                payload: ClipCreate = Body(...), db: Session = Depends(get_db)):
    t = db.query(Timeline).filter(Timeline.id == timeline_id,
                                  Timeline.project_id == project_id).first()
    if not t:
        raise HTTPException(404, "Không tìm thấy timeline")
    c = TimelineClip(
        timeline_id=timeline_id, track=payload.track, asset_id=payload.asset_id,
        source_path=payload.source_path, scene_id=payload.scene_id,
        clip_start=payload.clip_start, clip_end=payload.clip_end,
        in_point=payload.in_point, out_point=payload.out_point,
        volume=payload.volume, transform_json=__import__("json").dumps(payload.transform or {}),
        group_id=payload.group_id, locked=payload.locked,
        order_index=payload.order_index,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return ClipRead.model_validate(c).model_dump()


@router.get("/projects/{project_id}/timelines/{timeline_id}/clips")
def list_clips(project_id: int, timeline_id: int, db: Session = Depends(get_db)):
    t = db.query(Timeline).filter(Timeline.id == timeline_id,
                                  Timeline.project_id == project_id).first()
    if not t:
        raise HTTPException(404, "Không tìm thấy timeline")
    return [ClipRead.model_validate(c).model_dump()
            for c in db.query(TimelineClip).filter(
                TimelineClip.timeline_id == timeline_id).order_by(
                    TimelineClip.track, TimelineClip.order_index).all()]


@router.patch("/projects/{project_id}/timelines/{timeline_id}/clips/{clip_id}")
def update_clip(project_id: int, timeline_id: int, clip_id: int,
                payload: dict = Body(...), db: Session = Depends(get_db)):
    t = db.query(Timeline).filter(Timeline.id == timeline_id,
                                  Timeline.project_id == project_id).first()
    if not t:
        raise HTTPException(404, "Không tìm thấy timeline")
    c = db.query(TimelineClip).filter(TimelineClip.id == clip_id,
                                      TimelineClip.timeline_id == timeline_id).first()
    if not c:
        raise HTTPException(404, "Không tìm thấy clip")
    for k, v in payload.items():
        if k == "transform":
            c.transform_json = __import__("json").dumps(v)
        elif hasattr(c, k):
            setattr(c, k, v)
    db.commit()
    return ClipRead.model_validate(c).model_dump()


@router.delete("/projects/{project_id}/timelines/{timeline_id}/clips/{clip_id}")
def delete_clip(project_id: int, timeline_id: int, clip_id: int,
                db: Session = Depends(get_db)):
    t = db.query(Timeline).filter(Timeline.id == timeline_id,
                                  Timeline.project_id == project_id).first()
    if not t:
        raise HTTPException(404, "Không tìm thấy timeline")
    c = db.query(TimelineClip).filter(TimelineClip.id == clip_id,
                                      TimelineClip.timeline_id == timeline_id).first()
    if not c:
        raise HTTPException(404, "Không tìm thấy clip")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/timelines/autosave")
def autosave_timeline(project_id: int, payload: dict = Body(...),
                      db: Session = Depends(get_db)):
    """Lưu điểm kiểm tra timeline (checkpoint) — khôi phục sau khi đóng app."""
    t = db.query(Timeline).filter(Timeline.project_id == project_id,
                                  Timeline.autosave == True).first()  # noqa: E712
    if t:
        t.version += 1
        t.settings_json = __import__("json").dumps(payload.get("settings", {}))
        t.checkpoint_json = __import__("json").dumps(payload.get("checkpoint", {}))
        t.duration = payload.get("duration", t.duration)
    else:
        t = Timeline(project_id=project_id,
                     settings_json=__import__("json").dumps(payload.get("settings", {})),
                     checkpoint_json=__import__("json").dumps(payload.get("checkpoint", {})),
                     duration=payload.get("duration", 0.0), autosave=True)
        db.add(t)
    db.commit()
    db.refresh(t)
    return {"ok": True, "timeline_id": t.id, "version": t.version}


# ---------------------------------------------------------------------------
# Xuất bản
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/publish")
def get_publish(project_id: int, db: Session = Depends(get_db)):
    p = db.query(PublishMeta).filter(PublishMeta.project_id == project_id).first()
    if not p:
        return {}
    return PublishMetaRead.model_validate(p).model_dump()


@router.post("/projects/{project_id}/publish")
def save_publish(project_id: int, payload: PublishMetaCreate = Body(...),
                 db: Session = Depends(get_db)):
    p = db.query(PublishMeta).filter(PublishMeta.project_id == project_id).first()
    if p:
        for k, v in payload.model_dump().items():
            if k != "project_id":
                setattr(p, k, v)
    else:
        p = PublishMeta(**payload.model_dump())
        db.add(p)
    db.commit()
    db.refresh(p)
    return PublishMetaRead.model_validate(p).model_dump()


@router.post("/projects/{project_id}/publish/verify")
def verify_publish(project_id: int, db: Session = Depends(get_db)):
    """Chỉ cho phép xuất bản khi video tồn tại VÀ FFprobe xác minh (không mock)."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Không tìm thấy dự án")
    if not proj.output_video_path or not os.path.isfile(proj.output_video_path):
        raise HTTPException(422, "Chưa có video đầu ra thật")
    info = _ffprobe_info(proj.output_video_path)
    if not info or not info.get("duration"):
        raise HTTPException(422, "FFprobe không xác minh được file video")
    p = db.query(PublishMeta).filter(PublishMeta.project_id == project_id).first()
    if p:
        p.publish_state = "ready"
        db.commit()
    return {"ok": True, "ffprobe": info}


# ---------------------------------------------------------------------------
# Nhân vật toàn cục + ảnh tham chiếu
# ---------------------------------------------------------------------------

@router.get("/characters-global")
def list_characters_global(db: Session = Depends(get_db)):
    chars = db.query(Character).all()
    out = []
    for ch in chars:
        refs = [{"id": r.id, "file_path": r.file_path, "ref_kind": r.ref_kind,
                 "version": r.version}
                for r in db.query(CharacterRef).filter(
                    CharacterRef.character_id == ch.id).all()]
        d = CharacterGlobalRead.model_validate(ch).model_dump()
        d["refs"] = refs
        d["used_projects"] = db.query(Scene).filter(
            Scene.media_path.like(f"%{ch.name}%")).count()
        out.append(d)
    return out


@router.post("/characters-global")
def create_character_global(payload: CharacterGlobalCreate = Body(...),
                            db: Session = Depends(get_db)):
    ch = Character(
        project_id=None,
        channel_id=None,
        name=payload.name.strip(),
        description=payload.role.strip() or payload.appearance.strip(),
        image_path="",
        is_host=True,
        ai_tag=payload.code.strip(),
        code=payload.code.strip(),
        role=payload.role.strip(),
        appearance=payload.appearance.strip(),
        negative_prompt=payload.negative.strip(),
        identity_prompt=payload.identity_prompt.strip(),
        face_lock=payload.face_lock,
        outfit_lock=payload.outfit_lock,
        seed=payload.seed.strip(),
    )

    db.add(ch)
    db.commit()
    db.refresh(ch)
    return {"character_id": ch.id}


@router.patch("/characters-global/{char_id}")
def update_character_global(char_id: int, payload: CharacterGlobalCreate = Body(...),
                            db: Session = Depends(get_db)):
    ch = db.query(Character).filter(Character.id == char_id).first()
    if not ch:
        raise HTTPException(404, "Không tìm thấy nhân vật")
    ch.name = payload.name.strip()
    ch.code = payload.code.strip()
    ch.ai_tag = payload.code.strip()
    ch.role = payload.role.strip()
    ch.appearance = payload.appearance.strip()
    ch.negative_prompt = payload.negative.strip()
    ch.identity_prompt = payload.identity_prompt.strip()
    ch.face_lock = payload.face_lock
    ch.outfit_lock = payload.outfit_lock
    ch.seed = payload.seed.strip()
    ch.description = payload.role.strip() or payload.appearance.strip()
    db.commit()
    db.refresh(ch)
    return {"ok": True, "character_id": ch.id}


@router.post("/characters-global/{char_id}/refs")
def add_character_ref(char_id: int, payload: dict = Body(...),

                      db: Session = Depends(get_db)):
    ch = db.query(Character).filter(Character.id == char_id).first()
    if not ch:
        raise HTTPException(404, "Không tìm thấy nhân vật")
    file_path = payload.get("file_path", "")
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(422, "File ảnh không tồn tại")
    r = CharacterRef(character_id=char_id, file_path=file_path,
                     ref_kind=payload.get("ref_kind", "face"), version=payload.get("version", 1))
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"ok": True, "ref": {"id": r.id, "file_path": r.file_path,
                                "ref_kind": r.ref_kind}}


@router.get("/characters-global/{char_id}")
def get_character_global(char_id: int, db: Session = Depends(get_db)):
    ch = db.query(Character).filter(Character.id == char_id).first()
    if not ch:
        raise HTTPException(404, "Không tìm thấy nhân vật")
    refs = [{"id": r.id, "file_path": r.file_path, "ref_kind": r.ref_kind}
            for r in db.query(CharacterRef).filter(
                CharacterRef.character_id == char_id).all()]
    return {**CharacterGlobalRead.model_validate(ch).model_dump(), "refs": refs}


@router.delete("/characters-global/{char_id}")
def delete_character_global(char_id: int, db: Session = Depends(get_db)):
    ch = db.query(Character).filter(Character.id == char_id).first()
    if not ch:
        raise HTTPException(404, "Không tìm thấy nhân vật")
    if db.query(CharacterRef).filter(CharacterRef.character_id == char_id).count() > 0:
        # Chặn xóa nếu có ảnh tham chiếu đang dùng
        db.query(CharacterRef).filter(CharacterRef.character_id == char_id).delete()
    db.delete(ch)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Flow Connection (ghép Extension runtime)
# ---------------------------------------------------------------------------

@router.get("/flow-connection")
def get_flow_connection(db: Session = Depends(get_db)):
    fc = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    return connection_payload(fc)


def _require_flow_bootstrap_token(value: str | None) -> None:
    if not FLOW_BOOTSTRAP_TOKEN:
        raise HTTPException(503, "Flow bootstrap token chưa được Electron khởi tạo")
    if not secrets.compare_digest(value or "", FLOW_BOOTSTRAP_TOKEN):
        raise HTTPException(403, "Flow Connector bootstrap token không hợp lệ")


@router.post("/flow-connection/factory/start")
def start_factory_flow(payload: FactoryStartRequest, db: Session = Depends(get_db)):
    """Start or resume a project-bound two-stage Flow Factory session."""
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(404, "Project không tồn tại")
    scenes = db.query(Scene).filter(Scene.project_id == payload.project_id).order_by(Scene.order_index.asc()).all()
    if not scenes:
        raise HTTPException(409, "Project chưa có scene. Hãy duyệt kịch bản và chạy phân cảnh trước.")

    # Channel config is stored separately from project wizard config. Merge both
    # with project/media values taking precedence, so the saved channel settings
    # actually control Factory behavior without losing per-project overrides.
    channel_cfg: dict = {}
    if project.channel_id:
        channel = db.query(Channel).filter(Channel.id == project.channel_id).first()
        if channel and channel.config_json:
            try:
                channel_cfg = json.loads(channel.config_json) if isinstance(channel.config_json, str) else dict(channel.config_json)
            except (TypeError, ValueError):
                channel_cfg = {}
    project_cfg: dict = {}
    if project.config_json:
        try:
            project_cfg = json.loads(project.config_json) if isinstance(project.config_json, str) else dict(project.config_json)
        except (TypeError, ValueError):
            project_cfg = {}
    project_channel_cfg = project_cfg.get("channel") if isinstance(project_cfg.get("channel"), dict) else {}
    project_media_cfg = project_cfg.get("media") if isinstance(project_cfg.get("media"), dict) else {}
    effective_cfg = {**channel_cfg, **project_channel_cfg, **project_media_cfg}
    image_mode = str(effective_cfg.get("image_mode") or effective_cfg.get("mix_mode") or "mixed").lower()
    include_video = bool(payload.include_video) and image_mode not in {"image", "images", "static", "static_image"}
    video_model = str(effective_cfg.get("video_model") or "Veo 3.1 Lite")

    connection = get_or_create_connection(db)
    session_id = connection.factory_session_id if (
        connection.factory_project_id == payload.project_id
        and connection.factory_state not in {"completed", "failed"}
        and connection.factory_session_id
    ) else new_factory_session_id()
    connection.factory_project_id = payload.project_id
    connection.factory_session_id = session_id
    connection.factory_mode = bool(payload.factory_mode)
    connection.include_video = include_video
    connection.factory_stage = "image"

    created = 0
    skipped = 0
    missing_prompts = 0
    for index, scene in enumerate(scenes):
        prompt = (scene.visual_prompt or "").strip()
        if not prompt:
            missing_prompts += 1
            scene.status = "media_failed"
            scene.error_message = "Cảnh chưa có visual prompt; cần chạy phân cảnh AI trước khi Factory gửi sang Flow."
            continue
        image_file = scene.image_path or (scene.media_path if scene.media_type == "image" else "")
        video_file = scene.video_path or (scene.media_path if scene.media_type == "video" else "")
        image_ready = bool(image_file and os.path.isfile(image_file) and os.path.getsize(image_file) > 0)
        video_ready = bool(video_file and os.path.isfile(video_file) and os.path.getsize(video_file) > 0)
        if video_ready or (image_ready and not payload.include_video):
            skipped += 1
            continue
        stage = "video" if image_ready and payload.include_video else "image"
        existing = db.query(ConnectorTask).filter(
            ConnectorTask.project_id == payload.project_id,
            ConnectorTask.scene_id == scene.id,
            ConnectorTask.stage == stage,
            ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying"]),
        ).first()
        if existing:
            existing.factory_session_id = session_id
            skipped += 1
            continue
        db.add(ConnectorTask(
            task_id=__import__("uuid").uuid4().hex,
            project_id=payload.project_id,
            scene_id=scene.id,
            scene_order=index,
            status="pending",
            stage=stage,
            attempts=0,
            prompt=prompt,
            media_type="video" if stage == "video" else "image",
            aspect=payload.aspect or project.aspect_ratio or "16:9",
            model=payload.model or (video_model if stage == "video" else "Nano Banana 2"),
            factory_session_id=session_id,
        ))
        scene.status = "media_pending"
        created += 1
        if stage == "video":
            connection.factory_stage = "video"

    if missing_prompts and created == 0 and skipped == 0:
        connection.factory_state = "failed"
        connection.last_error = "Không có visual prompt hợp lệ cho các cảnh."
        connection.last_state_at = datetime.utcnow()
        db.commit()
        raise HTTPException(409, connection.last_error)

    heartbeat_fresh = bool(connection.heartbeat_at and (datetime.utcnow() - connection.heartbeat_at).total_seconds() < 300)
    connection.factory_state = "ready" if (connection.status == "paired" or bool(connection.google_account) or heartbeat_fresh) else "waiting_login"
    connection.last_error = ""
    connection.last_state_at = datetime.utcnow()
    if created:
        project.status = "preparing_media"
        project.current_step = "Media"
        project.progress = max(project.progress or 0, 60)
    elif skipped:
        project.status = "media_ready"
        project.current_step = "Media đã xác minh"
        project.progress = max(project.progress or 0, 70)
    db.commit()
    return {
        "ok": True,
        "project_id": payload.project_id,
        "factory_session_id": session_id,
        "factory_state": connection.factory_state,
        "requires_login": connection.factory_state == "waiting_login" and not bool(connection.google_account),
        "include_video": include_video,
        "factory_stage": connection.factory_stage,
        "created": created,
        "skipped": skipped,
        "missing_prompts": missing_prompts,
    }


@router.post("/flow-connection/factory/state")
def update_factory_flow_state(
    payload: dict = Body(...),
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Authenticated extension heartbeat/state report for auto-resume."""
    _require_flow_bootstrap_token(x_viu_flow_token)
    extension_id = str(payload.get("extension_id") or "").strip()
    session_id = str(payload.get("factory_session_id") or "").strip()
    connection = get_or_create_connection(db)
    if connection.factory_session_id and session_id and connection.factory_session_id != session_id:
        raise HTTPException(409, "Flow Factory session không còn là session đang chạy")
    if extension_id:
        connection.extension_id = extension_id
    connection.extension_version = str(payload.get("extension_version") or connection.extension_version or "")
    connection.extension_name = str(payload.get("extension_name") or connection.extension_name or "Viu Flow Connector")
    connection.google_account = str(payload.get("google_account") or connection.google_account or "")
    connection.profile_name = str(payload.get("profile_name") or connection.profile_name or "")
    connection.heartbeat_at = datetime.utcnow()
    logged_in = bool(payload.get("logged_in"))
    ready = bool(payload.get("ready"))
    if logged_in:
        connection.status = "paired"
        connection.paired_at = connection.paired_at or datetime.utcnow()
        if connection.factory_state not in {"processing", "generate_image", "generate_video", "completed", "failed"}:
            connection.factory_state = "ready"
        connection.last_error = ""
    else:
        connection.status = "unpaired"
        connection.factory_state = "waiting_login"
    if session_id:
        connection.factory_session_id = session_id
    connection.last_state_at = datetime.utcnow()
    db.commit()
    return connection_payload(connection)


@router.post("/flow-connection/pair")

def pair_flow_connection(payload: FlowPairRequest = Body(...),
                         db: Session = Depends(get_db)):
    """Extension gửi mã ghép một lần → cập nhật trạng thái ghép (heartbeat)."""
    fc = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if not fc or fc.pairing_code != payload.pairing_code:
        raise HTTPException(422, "Mã ghép không hợp lệ hoặc đã hết hạn")
    if fc.pairing_expires_at and fc.pairing_expires_at < datetime.utcnow():
        raise HTTPException(422, "Mã ghép đã hết hạn")
    fc.extension_id = payload.extension_id.strip()
    if not fc.extension_id:
        raise HTTPException(422, "Thiếu extension_id")
    fc.extension_version = payload.extension_version
    fc.extension_name = payload.extension_name
    fc.status = "paired"
    fc.paired_at = datetime.utcnow()
    fc.heartbeat_at = datetime.utcnow()
    fc.pairing_code = ""
    db.commit()
    return {"ok": True}


@router.post("/flow-connection/heartbeat")
def flow_heartbeat(
    payload: dict = Body(...),
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    _require_flow_bootstrap_token(x_viu_flow_token)
    ext_id = payload.get("extension_id", "")
    fc = db.query(FlowConnection).filter(FlowConnection.extension_id == ext_id).first()

    if not fc or fc.status != "paired":
        raise HTTPException(403, "Extension chưa được ghép bằng mã một lần")
    fc.heartbeat_at = datetime.utcnow()
    fc.extension_version = payload.get("extension_version", fc.extension_version)
    fc.extension_name = payload.get("extension_name", fc.extension_name)
    fc.google_account = payload.get("google_account", fc.google_account)
    fc.profile_name = payload.get("profile_name", fc.profile_name)

    if payload.get("logged_in"):
        fc.status = "paired"
        fc.paired_at = fc.paired_at or datetime.utcnow()
        if payload.get("ready"):
            if fc.factory_state not in {"processing", "generate_image", "generate_video", "completed", "failed"}:
                fc.factory_state = "ready"
            fc.last_error = ""
    fc.last_state_at = datetime.utcnow()
    db.commit()
    return connection_payload(fc)


@router.post("/flow-connection/logout")
def logout_flow_connection(
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Đăng xuất Flow profile và reset trạng thái account/factory hiện tại."""
    _require_flow_bootstrap_token(x_viu_flow_token)
    fc = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if not fc:
        return {"ok": True, "message": "Flow chưa có profile đăng nhập."}
    fc.status = "unpaired"
    fc.google_account = ""
    fc.profile_name = ""
    fc.factory_state = "waiting_login"
    fc.factory_project_id = None
    fc.factory_session_id = ""
    fc.factory_mode = False
    fc.include_video = False
    fc.last_error = ""
    fc.last_state_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Đã reset trạng thái tài khoản Google Flow.", "connection": connection_payload(fc)}


@router.post("/flow-connection/new-pairing-code")
def new_pairing_code(db: Session = Depends(get_db)):

    import secrets
    fc = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if not fc:
        fc = FlowConnection()
        db.add(fc)
        db.flush()
    fc.pairing_code = "".join(secrets.choice("0123456789") for _ in range(6))
    fc.pairing_expires_at = datetime.utcnow() + timedelta(minutes=10)
    fc.status = "pairing"
    db.commit()
    return {"pairing_code": fc.pairing_code,
            "expires_at": str(fc.pairing_expires_at)}


# ---------------------------------------------------------------------------
# Cài đặt ứng dụng toàn cục (UI settings)
# ---------------------------------------------------------------------------

@router.get("/global-settings")
def get_global_settings(db: Session = Depends(get_db)):
    return {"settings": _get_global_settings(db)}


@router.patch("/global-settings")
def update_global_settings(payload: GlobalSettingsUpdate = Body(...),
                           db: Session = Depends(get_db)):
    cur = _get_global_settings(db)
    cur.update(payload.settings or {})
    _save_global_settings(db, cur)
    db.commit()
    return {"settings": cur}


PRODUCING_STATUSES = (
    "generating_voice", "voice_ready", "preparing_media", "media_ready",
    "generating_subtitles", "subtitle_ready", "rendering", "processing", "running",
)
WAITING_STATUSES = (
    "waiting_for_review", "pending", "queued", "draft", "script_ready",
    "script_approved", "idle",
)


def _project_bucket(status: str) -> str:
    if status in PRODUCING_STATUSES:
        return "producing"
    if status in WAITING_STATUSES:
        return "waiting"
    if status == "completed":
        return "completed"
    if status == "failed":
        return "failed"
    return "other"


def _project_counts(db: Session) -> dict[str, int]:
    counts = {"producing": 0, "waiting": 0, "completed": 0, "failed": 0, "other": 0, "total": 0}
    for project in db.query(Project).all():
        counts["total"] += 1
        counts[_project_bucket(project.status)] += 1
    return counts


class NotificationMarkRead(BaseModel):
    keys: list[str] = []


@router.get("/dashboard/overview")
def dashboard_overview(db: Session = Depends(get_db)):
    """Đếm dự án thật + delta so với snapshot ngày trước (lưu SQLite)."""
    counts = _project_counts(db)
    today = datetime.utcnow().date().isoformat()
    settings = _get_global_settings(db)
    snap = settings.get("overview_snapshot") if isinstance(settings.get("overview_snapshot"), dict) else {}
    if snap.get("date") == today:
        previous = snap.get("previous") if isinstance(snap.get("previous"), dict) else counts
    else:
        previous = snap.get("counts") if isinstance(snap.get("counts"), dict) else counts
        settings["overview_snapshot"] = {"date": today, "counts": counts, "previous": previous}
        _save_global_settings(db, settings)
        db.commit()
        if snap.get("date") != today:
            settings["overview_snapshot"] = {"date": today, "counts": counts, "previous": previous}
    # Cập nhật counts trong ngày để ngày mai có mốc thật, không đổi previous.
    settings["overview_snapshot"] = {
        "date": today,
        "counts": counts,
        "previous": previous,
    }
    _save_global_settings(db, settings)
    db.commit()
    keys = ("producing", "waiting", "completed", "failed")
    delta = {k: int(counts.get(k, 0)) - int(previous.get(k, 0) or 0) for k in keys}
    return {"counts": counts, "delta": delta, "snapshot_date": today}


@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db)):
    settings = _get_global_settings(db)
    read_keys = set(settings.get("notification_read_keys") or [])
    items: list[dict] = []

    for project in db.query(Project).filter(Project.status == "failed").order_by(Project.updated_at.desc()).limit(20).all():
        stamp = project.updated_at.isoformat() if project.updated_at else ""
        key = f"project-fail-{project.id}-{stamp}"
        items.append({
            "key": key,
            "title": "Dự án lỗi",
            "message": project.error_message or project.name,
            "href": f"/projects/{project.id}",
            "created_at": stamp,
            "read": key in read_keys,
        })

    for job in db.query(RenderJob).filter(RenderJob.status == "failed").order_by(RenderJob.updated_at.desc()).limit(20).all():
        stamp = job.updated_at.isoformat() if job.updated_at else ""
        key = f"render-fail-{job.id}-{stamp}"
        items.append({
            "key": key,
            "title": "Tác vụ render lỗi",
            "message": job.error_message or f"Job #{job.id}",
            "href": f"/queue?status=failed&job={job.id}",
            "created_at": stamp,
            "read": key in read_keys,
        })

    for job in db.query(Job).filter(Job.status == "failed").order_by(Job.updated_at.desc()).limit(20).all():
        stamp = job.updated_at.isoformat() if job.updated_at else ""
        key = f"queue-fail-{job.id}-{stamp}"
        items.append({
            "key": key,
            "title": "Tác vụ hàng đợi lỗi",
            "message": job.kind or f"Job #{job.id}",
            "href": f"/queue?status=failed&job={job.id}",
            "created_at": stamp,
            "read": key in read_keys,
        })

    flow = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if flow is None or flow.status in ("unpaired", "lost", "") or not flow.heartbeat_at:
        key = "flow-offline"
        items.append({
            "key": key,
            "title": "Flow Connector",
            "message": "Chưa ghép hoặc mất heartbeat",
            "href": "/flow",
            "created_at": datetime.utcnow().isoformat(),
            "read": key in read_keys,
        })
    elif flow.heartbeat_at and (datetime.utcnow() - flow.heartbeat_at) > timedelta(minutes=2):
        key = f"flow-stale-{flow.heartbeat_at.isoformat()}"
        items.append({
            "key": key,
            "title": "Flow Connector",
            "message": "Heartbeat quá hạn",
            "href": "/flow",
            "created_at": flow.heartbeat_at.isoformat(),
            "read": key in read_keys,
        })

    items.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    unread = sum(1 for row in items if not row["read"])
    return {"items": items[:30], "unread": unread}


@router.post("/notifications/read")
def mark_notifications_read(payload: NotificationMarkRead = Body(...), db: Session = Depends(get_db)):
    settings = _get_global_settings(db)
    current = list(settings.get("notification_read_keys") or [])
    merged = list(dict.fromkeys([*current, *(payload.keys or [])]))
    settings["notification_read_keys"] = merged[-200:]
    _save_global_settings(db, settings)
    db.commit()
    return {"ok": True, "read": len(settings["notification_read_keys"])}


# ---------------------------------------------------------------------------
# Phân tích KPI (dữ liệu thật từ SQLite)
# ---------------------------------------------------------------------------

@router.get("/analytics")
def get_analytics(days: int = Query(0), db: Session = Depends(get_db)):
    cutoff = datetime.utcnow() - timedelta(days=days) if days and days > 0 else None

    def _in_range(value) -> bool:
        if cutoff is None or value is None:
            return cutoff is None
        return value >= cutoff

    projects = [p for p in db.query(Project).all() if _in_range(p.updated_at or p.created_at)]
    scenes = [s for s in db.query(Scene).all() if _in_range(s.updated_at or s.created_at)]
    jobs = [j for j in db.query(Job).all() if _in_range(j.updated_at or j.created_at)]
    renders = [r for r in db.query(RenderJob).all() if _in_range(r.updated_at or r.created_at)]
    connectors = [t for t in db.query(ConnectorTask).all() if _in_range(t.updated_at or t.created_at)]
    voices = [v for v in db.query(VoiceAsset).all() if cutoff is None or (v.created_at and v.created_at >= cutoff)]

    completed_projects = sum(1 for p in projects if p.status == "completed")
    failed_projects = sum(1 for p in projects if p.status == "failed")
    in_progress = sum(1 for p in projects if _project_bucket(p.status) == "producing")
    media_ready = sum(1 for s in scenes if (s.media_path or "") or s.status in ("media_ready", "done", "completed"))

    job_by_status = {
        "pending": 0, "running": 0, "waiting_for_review": 0,
        "completed": 0, "failed": 0, "cancelled": 0,
    }
    for job in jobs:
        if job.status in job_by_status:
            job_by_status[job.status] += 1
    for render in renders:
        mapped = "running" if render.status in PRODUCING_STATUSES else render.status
        if mapped in job_by_status:
            job_by_status[mapped] += 1

    completed_renders = [r for r in renders if r.status == "completed" and r.completed_at and r.started_at]
    total_render_seconds = sum((r.completed_at - r.started_at).total_seconds() for r in completed_renders)
    avg_render_minutes = (total_render_seconds / 60) / max(1, len(completed_renders))

    connector_failed = sum(1 for t in connectors if t.status == "failed")
    connector_total = len(connectors)
    flow_success_rate = (
        100.0 * (connector_total - connector_failed) / connector_total
        if connector_total else 0.0
    )

    tts_verified = sum(1 for v in voices if v.verify_state == "verified")
    tts_failed = sum(1 for v in voices if v.verify_state == "failed")
    tts_total = len(voices)
    render_failed = sum(1 for r in renders if r.status == "failed")
    render_total = len(renders)

    def _rate(ok: int, total: int) -> float:
        return round(100.0 * ok / total, 1) if total else 0.0

    return {
        "range_days": days,
        "projects": {
            "total": len(projects),
            "completed": completed_projects,
            "in_progress": in_progress,
            "failed": failed_projects,
        },
        "scenes": {"total": len(scenes), "media_ready": media_ready},
        "jobs": {
            "total": len(jobs) + len(renders),
            "completed": job_by_status["completed"],
            "failed": job_by_status["failed"],
            "by_status": job_by_status,
        },
        "render": {
            "avg_minutes": round(avg_render_minutes, 1) if completed_renders else 0,
            "total_seconds": round(total_render_seconds),
            "completed": len(completed_renders),
        },
        "flow": {
            "total_tasks": connector_total,
            "failed_tasks": connector_failed,
            "success_rate": round(flow_success_rate, 1),
        },
        "providers": [
            {
                "name": "Google Flow",
                "total": connector_total,
                "failed": connector_failed,
                "rate": _rate(connector_total - connector_failed, connector_total),
            },
            {
                "name": "TTS",
                "total": tts_total,
                "failed": tts_failed,
                "rate": _rate(tts_verified, tts_total),
            },
            {
                "name": "FFmpeg / Render",
                "total": render_total,
                "failed": render_failed,
                "rate": _rate(render_total - render_failed, render_total),
            },
        ],
    }


# ---------------------------------------------------------------------------
# Kiểm tra công cụ / chẩn đoán hệ thống (Engine & Công cụ)
# ---------------------------------------------------------------------------

@router.get("/system/diagnose")
def system_diagnose():
    """Kiểm tra công cụ đóng gói + quyền ghi + tài nguyên thật."""
    import psutil
    items: dict = {}
    items["backend"] = "FastAPI"
    items["ffmpeg_version"] = _tool_version(FFMPEG_BIN)
    items["ffprobe_version"] = _tool_version(FFPROBE_BIN)
    items["python_runtime"] = platform.python_version()
    items["os"] = f"{platform.system()} {platform.release()}"
    items["cpu"] = f"{psutil.cpu_count(logical=True)} cores"
    vm = psutil.virtual_memory()
    items["ram_gb"] = round(vm.total / (1024 ** 3), 1)
    items["write_permission_app_data"] = os.access(LOG_DIR, os.W_OK)
    items["write_permission_projects"] = os.access(PROJECTS_DIR, os.W_OK)
    items["demucs_available"] = bool(shutil.which("demucs"))
    items["yt_dlp_available"] = bool(shutil.which("yt-dlp"))
    disk = shutil.disk_usage(PROJECTS_DIR)

    items["disk_free_gb"] = round(disk.free / (1024 ** 3), 1)
    return items


def _tool_version(bin_path: str) -> str:
    import subprocess
    try:
        p = subprocess.run([bin_path, "-version"], capture_output=True,
                           text=True, timeout=10)
        first = (p.stderr or p.stdout or "").splitlines()[0]
        return first.replace("ffmpeg version", "").replace("ffprobe version", "").strip()
    except Exception:
        return ""
