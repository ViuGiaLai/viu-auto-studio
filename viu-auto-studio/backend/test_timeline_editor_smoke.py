"""Regression smoke test for the real timeline editor persistence API."""
from __future__ import annotations

import json

from backend.api.pages_routes import TimelineProjectPayload, get_timeline_project, save_timeline_project
from backend.core.database import SessionLocal
from backend.db import init_db
from backend.models import Project, Scene, Timeline, TimelineClip
from fastapi import HTTPException


def main() -> None:
    init_db()
    db = SessionLocal()
    project = Project(name="Timeline editor smoke", aspect_ratio="16:9", status="draft", project_directory="")
    db.add(project)
    db.flush()
    scene = Scene(
        project_id=project.id,
        order_index=0,
        narration="Timeline test",
        media_path="C:/media/scene.mp4",
        media_type="video",
        audio_path="C:/media/voice.wav",
        duration=4.0,
    )
    db.add(scene)
    db.commit()
    db.refresh(project)
    db.refresh(scene)
    try:
        seeded = get_timeline_project(project.id, db)
        assert seeded["project_id"] == project.id
        assert seeded["version"] == 1
        assert any(clip["track"] == "visual" for clip in seeded["clips"])
        assert any(clip["track"] == "voice" for clip in seeded["clips"])

        visual = next(clip for clip in seeded["clips"] if clip["track"] == "visual")
        payload = TimelineProjectPayload(
            duration=6.0,
            settings={"fps": 30, "aspect_ratio": "16:9"},
            expected_version=seeded["version"],
            clips=[
                {
                    "track": "visual",
                    "source_path": visual["source_path"],
                    "scene_id": scene.id,
                    "clip_start": 1.0,
                    "clip_end": 5.0,
                    "in_point": 0.5,
                    "out_point": 4.5,
                    "volume": 1.0,
                    "transform": {"effect": "zoom_out"},
                    "order_index": 0,
                },
                {
                    "track": "voice",
                    "source_path": "C:/media/voice.wav",
                    "scene_id": scene.id,
                    "clip_start": 1.0,
                    "clip_end": 5.0,
                    "in_point": 0.0,
                    "out_point": 4.0,
                    "volume": 0.9,
                    "transform": {},
                    "order_index": 0,
                },
            ],
        )
        saved = save_timeline_project(project.id, payload, db)
        assert saved["version"] == 2
        assert saved["duration"] == 6.0
        assert saved["clips"][0]["transform"]["effect"] == "zoom_out"
        assert saved["clips"][0]["clip_start"] == 1.0

        try:
            save_timeline_project(
                project.id,
                TimelineProjectPayload(duration=6, expected_version=1, clips=[]),
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("stale timeline version was accepted")
        print("TIMELINE_EDITOR_SMOKE_PASS")
    finally:
        timeline_ids = [t.id for t in db.query(Timeline).filter(Timeline.project_id == project.id).all()]
        if timeline_ids:
            db.query(TimelineClip).filter(TimelineClip.timeline_id.in_(timeline_ids)).delete(synchronize_session=False)
            db.query(Timeline).filter(Timeline.id.in_(timeline_ids)).delete(synchronize_session=False)
        db.delete(scene)
        db.delete(project)
        db.commit()
        db.close()


if __name__ == "__main__":
    main()
