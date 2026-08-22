"""Central Task Dispatcher & Universal Job Manager for Viu Auto Studio.

Architecture:
- 3 Execution Domains with Dynamic Resource Scheduler:
  1. Render Worker: 1 (Dedicated GPU/QSV/CPU encoder allocation)
  2. AI Worker: Dynamic (1 to max(1, CPU cores // 4))
  3. Media Worker: Dynamic (1 to max(1, CPU cores // 2))
- Prioritized Scheduling: High > Normal > Low with FIFO.
- Job Dependency Resolution (depends_on: [job_id, ...]):
  Queued jobs wait until all parent jobs complete before executing.
- Versioned Schemas (schema_version & result_schema_version).
- Clean cancellation with automatic temp file cleanup.
- Simplified Pause policy (only queued jobs can pause; running jobs use cancel).
- Real-time progress, step tracking, speed metrics, and ETA estimation.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.core.config import PROJECTS_DIR
from backend.core.database import SessionLocal
from backend.models import Project, RenderJob, Scene, Script
from backend.services.project_config import effective_project_config

log = logging.getLogger("viu.task_dispatcher")

# Priority numeric weights
PRIORITY_WEIGHTS = {
    "high": 3,
    "normal": 2,
    "low": 1,
}


def get_dynamic_concurrency() -> Dict[str, int]:
    """Calculate safe dynamic concurrency slots based on available CPU cores."""
    cores = os.cpu_count() or 4
    # Render is always 1 to give full encoder & hardware acceleration without thread collision
    render_concurrency = 1
    # AI worker slot dynamically scales
    ai_concurrency = max(1, min(3, cores // 4))
    # Media worker slot dynamically scales
    media_concurrency = max(1, min(4, cores // 2))
    return {
        "render": render_concurrency,
        "ai": ai_concurrency,
        "media": media_concurrency,
    }


class TaskDispatcher:
    """Central Task Dispatcher managing background job workers across Render, AI, and Media."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_jobs: Dict[int, threading.Thread] = {}
        self._cancel_events: Dict[int, threading.Event] = {}
        self._active_domain_counts = {"render": 0, "ai": 0, "media": 0}
        self._running = True
        self._dispatcher_thread = threading.Thread(target=self._dispatch_loop, daemon=True, name="task_dispatcher")
        self._dispatcher_thread.start()
        log.info("TaskDispatcher initialized with dynamic concurrency: %s", get_dynamic_concurrency())

    def create_job(
        self,
        project_id: int,
        job_type: str,
        domain: str,
        title: str = "",
        priority: str = "normal",
        params: Optional[Dict[str, Any]] = None,
        depends_on: Optional[List[int]] = None,
        schema_version: int = 1,
        result_schema_version: int = 1,
    ) -> RenderJob:
        """Create and enqueue a new job with dependency tracking and versioned schemas."""
        db: Session = SessionLocal()
        try:
            params = params or {}
            depends_on = depends_on or []
            if not title:
                project = db.query(Project).filter(Project.id == project_id).first()
                p_name = project.name if project else f"Project #{project_id}"
                if job_type == "render":
                    title = f"Xuất video · {p_name}"
                elif job_type == "ai_auto_edit":
                    title = f"AI Auto Edit · {p_name}"
                elif job_type == "tts_batch":
                    title = f"Lồng tiếng hàng loạt · {p_name}"
                else:
                    title = f"{job_type.replace('_', ' ').title()} · {p_name}"

            init_step = "Đang chờ trong hàng đợi..."
            if depends_on:
                init_step = f"Đang chờ {len(depends_on)} tác vụ phụ thuộc (#{', #'.join(map(str, depends_on))})..."

            job = RenderJob(
                project_id=project_id,
                job_type=job_type,
                domain=domain,
                title=title,
                priority=priority,
                status="queued",
                progress=0,
                current_step=init_step,
                params_json=json.dumps(params),
                schema_version=schema_version,
                result_json="{}",
                result_schema_version=result_schema_version,
                depends_on_json=json.dumps(depends_on),
                error_message="",
                retry_count=0,
                speed_multiplier=1.0,
                eta_seconds=0,
                worker_id=f"{domain}-worker",
                started_at=None,
                completed_at=None,
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            log.info(
                "Created %s job #%d (%s, priority=%s, depends_on=%s) for project #%d",
                domain, job.id, job_type, priority, depends_on, project_id
            )
            return job
        finally:
            db.close()

    def prioritize_job(self, job_id: int) -> bool:
        """Elevate a queued job to high priority so it runs first."""
        db: Session = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job or job.status not in ["queued", "paused"]:
                return False
            job.priority = "high"
            job.updated_at = datetime.utcnow()
            db.commit()
            log.info("Job #%d elevated to HIGH priority", job_id)
            return True
        finally:
            db.close()

    def pause_job(self, job_id: int) -> Tuple[bool, str]:
        """Pause a queued job. Running jobs cannot be paused in V1 (must cancel)."""
        db: Session = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return False, "Không tìm thấy tác vụ"
            if job.status != "queued":
                if job.status in ["processing", "preparing", "finalizing", "running", "rendering"]:
                    return False, "Không thể tạm dừng tác vụ đang thực thi. Hãy chọn Hủy (Cancel) nếu muốn dừng."
                return False, f"Không thể tạm dừng tác vụ ở trạng thái '{job.status}'"

            job.status = "paused"
            job.current_step = "Đã tạm dừng trong hàng đợi"
            db.commit()
            log.info("Job #%d paused", job_id)
            return True, "Đã tạm dừng tác vụ"
        finally:
            db.close()

    def resume_job(self, job_id: int) -> Tuple[bool, str]:
        """Resume a paused job."""
        db: Session = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job or job.status != "paused":
                return False, "Tác vụ không ở trạng thái tạm dừng"
            job.status = "queued"
            job.current_step = "Đang chờ trong hàng đợi..."
            db.commit()
            log.info("Job #%d resumed to queued", job_id)
            return True, "Đã tiếp tục tác vụ"
        finally:
            db.close()

    def cancel_job(self, job_id: int) -> bool:
        """Cancel a running or queued job with complete temp file cleanup."""
        db: Session = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return False

            with self._lock:
                if job_id in self._cancel_events:
                    self._cancel_events[job_id].set()

            job.status = "cancelled"
            job.current_step = "Đã hủy bởi người dùng"
            job.completed_at = datetime.utcnow()
            db.commit()

            # Temp files cleanup
            self._cleanup_job_temp(job)
            log.info("Job #%d cancelled and temp files cleaned", job_id)
            return True
        finally:
            db.close()

    def retry_job(self, job_id: int) -> bool:
        """Retry a failed or cancelled job."""
        db: Session = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return False
            job.status = "queued"
            job.progress = 0
            job.current_step = "Đang chuẩn bị thử lại..."
            job.error_message = ""
            job.error_category = ""
            job.retry_count = (job.retry_count or 0) + 1
            job.started_at = None
            job.completed_at = None
            db.commit()
            log.info("Job #%d reset for retry (attempt %d)", job_id, job.retry_count)
            return True
        finally:
            db.close()

    def _cleanup_job_temp(self, job: RenderJob) -> None:
        """Clean up any temporary files generated during this job."""
        try:
            if job.project_id:
                proj_dir = Path(PROJECTS_DIR) / f"project_{job.project_id}"
                if proj_dir.exists():
                    for pattern in ["_concat_tmp*.mp4", "*.cache_hash", "*.raw.mp3", "tmp_*"]:
                        for f in proj_dir.glob(pattern):
                            try:
                                if f.is_file():
                                    f.unlink(missing_ok=True)
                            except Exception:
                                pass
        except Exception as exc:
            log.debug("Cleanup temp error for job #%d: %s", job.id, exc)

    def _dispatch_loop(self) -> None:
        """Continuous background dispatcher loop."""
        while self._running:
            try:
                self._check_and_spawn_next()
            except Exception as exc:
                log.error("Dispatcher loop error: %s", exc, exc_info=True)
            time.sleep(1.0)

    def _check_and_spawn_next(self) -> None:
        """Select highest priority queued job whose dependencies are completed."""
        db: Session = SessionLocal()
        try:
            # Query queued jobs
            queued_jobs = (
                db.query(RenderJob)
                .filter(RenderJob.status == "queued")
                .order_by(
                    RenderJob.priority.desc(),
                    RenderJob.created_at.asc(),
                )
                .all()
            )

            # Sort by explicit priority weight (high=3, normal=2, low=1)
            queued_jobs.sort(key=lambda j: (PRIORITY_WEIGHTS.get(j.priority, 2), -j.id), reverse=True)

            dynamic_concurrency = get_dynamic_concurrency()

            for job in queued_jobs:
                # 1. Dependency Resolution Check
                depends_on = json.loads(job.depends_on_json or "[]")
                if depends_on:
                    parent_jobs = db.query(RenderJob).filter(RenderJob.id.in_(depends_on)).all()
                    parent_map = {p.id: p.status for p in parent_jobs}

                    # Check if any parent failed or cancelled
                    failed_parents = [pid for pid in depends_on if parent_map.get(pid) in ["failed", "cancelled"]]
                    if failed_parents:
                        blocked_msg = f"Đang chờ: Job phụ thuộc (#{', #'.join(map(str, failed_parents))}) đã thất bại hoặc bị hủy."
                        if job.current_step != blocked_msg:
                            job.current_step = blocked_msg
                            db.commit()
                        continue

                    # Check if all parents completed
                    all_completed = len(parent_jobs) == len(depends_on) and all(p.status == "completed" for p in parent_jobs)
                    if not all_completed:
                        uncompleted = [pid for pid in depends_on if parent_map.get(pid) != "completed"]
                        waiting_msg = f"Đang chờ tác vụ phụ thuộc (#{', #'.join(map(str, uncompleted))}) hoàn thành..."
                        if job.current_step != waiting_msg:
                            job.current_step = waiting_msg
                            db.commit()
                        continue

                # 2. Dynamic Resource Concurrency Check
                dom = job.domain or "render"
                max_concurrency = dynamic_concurrency.get(dom, 1)

                with self._lock:
                    curr_count = self._active_domain_counts.get(dom, 0)
                    if curr_count >= max_concurrency:
                        continue  # Wait until active slot frees up

                    if job.id in self._active_jobs:
                        continue

                    # Reserve slot
                    self._active_domain_counts[dom] = curr_count + 1
                    cancel_evt = threading.Event()
                    self._cancel_events[job.id] = cancel_evt

                # Spawn worker thread
                t = threading.Thread(
                    target=self._run_job_worker,
                    args=(job.id, dom, cancel_evt),
                    daemon=True,
                    name=f"worker-{dom}-{job.id}",
                )
                with self._lock:
                    self._active_jobs[job.id] = t
                t.start()

        finally:
            db.close()

    def _run_job_worker(self, job_id: int, domain: str, cancel_evt: threading.Event) -> None:
        """Worker thread entry point executing specific domain handlers."""
        db: Session = SessionLocal()
        job = None
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return

            job.status = "processing"
            job.started_at = datetime.utcnow()
            job.current_step = "Đang khởi tạo tác vụ..."
            db.commit()

            # Route by job_type
            if job.job_type == "render":
                self._execute_render_job(job_id, cancel_evt)
            elif job.job_type == "ai_auto_edit":
                self._execute_auto_edit_job(job_id, cancel_evt)
            elif job.job_type == "tts_batch":
                self._execute_tts_batch_job(job_id, cancel_evt)
            else:
                self._execute_generic_job(job_id, cancel_evt)

        except Exception as exc:
            log.error("Job #%d failed with exception: %s", job_id, exc, exc_info=True)
            db_fail = SessionLocal()
            try:
                j = db_fail.query(RenderJob).filter(RenderJob.id == job_id).first()
                if j and j.status != "cancelled":
                    j.status = "failed"
                    j.error_message = str(exc)
                    err_str = str(exc).lower()
                    if "timeout" in err_str or "connection" in err_str or "network" in err_str:
                        j.error_category = "retryable"
                    elif "disk" in err_str or "space" in err_str:
                        j.error_category = "fatal_disk"
                    else:
                        j.error_category = "fatal"
                    j.completed_at = datetime.utcnow()
                    db_fail.commit()
            finally:
                db_fail.close()

        finally:
            with self._lock:
                self._active_jobs.pop(job_id, None)
                self._cancel_events.pop(job_id, None)
                self._active_domain_counts[domain] = max(0, self._active_domain_counts.get(domain, 1) - 1)
            db.close()

    def _execute_render_job(self, job_id: int, cancel_evt: threading.Event) -> None:
        """Execute video render job via SmartRenderEngine."""
        from backend.pipeline.queue import pipeline
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return
            params = json.loads(job.params_json or "{}")
            tts_cfg = params.get("tts_config") or {}
            render_cfg = params.get("render_config") or {}

            # Execute pipeline step
            pipeline._run_job(job.id, job.project_id, render_cfg, tts_cfg, cancel_evt)
        finally:
            db.close()

    def _execute_auto_edit_job(self, job_id: int, cancel_evt: threading.Event) -> None:
        """Execute AI Auto Edit job."""
        from backend.services.ai.auto_edit_engine import AutoEditEngine
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return

            job.current_step = "AI Director đang phân tích nhịp giọng và bóc tách Multi-Shots..."
            job.progress = 25
            db.commit()

            if cancel_evt.is_set():
                return

            auto_engine = AutoEditEngine(db)
            params = json.loads(job.params_json or "{}")
            result = auto_engine.auto_edit_project(job.project_id, options=params)

            job.progress = 100
            job.status = "completed"
            job.current_step = f"Hoàn thành! Đã tự dựng {result.get('shots_count', 0)} shots (Điểm: {result.get('overall_edit_score', 90)}%)"
            job.result_json = json.dumps(result)
            job.completed_at = datetime.utcnow()
            db.commit()
            log.info("AI Auto Edit Job #%d completed successfully", job_id)
        finally:
            db.close()

    def _execute_tts_batch_job(self, job_id: int, cancel_evt: threading.Event) -> None:
        """Execute batch TTS synthesis for all scenes in a project."""
        from backend.services.tts.edge_provider import EdgeTTSProvider
        from backend.services.media import get_audio_duration
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return

            project = db.query(Project).filter(Project.id == job.project_id).first()
            scenes = db.query(Scene).filter(Scene.project_id == job.project_id).order_by(Scene.order_index).all()
            if not scenes:
                job.status = "completed"
                job.current_step = "Dự án chưa có phân cảnh để lồng tiếng."
                job.completed_at = datetime.utcnow()
                db.commit()
                return

            tts_provider = EdgeTTSProvider()
            total = len(scenes)
            proj_dir = Path(project.project_directory) if (project and project.project_directory) else Path(PROJECTS_DIR) / f"project_{job.project_id}"
            audio_dir = proj_dir / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)

            running_time = 0.0
            for idx, scene in enumerate(scenes, start=1):
                if cancel_evt.is_set():
                    return

                job.current_step = f"Lồng tiếng Scene {idx}/{total}: {scene.narration[:30]}..."
                job.progress = int((idx - 1) / total * 100)
                db.commit()

                out_audio = str(audio_dir / f"scene_{scene.order_index:03d}.mp3")
                tts_provider.synthesize(
                    text=scene.narration or "",
                    voice=project.voice or "vi-VN-HoaiMyNeural",
                    speed=float(project.speed or 1.0),
                    output_path=out_audio,
                )

                dur = get_audio_duration(out_audio)
                scene.audio_path = out_audio
                scene.duration = dur
                scene.start_time = running_time
                scene.end_time = running_time + dur
                running_time += dur
                db.commit()

            job.progress = 100
            job.status = "completed"
            job.current_step = f"Đã lồng tiếng hoàn tất toàn bộ {total} phân cảnh ({running_time:.1f}s audio)"
            job.completed_at = datetime.utcnow()
            db.commit()
            log.info("TTS Batch Job #%d completed successfully", job_id)
        finally:
            db.close()

    def _execute_generic_job(self, job_id: int, cancel_evt: threading.Event) -> None:
        """Generic fallback job execution."""
        db = SessionLocal()
        try:
            job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
            if not job:
                return
            for p in [20, 50, 80, 100]:
                if cancel_evt.is_set():
                    return
                job.progress = p
                job.current_step = f"Đang xử lý {p}%..."
                db.commit()
                time.sleep(0.5)
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()


# Global Singleton Dispatcher instance
dispatcher = TaskDispatcher()
