import sqlite3
import os
from pathlib import Path
from backend.core.config import DATA_DIR

db_path = DATA_DIR / "app.db"
if not db_path.exists():
    db_path = Path(__file__).resolve().parent / "data" / "app.db"

if db_path.exists():
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, updated_at FROM projects ORDER BY id DESC LIMIT 10")
    print("Recent Projects:")
    for row in cursor.fetchall():
        print(row)
    conn.close()
else:
    print("Database file not found at:", db_path)
