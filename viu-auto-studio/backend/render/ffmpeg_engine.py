"""FFmpeg render engine — gọi FFmpeg thật bằng subprocess an toàn.

Quy tắc an toàn (bắt buộc theo đặc tả):
- KHÔNG dùng shell=True
- KHÔNG nối trực tiếp dữ liệu người dùng thành câu lệnh shell (toàn bộ tham
  số được truyền dưới dạng list, được trích dẫn tự động bởi subprocess)
- Mọi kết xuất được ghi log
- Kiểm tra sự tồn tại của FFmpeg trước khi render; hướng dẫn cài đặt rõ ràng
  nếu thiếu thay vì crash ứng dụng
"""

from __future__ import annotations

import logging
import os
import shutil
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from backend.core.config import FFMPEG_BIN, get_system_subtitles_font_dir
from backend.services.media import get_audio_duration

log = logging.getLogger("viu.render")

INSTALL_GUIDE = (
    "FFmpeg không được tìm thấy trên hệ thống. Vui lòng cài đặt FFmpeg:\n"
    "  - Windows: tải từ https://www.gyan.dev/ffmpeg/builds/ và thêm vào PATH,\n"
    "    hoặc chạy 'winget install Gyan.FFmpeg' trong PowerShell\n"
    "  - Sau khi cài, khởi động lại Viu Auto Studio."
)


def check_ffmpeg() -> dict:
    """Return availability info for ffmpeg and ffprobe."""
    from backend.core.config import FFPROBE_BIN

    result = {"ffmpeg": False, "ffprobe": False, "guide": INSTALL_GUIDE}
    path = shutil.which(FFMPEG_BIN)
    if path:
        result["ffmpeg"] = True
        result["ffmpeg_path"] = path
        try:
            out = subprocess.check_output([FFMPEG_BIN, "-version"], stderr=subprocess.STDOUT,
                                          stdin=subprocess.DEVNULL, timeout=10).decode("utf-8", "replace")
            first_line = out.splitlines()[0] if out else ""
            m = re.search(r"ffmpeg version ([\d.]+)", first_line)
            result["version"] = m.group(1) if m else "Phiên bản FFmpeg hệ thống"
        except Exception:
            result["version"] = ""
    else:
        result["version"] = ""
    path = shutil.which(FFPROBE_BIN)
    if path:
        result["ffprobe"] = True
        result["ffprobe_path"] = path
    return result


class RenderError(RuntimeError):
    """Raised when an ffmpeg command fails, carrying the captured log."""


