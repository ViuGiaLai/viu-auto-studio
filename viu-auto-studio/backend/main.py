"""Viu Auto Studio — FastAPI entry point.

Khởi động cùng Electron; dữ liệu lưu local-first (SQLite + thư mục dự án).
"""

from __future__ import annotations

import logging
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core.config import DATA_DIR, init_data_dirs
from backend.db import init_db
from backend.api.routes import router
from backend.api.connector_routes import router as connector_router
from backend.api.pages_routes import router as pages_router
from backend.api.skill_routes import router as skill_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stdout,
)


def cleanup_stale_uploads(max_age_seconds: int = 24 * 60 * 60) -> int:
    """Remove upload chunks left behind by a crashed request or process."""
    upload_dir = DATA_DIR / "upload_tmp"
    if not upload_dir.exists():
        return 0
    cutoff = time.time() - max_age_seconds
    removed = 0
    for path in upload_dir.iterdir():
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                removed += 1
        except OSError:
            logging.getLogger("viu.startup").warning("Không thể dọn tệp tạm: %s", path)
    return removed


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_data_dirs()
    removed_uploads = cleanup_stale_uploads()
    if removed_uploads:
        logging.getLogger("viu.startup").info("Đã dọn %s upload tạm cũ", removed_uploads)
    init_db()
    yield


app = FastAPI(
    title="Viu Auto Studio API",
    version="1.0.0",
    lifespan=lifespan,
)

from pathlib import Path

VAS_STATIC_DIR = Path(__file__).resolve().parent / "static"
VAS_STATIC_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    # Backend is local-first. Keep Electron's file origin and local dev servers,
    # but do not allow arbitrary websites to call the local API if the port leaks.
    allow_origins=["null"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Viu-Flow-Token"],
)

app.include_router(router, prefix="/api")
app.include_router(connector_router, prefix="/api")
app.include_router(pages_router, prefix="/api")
app.include_router(skill_router, prefix="/api")

# Mount root routers as well for full compatibility
app.include_router(router)
app.include_router(connector_router)
app.include_router(pages_router)
app.include_router(skill_router)

app.mount("/vas", StaticFiles(directory=str(VAS_STATIC_DIR)), name="vas_static")

if __name__ == "__main__":
    import uvicorn
    from backend.core.config import HOST, PORT

    init_data_dirs()
    init_db()
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)
