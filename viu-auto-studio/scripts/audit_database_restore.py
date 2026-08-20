from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from backend.core.config import DATABASE_URL


def sqlite_path() -> Path:
    prefix = "sqlite:///"
    if not DATABASE_URL.startswith(prefix):
        raise RuntimeError(f"Unsupported DATABASE_URL for restore audit: {DATABASE_URL}")
    return Path(DATABASE_URL[len(prefix):]).resolve()


def main() -> None:
    source_path = sqlite_path()
    if not source_path.exists():
        raise RuntimeError(f"Database does not exist: {source_path}")
    with tempfile.TemporaryDirectory(prefix="viu-db-restore-") as tmp:
        backup_path = Path(tmp) / "backup.sqlite3"
        source = sqlite3.connect(source_path, timeout=30)
        target = sqlite3.connect(backup_path, timeout=30)
        try:
            source.backup(target)
            target.commit()
            integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
            table_count = target.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        finally:
            target.close()
            source.close()
        if integrity != "ok":
            raise RuntimeError(f"Restored backup integrity failed: {integrity}")
        if table_count < 1:
            raise RuntimeError("Restored backup contains no tables")
        print(f"DATABASE_RESTORE_AUDIT_PASS integrity={integrity} tables={table_count} bytes={backup_path.stat().st_size}")


if __name__ == "__main__":
    main()
