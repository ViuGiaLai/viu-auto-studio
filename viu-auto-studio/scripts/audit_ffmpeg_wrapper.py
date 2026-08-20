from __future__ import annotations

import tempfile
from pathlib import Path

from backend.render.ffmpeg_engine import FFmpegEngine


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="viu-ffmpeg-audit-") as tmp:
        log_path = Path(tmp) / "ffmpeg.log"
        engine = FFmpegEngine(str(log_path))
        engine.run(["-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.1", "-frames:v", "1", "-f", "null", "-"])
        if not log_path.is_file() or "ffmpeg" not in log_path.read_text(encoding="utf-8", errors="replace"):
            raise AssertionError("FFmpeg log was not written")
        if engine.timeout_seconds < 60:
            raise AssertionError("FFmpeg timeout guard is below the minimum")
    print(f"FFMPEG_WRAPPER_AUDIT_PASS timeout={engine.timeout_seconds}")


if __name__ == "__main__":
    main()
