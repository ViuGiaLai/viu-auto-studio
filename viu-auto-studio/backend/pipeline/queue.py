"""Job queue manager — một video xử lý tại một thời điểm.

Trạng thái: draft, script_ready, script_approved, generating_voice,
voice_ready, preparing_media, media_ready, generating_subtitles, rendering,
completed, failed, cancelled.

Tính năng:
- Hủy tiến trình, thử lại, tiếp tục từ bước lỗi
- Không tạo lại những bước đã hoàn thành
- Khởi động lại ứng dụng vẫn đọc được trạng thái cũ (lưu vào SQLite)
"""

from __future__ import annotations

import json
import logging
import subprocess
import shutil
import threading

import time
import uuid

from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from backend.core.database import SessionLocal
from backend.core.config import PROJECTS_DIR, CRF, PRESET, FFPROBE_BIN

from backend.models import AppSetting, ConnectorTask, Project, RenderJob, Scene, Script, PipelineState, Timeline, TimelineClip

from backend.render.ffmpeg_engine import FFmpegEngine, RenderError, check_ffmpeg
from backend.schemas import RenderConfig, TTSConfigRequest
from backend.services.media import get_audio_duration
from backend.services.subtitles import generate_subtitles
from backend.services.tts import get_tts_config, synthesize as tts_synthesize

from backend.services.script_service import split_into_sentences
from backend.services.project_config import effective_project_config

log = logging.getLogger("viu.pipeline")


def verify_output_file(path: str, expected_fps: int | None = None) -> tuple[bool, dict, str]:
    """Verify the final container with FFprobe before marking a job completed."""
    output = Path(path)
    if not output.is_file() or output.stat().st_size <= 0:
        return False, {}, "File output không tồn tại hoặc rỗng"
    try:
        result = subprocess.run([
            FFPROBE_BIN, "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,width,height,r_frame_rate",
            "-of", "json", str(output),
        ], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return False, {}, result.stderr.strip()[:500] or "FFprobe không đọc được output"
        payload = json.loads(result.stdout or "{}")
        streams = payload.get("streams") or []
        format_info = payload.get("format") or {}
        video = next((item for item in streams if item.get("codec_type") == "video"), None)
        audio = next((item for item in streams if item.get("codec_type") == "audio"), None)
        duration = float(format_info.get("duration") or 0)
        if not video:
            return False, payload, "Output thiếu video stream"
        if not audio:
            return False, payload, "Output thiếu audio stream"
        if duration <= 0:
            return False, payload, "Output có duration không hợp lệ"
        if expected_fps and video.get("r_frame_rate"):
            try:
                numerator, denominator = str(video["r_frame_rate"]).split("/")
                actual_fps = float(numerator) / float(denominator or 1)
                if abs(actual_fps - expected_fps) > 1.0:
                    return False, payload, f"FPS output {actual_fps:.2f} không khớp {expected_fps}"
            except (ValueError, ZeroDivisionError):
                pass
        return True, payload, "Output đã được FFprobe xác minh"
    except (OSError, subprocess.SubprocessError, ValueError, TypeError) as exc:
        return False, {}, f"Không thể verify output bằng FFprobe: {exc}"


VALID_STATUSES = [

    "draft", "script_ready", "script_approved", "generating_voice",
    "voice_ready", "preparing_media", "media_ready", "generating_subtitles",
    "rendering", "completed", "failed", "cancelled",
]

ENGINE_PROFILES = {
    "basic": {"crf": 24, "preset": "veryfast"},
    "balanced": {"crf": 21, "preset": "medium"},
    "high": {"crf": 18, "preset": "slow"},
}

OUTPUT_PRESETS = {
    "youtube": (1920, 1080, 30),
    "shorts": (1080, 1920, 30),
    "square": (1080, 1080, 30),
    "4k": (3840, 2160, 30),
}


def output_size(project: Project | None, render_config: RenderConfig) -> tuple[int, int]:
    preset = str(render_config.output_preset or "youtube").lower()
    if preset in OUTPUT_PRESETS:
        return OUTPUT_PRESETS[preset][:2]
    return (1080, 1920) if (project and project.aspect_ratio == "9:16") else (1920, 1080)


SUBTITLE_STYLE_PRESETS = {
    "clean": {"font_size": 44, "primary_color": "#FFFFFF", "border_color": "#000000", "border_width": 2, "position": "bottom", "max_chars_per_line": 52},
    "bold": {"font_size": 56, "primary_color": "#FFFFFF", "border_color": "#000000", "border_width": 4, "position": "center", "max_chars_per_line": 38, "granularity": "phrase"},
    "cinematic": {"font_size": 42, "primary_color": "#FFFFFF", "border_color": "#000000", "border_width": 1, "position": "bottom", "max_chars_per_line": 48},
}


def _apply_engine_profile(db, render_config: dict) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == "engine_mode").first()
    mode = (row.value_encrypted if row and row.value_encrypted else "balanced").strip().lower()
    defaults = ENGINE_PROFILES.get(mode, ENGINE_PROFILES["balanced"])
    return {**defaults, **(render_config or {})}


def _render_config_for_project(db, project: Project, render_config: dict) -> dict:
    resolved = _apply_engine_profile(db, render_config)
    if "subtitle_config" not in (render_config or {}):
        style = str(effective_project_config(db, project).get("subtitle_style") or "default")
        preset = SUBTITLE_STYLE_PRESETS.get(style)
        if preset:
            resolved["subtitle_config"] = preset
    return resolved


