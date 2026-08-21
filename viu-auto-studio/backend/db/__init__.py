"""Database initialization helpers.

Re-exports session utilities and provides schema creation used at app
startup. Alembic can be wired in later without changing the model layer.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from backend.core.database import Base, SessionLocal, engine, get_db


def _ensure_column(table_name: str, column_name: str, column_ddl: str) -> None:
    """Add a missing SQLite column without requiring a destructive migration."""
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in columns:
        return
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_ddl}"))


def init_db() -> None:
    """Create tables and apply small idempotent compatibility migrations."""
    Base.metadata.create_all(bind=engine)
    _ensure_column("scenes", "transition_description", "transition_description TEXT DEFAULT ''")
    _ensure_column("scenes", "image_path", "image_path VARCHAR(512) DEFAULT ''")
    _ensure_column("scenes", "video_path", "video_path VARCHAR(512) DEFAULT ''")
    _ensure_column("scenes", "shots_json", "shots_json TEXT DEFAULT '[]'")
    _ensure_column("connector_tasks", "stage", "stage VARCHAR(16) DEFAULT 'image'")
    _ensure_column("connector_tasks", "factory_session_id", "factory_session_id VARCHAR(64) DEFAULT ''")
    _ensure_column("flow_connections", "factory_state", "factory_state VARCHAR(32) DEFAULT 'waiting_login'")
    _ensure_column("flow_connections", "factory_mode", "factory_mode BOOLEAN DEFAULT 1")
    _ensure_column("flow_connections", "include_video", "include_video BOOLEAN DEFAULT 1")
    _ensure_column("flow_connections", "factory_stage", "factory_stage VARCHAR(16) DEFAULT 'image'")
    _ensure_column("flow_connections", "factory_project_id", "factory_project_id INTEGER")
    _ensure_column("flow_connections", "factory_session_id", "factory_session_id VARCHAR(64) DEFAULT ''")
    _ensure_column("flow_connections", "browser_profile_path", "browser_profile_path VARCHAR(512) DEFAULT ''")
    _ensure_column("flow_connections", "last_error", "last_error TEXT DEFAULT ''")
    _ensure_column("flow_connections", "last_state_at", "last_state_at DATETIME")
