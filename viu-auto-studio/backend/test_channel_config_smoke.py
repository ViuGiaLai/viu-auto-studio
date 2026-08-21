from __future__ import annotations

import json
import tempfile
from pathlib import Path

from backend.api.connector_routes import connector_task_complete, connector_task_progress, media_tasks_cancel
from backend.api.pages_routes import FactoryStartRequest, start_factory_flow
from backend.core.database import SessionLocal
from backend.db import init_db
from backend.models import Channel, ConnectorTask, FlowConnection, FlowFactoryRun, PipelineState, Project, Scene
from backend.test_flow_factory_smoke import png_bytes


def make_project(db, name: str, config: dict) -> tuple[Project, Scene]:
    channel = Channel(name=f"{name} channel", config_json=json.dumps(config, ensure_ascii=False))
    db.add(channel)
    db.flush()
    project = Project(name=name, channel_id=channel.id, aspect_ratio="16:9", status="draft", config_json="{}")
    db.add(project)
    db.flush()
    scene = Scene(project_id=project.id, order_index=0, narration="Test", visual_prompt="Cinematic test frame")
    db.add(scene)
    db.add(PipelineState(project_id=project.id, status="processing", step_data_json="{}"))
    db.commit()
    db.refresh(project)
    db.refresh(scene)
    return project, scene


def cleanup(db, project: Project) -> None:
    db.query(ConnectorTask).filter(ConnectorTask.project_id == project.id).delete()
    db.query(FlowFactoryRun).filter(FlowFactoryRun.project_id == project.id).delete()
    db.query(Scene).filter(Scene.project_id == project.id).delete()
    db.query(PipelineState).filter(PipelineState.project_id == project.id).delete()
    db.query(FlowConnection).filter(FlowConnection.factory_project_id == project.id).delete()
    channel = db.query(Channel).filter(Channel.id == project.channel_id).first()
    db.delete(project)
    if channel:
        db.delete(channel)
    db.commit()


def main() -> None:
    init_db()
    db = SessionLocal()
    projects: list[Project] = []
    try:
        image_project, _ = make_project(db, "Channel image-only smoke", {"image_mode": "image"})
        projects.append(image_project)
        image_result = start_factory_flow(FactoryStartRequest(project_id=image_project.id, include_video=True), db)
        assert image_result["include_video"] is False
        assert db.query(ConnectorTask).filter(ConnectorTask.project_id == image_project.id, ConnectorTask.stage == "video").count() == 0
        media_tasks_cancel(image_project.id, db)

        video_project, video_scene = make_project(db, "Channel video-model smoke", {"image_mode": "mix", "video_model": "Veo Custom Test"})
        projects.append(video_project)
        video_result = start_factory_flow(FactoryStartRequest(project_id=video_project.id, include_video=True), db)
        task = db.query(ConnectorTask).filter(ConnectorTask.project_id == video_project.id, ConnectorTask.stage == "image").first()
        assert task and task.project_id == video_project.id and task.stage == "image"
        connector_task_progress(task.task_id, {"phase": "generate_image", "percent": 20, "message": "channel smoke"}, None, db)
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "image.png"
            image.write_bytes(png_bytes())
            connector_task_complete(task.task_id, {"local_path": str(image), "media_type": "image"}, None, db)
        follow_up = db.query(ConnectorTask).filter(ConnectorTask.project_id == video_project.id, ConnectorTask.scene_id == video_scene.id, ConnectorTask.stage == "video").first()
        assert follow_up and follow_up.model == "Veo Custom Test"
        print("CHANNEL_CONFIG_SMOKE_PASS")
    finally:
        for project in projects:
            cleanup(db, project)
        db.close()


if __name__ == "__main__":
    main()