def _tts_config_for_project(db, project: Project) -> dict:
    """Resolve global TTS settings plus channel/project voice overrides."""
    config = get_tts_config(db)
    merged = effective_project_config(db, project)
    provider = merged.get("tts_provider_override") or merged.get("tts_provider") or merged.get("provider")
    voice = merged.get("voice_override") or merged.get("voice")
    if provider:
        config["provider"] = str(provider)
    if voice:
        config["voice"] = str(voice)
    for key in ("speed", "volume", "duration", "audio_chunk_duration", "audio_chunk_threshold"):
        if merged.get(key) is not None:
            try:
                config[key] = float(merged[key])
            except (TypeError, ValueError):
                pass
    for key in (
        "reference_audio", "reference_text", "voice_clone_prompt", "voice_design",
        "model_name", "device", "normalize_text", "postprocess_output", "num_step",
    ):
        if merged.get(key) is not None and merged.get(key) != "":
            config[key] = merged[key]
    return config


STEPS = [

    ("generating_voice", 10),
    ("voice_ready", 20),
    ("preparing_media", 40),
    ("media_ready", 60),
    ("generating_subtitles", 75),
    ("rendering", 90),
]


class PipelineManager:
    """Owns the single concurrent render job process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop_flags: Dict[int, threading.Event] = {}
        self._threads: Dict[int, threading.Thread] = {}
        self._auto_threads: Dict[int, threading.Thread] = {}

    # ------------------------------------------------------------------
    @staticmethod
    def active_job(db) -> Optional[RenderJob]:
        return (
            db.query(RenderJob)
            .filter(RenderJob.status.in_(["generating_voice", "voice_ready", "preparing_media",
                                          "media_ready", "generating_subtitles", "rendering"]))
            .first()
        )

    @staticmethod
    def job_for_project(db, project_id: int) -> Optional[RenderJob]:
        return db.query(RenderJob).filter(RenderJob.project_id == project_id).first()

    # ------------------------------------------------------------------
    def start(self, project_id: int, render_config: dict, tts_config: dict) -> dict:
        """Create or resume a job for a project. Only ONE job runs at a time."""
        with self._lock:
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if project is None:
                    return {"ok": False, "message": f"Project {project_id} không tồn tại"}

                ffmpeg_check = check_ffmpeg()
                if not ffmpeg_check["ffmpeg"]:
                    return {"ok": False, "message": ffmpeg_check["guide"]}

                active = self.active_job(db)
                if active is not None and active.project_id != project_id:
                    return {
                        "ok": False,
                        "message": f"Đang xử lý project #{active.project_id}. "
                                   "Mỗi thời điểm chỉ một video được xử lý.",
                    }

                render_config = _render_config_for_project(db, project, render_config)
                tts_config = _tts_config_for_project(db, project)
                job = self.job_for_project(db, project_id)
                project_dir = Path(project.project_directory) if project.project_directory else (Path(PROJECTS_DIR) / f"project_{project_id}")
                project_dir.mkdir(parents=True, exist_ok=True)
                (project_dir / "assets").mkdir(parents=True, exist_ok=True)
                project.project_directory = str(project_dir.resolve())

                if job is None or job.status in ("completed", "failed", "cancelled", "draft", "pending"):

                    initial_status = project.status
                    if initial_status in ("completed", "failed", "cancelled", "idle", "draft", "script_ready"):
                        initial_status = "generating_voice"
                    job = RenderJob(
                        project_id=project_id,
                        status=initial_status,
                        progress=0,
                        started_at=datetime.utcnow(),
                        completed_at=None,
                        error_message="",
                        log_path=str(project_dir / "render.log"),
                        output_path=str(project_dir / "output.mp4"),
                    )
                    db.add(job)
                    db.flush()
                else:
                    job.started_at = datetime.utcnow()
                    job.completed_at = None
                    job.error_message = ""

                project.project_directory = str(project_dir.resolve())
                project.status = job.status or "generating_voice"

                db.commit()

                stop_event = threading.Event()
                self._stop_flags[job.id] = stop_event
                thread = threading.Thread(
                    target=self._run_job,
                    args=(job.id, project_id, render_config, tts_config, stop_event),
                    daemon=True,
                )
                self._threads[job.id] = thread
                thread.start()
                db.close()
                return {"ok": True, "job_id": job.id, "message": "Bắt đầu xử lý pipeline"}
            except Exception:  # noqa: BLE001
                db.rollback()
                db.close()
                raise

    # ------------------------------------------------------------------
    def cancel(self, job_id: int) -> dict:
        with self._lock:
            db = SessionLocal()
            try:
                job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
                if job is None:
                    return {"ok": False, "message": "Job không tồn tại"}
                stop = self._stop_flags.get(job.id)
                if stop:
                    stop.set()
                job.status = "cancelled"
                db.commit()
                return {"ok": True, "message": "Đã hủy tiến trình"}
            finally:
                db.close()

    def retry(self, job_id: int, render_config: dict, tts_config: dict) -> dict:
        """Retry a failed/cancelled job, skipping completed steps."""
        with self._lock:
            db = SessionLocal()
            try:
                job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
                if job is None:
                    return {"ok": False, "message": "Job không tồn tại"}
                # Chặn retry trùng lặp: job đang chạy (thread còn sống hoặc trạng thái
                # chưa phải failed/cancelled/pending) thì từ chối ngay, tránh ghi đè
                # output.mp4 gây hỏng file đầu ra.
                running_thread = self._threads.get(job.id)
                if running_thread is not None and running_thread.is_alive():
                    return {"ok": False, "message": "Job đang chạy — không thử lại được. Hãy đợi tiến trình hiện tại kết thúc."}
                if job.status not in ("failed", "cancelled"):
                    # Phục hồi job đang treo (vd. server bị restart giữa chừng)
                    job.status = "pending"
                    job.error_message = ""
                    job.progress = 0
                    job.started_at = None
                    db.commit()
                job.error_message = ""
                job.completed_at = None
                # Xóa output cũ có thể bị hỏng/trễ để tránh file cũ nằm lại khi
                # render mới chưa kịp ghi xong (dư file từ lần chạy trước).
                if job.output_path and Path(job.output_path).exists():
                    try:
                        Path(job.output_path).unlink()
                    except OSError:
                        pass
                project = db.query(Project).filter(Project.id == job.project_id).first()
                if not project:
                    return {"ok": False, "message": "Project không tồn tại"}
                render_config = _render_config_for_project(db, project, render_config)
                tts_config = _tts_config_for_project(db, project)
                # Start from the step after the last completed one

                if job.current_step in ("voice_ready",):
                    next_step = "preparing_media"
                elif job.current_step in ("media_ready", "subtitle_ready"):
                    next_step = "generating_subtitles"
                elif job.current_step in ("failed", "cancelled", "draft") or not job.current_step:
                    next_step = "generating_voice"
                else:
                    next_step = job.current_step
                job.status = next_step
                job.started_at = datetime.utcnow()
                db.commit()

                stop_event = threading.Event()
                self._stop_flags[job.id] = stop_event
                thread = threading.Thread(
                    target=self._run_job,
                    args=(job.id, job.project_id, render_config, tts_config, stop_event),
                    daemon=True,
                )
                self._threads[job.id] = thread
                thread.start()
                return {"ok": True, "message": "Bắt đầu thử lại từ bước " + next_step}
            finally:
                db.close()

    # ------------------------------------------------------------------
    @staticmethod
    def status(job_id: int) -> dict:
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if job is None:
                return {"ok": False, "message": "Job không tồn tại"}
            project = db.query(Project).filter(Project.id == job.project_id).first()
            output_preview = ""
            if job.output_path and Path(job.output_path).exists():
                preview_path = Path(job.output_path).parent / "preview.mp4"
                output_preview = str(preview_path)
            return {
                "ok": True,
                "job": {
                    "id": job.id,
                    "project_id": job.project_id,
                    "status": job.status,
                    "progress": job.progress,
                    "current_step": job.current_step,
                    "error_message": job.error_message,
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                    "output_path": job.output_path,
                    "log_path": job.log_path,
                    "project_name": project.name if project else "",
                },
            }
        finally:
            db.close()

    # ------------------------------------------------------------------
    def read_tail_log(self, job_id: int, lines: int = 50) -> dict:
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if job is None or not job.log_path or not Path(job.log_path).exists():
                return {"ok": True, "lines": []}
            tail = Path(job.log_path).read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
            return {"ok": True, "lines": tail}
        finally:
            db.close()

    # ==================================================================
    # Studio v2: Auto Production Pipeline
    # ==================================================================
    def start_auto_production(self, project_id: int, *, prepare_only: bool = False) -> dict:
        """Start the fully automated Studio v2 pipeline exactly once per project."""
        with self._lock:
            existing = self._auto_threads.get(project_id)
            if existing is not None and existing.is_alive():
                return {"ok": True, "already_running": True}
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if not project:
                    return {"ok": False, "message": "Project not found"}

                state = db.query(PipelineState).filter(PipelineState.project_id == project_id).first()
                if not state:
                    state = PipelineState(project_id=project_id)
                    db.add(state)

                state.status = "processing"
                db.commit()

                thread = threading.Thread(
                    target=self._run_auto_production,
                    args=(project_id, prepare_only),
                    daemon=True,
                    name=f"auto-production-{project_id}",
                )
                self._auto_threads[project_id] = thread
                thread.start()
                return {"ok": True, "already_running": False}
            finally:
                db.close()

    def _run_auto_production(self, project_id: int, prepare_only: bool = False) -> None:
        """Run the real preparation stages and enqueue media work for Flow.

        This stage never simulates progress or marks a project failed just because
        an external connector is not available. It leaves an explicit waiting
        state with an actionable log instead.
        """
        db = SessionLocal()
        state = None
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            state = db.query(PipelineState).filter(PipelineState.project_id == project_id).first()
            script = db.query(Script).filter(Script.project_id == project_id).first()
            if not project or not state or not script:
                return
            project.status = "preparing_media"
            project.current_step = "Phân cảnh Visual"
            project.progress = 25
            db.commit()

            def update_step(step_name: str, status: str) -> None:
                steps = json.loads(state.step_data_json or "{}")
                steps[step_name] = status
                state.step_data_json = json.dumps(steps, ensure_ascii=False)
                db.commit()

            update_step("Kịch bản", "success")
            update_step("Storyboard", "running")
            scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index.asc()).all()
            if not scenes:
                sentences = split_into_sentences(script.full_script or "")
                for i, text in enumerate(sentences):
                    db.add(Scene(project_id=project_id, order_index=i, narration=text, subtitle_text=text, status="pending"))
                db.commit()
                scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index.asc()).all()
            if not scenes:
                raise RuntimeError("Không thể tạo phân cảnh từ kịch bản trống")
            update_step("Storyboard", "success")

            update_step("Lồng tiếng", "running")
            tts_config = _tts_config_for_project(db, project)
            for scene in scenes:
                if scene.audio_path and Path(scene.audio_path).exists():
                    continue
                project_dir = Path(project.project_directory) if project.project_directory else (Path(PROJECTS_DIR) / f"project_{project_id}")
                audio_path = str(project_dir / f"scene_{scene.order_index:03d}_voice.mp3")
                Path(audio_path).parent.mkdir(parents=True, exist_ok=True)
                tts_synthesize(scene.narration or scene.subtitle_text, audio_path, tts_config)
                scene.audio_path = audio_path
                scene.status = "voice_ready"
            db.commit()
            update_step("Lồng tiếng", "success")
            project.status = "preparing_media"
            project.current_step = "Media"
            project.progress = 50
            db.commit()

            missing_prompts = [scene for scene in scenes if not (scene.visual_prompt or "").strip()]
            if missing_prompts:
                state.status = "waiting_for_review"
                state.error_step = "Ảnh/Video"
                state.last_log = "Cần chạy Phân tích phân cảnh AI để tạo visual prompt trước khi gửi task sang Flow."
                update_step("Ảnh/Video", "waiting_for_review")
                db.commit()
                return

            if prepare_only:
                # Revo-compatible hand-off: scene prompts and voice are ready;
                # the project editor now creates the sole session-bound Factory
                # run. Never enqueue anonymous connector tasks here.
                state.status = "waiting_for_review"
                state.error_step = ""
                state.last_log = "Phân cảnh và giọng đã sẵn sàng; đang chuyển sang Flow Factory của dự án."
                update_step("Ảnh/Video", "pending")
                db.commit()
                return

            update_step("Ảnh/Video", "running")
            db.query(ConnectorTask).filter(
                ConnectorTask.project_id == project_id,
                ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying", "failed"]),
            ).delete(synchronize_session=False)
            created = 0
            for index, scene in enumerate(scenes):
                if scene.media_path and Path(scene.media_path).is_file() and Path(scene.media_path).stat().st_size > 0:
                    continue
                db.add(ConnectorTask(
                    task_id=str(uuid.uuid4()),
                    project_id=project_id,
                    scene_id=scene.id,
                    scene_order=index,
                    status="pending",
                    attempts=0,
                    prompt=scene.visual_prompt.strip(),
                    media_type="image",
                    aspect=project.aspect_ratio or "16:9",
                    model="Nano Banana 2",
                ))
                scene.status = "media_pending"
                created += 1
            state.status = "processing" if created else "waiting_for_review"
            project.status = "preparing_media" if created else "media_ready"
            project.current_step = "Media" if created else "Media đã xác minh"
            project.progress = 60 if created else 70
            state.error_step = ""
            state.last_log = f"Đã xếp {created} media task cho Flow Connector." if created else "Media đã sẵn sàng; có thể chạy render."
            update_step("Ảnh/Video", "waiting_for_review" if created else "success")
            db.commit()
        except Exception as exc:  # noqa: BLE001
            log.exception("Auto production failed")
            if state:
                state.status = "failed"
                state.error_step = state.error_step or "Lồng tiếng"
                if project:
                    project.status = "failed"
                    project.current_step = state.error_step
                state.last_log = str(exc)
                db.commit()
        finally:
            db.close()
            self._auto_threads.pop(project_id, None)

    # ==================================================================
    # Internal runner
    # ==================================================================
    def _run_job(self, job_id: int, project_id: int, render_config: dict, tts_config: dict, stop: threading.Event) -> None:
        db = SessionLocal()
        try:
            self._execute_steps(db, job_id, project_id, render_config, tts_config, stop)
        except Exception as exc:  # noqa: BLE001
            log.exception("Pipeline error")
            self._fail(db, job_id, str(exc))
        finally:
            db.close()
            self._stop_flags.pop(job_id, None)
            # Dọn thread khỏi map sau khi job kết thúc — nếu không, guard chống
            # retry trùng lặp sẽ chặn mọi lần retry sau này của job này.
            self._threads.pop(job_id, None)

    def _set_status(self, db, job_id: int, status: str, progress: int, step: str = "") -> None:
        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        if job is None:
            return
        project = db.query(Project).filter(Project.id == job.project_id).first()
        job.status = status
        job.progress = progress
        job.current_step = step
        db.flush()
        if project is not None:
            project.status = status
            project.progress = progress
            project.current_step = step
        db.commit()

    def _fail(self, db, job_id: int, message: str) -> None:
        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        # Preserve the executable stage so Retry resumes exactly where the
        # failure happened (voice/media/subtitles/render), without repeating
        # already verified Flow media or completed voice work.
        resume_step = job.status if job and job.status in {
            "generating_voice", "preparing_media", "media_ready",
            "generating_subtitles", "rendering",
        } else "failed"
        self._set_status(db, job_id, "failed", 0, resume_step)
        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        if job is not None:
            job.error_message = message
            db.commit()
        project = db.query(Project).filter(Project.id == (job.project_id if job else 0)).first()
        if project is not None:
            project.status = "failed"
            project.error_message = message
            db.commit()

    def _check_stop(self, db, job_id: int, stop: threading.Event) -> bool:
        if stop.is_set():
            self._set_status(db, job_id, "cancelled", 0, "cancelled")
            return True
        return False

    # ------------------------------------------------------------------
    def _execute_steps(self, db, job_id: int, project_id: int, render_config: dict, tts_config: dict, stop: threading.Event) -> None:
        render_cfg = RenderConfig(**(render_config or {}))
        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        project = db.query(Project).filter(Project.id == project_id).first()
        project_dir = Path(project.project_directory) if project and project.project_directory else (Path(PROJECTS_DIR) / f"project_{project_id}")
        project_dir.mkdir(parents=True, exist_ok=True)
        log_path = project_dir / "render.log"
        engine = FFmpegEngine(log_path=str(log_path))
        start_status = job.status if job else "generating_voice"

        # Canvas dimensions
        width, height = output_size(project, render_cfg)

        scenes = (
            db.query(Scene).filter(Scene.project_id == project_id)
            .order_by(Scene.order_index).all()
        )

        # Check if all scenes already have voice audio and media ready
        all_voices_ready = bool(scenes and all(
            (s.audio_path and Path(s.audio_path).exists()) or not (s.narration or "").strip()
            for s in scenes
        ))
        all_media_ready = bool(scenes and all(
            (s.media_path and Path(s.media_path).exists()) or
            (s.video_path and Path(s.video_path).exists()) or
            (s.image_path and Path(s.image_path).exists())
            for s in scenes
        ))

        # If everything is already in place from Dựng phim, jump straight to subtitles or rendering
        if start_status == "generating_voice" and all_voices_ready:
            if all_media_ready:
                start_status = "generating_subtitles" if render_cfg.enable_subtitles else "rendering"
            else:
                start_status = "preparing_media"

        # ------------------------------------------------------------------
        # Step 1: voice
        # ------------------------------------------------------------------
        if start_status in ("generating_voice",):
            self._set_status(db, job_id, "generating_voice", 10, "Tạo giọng đọc")
            script = db.query(Script).filter(Script.project_id == project_id).first()
            scenes = (
                db.query(Scene).filter(Scene.project_id == project_id)
                .order_by(Scene.order_index).all()
            )
            if not scenes or not script:
                self._fail(db, job_id, "Chưa có kịch bản hoặc phân cảnh cho project này")
                return

            for scene in scenes:
                if self._check_stop(db, job_id, stop):
                    return
                if scene.status in ("voice_ready", "media_ready", "done") and scene.audio_path and Path(scene.audio_path).exists():
                    continue  # skip completed scenes
                audio_path = str(log_path.parent / f"scene_{scene.order_index:03d}_voice.mp3")
                try:
                    tts_synthesize(scene.narration, audio_path, tts_config)
                    scene.audio_path = audio_path
                    scene.status = "voice_ready"
                    db.flush()
                    db.commit()
                except Exception as exc:  # noqa: BLE001
                    scene.error_message = str(exc)
                    scene.status = "error"
                    db.commit()
                    self._fail(db, job_id, f"Voice lỗi ở cảnh {scene.order_index}: {exc}")
                    return

            # Recompute durations from REAL audio (FFprobe, bắt buộc)
            for scene in scenes:
                if scene.audio_path and Path(scene.audio_path).exists():
                    scene.duration = max(1.5, get_audio_duration(scene.audio_path) + 0.3)
                else:
                    scene.duration = max(1.5, len((scene.narration or "").split()) / 2.5 + 0.3)

            self._set_status(db, job_id, "voice_ready", 20, "Hoàn tất giọng đọc")

        # ------------------------------------------------------------------
        # Step 2: prepare media (images/videos)
        # ------------------------------------------------------------------
        if start_status in ("generating_voice", "voice_ready", "preparing_media"):
            self._set_status(db, job_id, "preparing_media", 35, "Chuẩn bị hình ảnh")
            scenes = (
                db.query(Scene).filter(Scene.project_id == project_id)
                .order_by(Scene.order_index).all()
            )
            project = db.query(Project).filter(Project.id == project_id).first()

            total = len(scenes)
            for idx, scene in enumerate(scenes):
                if self._check_stop(db, job_id, stop):
                    return
                # Cập nhật tiến độ theo từng cảnh (35–55%) — tránh giao diện trông bị treo
                scene_progress = 35 + int((idx + 1) / max(total, 1) * 20)
                self._set_status(db, job_id, "preparing_media", scene_progress, "Chuẩn bị hình ảnh")
                if scene.status in ("media_ready", "done") and scene.media_path and Path(scene.media_path).exists():
                    continue
                if not scene.media_path or not Path(scene.media_path).exists():
                    # Sinh media AI thật từ visual_prompt (đã được AI phân tích ngữ nghĩa).
                    # Trình tự provider: UTO Flow (labs.google/fx — nguồn chính) → Pollinations.ai
                    # (CHỈ khi người dùng bật cho phép). Gemini chỉ dùng cho kịch bản/chia cảnh.
                    # KHÔNG fallback âm thầm sang nền màu — báo lỗi rõ ràng + cho thử lại.
                    prompt = (scene.visual_prompt or "").strip()
                    if not prompt:
                        # Cảnh chưa có prompt — KHÔNG fail toàn bộ pipeline, nhưng báo lỗi rõ.
                        scene.error_message = "Cảnh chưa có prompt ảnh — hãy sửa prompt trong Storyboard rồi thử lại"
                        scene.status = "error"
                        db.commit()
                        self._fail(
                            db, job_id,
                            f"Cảnh {scene.order_index} chưa có prompt ảnh — hãy sửa trong Storyboard rồi thử lại",
                        )
                        return
                    img_path = str(log_path.parent / f"scene_{scene.order_index:03d}_ai.jpg")
                    portrait = (project and project.aspect_ratio == "9:16")
                    from backend.services.media.config import get_labs_config

                    cfg = get_labs_config(db)
                    made = False
                    errors: list[str] = []

                    # 1) UTO Flow — nguồn tạo ảnh/video CHÍNH (labs.google/fx Nano Banana 2).
                    # Gemini chỉ phục vụ viết kịch bản/chia cảnh — KHÔNG sinh ảnh.
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
                                log.info("Cảnh %s: đã sinh ảnh AI từ UTO Flow", scene.order_index)
                                made = True
                        except UTOFlowAuthError as exc:
                            errors.append(f"UTO Flow chưa đăng nhập Google: {exc}")
                        except UTOFlowTimeoutError as exc:
                            errors.append(f"UTO Flow timeout: {exc}")
                        except Exception as exc:  # noqa: BLE001
                            errors.append(f"UTO Flow thất bại: {exc}")

                    # 2) Pollinations.ai — CHỈ khi người dùng bật cho phép fallback
                    if not made and cfg.get("pollinations_fallback"):
                        try:
                            from backend.services.media import generate_ai_image

                            generate_ai_image(
                                prompt, img_path, width=width, height=height,
                                negative_prompt=scene.negative_prompt or "",
                            )
                            scene.media_path = img_path
                            scene.media_type = "image"
                            log.info("Cảnh %s: đã sinh ảnh AI tự động (Pollinations)", scene.order_index)
                            made = True
                        except Exception as exc:  # noqa: BLE001
                            errors.append(f"Pollinations thất bại: {exc}")

                    if not made:
                        # Báo lỗi RÕ RÀNG — KHÔNG ghi nền màu âm thầm. Người dùng bấm
                        # "Thử lại" sau khi khắc phục (chờ quota / nhập key / bật Labs).
                        detail = "; ".join(errors) if errors else "Không có nguồn ảnh AI nào được bật"
                        scene.error_message = detail
                        scene.status = "error"
                        db.commit()
                        self._fail(
                            db, job_id,
                            f"Sinh ảnh AI cảnh {scene.order_index} thất bại: {detail} — "
                            "hãy đăng nhập Google Labs (UTO Flow) hoặc kiểm tra cài đặt "
                            "trong Cài đặt → AI rồi bấm Thử lại",
                        )
                        return
                    scene.error_message = ""
                # Generate voice now if the scene still has no audio (resume path)
                if not scene.audio_path or not Path(scene.audio_path).exists():
                    settings = get_tts_config(db)
                    audio_path = str(log_path.parent / f"scene_{scene.order_index:03d}_voice.mp3")
                    try:
                        tts_synthesize(scene.narration, audio_path, settings)
                        scene.audio_path = audio_path
                    except RuntimeError as exc:
                        scene.error_message = str(exc)
                        scene.status = "error"
                        db.commit()
                        self._fail(db, job_id, f"Voice lỗi ở cảnh {scene.order_index}: {exc}")
                        return
                scene.status = "media_ready"
                db.commit()

            self._set_status(db, job_id, "media_ready", 60, "Hoàn tất media")

        # ------------------------------------------------------------------
        # Step 3: subtitles (timing from real audio)
        # ------------------------------------------------------------------
        if start_status in ("generating_voice", "voice_ready", "preparing_media",
                            "media_ready", "generating_subtitles"):
            self._set_status(db, job_id, "generating_subtitles", 70, "Tạo phụ đề")
            scenes = (
                db.query(Scene).filter(Scene.project_id == project_id)
                .order_by(Scene.order_index).all()
            )
            cursor = 0.0
            for scene in scenes:
                if self._check_stop(db, job_id, stop):
                    return
                scene_dir = Path(log_path.parent) / f"scene_{scene.order_index:03d}"
                scene_dir.mkdir(parents=True, exist_ok=True)
                try:
                    result = generate_subtitles(
                        text=scene.subtitle_text or scene.narration,
                        audio_path=scene.audio_path,
                        output_dir=str(scene_dir),
                        config=render_cfg.subtitle_config,
                        scene_start=cursor,
                        canvas_width=width,
                        canvas_height=height,
                    )
                    scene.start_time = cursor
                    scene.end_time = cursor + scene.duration
                    cursor = scene.end_time
                    scene.status = "subtitle_ready"
                    db.commit()
                except Exception as exc:  # noqa: BLE001
                    scene.error_message = str(exc)
                    scene.status = "error"
                    db.commit()
                    self._fail(db, job_id, f"Phụ đề lỗi ở cảnh {scene.order_index}: {exc}")
                    return

            # build a global ASS from all scene subtitles
            all_entries_lines: list[str] = []
            from backend.services.subtitles import _ass_timecode
            for scene in scenes:
                ass_file = Path(log_path.parent) / f"scene_{scene.order_index:03d}" / "subtitles.ass"
                if ass_file.exists():
                    all_entries_lines.append(ass_file.read_text(encoding="utf-8"))
            self._set_status(db, job_id, "media_ready", 80, "Hoàn tất phụ đề")

        # ------------------------------------------------------------------
        # Step 4: render per-scene clips + final composite
        # ------------------------------------------------------------------
        self._set_status(db, job_id, "rendering", 85, "Render video")
        scenes = (
            db.query(Scene).filter(Scene.project_id == project_id)
            .order_by(Scene.order_index).all()
        )
        project = db.query(Project).filter(Project.id == project_id).first()
        width, height = output_size(project, render_cfg)

        # Timeline is the source of truth after the user edits the CapCut-like editor.
        # If no timeline exists, preserve the original scene-driven behavior.
        timeline = db.query(Timeline).filter(
            Timeline.project_id == project_id,
            Timeline.autosave == True,  # noqa: E712
        ).order_by(Timeline.version.desc()).first()
        render_items: list[dict] = []
        timeline_music_path = ""
        timeline_music_volume = render_cfg.music_volume
        # Version 1 is only the generated editor draft. Render directly from
        # freshly measured scene/voice durations so an earlier timeline read
        # cannot freeze stale timings. Version >= 2 is an explicit user edit
        # and therefore becomes authoritative.
        if timeline and int(timeline.version or 1) >= 2:
            visual_clips = db.query(TimelineClip).filter(
                TimelineClip.timeline_id == timeline.id,
                TimelineClip.track == "visual",
            ).order_by(TimelineClip.clip_start, TimelineClip.order_index).all()
            voice_clips = db.query(TimelineClip).filter(
                TimelineClip.timeline_id == timeline.id,
                TimelineClip.track == "voice",
            ).order_by(TimelineClip.clip_start, TimelineClip.order_index).all()
            music_clip = db.query(TimelineClip).filter(
                TimelineClip.timeline_id == timeline.id,
                TimelineClip.track == "music",
            ).order_by(TimelineClip.clip_start, TimelineClip.order_index).first()
            if music_clip and music_clip.source_path and Path(music_clip.source_path).exists():
                timeline_music_path = music_clip.source_path
                timeline_music_volume = float(music_clip.volume if music_clip.volume is not None else render_cfg.music_volume)
            for clip in visual_clips:
                scene = db.query(Scene).filter(Scene.id == clip.scene_id).first() if clip.scene_id else None
                source = clip.source_path or (scene.video_path or scene.image_path or scene.media_path if scene else "")
                if not source and not scene:
                    continue
                transform = {}
                try:
                    transform = json.loads(clip.transform_json or "{}")
                except (TypeError, ValueError):
                    transform = {}
                voice_clip = next((voice for voice in voice_clips if (
                    (clip.scene_id and voice.scene_id == clip.scene_id)
                    or (clip.group_id and voice.group_id == clip.group_id)
                )), None)
                render_items.append({
                    "scene": scene,
                    "source": source,
                    "media_type": ("video" if source.lower().endswith((".mp4", ".mov", ".webm", ".mkv")) else (scene.media_type if scene else "image")),
                    "audio": (voice_clip.source_path if voice_clip and voice_clip.source_path else (scene.audio_path if scene else "")),
                    "audio_volume": float(voice_clip.volume if voice_clip and voice_clip.volume is not None else 1.0),
                    "duration": max(0.1, float(clip.clip_end or 0.0) - float(clip.clip_start or 0.0)),
                    "effect": str(transform.get("effect") or (scene.effect if scene else "zoom_in")),
                    "transition": str(transform.get("transition") or "auto"),
                    "scale": float(transform.get("scale") or 1.0),
                    "x": float(transform.get("x") or 0.0),
                    "y": float(transform.get("y") or 0.0),
                })
        if not render_items:
            render_items = []
            for scene in scenes:
                raw_shots = []
                try:
                    if hasattr(scene, "shots_json") and scene.shots_json:
                        raw_shots = json.loads(scene.shots_json)
                except Exception:
                    raw_shots = []

                if raw_shots and len(raw_shots) > 1:
                    # Multi-Shots scene: Render each visual shot, audio is attached to first shot
                    for s_idx, s in enumerate(raw_shots):
                        s_source = s.get("video_path") or s.get("image_path") or s.get("media_path") or scene.media_path
                        s_dur = float(s.get("duration") or (scene.duration / len(raw_shots)))
                        s_type = "video" if s_source and str(s_source).lower().endswith((".mp4", ".mov", ".webm", ".mkv")) else (s.get("media_type") or "image")
                        render_items.append({
                            "scene": scene,
                            "source": s_source,
                            "media_type": s_type,
                            "audio": scene.audio_path if s_idx == 0 else "",
                            "audio_volume": 1.0,
                            "duration": s_dur,
                            "effect": s.get("effect") or scene.effect or "zoom_in",
                            "transition": "auto",
                            "scale": 1.0,
                            "x": 0.0,
                            "y": 0.0,
                        })
                else:
                    render_items.append({
                        "scene": scene,
                        "source": scene.media_path,
                        "media_type": scene.media_type or "image",
                        "audio": scene.audio_path,
                        "audio_volume": 1.0,
                        "duration": scene.duration,
                        "effect": scene.effect or "zoom_in",
                        "transition": "auto",
                        "scale": 1.0,
                        "x": 0.0,
                        "y": 0.0,
                    })

        clip_paths = []
        rendered_scenes = []
        transition_types: list[str] = []
        for index, item in enumerate(render_items):
            if self._check_stop(db, job_id, stop):
                return
            scene = item["scene"]
            clip_path = str(log_path.parent / f"timeline_{index:03d}.mp4")
            try:
                engine.build_scene_clip(
                    media_path=item["source"],
                    media_type=item["media_type"],
                    audio_path=item["audio"],
                    duration=item["duration"],
                    output_path=clip_path,
                    width=width,
                    height=height,
                    fps=render_cfg.fps,
                    effect=item["effect"],
                    # Burn subtitles once on the final composite. Burning here
                    # and again globally produced doubled text.
                    subtitle_ass=None,
                    transform_scale=item.get("scale", 1.0),
                    transform_x=item.get("x", 0.0),
                    transform_y=item.get("y", 0.0),
                    audio_volume=item.get("audio_volume", 1.0),
                )
                clip_paths.append(clip_path)
                automatic_transition = {
                    "pan_left": "smoothleft",
                    "pan_right": "smoothright",
                    "zoom_out": "dissolve",
                }.get(item["effect"], "fade")
                requested_transition = item.get("transition", "auto")
                transition_types.append(requested_transition if requested_transition in {
                    "fade", "dissolve", "smoothleft", "smoothright",
                } else automatic_transition)
                if scene:
                    rendered_scenes.append(scene)
            except RenderError as exc:
                if scene:
                    scene.error_message = str(exc)
                    scene.status = "error"
                db.commit()
                self._fail(db, job_id, f"Render lỗi ở timeline clip {index + 1}: {exc}")
                return

        # global subtitle ASS (merged)
        global_ass = None
        if render_cfg.enable_subtitles and rendered_scenes:

            from backend.services.subtitles import SubtitleConfig
            merged_ass_path = str(log_path.parent / "global_subtitles.ass")
            try:
                self._merge_scene_ass_files(rendered_scenes, log_path.parent, merged_ass_path, width, height, render_cfg.subtitle_config)

                global_ass = merged_ass_path
            except Exception as exc:  # noqa: BLE001
                log.warning("Không gộp được file ASS: %s", exc)

        output_path = str(project_dir / "output.mp4")
        subtitle_format = str(render_cfg.subtitle_output_format or "embed").lower()
        subtitle_for_video = global_ass if render_cfg.enable_subtitles and subtitle_format == "embed" else None

        try:

            engine.concat_scenes(
                clip_paths=clip_paths,
                audio_path="",
                music_path=timeline_music_path or render_cfg.background_music_path,
                music_volume=timeline_music_volume,
                logo_path=render_cfg.logo_path,
                logo_position=render_cfg.logo_position,
                intro_path=render_cfg.intro_path,
                outro_path=render_cfg.outro_path,
                subtitle_ass=subtitle_for_video,

                width=width,
                height=height,
                fps=render_cfg.fps,
                crf=render_cfg.crf,
                preset=render_cfg.preset,
                output_path=output_path,
                transition=render_cfg.transition_duration,
                transition_types=transition_types[:-1],
                voice_volume=render_cfg.voice_volume,
                enable_ducking=render_cfg.enable_ducking,
                normalize_audio=render_cfg.normalize_audio,
            )
        except RenderError as exc:
            self._fail(db, job_id, f"Render tổng hợp thất bại: {exc}")
            return

        if render_cfg.enable_subtitles and subtitle_format in {"srt", "ass"}:
            if subtitle_format == "ass" and global_ass and Path(global_ass).is_file():
                shutil.copyfile(global_ass, project_dir / "subtitles.ass")
            elif subtitle_format == "srt":
                srt_lines = []
                subtitle_index = 1
                for item in rendered_scenes:
                    text = (item.subtitle_text or item.narration or "").strip()
                    if not text:
                        continue
                    start = max(float(item.start_time or 0), 0.0)
                    end = max(float(item.end_time or (start + item.duration or 0)), start + 0.1)
                    def _srt_time(value: float) -> str:
                        millis = int(round(value * 1000))
                        hours, millis = divmod(millis, 3600000)
                        minutes, millis = divmod(millis, 60000)
                        seconds, millis = divmod(millis, 1000)
                        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"
                    srt_lines.extend([str(subtitle_index), f"{_srt_time(start)} --> {_srt_time(end)}", text, ""])
                    subtitle_index += 1
                (project_dir / "subtitles.srt").write_text("\n".join(srt_lines), encoding="utf-8")

        verified, verify_payload, verify_message = verify_output_file(output_path, expected_fps=render_cfg.fps)
        if not verified:
            self._fail(db, job_id, f"Output verification thất bại: {verify_message}")
            return

        # preview
        try:
            from backend.render.preview import render_preview
            render_preview(output_path, str(Path(output_path).parent / "preview.mp4"))
        except Exception as exc:  # noqa: BLE001
            log.warning("Không tạo được preview: %s", exc)

        self._set_status(db, job_id, "completed", 100, "completed")

        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        if job is not None:
            job.completed_at = datetime.utcnow()
        project = db.query(Project).filter(Project.id == project_id).first()
        if project is not None:
            project.status = "completed"
            project.progress = 100
            project.current_step = "completed"
            project.output_video_path = output_path
        db.commit()

    # ------------------------------------------------------------------
    @staticmethod
    def _merge_scene_ass_files(scenes, base_dir: Path, out_path: str, width: int, height: int, config) -> None:
        """Merge per-scene ASS entry lines into one global ASS file."""
        from backend.services.subtitles import ASS_HEADER, _color_to_ass, _ass_timecode, _margin_from_position

        entries = []
        for scene in scenes:
            ass_file = base_dir / f"scene_{scene.order_index:03d}" / "subtitles.ass"
            if not ass_file.exists():
                continue
            for line in ass_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("Dialogue:"):
                    entries.append(line)

        header = ASS_HEADER.format(
            width=width, height=height,
            font=(config.font or "DejaVuSans").replace(",", " "),
            size=int(config.font_size or 48),
            primary=_color_to_ass(config.primary_color or "#FFFFFF"),
            secondary=_color_to_ass(config.primary_color or "#FFFFFF"),
            outline=_color_to_ass(config.border_color or "#000000"),
            border=int(config.border_width or 2),
            margin=_margin_from_position(config, height),
        )
        Path(out_path).write_text(header + "\n".join(entries) + "\n", encoding="utf-8")


pipeline = PipelineManager()
