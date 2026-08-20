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

from backend.models import ConnectorTask, FlowConnection

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


def infer_task_state(db: Session, project_id: int, *, fallback: str = "processing") -> str:
    rows = (
        db.query(ConnectorTask.status, func.count(ConnectorTask.id))
        .filter(ConnectorTask.project_id == project_id)
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


def refresh_task_state(db: Session, project_id: int, *, commit: bool = True) -> FlowConnection:
    connection = get_or_create_connection(db)
    state = infer_task_state(db, project_id, fallback="processing")
    if connection.factory_project_id == project_id or state in {"completed", "failed"}:
        connection.factory_state = state
        connection.factory_project_id = project_id
        connection.last_state_at = datetime.utcnow()
        if state != "failed":
            connection.last_error = ""
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
