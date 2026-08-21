"""Keep the project library in sync with files referenced by project records.

Flow writes verified files to ``Scene`` first.  The Media page, however, reads
``MediaAsset``.  This module is the single idempotent bridge between those two
representations so a completed Flow run can never leave an empty library.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess

from sqlalchemy.orm import Session

from backend.core.config import FFPROBE_BIN
from backend.models import ConnectorTask, MediaAsset, Project, Scene


def _checksum(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _probe(path: str) -> dict:
    if not path or not os.path.isfile(path):
        return {}
    try:
        result = subprocess.run(
            [
                str(FFPROBE_BIN), "-v", "error",
                "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height",
                "-of", "json", path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            return {}
        data = json.loads(result.stdout or "{}")
        streams = data.get("streams") or []
        visual = next((item for item in streams if item.get("codec_type") == "video"), None)
        primary = visual or (streams[0] if streams else {})
        width = int(primary.get("width") or 0)
        height = int(primary.get("height") or 0)
        fmt = data.get("format") or {}
        return {
            "codec": str(primary.get("codec_name") or ""),
            "resolution": f"{width}x{height}" if width and height else "",
            "duration": float(fmt.get("duration") or 0.0),
            "size_bytes": int(fmt.get("size") or os.path.getsize(path)),
        }
    except (OSError, ValueError, subprocess.SubprocessError):
        return {}


def sync_project_media_assets(db: Session, project_id: int) -> list[MediaAsset]:
    """Upsert every real project file into ``MediaAsset`` and return active rows."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return []

    scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.order_index).all()
    flow_paths = {
        task.file_path
        for task in db.query(ConnectorTask).filter(
            ConnectorTask.project_id == project_id,
            ConnectorTask.status == "completed",
        ).all()
        if task.file_path
    }
    candidates: list[tuple[int | None, str, str, str]] = []
    seen: set[str] = set()

    def add(scene_id: int | None, kind: str, path: str, provider: str) -> None:
        normalized = os.path.normcase(os.path.realpath(path)) if path else ""
        if not normalized or normalized in seen or not os.path.isfile(normalized):
            return
        seen.add(normalized)
        candidates.append((scene_id, kind, normalized, provider))

    for scene in scenes:
        add(scene.id, "media", scene.image_path, "flow" if scene.image_path in flow_paths else "local")
        add(scene.id, "media", scene.video_path, "flow" if scene.video_path in flow_paths else "local")
        add(scene.id, "voice", scene.audio_path, "tts")
    add(None, "thumbnail", project.thumbnail_path, "local")
    add(None, "output", project.output_video_path, "render")

    changed = False
    for scene_id, kind, path, provider in candidates:
        row = db.query(MediaAsset).filter(
            MediaAsset.project_id == project_id,
            MediaAsset.file_path == path,
        ).first()
        if not row:
            row = MediaAsset(project_id=project_id, file_path=path)
            db.add(row)
        info = _probe(path)
        row.scene_id = scene_id
        row.kind = kind
        row.provider = provider
        row.codec = info.get("codec", "")
        row.resolution = info.get("resolution", "")
        row.duration = info.get("duration", 0.0)
        row.size_bytes = info.get("size_bytes", os.path.getsize(path))
        row.checksum = _checksum(path)
        row.verify_state = "verified" if info else "failed"
        row.active = True
        def same_file(candidate: str) -> bool:
            return bool(candidate) and os.path.normcase(os.path.realpath(candidate)) == path

        row.reference_count = sum(
            1 for scene in scenes
            if any(same_file(candidate) for candidate in (
                scene.media_path, scene.image_path, scene.video_path, scene.audio_path,
            ))
        ) + (1 if same_file(project.output_video_path) else 0)
        changed = True

    for row in db.query(MediaAsset).filter(MediaAsset.project_id == project_id, MediaAsset.active == True).all():  # noqa: E712
        if row.file_path and not os.path.isfile(row.file_path):
            row.active = False
            row.verify_state = "missing"
            changed = True
    if changed:
        db.commit()
    return db.query(MediaAsset).filter(
        MediaAsset.project_id == project_id,
        MediaAsset.active == True,  # noqa: E712
    ).all()
