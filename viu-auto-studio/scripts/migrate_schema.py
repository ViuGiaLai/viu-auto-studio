"""Idempotent schema migration for existing SQLite databases.

Adds columns introduced by model changes:
- channels.config_json
- render_jobs.retry_count
"""

from __future__ import annotations

from pathlib import Path

import sqlite3

from backend.core.config import DATA_DIR

DB_PATH = DATA_DIR / "app.db"

ALTERS = [
    ("channels", "config_json", "TEXT DEFAULT '{}'"),
    ("render_jobs", "retry_count", "INTEGER DEFAULT 0"),
    ("projects", "project_type", "TEXT DEFAULT 'ai_studio'"),
    ("scripts", "series_link", "TEXT DEFAULT ''"),
    ("scripts", "visual_style", "TEXT DEFAULT ''"),
    ("scripts", "viral_reason", "TEXT DEFAULT ''"),
    ("scripts", "status", "TEXT DEFAULT 'proposed'"),
]

TABLES = [
    (
        "characters",
        """
        CREATE TABLE characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            channel_id INTEGER,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            image_path TEXT DEFAULT '',
            is_host BOOLEAN DEFAULT 0,
            is_fixed BOOLEAN DEFAULT 0,
            ai_tag TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "pipeline_states",
        """
        CREATE TABLE pipeline_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER UNIQUE NOT NULL,
            status TEXT DEFAULT 'idle',
            step_data_json TEXT DEFAULT '{}',
            error_step TEXT DEFAULT '',
            last_log TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
]


def main() -> None:
    if not DB_PATH.exists():
        print(f"DB not found at {DB_PATH}; nothing to migrate.")
        return
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    for table, column, definition in ALTERS:
        cursor.execute(
            "SELECT name FROM pragma_table_info(?) WHERE name=?", (table, column)
        )
        if cursor.fetchone():
            print(f"  column {table}.{column} already exists — skip")
            continue
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        print(f"  added {table}.{column}")

    for table_name, create_sql in TABLES:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
        )
        if cursor.fetchone():
            print(f"  table {table_name} already exists — skip")
            continue
        cursor.execute(create_sql)
        print(f"  created table {table_name}")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()
