from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path

from backend.api.connector_routes import connector_next_task, connector_task_complete, media_tasks_state
from backend.api.pages_routes import FactoryStartRequest, start_factory_flow
from backend.core.database import SessionLocal
from backend.db import init_db
from backend.models import ConnectorTask, FlowConnection, FlowFactoryRun, PipelineState, Project, Scene
from backend.services.flow_factory import activate_next_factory_run
from backend.test_flow_factory_smoke import png_bytes


def make_project(db, root: str, name: str) -> Project:
    project = Project(name=name, aspect_ratio="16:9", status="draft", project_directory=root)
    db.add(project)
    db.flush()
    db.add(Scene(project_id=project.id, order_index=0, narration=f"{name} narration", visual_prompt=f"{name} visual"))
    db.add(PipelineState(project_id=project.id, status="processing", step_data_json="{}"))
    db.commit()
    db.refresh(project)
    return project


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            first = make_project(db, str(Path(tmp) / "first"), "Factory project A")
            second = make_project(db, str(Path(tmp) / "second"), "Factory project B")
            second_scene = db.query(Scene).filter(Scene.project_id == second.id).first()
            db.add(ConnectorTask(
                task_id="old-failed-history",
                project_id=second.id,
                scene_id=second_scene.id,
                status="failed",
                stage="image",
                attempts=3,
                prompt="old",
                factory_session_id="old-session",
            ))
            connection = FlowConnection(status="paired", heartbeat_at=datetime.utcnow(), factory_state="ready")
            db.add(connection)
            db.commit()
            # A historical failed attempt must not become the current project
            # status before a new Factory run is created.
            assert media_tasks_state(second.id, db)["total"] == 0

            run_a = start_factory_flow(FactoryStartRequest(project_id=first.id, include_video=False), db)
            run_b = start_factory_flow(FactoryStartRequest(project_id=second.id, include_video=False), db)
            assert run_a["factory_state"] == "ready", run_a
            assert run_b["factory_state"] == "queued" and run_b["queue_position"] == 1, run_b
            db.refresh(connection)
            assert connection.factory_project_id == first.id
            assert connection.factory_session_id == run_a["factory_session_id"]
            assert media_tasks_state(second.id, db)["failed"] == 0

            task_a = connector_next_task("multi-worker", None, db)
            assert task_a["project_id"] == first.id
            image_a = Path(tmp) / "a.png"
            image_a.write_bytes(png_bytes())
            connector_task_complete(task_a["task_id"], {"local_path": str(image_a), "media_type": "image"}, None, db)

            db.expire_all()
            connection = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
            assert connection.factory_project_id == second.id, {
                "connection_project": connection.factory_project_id,
                "connection_session": connection.factory_session_id,
                "runs": [(r.project_id, r.session_id, r.status) for r in db.query(FlowFactoryRun).order_by(FlowFactoryRun.id).all()],
            }
            assert connection.factory_session_id == run_b["factory_session_id"]
            assert db.query(FlowFactoryRun).filter(FlowFactoryRun.session_id == run_a["factory_session_id"]).first().status == "completed"

            task_b = connector_next_task("multi-worker", None, db)
            assert task_b["project_id"] == second.id
            image_b = Path(tmp) / "b.png"
            image_b.write_bytes(png_bytes())
            connector_task_complete(task_b["task_id"], {"local_path": str(image_b), "media_type": "image"}, None, db)
            assert db.query(FlowFactoryRun).filter(FlowFactoryRun.session_id == run_b["factory_session_id"]).first().status == "completed"

            # Upgrade path: adopt a pre-run-table session that still owns
            # unfinished tasks, rather than leaving Flow stuck on its home page.
            legacy = make_project(db, str(Path(tmp) / "legacy"), "Legacy project")
            legacy_scene = db.query(Scene).filter(Scene.project_id == legacy.id).first()
            db.add(ConnectorTask(
                task_id="legacy-active-task",
                project_id=legacy.id,
                scene_id=legacy_scene.id,
                status="pending",
                stage="image",
                prompt="legacy visual",
                factory_session_id="legacy-active-session",
            ))
            connection = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
            connection.factory_project_id = legacy.id
            connection.factory_session_id = "legacy-active-session"
            db.commit()
            adopted = activate_next_factory_run(db)
            assert adopted and adopted.project_id == legacy.id and adopted.status == "running"
            print("FLOW_FACTORY_MULTI_PROJECT_PASS")
    finally:
        db.close()


if __name__ == "__main__":
    main()
