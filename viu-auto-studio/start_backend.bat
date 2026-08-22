@echo off
title Viu Auto Studio - FastAPI Backend
echo ==================================================
echo Starting Viu Auto Studio Backend on http://localhost:8000 ...
echo Swagger UI API Docs: http://localhost:8000/docs
echo ==================================================
cd /d "%~dp0"
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
