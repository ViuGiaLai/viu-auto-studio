"""Flow Connector API routes — bridge between Viu Auto Studio and the Chrome Extension.

Luồng:
  FastAPI tạo ConnectorTask cho từng scene_id khi người dùng bấm "Bắt đầu render tự động"
  (media_source=flow). Extension đăng ký, poll /connector/tasks, nhận task, tự mở Google Flow,
  tạo project, chọn mode/aspect/model, nhập prompt, bấm tạo, theo dõi tile, tải file THẬT.
  Extension báo progress/complete/fail → backend xác minh file bằng FFprobe, gắn media_path
  vào đúng scene_id, cảnh lỗi được retry riêng (không chạy lại cảnh đã hoàn thành).

Không có mock, không có fallback ảnh giả.
"""
import json
import os
import re
import secrets
import shutil
import subprocess
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from sqlalchemy.orm import Session

from backend.core.config import DATA_DIR, FLOW_BOOTSTRAP_TOKEN, HOST, PORT, PROJECTS_DIR as _CFG_PROJECTS_DIR, FFPROBE_BIN
from backend.core.database import get_db
from backend.models import Channel, ConnectorTask, FlowConnection, PipelineState, Project, RenderJob, Scene
from backend.services.flow_factory import refresh_task_state, set_factory_state

router = APIRouter(prefix="/connector", tags=["flow-connector"])

PROJECTS_DIR = str(_CFG_PROJECTS_DIR)
WORKER_STATE_PATH = os.path.join(DATA_DIR, "connector_workers.json")


def _require_connector_token(value: str | None) -> None:
    if FLOW_BOOTSTRAP_TOKEN and not secrets.compare_digest(value or "", FLOW_BOOTSTRAP_TOKEN):
        raise HTTPException(403, "Flow Connector token không hợp lệ")


def _sync_pipeline_state(db: Session, project_id: int) -> None:
    state = db.query(PipelineState).filter(PipelineState.project_id == project_id).first()
    if not state:
        return
    scenes = db.query(Scene).filter(Scene.project_id == project_id).all()
    if not scenes:
        return
    tasks = db.query(ConnectorTask).filter(ConnectorTask.project_id == project_id).all()
    total = len(tasks) if tasks else len(scenes)
    ready = sum(1 for task in tasks if task.status == "completed") if tasks else sum(1 for scene in scenes if scene.media_path and os.path.isfile(scene.media_path))
    failed = sum(1 for task in tasks if task.status == "failed") + sum(1 for scene in scenes if scene.status == "media_failed" and not any(task.scene_id == scene.id for task in tasks))
    steps = json.loads(state.step_data_json or "{}")
    if failed:
        state.status = "failed"
        state.error_step = "Ảnh/Video"
        state.last_log = f"{failed} task/cảnh media lỗi; có thể retry riêng từng task."
        steps["Ảnh/Video"] = "failed"
    elif ready >= total:
        state.status = "media_ready"
        state.error_step = ""
        state.last_log = f"Đã xác minh media thật cho {ready}/{total} task media."
        steps["Ảnh/Video"] = "success"
    else:
        state.status = "processing"
        state.error_step = ""
        state.last_log = f"Đã xác minh media thật cho {ready}/{total} task media."
        steps["Ảnh/Video"] = f"{round(ready * 100 / total)}%"
    state.step_data_json = json.dumps(steps, ensure_ascii=False)
    db.commit()
    if ready >= total and not failed:
        _maybe_start_render(project_id)


def _maybe_start_render(project_id: int) -> None:
    """Start the real FFmpeg render once Factory has delivered every final asset."""
    from backend.core.database import SessionLocal
    from backend.pipeline.queue import pipeline
    from backend.services.tts import get_tts_config

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return
        scenes = db.query(Scene).filter(Scene.project_id == project_id).all()
        if not scenes or any(
            not scene.media_path or not os.path.isfile(scene.media_path)
            or not scene.audio_path or not os.path.isfile(scene.audio_path)
            for scene in scenes
        ):
            return
        existing = db.query(RenderJob).filter(RenderJob.project_id == project_id).all()
        if any(job.status in {"generating_voice", "voice_ready", "preparing_media", "media_ready", "generating_subtitles", "rendering"} for job in existing):
            return
        if any(job.status == "completed" and job.output_path and os.path.isfile(job.output_path) for job in existing):
            return
        project.status = "media_ready"
        project.current_step = "Media đã xác minh"
        db.commit()
        started = pipeline.start(project_id, {}, get_tts_config(db))
        if started.get("ok"):
            project.status = "rendering"
            project.current_step = "Dựng phim"
            project.error_message = ""
        else:
            project.status = "failed"
            project.error_message = started.get("message", "Không thể khởi động Dựng phim")
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.exception("Không thể tự khởi động render project %s: %s", project_id, exc)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Media verification helpers
# ---------------------------------------------------------------------------

