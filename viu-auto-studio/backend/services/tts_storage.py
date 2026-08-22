"""Storage policy for TTS preview files and reusable TTS cache."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Iterable

from backend.core.config import DATA_DIR

PREVIEW_TTL_SECONDS = 30 * 60
GENERATED_TTL_SECONDS = 30 * 60
CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
CACHE_LIMIT_BYTES = 1024 * 1024 * 1024


def temp_root() -> Path:
    return Path(tempfile.gettempdir()) / "ViuAutoStudio" / "tts"


def preview_dir() -> Path:
    path = temp_root() / "preview"
    path.mkdir(parents=True, exist_ok=True)
    return path


def generated_dir() -> Path:
    path = temp_root() / "generated"
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_dir() -> Path:
    path = Path(DATA_DIR) / "cache" / "tts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _iter_audio(directory: Path) -> Iterable[Path]:
    if not directory.exists():
        return []
    return (item for item in directory.iterdir() if item.is_file() and item.suffix.lower() in {".mp3", ".wav", ".ogg", ".m4a"})


def tts_cache_key(text: str, settings: dict) -> str:
    # Hash the credential so changing key/account invalidates cache
    api_key_sample = str(settings.get("api_key") or settings.get("api_keys", {}).get(settings.get("provider", "")) or "")[:12]
    material = {
        "text": text.strip(),
        "provider": str(settings.get("provider", "edge")).lower().strip(),
        "voice": str(settings.get("voice", "")).strip(),
        "speed": round(float(settings.get("speed", 1.0)), 2),
        "pitch": round(float(settings.get("pitch", 0.0)), 2),
        "volume": round(float(settings.get("volume", 1.0)), 2),
        "language": str(settings.get("language", "")).strip(),
        "model": str(settings.get("model_name", "") or settings.get("model_id", "")).strip(),
        "key_hash": hashlib.md5(api_key_sample.encode("utf-8")).hexdigest() if api_key_sample else "",
    }
    encoded = json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def cache_path(key: str) -> Path:
    return cache_dir() / f"{key}.mp3"


def mark_cache_used(path: Path) -> None:
    """Refresh cache recency so the TTL represents inactivity, not creation time."""
    try:
        path.touch()
    except OSError:
        pass


def new_preview_path(key: str) -> Path:
    return preview_dir() / f"preview_{key}_{int(time.time() * 1000)}.mp3"


def remove_other_previews(keep: Path | None = None) -> int:
    removed = 0
    for item in _iter_audio(preview_dir()):
        if keep is not None and item.resolve() == keep.resolve():
            continue
        try:
            item.unlink()
            removed += 1
        except OSError:
            pass
    return removed


def cleanup_preview_files() -> int:
    cutoff = time.time() - PREVIEW_TTL_SECONDS
    removed = 0
    for item in _iter_audio(preview_dir()):
        try:
            if item.stat().st_mtime < cutoff:
                item.unlink()
                removed += 1
        except OSError:
            pass
    return removed


def cleanup_generated_files() -> int:
    cutoff = time.time() - GENERATED_TTL_SECONDS
    removed = 0
    for item in _iter_audio(generated_dir()):
        try:
            if item.stat().st_mtime < cutoff:
                item.unlink()
                removed += 1
        except OSError:
            pass
    return removed


def cleanup_tts_cache() -> dict[str, int]:
    now = time.time()
    removed = 0
    files = []
    for item in _iter_audio(cache_dir()):
        try:
            stat = item.stat()
            if stat.st_mtime < now - CACHE_TTL_SECONDS:
                item.unlink()
                removed += 1
            else:
                files.append((item, stat.st_size, stat.st_mtime))
        except OSError:
            pass
    total = sum(size for _, size, _ in files)
    if total > CACHE_LIMIT_BYTES:
        for item, size, _mtime in sorted(files, key=lambda entry: entry[2]):
            if total <= CACHE_LIMIT_BYTES:
                break
            try:
                item.unlink()
                total -= size
                removed += 1
            except OSError:
                pass
    return {"removed": removed, "bytes": total}


def cleanup_all_tts_storage() -> dict[str, int]:
    return {
        "preview_removed": cleanup_preview_files(),
        "generated_removed": cleanup_generated_files(),
        "cache_removed": cleanup_tts_cache()["removed"],
    }


def storage_stats() -> dict[str, int | str]:
    preview_bytes = sum(item.stat().st_size for item in _iter_audio(preview_dir()) if item.exists())
    generated_bytes = sum(item.stat().st_size for item in _iter_audio(generated_dir()) if item.exists())
    cache_bytes = sum(item.stat().st_size for item in _iter_audio(cache_dir()) if item.exists())
    return {
        "preview_bytes": preview_bytes,
        "generated_bytes": generated_bytes,
        "cache_bytes": cache_bytes,
        "cache_limit_bytes": CACHE_LIMIT_BYTES,
        "preview_ttl_seconds": PREVIEW_TTL_SECONDS,
        "generated_ttl_seconds": GENERATED_TTL_SECONDS,
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "preview_dir": str(preview_dir()),
        "cache_dir": str(cache_dir()),
    }


def clear_tts_cache() -> dict[str, int]:
    removed = 0
    for item in list(_iter_audio(cache_dir())):
        try:
            item.unlink()
            removed += 1
        except OSError:
            pass
    return {"removed": removed}


def clear_generated_files() -> int:
    removed = 0
    for item in list(_iter_audio(generated_dir())):
        try:
            item.unlink()
            removed += 1
        except OSError:
            pass
    return removed
