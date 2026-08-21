"""Internal tool installer for Viu Auto Studio.

The desktop app owns this directory and downloads tools only after an explicit
user action. No external installer or package manager is required for FFmpeg or
standalone yt-dlp on Windows.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

from backend.core.config import DATA_DIR

TOOL_ROOT = DATA_DIR / "tools"
FFMPEG_ROOT = TOOL_ROOT / "ffmpeg"
YTDLP_ROOT = TOOL_ROOT / "yt-dlp"

FFMPEG_WINDOWS_URL = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"
YTDLP_WINDOWS_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"

ProgressCallback = Callable[[str, int, int | None], None]


def _emit(progress: ProgressCallback | None, stage: str, completed: int = 0, total: int | None = None) -> None:
    if progress:
        progress(stage, completed, total)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download(url: str, destination: Path, progress: ProgressCallback | None = None) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _emit(progress, "Đang tải", 0, None)
    request = urllib.request.Request(url, headers={"User-Agent": "ViuAutoStudio/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        total_header = response.headers.get("Content-Length")
        total = int(total_header) if total_header and total_header.isdigit() else None
        completed = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            completed += len(chunk)
            _emit(progress, "Đang tải", completed, total)
    if destination.stat().st_size == 0:
        raise RuntimeError(f"Tải file rỗng từ {url}")
    return _sha256(destination)


def _make_executable(path: Path) -> None:
    if os.name != "nt":
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _write_manifest(tool_id: str, version: str, files: list[Path], checksums: dict[str, str]) -> None:
    manifest = {
        "tool": tool_id,
        "version": version,
        "files": {str(path.relative_to(TOOL_ROOT)): checksums.get(str(path), _sha256(path)) for path in files},
    }
    TOOL_ROOT.mkdir(parents=True, exist_ok=True)
    (TOOL_ROOT / f"{tool_id}.manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def latest_ffmpeg_info() -> dict:
    request = urllib.request.Request(
        "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest",
        headers={"User-Agent": "ViuAutoStudio/1.0", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    assets = payload.get("assets") or []
    asset = next((item for item in assets if item.get("name") == "ffmpeg-master-latest-win64-gpl.zip"), None)
    return {"version": payload.get("tag_name") or payload.get("name") or "latest", "asset_name": asset.get("name") if asset else "", "asset_size": asset.get("size") if asset else None}


def install_ffmpeg(progress: ProgressCallback | None = None) -> dict:
    if os.name != "nt":
        raise RuntimeError("Bộ cài nội bộ FFmpeg hiện hỗ trợ Windows trước.")
    with tempfile.TemporaryDirectory(prefix="viu-ffmpeg-") as temporary:
        archive = Path(temporary) / "ffmpeg.zip"
        digest = _download(FFMPEG_WINDOWS_URL, archive, progress)
        _emit(progress, "Đang xác minh gói FFmpeg")
        extract_root = Path(temporary) / "extracted"
        with zipfile.ZipFile(archive) as zipped:
            zipped.extractall(extract_root)
        ffmpeg_candidates = list(extract_root.rglob("ffmpeg.exe"))
        ffprobe_candidates = list(extract_root.rglob("ffprobe.exe"))
        if not ffmpeg_candidates or not ffprobe_candidates:
            raise RuntimeError("Gói FFmpeg không chứa ffmpeg.exe và ffprobe.exe hợp lệ.")
        staging = TOOL_ROOT / "ffmpeg.staging"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        ffmpeg_target = staging / "ffmpeg.exe"
        ffprobe_target = staging / "ffprobe.exe"
        shutil.copy2(ffmpeg_candidates[0], ffmpeg_target)
        shutil.copy2(ffprobe_candidates[0], ffprobe_target)
        if FFMPEG_ROOT.exists():
            shutil.rmtree(FFMPEG_ROOT, ignore_errors=True)
        staging.replace(FFMPEG_ROOT)
        checksums = {str(ffmpeg_target): _sha256(FFMPEG_ROOT / "ffmpeg.exe"), str(ffprobe_target): _sha256(FFMPEG_ROOT / "ffprobe.exe")}
        _write_manifest("ffmpeg", "latest", [FFMPEG_ROOT / "ffmpeg.exe", FFMPEG_ROOT / "ffprobe.exe"], checksums)
        _emit(progress, "Đã cài FFmpeg", archive.stat().st_size, archive.stat().st_size)
        return {"tool": "ffmpeg", "ffmpeg_path": str(FFMPEG_ROOT / "ffmpeg.exe"), "ffprobe_path": str(FFMPEG_ROOT / "ffprobe.exe"), "sha256": digest}


def install_ytdlp(progress: ProgressCallback | None = None) -> dict:
    filename = "yt-dlp.exe" if os.name == "nt" else "yt-dlp"
    url = YTDLP_WINDOWS_URL if os.name == "nt" else "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    YTDLP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="viu-ytdlp-") as temporary:
        temporary_path = Path(temporary) / filename
        digest = _download(url, temporary_path, progress)
        target = YTDLP_ROOT / filename
        shutil.copy2(temporary_path, target)
        _make_executable(target)
        _write_manifest("yt-dlp", "latest", [target], {str(target): digest})
        _emit(progress, "Đã cài yt-dlp", target.stat().st_size, target.stat().st_size)
        return {"tool": "yt_dlp", "yt_dlp_path": str(target), "sha256": digest}


def install_python_packages(packages: list[str], progress: ProgressCallback | None = None) -> dict:
    if not packages:
        return {"packages": []}
    _emit(progress, "Đang cài thành phần AI", 0, None)
    command = [sys.executable, "-m", "pip", "install", "--upgrade", *packages]
    result = subprocess.run(command, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "pip install thất bại")[-4000:])
    _emit(progress, "Đã cài thành phần AI")
    return {"packages": packages, "output": (result.stdout or "")[-2000:]}


def install_dependencies(dependency_ids: list[str], progress: ProgressCallback | None = None) -> dict:
    result: dict = {"installed": []}
    requested = set(dependency_ids)
    if "ffmpeg" in requested or "ffprobe" in requested:
        result.update(install_ffmpeg(progress))
        result["installed"].extend(["ffmpeg", "ffprobe"])
    if "yt_dlp" in requested:
        result.update(install_ytdlp(progress))
        result["installed"].append("yt_dlp")
    packages = []
    if "pytorch" in requested:
        packages.append("torch")
    if "demucs" in requested:
        packages.append("demucs")
    if packages:
        result.update(install_python_packages(packages, progress))
        result["installed"].extend(["pytorch" if package == "torch" else "demucs" for package in packages])
    return result


def internal_tool_paths() -> dict[str, str]:
    paths: dict[str, str] = {}
    ffmpeg = FFMPEG_ROOT / "ffmpeg.exe" if os.name == "nt" else FFMPEG_ROOT / "ffmpeg"
    ffprobe = FFMPEG_ROOT / "ffprobe.exe" if os.name == "nt" else FFMPEG_ROOT / "ffprobe"
    ytdlp = YTDLP_ROOT / ("yt-dlp.exe" if os.name == "nt" else "yt-dlp")
    if ffmpeg.is_file():
        paths["ffmpeg"] = str(ffmpeg)
    if ffprobe.is_file():
        paths["ffprobe"] = str(ffprobe)
    if ytdlp.is_file():
        paths["yt_dlp"] = str(ytdlp)
    return paths
