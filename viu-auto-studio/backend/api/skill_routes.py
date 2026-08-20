from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models import SkillRun
from backend.schemas import SkillCatalogItem, SkillRunCreate, SkillRunRead
from backend.services.skill_service import CATALOG_BY_ID, SKILL_CATALOG, refresh_manus_run, run_skill

router = APIRouter(prefix="/skills", tags=["skill-lab"])


def _read(run: SkillRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "project_id": run.project_id,
        "skill_id": run.skill_id,
        "mode": run.mode,
        "status": run.status,
        "input_json": run.input_json or "{}",
        "output_text": run.output_text or "",
        "external_task_id": run.external_task_id or "",
        "error_message": run.error_message or "",
        "created_at": run.created_at,
        "updated_at": run.updated_at,
    }


@router.get("/catalog", response_model=list[SkillCatalogItem])
def catalog() -> list[dict[str, Any]]:
    return SKILL_CATALOG


@router.get("/runs", response_model=list[SkillRunRead])
def list_runs(project_id: int | None = None, limit: int = 30, db: Session = Depends(get_db)):
    query = db.query(SkillRun).order_by(SkillRun.created_at.desc())
    if project_id is not None:
        query = query.filter(SkillRun.project_id == project_id)
    return [_read(run) for run in query.limit(max(1, min(limit, 100))).all()]


@router.post("/runs", response_model=SkillRunRead)
def create_run(payload: SkillRunCreate, db: Session = Depends(get_db)):
    if payload.skill_id not in CATALOG_BY_ID:
        raise HTTPException(404, f"Skill không tồn tại: {payload.skill_id}")
    run = run_skill(
        db,
        skill_id=payload.skill_id,
        data=payload.input,
        fallback=payload.prompt,
        project_id=payload.project_id,
        use_manus=payload.use_manus,
    )
    return _read(run)


@router.post("/runs/{run_id}/refresh", response_model=SkillRunRead)
def refresh_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(SkillRun).filter(SkillRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Skill run không tồn tại")
    return _read(refresh_manus_run(db, run))
