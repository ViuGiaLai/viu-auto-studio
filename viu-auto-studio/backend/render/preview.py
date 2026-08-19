"""Low-resolution preview rendering (1280x720 hoặc thấp hơn)."""

from __future__ import annotations

from pathlib import Path

from backend.render.ffmpeg_engine import FFmpegEngine


def render_preview(
    source_video: str,
    output_path: str,
    width: int = 1280,
    height: int = 720,
    crf: int = 28,
) -> str:
    """Downscale the source MP4 to a preview size for fast playback."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    engine = FFmpegEngine(log_path=str(Path(output_path).parent / "preview.log"))
    engine.run([
        "-i", source_video,
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf),
        "-c:a", "aac", "-b:a", "128k",
        "-y", output_path,
    ])
    return output_path
