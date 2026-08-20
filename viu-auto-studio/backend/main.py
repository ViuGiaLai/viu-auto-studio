"""Viu Auto Studio — FastAPI entry point.

Khởi động cùng Electron; dữ liệu lưu local-first (SQLite + thư mục dự án).
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core.config import init_data_dirs
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_data_dirs()
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
    allow_origins=["*", "null"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(connector_router, prefix="/api")
app.include_router(pages_router, prefix="/api")
app.include_router(skill_router, prefix="/api")

app.mount("/vas", StaticFiles(directory=str(VAS_STATIC_DIR)), name="vas_static")

if __name__ == "__main__":
    import uvicorn
    from backend.core.config import HOST, PORT

    init_data_dirs()
    init_db()
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)
