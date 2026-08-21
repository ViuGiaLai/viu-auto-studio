"""Flow Factory session and state helpers.

The service deliberately keeps Google authentication out of the app. The
Chrome profile owns the Google session; Viu stores only a local session id,
connector identity and coarse readiness/progress state.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import ConnectorTask, FlowConnection, FlowFactoryRun

FACTORY_STATES = {
    "waiting_login",
    "ready",
    "processing",
    "generate_image",
    "generate_video",
    "completed",
    "failed",
}


def get_or_create_connection(db: Session) -> FlowConnection:
    connection = db.query(FlowConnection).order_by(FlowConnection.id.desc()).first()
    if connection:
        return connection
    connection = FlowConnection(factory_state="waiting_login", last_state_at=datetime.utcnow())
    db.add(connection)
    db.flush()
    return connection


def new_factory_session_id() -> str:
    return uuid.uuid4().hex


def activate_next_factory_run(db: Session, *, commit: bool = True) -> FlowFactoryRun | None:
    """Keep one serialized browser run active and leave every other project queued."""
    # SessionLocal disables autoflush; state transitions must be visible to the
    # scheduler queries below before choosing the next project.
    db.flush()
    connection = get_or_create_connection(db)
    # Upgrade compatibility: builds before project-bound runs stored the active
    # session only on FlowConnection. Adopt that session once when unfinished
    # tasks still exist, so an app restart cannot strand Chrome on Flow's home
    # page with tasks that have no owning run.
    if connection.factory_session_id and connection.factory_project_id:
        legacy_run = db.query(FlowFactoryRun).filter(
            FlowFactoryRun.session_id == connection.factory_session_id,
        ).first()
        if not legacy_run:
            unfinished = db.query(ConnectorTask).filter(
                ConnectorTask.project_id == connection.factory_project_id,
                ConnectorTask.factory_session_id == connection.factory_session_id,
                ConnectorTask.status.in_(["pending", "assigned", "in_progress", "retrying"]),
            ).count()
            if unfinished:
                legacy_run = FlowFactoryRun(
                    project_id=connection.factory_project_id,
                    session_id=connection.factory_session_id,
                    status="running",
                    factory_mode=bool(connection.factory_mode),
                    include_video=bool(connection.include_video),
                    stage=connection.factory_stage or "image",
                    started_at=datetime.utcnow(),
                )
                db.add(legacy_run)
                db.flush()
    current = None
    if connection.factory_session_id:
        current = db.query(FlowFactoryRun).filter(
            FlowFactoryRun.session_id == connection.factory_session_id,
            FlowFactoryRun.status == "running",
        ).first()
    if current:
        return current

    run = db.query(FlowFactoryRun).filter(FlowFactoryRun.status == "running").order_by(
        FlowFactoryRun.started_at.asc(), FlowFactoryRun.id.asc()
    ).first()
    if not run:
        run = db.query(FlowFactoryRun).filter(FlowFactoryRun.status == "queued").order_by(
            FlowFactoryRun.created_at.asc(), FlowFactoryRun.id.asc()
        ).first()
        if run:
            run.status = "running"
            run.started_at = run.started_at or datetime.utcnow()
            run.updated_at = datetime.utcnow()

    if run:
        connection.factory_project_id = run.project_id
        connection.factory_session_id = run.session_id
        connection.factory_mode = bool(run.factory_mode)
        connection.include_video = bool(run.include_video)
        connection.factory_stage = run.stage or "image"
        connection.factory_state = "ready"
        connection.last_error = ""
    else:
        connection.factory_project_id = None
        connection.factory_session_id = ""
        connection.factory_state = "ready" if connection.status == "paired" else "waiting_login"
    connection.last_state_at = datetime.utcnow()
    if commit:
        db.commit()
    return run


def set_factory_state(
    db: Session,
    state: str,
    *,
    project_id: int | None = None,
    session_id: str | None = None,
    error: str = "",
    commit: bool = True,
) -> FlowConnection:
    if state not in FACTORY_STATES:
        raise ValueError(f"Unsupported Flow Factory state: {state}")
    connection = get_or_create_connection(db)
    connection.factory_state = state
    if project_id is not None:
        connection.factory_project_id = project_id
    if session_id is not None:
        connection.factory_session_id = session_id
    connection.last_error = error
    connection.last_state_at = datetime.utcnow()
    if commit:
        db.commit()
    return connection


def infer_task_state(db: Session, project_id: int, *, session_id: str | None = None, fallback: str = "processing") -> str:
    query = db.query(ConnectorTask.status, func.count(ConnectorTask.id)).filter(ConnectorTask.project_id == project_id)
    if session_id:
        query = query.filter(ConnectorTask.factory_session_id == session_id)
    rows = (
        query
        .group_by(ConnectorTask.status)
        .all()
    )
    counts = {status: int(count) for status, count in rows}
    total = sum(counts.values())
    if counts.get("failed", 0) > 0:
        return "failed"
    if total > 0 and counts.get("completed", 0) >= total:
        return "completed"
    if counts.get("in_progress", 0) > 0 or counts.get("assigned", 0) > 0:
        return "processing"
    if counts.get("pending", 0) > 0 or counts.get("retrying", 0) > 0:
        return fallback
    return "ready"


def refresh_task_state(
    db: Session,
    project_id: int,
    *,
    session_id: str | None = None,
    commit: bool = True,
) -> FlowConnection:
    connection = get_or_create_connection(db)
    session_id = session_id or (
        connection.factory_session_id if connection.factory_project_id == project_id else None
    )
    state = infer_task_state(db, project_id, session_id=session_id, fallback="processing")
    run = db.query(FlowFactoryRun).filter(FlowFactoryRun.session_id == session_id).first() if session_id else None
    if run and state in {"completed", "failed"}:
        run.status = state
        run.error = connection.last_error if state == "failed" else ""
        run.finished_at = datetime.utcnow()
        run.updated_at = datetime.utcnow()
    if connection.factory_project_id == project_id and (not session_id or connection.factory_session_id == session_id):
        connection.factory_state = state
        connection.last_state_at = datetime.utcnow()
        if state != "failed":
            connection.last_error = ""
        if state in {"completed", "failed"}:
            # Clear the just-finished browser slot and immediately activate the
            # oldest queued project, exactly like Revo's serialized job worker.
            connection.factory_project_id = None
            connection.factory_session_id = ""
            activate_next_factory_run(db, commit=False)
    if commit:
        db.commit()
    return connection


def connection_payload(connection: FlowConnection | None) -> dict:
    if not connection:
        return {
            "status": "unpaired",
            "factory_state": "waiting_login",
            "factory_mode": True,
            "include_video": True,
            "factory_stage": "image",
            "factory_project_id": None,
            "factory_session_id": "",
            "last_error": "",
        }
    return {
        "id": connection.id,
        "extension_id": connection.extension_id or "",
        "extension_version": connection.extension_version or "",
        "extension_name": connection.extension_name or "",
        "google_account": connection.google_account or "",
        "profile_name": connection.profile_name or "",
        "paired_at": connection.paired_at.isoformat() if connection.paired_at else None,
        "heartbeat_at": connection.heartbeat_at.isoformat() if connection.heartbeat_at else None,
        "status": connection.status or "unpaired",
        "factory_state": connection.factory_state or "waiting_login",
        "factory_mode": bool(connection.factory_mode),
        "include_video": bool(connection.include_video),
        "factory_stage": connection.factory_stage or "image",
        "factory_project_id": connection.factory_project_id,
        "factory_session_id": connection.factory_session_id or "",
        "browser_profile_path": connection.browser_profile_path or "",
        "last_error": connection.last_error or "",
        "last_state_at": connection.last_state_at.isoformat() if connection.last_state_at else None,
        "updated_at": connection.updated_at.isoformat() if connection.updated_at else None,
    }
