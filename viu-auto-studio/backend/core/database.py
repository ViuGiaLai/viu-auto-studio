"""SQLAlchemy database engine and session management."""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker, declarative_base

from backend.core.config import DATABASE_URL, DATA_DIR

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    echo=False,
    pool_pre_ping=True,
)

# Enable WAL mode and foreign keys for SQLite

def _auto_migrate_columns(dbapi_connection):
    """Ensure newly added columns exist in SQLite tables seamlessly."""
    cursor = dbapi_connection.cursor()
    try:
        # Check render_jobs table
        cursor.execute("PRAGMA table_info(render_jobs)")
        existing_cols = {row[1] for row in cursor.fetchall()}
        
        needed_cols = [
            ("job_type", "VARCHAR(64) DEFAULT 'render'"),
            ("domain", "VARCHAR(32) DEFAULT 'render'"),
            ("title", "VARCHAR(255) DEFAULT ''"),
            ("priority", "VARCHAR(32) DEFAULT 'normal'"),
            ("params_json", "TEXT DEFAULT '{}'"),
            ("schema_version", "INTEGER DEFAULT 1"),
            ("result_json", "TEXT DEFAULT '{}'"),
            ("result_schema_version", "INTEGER DEFAULT 1"),
            ("depends_on_json", "TEXT DEFAULT '[]'"),
            ("error_category", "VARCHAR(64) DEFAULT ''"),
            ("max_retries", "INTEGER DEFAULT 3"),
            ("speed_multiplier", "FLOAT DEFAULT 1.0"),
            ("eta_seconds", "INTEGER DEFAULT 0"),
            ("worker_id", "VARCHAR(64) DEFAULT ''"),
        ]
        for col_name, col_def in needed_cols:
            if col_name not in existing_cols and existing_cols:
                try:
                    cursor.execute(f"ALTER TABLE render_jobs ADD COLUMN {col_name} {col_def}")
                except Exception:
                    pass
    except Exception:
        pass
    finally:
        cursor.close()


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA foreign_keys=ON")
    _auto_migrate_columns(dbapi_connection)
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def get_db() -> Session:  # noqa: ANN001 - FastAPI Depends yield generator
    """FastAPI dependency that yields a request-scoped database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
