"""Migration: thêm cột style_prompt vào bảng scenes (SQLite)."""
import sqlite3

from pathlib import Path
DB = str((Path(__file__).resolve().parent / "data" / "app.db").resolve())
conn = sqlite3.connect(DB)
cur = conn.cursor()
cols = {r[1] for r in cur.execute("PRAGMA table_info(scenes)")}
if "style_prompt" not in cols:
    cur.execute("ALTER TABLE scenes ADD COLUMN style_prompt TEXT DEFAULT ''")
    conn.commit()
    print("added style_prompt column")
else:
    print("column already exists")
conn.close()
