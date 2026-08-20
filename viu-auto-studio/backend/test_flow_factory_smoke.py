from __future__ import annotations

import os
import struct
import tempfile
import zlib
from datetime import datetime
from pathlib import Path

from backend.api.connector_routes import connector_task_complete, connector_task_progress, connector_next_task
from backend.api.pages_routes import FactoryStartRequest, start_factory_flow
from backend.core.database import SessionLocal
from backend.models import ConnectorTask, FlowConnection, PipelineState, Project, Scene
from backend.db import init_db


def png_bytes(width: int = 64, height: int = 64) -> bytes:
    raw = b"".join(b"\\x00" + bytes((50, 80, 120)) * width for _ in range(height))
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"tEXt", b"padding\\x00" + b"x" * 1200) + chunk(b"IEND", b"")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            project = Project(name="Factory smoke", aspect_ratio="16:9", status="draft")
            db.add(project)
            db.flush()
            scene = Scene(project_id=project.id, order_index=0, narration="Smoke scene", visual_prompt="A clean cinematic test frame")
            db.add(scene)
            db.add(PipelineState(project_id=project.id, status="processing", step_data_json="{}"))
            db.commit()
            db.refresh(project)
            db.refresh(scene)

            started = start_factory_flow(FactoryStartRequest(project_id=project.id, include_video=True), db)
            assert started["created"] == 1
            assert started["factory_session_id"]
            connection = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
            assert connection and connection.factory_project_id == project.id
            connection.status = "paired"
            connection.heartbeat_at = datetime.utcnow()
            connection.factory_state = "ready"
            db.commit()

            task_payload = connector_next_task("smoke-worker", None, db)
            assert task_payload["stage"] == "image"
            task = db.query(ConnectorTask).filter(ConnectorTask.task_id == task_payload["task_id"]).first()
            assert task
            connector_task_progress(task.task_id, {"phase": "generate_image", "percent": 20, "message": "smoke"}, None, db)

            image_path = Path(tmp) / "image.png"
            image_path.write_bytes(png_bytes())
            image_result = connector_task_complete(task.task_id, {"local_path": str(image_path), "media_type": "image"}, None, db)
            assert image_result["ok"]
            db.expire_all()
            video_task = db.query(ConnectorTask).filter(ConnectorTask.scene_id == scene.id, ConnectorTask.stage == "video").first()
            assert video_task and video_task.status == "pending"
            assert db.query(Scene).get(scene.id).image_path
            print("FLOW_FACTORY_SMOKE_PASS")
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