def check_ffprobe(path: str):
    """Xác minh file media thật bằng ffprobe. Trả (ok: bool, info: dict)."""
    if not os.path.isfile(path):
        return False, {"error": "file không tồn tại"}
    try:
        r = subprocess.run(
            [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,width,height",
             "-of", "json", path],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return False, {"error": r.stderr.strip() or "ffprobe lỗi"}
        info = json.loads(r.stdout)
        fmt = info.get("format", {})
        size = int(fmt.get("size", 0))
        if size <= 0:
            return False, {"error": "file rỗng"}
        streams = [s for s in info.get("streams", [])]
        ok = True
        return ok, {"duration": float(fmt.get("duration") or 0), "size": size, "streams": streams}
    except Exception as e:
        return False, {"error": str(e)}


def detect_format(path: str):
    """Phát hiện định dạng THẬT của file qua magic bytes (không tin đuôi file).
    Trả (media_type: str, real_ext: str, info: dict | None)."""
    if not os.path.isfile(path):
        return "image", None, {"error": "file không tồn tại"}
    # Ưu tiên Pillow cho ảnh (chuẩn nhất với ảnh đơn khung); ffprobe chỉ cho video
    img_ext = None
    img_size = os.path.getsize(path)
    try:
        from PIL import Image
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            w, h = im.size
            fmt = str(im.format or "").lower()
        if fmt in ("png", "jpeg", "jpg", "webp", "gif"):
            ext_map = {"png": ".png", "jpeg": ".jpg", "jpg": ".jpg", "webp": ".webp", "gif": ".gif"}
            img_ext = ext_map[fmt]
            img_info = {"detected": fmt, "size": img_size, "width": w, "height": h}
    except Exception as e:
        img_info = {"error": "không mở được ảnh: " + str(e)}
    if img_ext:
        return "image", img_ext, img_info
    try:
        r = subprocess.run(
            [FFPROBE_BIN, "-v", "error", "-show_entries", "format=format_name,duration,size:stream=codec_type,width,height",
             "-of", "json", path],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode == 0:
            info = json.loads(r.stdout)
            fmt_name = str(info.get("format", {}).get("format_name") or "").lower()
            size = int(info.get("format", {}).get("size", 0))
            if size <= 0:
                return "image", None, {"error": "file rỗng"}
            streams = info.get("streams", [])
            # Video thật: container mp4/mov/webm + nhiều khung hoặc codec h264/hevp/vp9
            is_video = any(s.get("codec_type") == "video" for s in streams) and \
                not any(fmt_name == x for x in ("png_pipe", "mjpeg", "webp_pipe", "gif_pipe", "image2", "singlejpeg", "jpg_pipe", "smjpeg", "tiff_pipe", "bmp_pipe"))
            if is_video:
                return "video", ".mp4", info
            if any(s.get("codec_type") == "audio" for s in streams) and not is_video:
                return "audio", None, {"error": "file chỉ có âm thanh, không phải ảnh/video"}
    except Exception as e:
        pass
    with open(path, "rb") as f:
        head = f.read(16)
    if head.startswith(b"\xff\xd8"):
        return "image", ".jpg", {"detected": "jpeg", "size": os.path.getsize(path)}
    if head.startswith(b"\x89PNG"):
        return "image", ".png", {"detected": "png", "size": os.path.getsize(path)}
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", ".webp", {"detected": "webp", "size": os.path.getsize(path)}
    hdr = head[:8].hex()
    return "image", None, {"error": "không phải file ảnh hợp lệ (header: " + hdr + ")"}


def convert_to_jpeg(src: str, dest: str):
    """Chuyển mã thật PNG/WebP → JPEG bằng Pillow (không đổi đuôi suông)."""
    from PIL import Image
    img = Image.open(src)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    img.save(dest, "JPEG", quality=92)
    return dest


def verify_image(path: str):
    """Xác minh ảnh thật + phát hiện định dạng THẬT. Trả (ok, info gồm real_ext)."""
    if not os.path.isfile(path):
        return False, {"error": "file không tồn tại"}
    if os.path.getsize(path) < 1024:
        return False, {"error": "file quá nhỏ (<1KB)"}
    media_type, real_ext, info = detect_format(path)
    if not real_ext or media_type != "image":
        return False, info
    info["real_ext"] = real_ext
    return True, info


# ---------------------------------------------------------------------------
# Worker registration / state
# ---------------------------------------------------------------------------

def _load_workers() -> dict:
    if os.path.exists(WORKER_STATE_PATH):
        try:
            with open(WORKER_STATE_PATH) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_workers(workers: dict) -> None:
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(WORKER_STATE_PATH, "w") as f:
            json.dump(workers, f, ensure_ascii=False)
    except Exception:
        pass


@router.post("/register")
def connector_register(
    payload: dict,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Extension đăng ký worker với backend."""
    _require_connector_token(x_viu_flow_token)
    worker_id = str(payload.get("worker_id") or "").strip()
    if not worker_id:
        raise HTTPException(400, "worker_id bắt buộc")
    workers = _load_workers()
    workers[worker_id] = {
        "registered_at": datetime.utcnow().isoformat(),
        "last_seen": datetime.utcnow().isoformat(),
        "version": str(payload.get("version") or ""),
    }
    _save_workers(workers)
    return {"ok": True, "worker_id": worker_id}


@router.get("/worker/status")
def connector_worker_status(db: Session = Depends(get_db)):
    """Trạng thái kết nối extension (cho UI hiển thị badge)."""
    workers = _load_workers()
    return {
        "registered": bool(workers),
        "worker_count": len(workers),
        "latest_version": max((w.get("version") or "0") for w in workers.values()) if workers else None,
    }


# ---------------------------------------------------------------------------
# Task queue
# ---------------------------------------------------------------------------

LEASE_SECONDS = 120  # Worker mất kết nối > 2 phút → task được trả về hàng đợi


@router.get("/tasks/recent")
def recent_connector_tasks(
    limit: int = Query(8, ge=1, le=50),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """Read-only task history for the Desktop UI; never assigns or leases work."""
    query = db.query(ConnectorTask).order_by(ConnectorTask.updated_at.desc(), ConnectorTask.id.desc())
    if project_id is not None:
        query = query.filter(ConnectorTask.project_id == project_id)
    tasks = query.limit(limit).all()
    return [
        {
            "task_id": task.task_id,
            "project_id": task.project_id,
            "scene_id": task.scene_id,
            "scene_order": task.scene_order,
            "status": task.status,
            "phase": task.phase,
            "progress": task.progress or 0,
            "progress_message": task.progress_message or "",
            "media_type": task.media_type or "image",
            "aspect": task.aspect or "16:9",
            "model": task.model or "",
            "attempts": task.attempts or 0,
            "error": task.error or "",
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }
        for task in tasks
    ]


@router.get("/tasks")
def connector_tasks(
    worker_id: str,
    project_id: int,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    """Extension poll task chưa hoàn thành cho một project.
    - Project đang PAUSED → trả [].
    - Task assigned/in_progress mà worker chủ nhận CHƯA heartbeat trong LEASE_SECONDS →
      lease hết hạn, task được trả về pending cho worker khác/worker tái kết nối.
    - completed/cancelled task KHÔNG trả lại; failed hết attempts cũng không."""
    _require_connector_token(x_viu_flow_token)
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "project không tồn tại")
    # Check paused state in project settings
    paused = False
    try:
        from backend.services.media.config import get_labs_config
        cfg = get_labs_config(db)
        paused = bool(cfg.get("connector_paused") or False)
    except Exception:
        pass
    if paused:
        return []
    MAX_ATTEMPTS = 3
    # 1) Lease expiry: worker mất kết nối → trả task về pending
    workers = _load_workers()
    now = datetime.utcnow()
    for t in db.query(ConnectorTask).filter(
        ConnectorTask.project_id == project_id,
        ConnectorTask.status.in_(["assigned", "in_progress"]),
    ).all():
        w = workers.get(t.assigned_to or "") if t.assigned_to else None
        if w and t.updated_at:
            try:
                last = datetime.fromisoformat(w.get("last_seen") or "")
                if (now - last).total_seconds() > LEASE_SECONDS:
                    t.status = "pending"
                    t.updated_at = now
            except Exception:
                pass
    tasks = (
        db.query(ConnectorTask)
        .filter(
            ConnectorTask.project_id == project_id,
            ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying"]),
            ConnectorTask.attempts < MAX_ATTEMPTS,
        )
        .order_by(ConnectorTask.scene_order.asc())
        .all()
    )
    result = []
    for t in tasks:
        if t.status in ("pending", "retrying"):
            t.status = "assigned"
        else:
            t.attempts = (t.attempts or 0) + 1
        t.assigned_to = str(worker_id)
        t.updated_at = now
        scene = db.query(Scene).get(t.scene_id) if t.scene_id else None
        result.append({
            "task_id": t.task_id,
            "scene_id": t.scene_id,
            "scene_order": t.scene_order,
            "project_id": t.project_id,
            "project_name": project.name,
            "prompt": t.prompt,
            "style_prompt": (scene.style_prompt if scene else None),
            "transition_description": (scene.transition_description if scene else None),
            "media_type": t.media_type or "image",
            "aspect": t.aspect or getattr(project, "aspect_ratio", None) or "16:9",
            "model": t.model or "Nano Banana 2",
            "attempts": t.attempts or 0,
            "max_attempts": MAX_ATTEMPTS,
            "factory_session_id": t.factory_session_id or "",
            "stage": t.stage or "image",
            "reference_url": f"http://{HOST}:{PORT}/api/connector/tasks/{t.task_id}/reference" if (t.stage == "video" and scene and (scene.image_path or scene.media_path)) else None,
        })
    db.commit()
    return result


@router.get("/tasks/next")
def connector_next_task(
    worker_id: str,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Trả task kế tiếp của project Factory active cho Extension."""
    _require_connector_token(x_viu_flow_token)
    active = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if not active or active.factory_state not in {"ready", "processing", "generate_image", "generate_video"} or not active.factory_project_id:
        return {}
    project_ids = [
        row[0]
        for row in (
            db.query(ConnectorTask.project_id)
            .filter(
                ConnectorTask.project_id == active.factory_project_id,
                ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying"]),
                ConnectorTask.attempts < 3,
            )

            .order_by(ConnectorTask.updated_at.asc(), ConnectorTask.id.asc())
            .distinct()
            .all()
        )
        if row[0] is not None
    ]
    for project_id in project_ids:
        tasks = connector_tasks(worker_id=worker_id, project_id=project_id, db=db)
        if tasks:
            return tasks[0]
    return {}

@router.post("/projects/{project_id}/media-tasks/pause")
def media_tasks_pause(project_id: int, db: Session = Depends(get_db)):
    """Tạm dừng tạo media toàn project (task đang assigned vẫn chạy tới khi worker poll lần sau)."""
    try:
        from backend.services.media.config import save_labs_config
        save_labs_config(db, connector_paused=True)
    except Exception as e:
        raise HTTPException(500, f"không lưu được trạng thái: {e}")
    return {"ok": True, "paused": True}


@router.post("/projects/{project_id}/media-tasks/resume")
def media_tasks_resume(project_id: int, db: Session = Depends(get_db)):
    """Tiếp tục tạo media sau khi tạm dừng."""
    try:
        from backend.services.media.config import save_labs_config
        save_labs_config(db, connector_paused=False)
    except Exception as e:
        raise HTTPException(500, f"không lưu được trạng thái: {e}")
    return {"ok": True, "paused": False}


@router.post("/projects/{project_id}/media-tasks/cancel")
def media_tasks_cancel(project_id: int, db: Session = Depends(get_db)):
    """Hủy toàn bộ task chưa hoàn thành của project (pending/assigned/in_progress/retrying → cancelled).
    Task cancelled KHÔNG bao giờ được poll lại; cảnh đã hoàn thành không bị ảnh hưởng."""
    n = db.query(ConnectorTask).filter(
        ConnectorTask.project_id == project_id,
        ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying"]),
    ).update({"status": "cancelled"}, synchronize_session=False)
    db.commit()
    return {"ok": True, "cancelled": n}


@router.get("/projects/{project_id}/media-tasks/state")
def media_tasks_state(project_id: int, db: Session = Depends(get_db)):
    """Trạng thái tổng hợp media tasks của project (cho UI: đang chạy/tạm dừng/đã hủy/hoàn thành)."""
    paused = False
    try:
        from backend.services.media.config import get_labs_config
        cfg = get_labs_config(db)
        paused = bool(cfg.get("connector_paused") or False)
    except Exception:
        pass
    from sqlalchemy import func as sa_func
    counts = {}
    for s, cnt in db.query(ConnectorTask.status, sa_func.count(ConnectorTask.id)).filter(
        ConnectorTask.project_id == project_id
    ).group_by(ConnectorTask.status).all():
        counts[s] = cnt
    total = sum(counts.values())
    done = counts.get("completed", 0)
    cancelled = counts.get("cancelled", 0)
    failed = counts.get("failed", 0)
    state = "finished" if total and done + cancelled + failed == total else \
        ("paused" if paused else "running" if total - done - cancelled - failed > 0 else "idle")
    return {"state": state, "paused": paused, "counts": counts,
            "total": total, "completed": done, "cancelled": cancelled, "failed": failed}


@router.post("/tasks/{task_id}/progress")
def connector_task_progress(
    task_id: str,
    payload: dict,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_connector_token(x_viu_flow_token)
    t = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_id).first()
    if not t:
        raise HTTPException(404, "task không tồn tại")
    t.status = "in_progress"
    t.phase = str(payload.get("phase") or "")
    t.progress = int(payload.get("percent") or 0)
    t.progress_message = str(payload.get("message") or "")
    t.updated_at = datetime.utcnow()
    phase = t.phase.lower()
    factory_state = "generate_video" if "video" in phase else "generate_image" if "image" in phase else "processing"
    set_factory_state(db, factory_state, project_id=t.project_id, session_id=t.factory_session_id or None, commit=False)
    db.commit()
    return {"ok": True, "factory_state": factory_state}


@router.post("/tasks/{task_id}/complete")
def connector_task_complete(
    task_id: str,
    payload: dict,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_connector_token(x_viu_flow_token)
    """Extension báo hoàn thành + file thật (hoặc đường dẫn file đã tải).
    Backend xác minh file bằng FFprobe/kiểm tra header, chép vào thư mục scene,
    gắn media_path đúng scene_id. Cảnh lỗi KHÔNG bị chạy lại."""
    t = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_id).first()
    if not t:
        raise HTTPException(404, "task không tồn tại")
    if not t.scene_id:
        raise HTTPException(400, "task không gắn scene")

    local_path = str(payload.get("local_path") or "").strip()
    media_type_hint = str(payload.get("media_type") or t.media_type or "image").lower()
    bytes_size = int(payload.get("bytes") or 0)

    # 1. Xác minh file THẬT — phát hiện định dạng qua ffprobe/magic bytes,
    #    KHÔNG tin đuôi file. Nếu file là PNG mà yêu cầu .jpg thì chuyển mã thật sang JPEG.
    if media_type_hint == "image":
        verified, info = verify_image(local_path)
        media_type = "image"
    else:
        verified, info = check_ffprobe(local_path)
        media_type = "video"
    if not verified:
        t.status = "failed"
        t.error = "File không vượt qua xác minh: " + info.get("error", "unknown")
        t.updated_at = datetime.utcnow()
        db.commit()
        raise HTTPException(422, info.get("error", "file không hợp lệ"))

    # 2. Lưu vào thư mục scene với ĐUÔI ĐÚNG ĐỊNH DẠNG THẬT
    scene = db.query(Scene).get(t.scene_id)
    if not scene:
        raise HTTPException(404, "scene không tồn tại")
    project = db.query(Project).get(t.project_id)
    if not project:
        raise HTTPException(404, "project không tồn tại")
    project_root = project.project_directory or os.path.join(PROJECTS_DIR, f"project_{t.project_id}")
    proj_dir = os.path.join(project_root, "scenes")
    os.makedirs(proj_dir, exist_ok=True)
    if media_type == "video":
        ext = "mp4"
        dest_name = f"scene_{t.scene_id:03d}_flow_video.mp4"
        dest = os.path.join(proj_dir, dest_name)
        if os.path.isfile(dest):
            shutil.copy2(dest, dest + ".bak")
        shutil.copy2(local_path, dest)
    else:
        real_ext = info.get("real_ext", ".png")
        dest_name = f"scene_{t.scene_id:03d}_flow_image" + real_ext
        dest = os.path.join(proj_dir, dest_name)
        if os.path.isfile(dest):
            shutil.copy2(dest, dest + ".bak")
        if real_ext == ".jpg":
            # Nếu file gốc không phải JPEG (vd PNG) → chuyển mã thật sang JPEG
            if not open(local_path, "rb").read(2).startswith(b"\xff\xd8"):
                convert_to_jpeg(local_path, dest)
            else:
                shutil.copy2(local_path, dest)
        else:
            shutil.copy2(local_path, dest)

    # 3. Gắn asset vào scene; media_path luôn trỏ asset mới nhất để UI/library dùng ngay.
    scene.media_path = dest
    scene.media_type = media_type
    if media_type == "image":
        scene.image_path = dest
    else:
        scene.video_path = dest
    scene.status = "media_ready"
    scene.error_message = None
    t.status = "completed"
    t.file_path = dest
    t.result_json = json.dumps({"source": "flow", "stage": t.stage or media_type, "verified": info, "attempts": t.attempts}, ensure_ascii=False)
    t.updated_at = datetime.utcnow()

    # Factory Mode nối ảnh → video theo cùng scene và session, tuần tự để prompt video có ảnh tham chiếu thật.
    connection = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if media_type == "image" and t.stage == "image" and connection and connection.factory_session_id == t.factory_session_id and connection.factory_mode and connection.include_video:
        connection.factory_stage = "video"
        connection.factory_state = "ready"
        video_model = "Veo 3.1 Lite"
        try:
            channel_cfg = {}
            if project.channel_id:
                channel = db.query(Channel).filter(Channel.id == project.channel_id).first()
                if channel and channel.config_json:
                    channel_cfg = json.loads(channel.config_json) if isinstance(channel.config_json, str) else dict(channel.config_json)
            project_cfg = json.loads(project.config_json) if isinstance(project.config_json, str) and project.config_json else {}
            project_media = project_cfg.get("media") if isinstance(project_cfg.get("media"), dict) else {}
            video_model = str(project_media.get("video_model") or channel_cfg.get("video_model") or video_model)
        except (TypeError, ValueError):
            pass
        db.add(ConnectorTask(
            task_id=str(uuid.uuid4()),
            project_id=t.project_id,
            scene_id=t.scene_id,
            scene_order=t.scene_order,
            status="pending",
            stage="video",
            attempts=0,
            prompt=t.prompt,
            media_type="video",
            aspect=t.aspect,
            model=video_model,
            factory_session_id=t.factory_session_id,
        ))
    db.commit()
    _sync_pipeline_state(db, t.project_id)
    refresh_task_state(db, t.project_id)
    return {
        "ok": True,
        "scene_id": t.scene_id,
        "media_path": dest,
        "media_format": real_ext if media_type == "image" else "mp4",
        "verified": info,
        "attempts": t.attempts,
    }


@router.post("/tasks/{task_id}/fail")
def connector_task_fail(
    task_id: str,
    payload: dict,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_connector_token(x_viu_flow_token)
    """Extension báo task lỗi — cảnh sẽ được retry riêng khi backend tạo lại task,
    KHÔNG chạy lại cảnh đã hoàn thành."""
    t = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_id).first()
    if not t:
        raise HTTPException(404, "task không tồn tại")
    MAX_ATTEMPTS = 3
    t.error = str(payload.get("error") or "lỗi không xác định từ Flow Connector")
    t.attempts = (t.attempts or 0) + 1
    t.updated_at = datetime.utcnow()
    if t.attempts < MAX_ATTEMPTS:
        t.status = "retrying"
        t.error = "Lỗi " + str(t.attempts) + "/" + str(MAX_ATTEMPTS) + ": " + t.error
    else:
        t.status = "failed"
    if t.scene_id and t.status == "failed":
        scene = db.query(Scene).get(t.scene_id)
        if scene:
            scene.error_message = t.error
            scene.status = "media_failed"
    db.commit()
    _sync_pipeline_state(db, t.project_id)
    refresh_task_state(db, t.project_id)
    return {"ok": True, "task_id": task_id, "attempts": t.attempts}


@router.get("/tasks/{task_id}/reference")
def connector_task_reference(
    task_id: str,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_connector_token(x_viu_flow_token)
    task = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_id).first()
    if not task or not task.scene_id:
        raise HTTPException(404, "task không tồn tại hoặc không gắn scene")
    scene = db.query(Scene).get(task.scene_id)
    reference = (scene.image_path if scene else "") or (scene.media_path if scene else "")
    project = db.query(Project).filter(Project.id == task.project_id).first()
    project_root = os.path.realpath((project.project_directory if project and project.project_directory else os.path.join(PROJECTS_DIR, str(task.project_id))))
    reference_real = os.path.realpath(reference) if reference else ""
    try:
        inside_project = bool(reference_real) and os.path.commonpath([project_root, reference_real]) == project_root
    except ValueError:
        inside_project = False
    if not inside_project or not os.path.isfile(reference_real):
        raise HTTPException(404, "Chưa có ảnh tham chiếu đã xác minh cho video stage")
    reference = reference_real
    media_type = "image/jpeg" if reference.lower().endswith((".jpg", ".jpeg")) else "image/webp" if reference.lower().endswith(".webp") else "image/png"
    return FileResponse(reference, media_type=media_type, filename=os.path.basename(reference))


@router.post("/tasks/{task_id}/ingest")
async def connector_task_ingest(
    task_id: str,
    file: UploadFile,
    x_viu_flow_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_connector_token(x_viu_flow_token)
    """Extension upload file THẬT dạng multipart (vd: file trong
    Downloads/ViuAutoStudio/{task_id}/ hoặc Blob). Backend xác minh bằng
    ffprobe/magic bytes → lưu vào thư mục project → gắn đúng scene_id.
    Đuôi file được đặt theo ĐỊNH DẠNG THẬT, không theo đuôi extension gửi lên."""
    t = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_id).first()
    if not t or not t.scene_id:
        raise HTTPException(404, "task không tồn tại hoặc không gắn scene")
    tmp = os.path.join(DATA_DIR, "upload_tmp")
    os.makedirs(tmp, exist_ok=True)
    # Never use UploadFile.filename as a path. It is client-controlled and may
    # contain traversal characters or invalid Windows names.
    safe_suffix = os.path.splitext(os.path.basename(file.filename or "file"))[1].lower()
    if len(safe_suffix) > 12 or not re.fullmatch(r"\.[a-z0-9]{1,10}", safe_suffix):
        safe_suffix = ".upload"
    tmp_path = os.path.join(tmp, f"{uuid.uuid4().hex}{safe_suffix}")
    max_upload_bytes = 512 * 1024 * 1024
    total_bytes = 0
    with open(tmp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total_bytes += len(chunk)
            if total_bytes > max_upload_bytes:
                f.close()
                os.remove(tmp_path)
                raise HTTPException(413, "file upload vượt giới hạn 512 MB")
            f.write(chunk)
        if total_bytes < 1024:
            os.remove(tmp_path)
            raise HTTPException(422, "file quá nhỏ, không phải media thật")
    try:
        media_type = str((file.content_type or "image")).split("/")[0]
        media_type = media_type if media_type in ("image", "video") else "image"
        verified, info = verify_image(tmp_path) if media_type == "image" else check_ffprobe(tmp_path)
        if not verified:
            t.status = "failed"
            t.error = "File upload không vượt qua xác minh: " + info.get("error", "unknown")
            t.updated_at = datetime.utcnow()
            db.commit()
            raise HTTPException(422, info.get("error", "file không hợp lệ"))
        project = db.query(Project).get(t.project_id)
        if not project:
            raise HTTPException(404, "project không tồn tại")
        project_root = project.project_directory or os.path.join(PROJECTS_DIR, f"project_{t.project_id}")
        proj_dir = os.path.join(project_root, "scenes")
        os.makedirs(proj_dir, exist_ok=True)
        if media_type == "video":
            ext = "mp4"
            dest = os.path.join(proj_dir, f"scene_{t.scene_id:03d}_flow.mp4")
            shutil.copy2(tmp_path, dest)
        else:
            real_ext = info.get("real_ext", ".png")
            dest = os.path.join(proj_dir, f"scene_{t.scene_id:03d}_flow" + real_ext)
            if real_ext == ".jpg" and not open(tmp_path, "rb").read(2).startswith(b"\xff\xd8"):
                convert_to_jpeg(tmp_path, dest)
            else:
                shutil.copy2(tmp_path, dest)
        scene = db.query(Scene).get(t.scene_id)
        scene.media_path = dest
        scene.media_type = media_type
        if media_type == "image":
            scene.image_path = dest
        else:
            scene.video_path = dest
        scene.status = "media_ready"
        scene.error_message = None
        t.status = "completed"
        t.file_path = dest
        t.result_json = json.dumps({"source": "flow", "verified": info, "attempts": t.attempts}, ensure_ascii=False)
        t.updated_at = datetime.utcnow()
        db.commit()
        _sync_pipeline_state(db, t.project_id)
        refresh_task_state(db, t.project_id)
        return {
            "ok": True,
            "scene_id": t.scene_id,
            "media_path": dest,
            "media_format": "mp4" if media_type == "video" else str(info.get("real_ext") or ".png").lstrip(".") + ("" if False else ""),
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def create_media_tasks_payload(db: Session, project_id: int, scene: Scene, cfg: dict) -> dict:
    """Tạo ConnectorTask cho MỘT cảnh (dùng bởi endpoint sinh lại media từng cảnh)."""
    db.query(ConnectorTask).filter(
        ConnectorTask.project_id == project_id,
        ConnectorTask.scene_id == scene.id,
        ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying", "failed"]),
    ).delete(synchronize_session=False)
    db.commit()
    order = scene.order_index if scene.order_index is not None else 0
    db.add(ConnectorTask(
        task_id=str(uuid.uuid4()),
        project_id=project_id,
        scene_id=scene.id,
        scene_order=order,
        status="pending",
        attempts=0,
        prompt=str(scene.visual_prompt or "").strip(),
        media_type=str(cfg.get("labs_media_type") or "image").lower(),
        aspect=str(cfg.get("labs_aspect") or "16:9"),
        model=str(
            (cfg.get("labs_model_video") or "Veo 3.1 Lite")
            if str(cfg.get("labs_media_type") or "image") == "video"
            else (cfg.get("labs_model_image") or "Nano Banana 2")
        ),
    ))
    db.commit()
    return {"ok": True, "scene_id": scene.id}


# ---------------------------------------------------------------------------
# Media task creation (một lần bấm "Bắt đầu render tự động")
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/media-tasks")
def create_media_tasks(project_id: int, payload: dict, db: Session = Depends(get_db)):
    """Tạo ConnectorTask cho từng scene có visual_prompt. Xóa task cũ chưa hoàn thành
    để tạo lại (cảnh đã completed giữ file và KHÔNG tạo task mới)."""
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "project không tồn tại")
    scenes = (
        db.query(Scene)
        .filter(Scene.project_id == project_id)
        .order_by(Scene.order_index.asc())
        .all()
    )
    if not scenes:
        raise HTTPException(400, "project chưa có cảnh — chạy Phân cảnh AI thông minh trước")

    # 1. Xóa task chưa hoàn thành (cảnh đã completed/verified vẫn giữ media_path)
    db.query(ConnectorTask).filter(
        ConnectorTask.project_id == project_id,
        ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying", "failed"]),
    ).delete(synchronize_session=False)
    db.commit()

    # 2. Tạo task cho từng cảnh thiếu/failed media
    created, skipped = 0, 0
    for idx, scene in enumerate(scenes):
        # Cảnh đã có media thật đã xác minh → giữ nguyên, không tạo task
        if scene.media_path and os.path.isfile(scene.media_path) and os.path.getsize(scene.media_path) > 0:
            skipped += 1
            continue
        prompt = (scene.visual_prompt or "").strip()
        if not prompt:
            scene.status = "media_failed"
            scene.error_message = "Không có prompt hình cho cảnh này — chạy Phân cảnh AI thông minh trước"
            skipped += 1
            continue
        db.add(ConnectorTask(
            task_id=str(uuid.uuid4()),
            project_id=project_id,
            scene_id=scene.id,
            scene_order=idx,
            status="pending",
            attempts=0,
            prompt=prompt,
            media_type=str(payload.get("media_type") or "image").lower(),
            aspect=str(payload.get("aspect") or getattr(project, "aspect_ratio", None) or "16:9"),
            model=str(payload.get("model") or "Nano Banana 2"),
        ))
        scene.status = "media_pending"
        created += 1
    db.commit()

    # 3. Đánh dấu project đang chờ extension
    if created:
        project.status = "rendering" if getattr(project, "status", None) not in ("rendering",) else project.status
        db.commit()
    return {
        "ok": True,
        "created": created,
        "skipped_existing": skipped,
        "total_scenes": len(scenes),
        "instruction": "Cài extension Flow Connector và mở tab Google Flow — extension sẽ tự nhận task",
    }


@router.get("/projects/{project_id}/media-tasks")
def list_media_tasks(project_id: int, db: Session = Depends(get_db)):
    tasks = (
        db.query(ConnectorTask)
        .filter(ConnectorTask.project_id == project_id)
        .order_by(ConnectorTask.scene_order.asc())
        .all()
    )
    return [
        {
            "task_id": t.task_id,
            "scene_id": t.scene_id,
            "scene_order": t.scene_order,
            "status": t.status,
            "attempts": t.attempts,
            "phase": t.phase,
            "progress": t.progress,
            "progress_message": t.progress_message,
            "prompt": t.prompt,
            "media_type": t.media_type,
            "aspect": t.aspect,
            "model": t.model,
            "file_path": t.file_path,
            "error": t.error,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in tasks
    ]

# ---------------------------------------------------------------------------
# Extension config — Flow Connector đọc API URL động từ file này.
# Electron ghi file extension-config.json vào userData; backend cung cấp
# endpoint đọc nó để extension (options page) lấy được API URL chính xác.
# ---------------------------------------------------------------------------
@router.get("/extension-config")
def extension_config():
    """Trả API URL + thông tin backend cho Flow Connector Extension."""
    from backend.core.config import EXTENSION_CONFIG_FILE, HOST, PORT, FFMPEG_BIN, FFPROBE_BIN
    cfg = {"apiBaseUrl": f"http://{HOST}:{PORT}", "backendPort": PORT}
    if EXTENSION_CONFIG_FILE.exists():
        import json
        try:
            cfg.update(json.loads(EXTENSION_CONFIG_FILE.read_text()))
        except Exception:
            pass
    return cfg
