"""Database initialization helpers.

Re-exports session utilities and provides schema creation used at app
startup. Alembic can be wired in later without changing the model layer.
"""

from __future__ import annotations

from backend.core.database import Base, SessionLocal, engine, get_db


def init_db() -> None:
    """Create all tables that do not exist yet (idempotent)."""
    Base.metadata.create_all(bind=engine)
