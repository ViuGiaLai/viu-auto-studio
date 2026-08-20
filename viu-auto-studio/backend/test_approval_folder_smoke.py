from __future__ import annotations

import tempfile
from pathlib import Path

from backend.api import routes as routes_module
from backend.api.routes import approve_script, create_project
from backend.core.database import SessionLocal
from backend.db import init_db
from backend.models import Project, Scene, Script
from backend.schemas import ProjectCreateV2


def main() -> None:
    init_db()
    db = SessionLocal()
    project = None
    original_start = routes_module.pipeline.start_auto_production
    routes_module.pipeline.start_auto_production = lambda project_id: {"ok": True, "already_running": False}
    try:
        with tempfile.TemporaryDirectory() as tmp:
            created = create_project(ProjectCreateV2(name="Approval folder smoke", output_folder=tmp), db)
            assert Path(created.project_directory).resolve() == Path(tmp).resolve()
            assert (Path(tmp) / "assets").is_dir()
            project = db.query(Project).filter(Project.id == created.id).first()
            assert project is not None
            db.add(Script(project_id=project.id, full_script="Một kịch bản kiểm thử đầy đủ."))
            db.commit()

            first = approve_script(project.id, db)
            assert first["approved"] is True
            assert first["needs_scene_analysis"] is True
            assert first["pipeline"] is None

            db.add(Scene(project_id=project.id, order_index=0, narration="Cảnh kiểm thử", visual_prompt="Cinematic test frame"))
            db.commit()
            second = approve_script(project.id, db)
            assert second["approved"] is True
            assert second["needs_scene_analysis"] is False
            assert second["pipeline"] is not None
            print("APPROVAL_FOLDER_SMOKE_PASS")
    finally:
        routes_module.pipeline.start_auto_production = original_start
        if project is not None:
            db.query(Scene).filter(Scene.project_id == project.id).delete()
            db.query(Script).filter(Script.project_id == project.id).delete()
            db.delete(project)
            db.commit()
        db.close()


if __name__ == "__main__":
    main()