class FFmpegEngine:
    """Safe subprocess wrapper around ffmpeg."""

    def __init__(self, log_path: Optional[str] = None) -> None:
        self.log_path = Path(log_path) if log_path else None
        try:
            configured_timeout = int(os.getenv("VIU_FFMPEG_TIMEOUT_SECONDS", "14400"))
        except ValueError:
            configured_timeout = 14400
        self.timeout_seconds = max(60, configured_timeout)
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    def run(self, args: List[str], progress_callback=None) -> str:
        """Run ffmpeg with the given argument list. Return full stderr log.

        All arguments MUST be passed as a list — never a single shell string.
        The process has a hard timeout so a broken codec/filter cannot leave a
        render thread and child process alive forever.
        """
        availability = check_ffmpeg()
        if not availability["ffmpeg"]:
            raise RenderError(INSTALL_GUIDE)

        log_file = None
        try:
            if self.log_path:
                log_file = self.log_path.open("a", encoding="utf-8")
                log_file.write(
                    f"\n=== {datetime.now().isoformat()} ===\n$ ffmpeg "
                    + " ".join(args) + "\n"
                )
                log_file.flush()

            process = subprocess.Popen(
                [FFMPEG_BIN, *args],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                _, stderr = process.communicate(timeout=self.timeout_seconds)
            except subprocess.TimeoutExpired:
                process.kill()
                _, stderr = process.communicate()
                detail = (stderr or "")[-1500:]
                raise RenderError(
                    f"FFmpeg timeout sau {self.timeout_seconds}s. "
                    f"Xem log tại {self.log_path}: {detail}"
                ) from None

            full_log = stderr or ""
            if log_file:
                log_file.write(full_log)
                log_file.flush()
            if progress_callback:
                for line in full_log.splitlines(True):
                    progress_callback(line)
            if process.returncode != 0:
                raise RenderError(
                    f"FFmpeg thất bại (exit {process.returncode}). "
                    f"Xem log tại {self.log_path}: " + full_log[-1500:]
                )
            return full_log
        finally:
            if log_file:
                log_file.close()

    # ------------------------------------------------------------------
    @staticmethod
    def _escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace(",", "\\,").replace("[", "\\[").replace("]", "\\]")

    # ------------------------------------------------------------------
    def build_scene_clip(
        self,
        media_path: str,
        media_type: str,
        audio_path: str,
        duration: float,
        output_path: str,
        width: int,
        height: int,
        fps: int = 30,
        effect: str = "zoom_in",
        subtitle_ass: Optional[str] = None,
        transform_scale: float = 1.0,
        transform_x: float = 0.0,
        transform_y: float = 0.0,
        audio_volume: float = 1.0,
    ) -> str:
        """Render one scene: image/video + Ken Burns effect + voiceover + subtitles."""
        # Guard: duration must never be None/invalid — fall back to 3s or audio length.
        try:
            duration = float(duration or 0.0)
        except (TypeError, ValueError):
            duration = 0.0
        if duration <= 0 and audio_path and Path(audio_path).exists():
            duration = get_audio_duration(audio_path)
        if duration <= 0:
            duration = 3.0
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        filters: List[str] = []
        inputs: List[str] = []
        transform_scale = max(1.0, min(2.0, float(transform_scale or 1.0)))
        transform_x = max(-1.0, min(1.0, float(transform_x or 0.0)))
        transform_y = max(-1.0, min(1.0, float(transform_y or 0.0)))
        audio_volume = max(0.0, min(2.0, float(audio_volume if audio_volume is not None else 1.0)))
        scaled_width = max(width, int(round(width * transform_scale)))
        scaled_height = max(height, int(round(height * transform_scale)))
        crop_x = f"max(0,min(iw-ow,(iw-ow)/2+({transform_x:.4f})*(iw-ow)/2))"
        crop_y = f"max(0,min(ih-oh,(ih-oh)/2+({transform_y:.4f})*(ih-oh)/2))"

        # --- Video source ---------------------------------------------------
        if media_type == "video" and Path(media_path).exists():
            inputs += ["-t", f"{duration:.3f}", "-i", media_path]
            filters.append(
                f"[0:v]scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height}:x='{crop_x}':y='{crop_y}',fps={fps},setpts=PTS-STARTPTS[vsrc]"
            )
            video_label = "[vsrc]"
        else:
            # Image source — apply Ken Burns effect; fall back to a solid
            # gradient-free color frame when the scene has no media file.
            use_color_fallback = (media_type != "video") and not (
                media_path and Path(media_path).exists()
            )
            zoom = {
                "zoom_in": "zoompan=z='min(1.0+0.0035*on,1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}",
                "zoom_out": "zoompan=z='max(1.15-0.0035*on,1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}",
                "pan_left": "zoompan=z=1.1:d=1:x='if(gte(on,1),x-1.2,0)':y=0:s={width}x{height}",
                "pan_right": "zoompan=z=1.1:d=1:x='if(lt(on,1),0,x+1.2)':y=0:s={width}x{height}",
                "none": "null",
            }.get(effect, "zoompan=z='min(1.0+0.0035*on,1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}")

            if use_color_fallback:
                # Lavfi solid-color fallback when no media was provided.
                inputs += ["-f", "lavfi", "-i",
                           f"color=c=0x111827:s={width}x{height}:r={fps}:d={max(duration, 3):.3f}"]
                filters.append(
                    f"[0:v]setpts=PTS-STARTPTS[vsrc]"
                )
            else:
                inputs += ["-loop", "1", "-i", media_path]
                filters.append(
                    f"[0:v]scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase,"
                    f"crop={width}:{height}:x='{crop_x}':y='{crop_y}',{zoom.format(width=width, height=height)},"
                    f"fps={fps},setpts=PTS-STARTPTS[vsrc]"
                )
            video_label = "[vsrc]"

        # --- Audio source ---------------------------------------------------
        if audio_path and Path(audio_path).exists():
            inputs += ["-i", audio_path]
            inputs += ["-t", f"{duration:.3f}"]
            filters.append(f"[1:a]volume={audio_volume:.4f},apad[aout]")
        else:
            # Scene has no voiceover — render with a silent track.
            # LƯU Ý: KHÔNG dùng `apad` kết hợp `anullsrc` + `-shortest` — audio
            # đệm vô hạn khiến ffmpeg thoát mã 255 kèm "received signal 15"
            # khi hoàn tất mux. Giữ duration hữu hạn trên anullsrc là đủ.
            silent_duration = max(float(duration or 3.0), 3.0)
            inputs += ["-f", "lavfi", "-i",
                       f"anullsrc=r=44100:cl=stereo:d={silent_duration:.3f}"]
            filters.append("[1:a]anull[aout]")

        # --- Subtitles ------------------------------------------------------
        if subtitle_ass and Path(subtitle_ass).exists():
            escaped = self._escape(str(subtitle_ass))
            font_dir = get_system_subtitles_font_dir()
            font_arg = f":fontsdir='{self._escape(font_dir)}'" if font_dir else ""
            filters.append(f"{video_label}subtitles='{escaped}'{font_arg}[vf1]")
            video_label = "[vf1]"

        filter_complex = ";".join(filters)

        args = [
            "-threads", "0",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", video_label, "-map", "[aout]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
        ]
        if audio_path and Path(audio_path).exists():
            # `-shortest` an toàn với track audio thực (hữu hạn).
            args.append("-shortest")
        else:
            # Silence fallback — cắt bằng `-t` tường minh để tránh
            # ffmpeg bị gửi signal 15 (exit 255) khi mux.
            args += ["-t", f"{max(float(duration or 3.0), 3.0):.3f}"]
        args += ["-y", output_path]
        self.run(args)
        return output_path

    # ------------------------------------------------------------------
    def concat_scenes(
        self,
        clip_paths: List[str],
        audio_path: str,
        music_path: str,
        music_volume: float,
        logo_path: str,
        logo_position: str,
        intro_path: str,
        outro_path: str,
        subtitle_ass: Optional[str],
        width: int,
        height: int,
        fps: int,
        crf: int,
        preset: str,
        output_path: str,
        transition: float = 0.5,
        transition_types: Optional[List[str]] = None,
        voice_volume: float = 1.0,
        enable_ducking: bool = True,
        normalize_audio: bool = True,
    ) -> str:
        """Compose all scene clips + music + logo + intro/outro into the final MP4."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        available_clips = [p for p in clip_paths if Path(p).exists()]
        if not available_clips:
            raise RenderError("Không có cảnh nào để render")

        # 1) Concatenate scene clips (with xfade transitions if transition>0 and 2+ clips).
        #    Với số cảnh lớn, gộp theo từng cặp (cascade merge) để tránh quá tải
        #    bộ nhớ khi xây filtergraph cho 19+ cảnh trong một lệnh duy nhất.
        if len(available_clips) >= 2 and transition > 0:
            merged = available_clips[0]
            workdir = Path(output_path).parent
            for idx, clip in enumerate(available_clips[1:], start=1):
                # Offset measured on the ACTUAL merged file duration — using
                # a hand-rolled running offset drifted after re-encoding.
                merged_d = self._clip_duration(merged)
                a_d = self._clip_duration(clip)
                tmp = str(workdir / f"_xfade_{idx:03d}.mp4")
                # Extend only the outgoing picture, then overlap the visuals at
                # the original cut point. Audio is concatenated (not
                # cross-faded), preserving narration timing and subtitle sync.
                offset = max(0.0, merged_d)
                requested = (transition_types or [])[idx - 1] if idx - 1 < len(transition_types or []) else "fade"
                transition_name = requested if requested in {"fade", "dissolve", "smoothleft", "smoothright"} else "fade"
                v_args = [
                    "-i", merged, "-i", clip,
                    "-filter_complex",
                    f"[0:v]tpad=stop_mode=clone:stop_duration={transition:.3f}[vhold];"
                    f"[vhold][1:v]xfade=transition={transition_name}:duration={transition:.3f}"
                    f":offset={offset:.3f}[vout];"
                    f"[0:a][1:a]concat=n=2:v=0:a=1[aout]",
                    "-map", "[vout]", "-map", "[aout]",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", str(crf),
                    "-c:a", "aac", "-b:a", "192k",
                    "-t", f"{merged_d + a_d:.3f}",
                    "-y", tmp,
                ]
                try:
                    self.run(v_args)
                except Exception:
                    Path(tmp).unlink(missing_ok=True)
                    raise
                if merged != available_clips[0]:
                    Path(merged).unlink(missing_ok=True)
                merged = tmp
            concat_args = ["-i", merged, "-map", "0:v", "-map", "0:a"]
        else:
            concat_args = []
            for clip in available_clips:
                concat_args += ["-i", clip]
            if len(available_clips) > 1:
                concat_args += [
                    "-filter_complex",
                    "".join(f"[{i}:v][{i}:a]" for i in range(len(available_clips)))
                    + f"concat=n={len(available_clips)}:v=1:a=1[vout][aout]",
                    "-map", "[vout]", "-map", "[aout]",
                ]
            else:
                concat_args += ["-map", "0:v", "-map", "0:a"]

        concat_tmp = str(Path(output_path).parent / "_concat_tmp.mp4")

        args = [
            "-threads", "0",
            *concat_args,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            "-y", concat_tmp,
        ]
        try:
            self.run(args)
        except Exception:
            Path(concat_tmp).unlink(missing_ok=True)
            for temp in Path(output_path).parent.glob("_xfade_*.mp4"):
                temp.unlink(missing_ok=True)
            raise

        # 2) Mix music (ducked), overlay logo, burn global subtitles, attach intro/outro
        inputs2: List[str] = ["-i", concat_tmp]
        filter_parts = []

        voice_gain = max(0.0, min(2.0, float(voice_volume)))
        voice_chain = f"volume={voice_gain:.3f}"
        if normalize_audio:
            voice_chain += ",loudnorm=I=-16:TP=-1.5:LRA=11"
        if music_path and Path(music_path).exists():
            inputs2 += ["-i", music_path]
            filter_parts.append(f"[0:a]{voice_chain}[voice]")
            filter_parts.append(
                "[1:a]volume="
                f"{max(0.0, min(1.0, music_volume)):.3f},"
                "afade=t=in:d=2,afade=t=out:st=3:d=3[music]"
            )
            if enable_ducking:
                filter_parts.append(
                    "[voice][music]sidechaincompress=threshold=0.03:ratio=8:attack=100:release=800,"
                    "amix=inputs=2:duration=first:dropout_transition=2[aout]"
                )
            else:
                filter_parts.append("[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]")
        else:
            filter_parts.append(f"[0:a]{voice_chain},aformat=sample_rates=44100:channel_layouts=stereo[aout]")

        # Logo watermark
        if logo_path and Path(logo_path).exists():
            position = (logo_position or "top_right").lower()
            margins = {
                "top_left": "x=20:y=20",
                "top_right": f"x=w-w-20:y=20",
                "bottom_left": "x=20:y=h-h-80",
                "bottom_right": f"x=w-w-80:y=h-h-80",
            }
            pos = margins.get(position, margins["top_right"])
            filter_parts.append(
                "[0:v]overlay="
                + pos.replace("w", f"{width}").replace("h", f"{height}")
                + f":format=auto:eval=frame,"
                f"format=yuv420p[vout]"
            )
        else:
            filter_parts.append("[0:v]format=yuv420p[vout]")

        # Global subtitles
        if subtitle_ass and Path(subtitle_ass).exists():
            escaped = self._escape(str(subtitle_ass))
            font_dir = get_system_subtitles_font_dir()
            font_arg = f":fontsdir='{self._escape(font_dir)}'" if font_dir else ""
            filter_parts.append(f"[vout]subtitles='{escaped}'{font_arg}[vf2]")
            video_label = "[vf2]"
        else:
            video_label = "[vout]"

        filter_complex = ";".join(filter_parts)
        args = [
            "-threads", "0",
            *inputs2,
            "-filter_complex", filter_complex,
            "-map", video_label, "-map", "[aout]",
            "-c:v", "libx264", "-preset", preset or "veryfast", "-crf", str(crf or 22),
            "-c:a", "aac", "-b:a", "192k",
            "-y", output_path,
        ]
        try:
            self.run(args)
        finally:
            Path(concat_tmp).unlink(missing_ok=True)
            for temp in Path(output_path).parent.glob("_xfade_*.mp4"):
                temp.unlink(missing_ok=True)
        return output_path

    # ------------------------------------------------------------------
    @staticmethod
    def _clip_duration(path: str) -> float:
        from backend.services.media import get_media_info

        return max(0.001, get_media_info(path).duration)
