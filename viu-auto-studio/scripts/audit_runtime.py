from __future__ import annotations

from pathlib import Path

from backend.core.config import DATA_DIR, LOG_DIR, PROJECTS_DIR
from backend.core.database import engine
from backend.db import init_db


def main() -> None:
    init_db()
    with engine.connect() as conn:
        integrity = conn.exec_driver_sql("PRAGMA integrity_check").fetchone()[0]
        journal = conn.exec_driver_sql("PRAGMA journal_mode").fetchone()[0]
        foreign_keys = conn.exec_driver_sql("PRAGMA foreign_keys").fetchone()[0]
        tables = [row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        required = {"projects", "scripts", "scenes", "connector_tasks", "flow_connections", "render_jobs"}
        missing = sorted(required.difference(tables))
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity failed: {integrity}")
        if missing:
            raise RuntimeError(f"Missing tables: {missing}")
        for folder in (DATA_DIR, LOG_DIR, PROJECTS_DIR):
            folder.mkdir(parents=True, exist_ok=True)
            if not folder.is_dir():
                raise RuntimeError(f"Runtime path is not a directory: {folder}")
        if int(foreign_keys) != 1:
            raise RuntimeError(f"SQLite foreign_keys pragma is not enabled: {foreign_keys}")
        print(f"SYSTEM_AUDIT_PASS integrity={integrity} journal={journal} foreign_keys={foreign_keys} tables={len(tables)}")


if __name__ == "__main__":
    main()
