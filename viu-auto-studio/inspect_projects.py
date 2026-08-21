import sqlite3
from pathlib import Path

candidates = [
    Path(r"C:\Users\works\AppData\Roaming\Electron\data\viu_auto_studio.db"),
    Path(r"C:\Users\works\AppData\Roaming\Electron\data\app.db"),
]
for path in candidates:
    if not path.is_file():
        continue
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute("select id, name, status, project_directory from projects order by id").fetchall()
    except sqlite3.Error:
        rows = []
    print(path)
    for row in rows:
        print(row)
    conn.close()
