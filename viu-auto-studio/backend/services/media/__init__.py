"""Media utilities: FFprobe-based introspection and media helpers."""

from __future__ import annotations

import subprocess
from pathlib import Path

from backend.core.config import FFPROBE_BIN
from backend.schemas import MediaInfo


def get_media_info(path: str) -> MediaInfo:
    """Read real media metadata via ffprobe. Raise RuntimeError if unreadable."""
    if not path or not Path(path).exists():
        return MediaInfo(path=path or "", duration=0.0, width=0, height=0, media_type="unknown")

    try:
        probe = subprocess.run(
            [
                FFPROBE_BIN, "-v", "error",
                "-show_entries", "format=duration",
                "-show_entries", "stream=codec_type,width,height,r_frame_rate",
                "-of", "json",
                str(path),
            ],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if probe.returncode != 0:
            return MediaInfo(path=path, duration=0.0, width=0, height=0, media_type="unknown")
        import json
        data = json.loads(probe.stdout)
    except (subprocess.TimeoutExpired, ValueError):
        return MediaInfo(path=path, duration=0.0, width=0, height=0, media_type="unknown")

    fmt = data.get("format", {})
    duration = float(fmt.get("duration", 0.0) or 0.0)
    streams = data.get("streams", [])

    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]

    if video_streams:
        video = video_streams[0]
        return MediaInfo(
            path=path,
            duration=duration,
            width=int(video.get("width", 0) or 0),
            height=int(video.get("height", 0) or 0),
            media_type="video",
        )
    if audio_streams:
        return MediaInfo(path=path, duration=duration, media_type="audio")

    # No streams detected — possibly an image
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        return MediaInfo(path=path, duration=0.0, media_type="image")
    return MediaInfo(path=path, duration=0.0, media_type="unknown")


def get_audio_duration(path: str) -> float:
    """Return the TRUE audio duration of a file using ffprobe (bắt buộc theo đặc tả)."""
    info = get_media_info(path)
    return info.duration


def estimate_text_duration(text: str, words_per_minute: int = 150) -> float:
    """Rough speech duration estimate from text length (fallback only)."""
    words = len(text.split())
    return max(0.5, words / words_per_minute * 60.0)


POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"
POLLINATIONS_TIMEOUT = 90  # giây, ảnh AI sinh khoảng 20–60s


def generate_ai_image(
    prompt: str,
    out_path: str,
    width: int = 1280,
    height: int = 720,
    seed: int | None = None,
    negative_prompt: str = "",
) -> str:
    """Sinh ảnh AI thật từ prompt (Pollinations.ai — miễn phí, không API key).

    Trả về đường dẫn file ảnh đã lưu. Raise RuntimeError nếu không sinh được.
    """
    import time

    import requests

    prompt = (prompt or "").strip()
    if not prompt:
        raise RuntimeError("Prompt tạo ảnh rỗng — không thể sinh media AI")

    if seed is None:
        seed = int(time.time() * 1000) % 10**6

    params = {
        "width": width,
        "height": height,
        "seed": seed,
        "nologo": "true",
        "model": "flux",
    }
    url = POLLINATIONS_URL.format(prompt=requests.utils.quote(prompt))

    last_exc: Exception | None = None
    for attempt in range(2):  # thử lại 1 lần khi timeout
        try:
            resp = requests.get(url, params=params, timeout=POLLINATIONS_TIMEOUT, stream=True)
            resp.raise_for_status()
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "wb") as fp:
                for chunk in resp.iter_content(chunk_size=256 * 1024):
                    fp.write(chunk)
            # Validate: phải là ảnh JPEG/PNG hợp lệ
            size = Path(out_path).stat().st_size
            if size < 4096:
                Path(out_path).unlink(missing_ok=True)
                raise RuntimeError(f"Ảnh nhận được quá nhỏ ({size} bytes) — thử lại")
            with open(out_path, "rb") as fp:
                header = fp.read(8)
            if not (header[:3] in (b"\xff\xd8\xff", b"\x89PNG\r")):
                Path(out_path).unlink(missing_ok=True)
                raise RuntimeError("Ảnh nhận được không đúng định dạng — thử lại")
            return str(out_path)
        except requests.RequestException as exc:  # noqa: BLE001
            last_exc = exc
            Path(out_path).unlink(missing_ok=True)
    raise RuntimeError(f"Sinh ảnh AI thất bại sau 2 lần thử: {last_exc}")
