"""Smart Render Engine for Viu Auto Studio.

Provides:
1. Automatic Hardware Encoder Detection (NVIDIA NVENC, Intel Quick Sync, AMD AMF, Apple VideoToolbox, CPU x264).
2. Automatic Hardware-to-CPU Fallback with Zero Crashes.
3. Pre-scaled Image Pipeline (Resizes 4K/8K images once before Ken Burns, skipping zoompan for static scenes).
4. Scene-level Clip Caching (Skips re-rendering unchanged scenes).
5. 3 Optimized Production Modes (⚡ Nhanh nhất / ⚖️ Cân bằng / 🎬 Chất lượng cao).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.core.config import FFMPEG_BIN
from backend.services.media import get_audio_duration

log = logging.getLogger("viu.render.smart")

# Cache for detected hardware capabilities
_HARDWARE_CACHE: Optional[Dict[str, Any]] = None
_HARDWARE_CACHE_TIME: float = 0.0


def detect_hardware_capabilities(force_refresh: bool = False) -> Dict[str, Any]:
    """Detect available hardware encoders and benchmark the best option."""
    global _HARDWARE_CACHE, _HARDWARE_CACHE_TIME
    now = time.time()
    if not force_refresh and _HARDWARE_CACHE is not None and (now - _HARDWARE_CACHE_TIME < 300):
        return _HARDWARE_CACHE

    ffmpeg_path = shutil.which(FFMPEG_BIN)
    if not ffmpeg_path:
        return {
            "available": False,
            "engine": "none",
            "encoder": "libx264",
            "encoder_name": "Không tìm thấy FFmpeg",
            "is_hardware": False,
            "speed_multiplier": 1.0,
            "details": "FFmpeg chưa được cài đặt",
            "all_supported": [],
        }

    # Candidate hardware encoders in priority order
    candidates = [
        ("h264_nvenc", "NVIDIA NVENC (GPU)", ["-c:v", "h264_nvenc", "-preset", "p4"]),
        ("h264_qsv", "Intel Quick Sync (GPU / Iris Xe)", ["-c:v", "h264_qsv", "-preset", "veryfast"]),
        ("h264_amf", "AMD AMF (GPU)", ["-c:v", "h264_amf", "-quality", "speed"]),
        ("h264_videotoolbox", "Apple VideoToolbox (Metal)", ["-c:v", "h264_videotoolbox"]),
        ("libx264", "CPU Multi-core (libx264)", ["-c:v", "libx264", "-preset", "ultrafast", "-threads", "0"]),
    ]

    all_supported: List[Dict[str, Any]] = []
    best_encoder = "libx264"
    best_name = "CPU Multi-core (libx264)"
    best_is_hw = False
    best_speed = 1.0

    for enc_id, enc_name, test_args in candidates:
        try:
            t0 = time.time()
            test_cmd = [
                ffmpeg_path,
                "-hide_banner",
                "-loglevel", "error",
                "-f", "lavfi",
                "-i", "testsrc=size=1920x1080:rate=30:duration=1",
                *test_args,
                "-f", "null",
                "-",
            ]
            res = subprocess.run(
                test_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                timeout=4,
            )
            elapsed = time.time() - t0
            if res.returncode == 0:
                is_hw = enc_id != "libx264"
                speed = round(1.0 / max(elapsed, 0.1), 1)
                item = {
                    "encoder": enc_id,
                    "name": enc_name,
                    "is_hardware": is_hw,
                    "test_duration": round(elapsed, 3),
                    "speed_multiplier": speed,
                }
                all_supported.append(item)
                if not best_is_hw and is_hw:
                    best_encoder = enc_id
                    best_name = enc_name
                    best_is_hw = True
                    best_speed = speed
        except Exception as exc:
            log.debug("Probe failed for %s: %s", enc_id, exc)

    if not best_is_hw and all_supported:
        cpu_item = all_supported[0]
        best_encoder = cpu_item["encoder"]
        best_name = cpu_item["name"]
        best_is_hw = False
        best_speed = cpu_item["speed_multiplier"]

    result = {
        "available": True,
        "engine": "hardware" if best_is_hw else "cpu",
        "encoder": best_encoder,
        "encoder_name": best_name,
        "is_hardware": best_is_hw,
        "speed_multiplier": best_speed,
        "details": f"Đã kích hoạt {best_name} cho tốc độ render tối đa",
        "all_supported": all_supported,
    }
    _HARDWARE_CACHE = result
    _HARDWARE_CACHE_TIME = now
    return result


def get_encoder_args(encoder: str, mode: str = "fastest", crf: int = 22, preset: str = "ultrafast") -> List[str]:
    """Return tuned FFmpeg encoding arguments for the selected encoder and mode with BT.709 color standards."""
    bt709_flags = [
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-colorspace", "bt709",
        "-color_range", "tv",
    ]
    if encoder == "h264_qsv":
        # Intel Quick Sync
        qsv_preset = "veryfast" if mode == "fastest" else "medium" if mode == "balanced" else "slow"
        return [
            "-c:v", "h264_qsv",
            "-preset", qsv_preset,
            "-global_quality", str(crf if crf > 0 else 22),
            "-look_ahead", "0",
            *bt709_flags,
        ]
    elif encoder == "h264_nvenc":
        # NVIDIA NVENC
        nv_preset = "p1" if mode == "fastest" else "p4" if mode == "balanced" else "p7"
        return [
            "-c:v", "h264_nvenc",
            "-preset", nv_preset,
            "-cq", str(crf if crf > 0 else 22),
            "-spatial-aq", "1",
            *bt709_flags,
        ]
    elif encoder == "h264_amf":
        # AMD AMF
        amf_quality = "speed" if mode == "fastest" else "balanced" if mode == "balanced" else "quality"
        return [
            "-c:v", "h264_amf",
            "-quality", amf_quality,
            "-rc", "cqp",
            "-qp_p", str(crf if crf > 0 else 22),
            *bt709_flags,
        ]
    elif encoder == "h264_videotoolbox":
        # Apple VideoToolbox
        return [
            "-c:v", "h264_videotoolbox",
            "-q:v", "65",
            "-realtime", "1" if mode == "fastest" else "0",
            *bt709_flags,
        ]
    else:
        # Default Multi-threaded CPU libx264
        cpu_preset = preset or ("ultrafast" if mode == "fastest" else "medium")
        return [
            "-threads", "0",
            "-c:v", "libx264",
            "-preset", cpu_preset,
            "-crf", str(crf if crf > 0 else 22),
            *bt709_flags,
        ]


class SmartRenderEngine:
    """Intelligent render engine with hardware acceleration, auto-fallback, and caching."""

    def __init__(self, log_path: Optional[str] = None) -> None:
        self.log_path = Path(log_path) if log_path else None
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.hw_info = detect_hardware_capabilities()

    def _escape(self, text: str) -> str:
        return (
            text.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace(":", "\\:")
            .replace(",", "\\,")
            .replace("[", "\\[")
            .replace("]", "\\]")
        )

    def _clip_duration(self, path: str) -> float:
        from backend.services.media import get_media_duration
        try:
            return float(get_media_duration(path) or 0.0)
        except Exception:
            return 0.0

    def run_with_fallback(self, primary_args: List[str], fallback_args: Optional[List[str]] = None) -> str:
        """Run FFmpeg command with primary encoder. If it fails, auto-fallback to CPU libx264."""
        ffmpeg_bin = shutil.which(FFMPEG_BIN) or FFMPEG_BIN
        log_file = None
        if self.log_path:
            log_file = self.log_path.open("a", encoding="utf-8")
            log_file.write(f"\n=== [SmartRender] {datetime.now().isoformat()} ===\n$ ffmpeg " + " ".join(primary_args) + "\n")
            log_file.flush()

        # Attempt primary execution
        proc = subprocess.Popen(
            [ffmpeg_bin, *primary_args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        _, stderr = proc.communicate(timeout=14400)
        full_log = stderr or ""
        if log_file:
            log_file.write(full_log)
            log_file.flush()

        if proc.returncode == 0:
            if log_file:
                log_file.close()
            return full_log

        # Primary failed! Check if we can fallback to CPU libx264
        if fallback_args and fallback_args != primary_args:
            log.warning("Hardware encoder failed with code %d. Auto-falling back to CPU libx264...", proc.returncode)
            if log_file:
                log_file.write(f"\n[SmartRender FALLBACK] Switching to CPU libx264...\n$ ffmpeg " + " ".join(fallback_args) + "\n")
                log_file.flush()

            proc2 = subprocess.Popen(
                [ffmpeg_bin, *fallback_args],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            _, stderr2 = proc2.communicate(timeout=14400)
            full_log2 = stderr2 or ""
            if log_file:
                log_file.write(full_log2)
                log_file.close()

            if proc2.returncode == 0:
                return full_log2
            raise RuntimeError(f"FFmpeg render failed on CPU fallback (code {proc2.returncode}): {full_log2[-1200:]}")

        if log_file:
            log_file.close()
        raise RuntimeError(f"FFmpeg render failed (code {proc.returncode}): {full_log[-1200:]}")

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
        mode: str = "fastest",
    ) -> str:
        """Render a single scene clip with optimized pre-scaling, hardware encoding, and fallback."""
        try:
            duration = float(duration or 0.0)
        except (TypeError, ValueError):
            duration = 0.0
        if duration <= 0 and audio_path and Path(audio_path).exists():
            duration = get_audio_duration(audio_path)
        if duration <= 0:
            duration = 3.0

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Check Cache
        cache_hash_path = output_file.with_suffix(".cache_hash")
        current_state = {
            "media": media_path,
            "media_mtime": os.path.getmtime(media_path) if (media_path and Path(media_path).is_file()) else 0,
            "audio": audio_path,
            "audio_mtime": os.path.getmtime(audio_path) if (audio_path and Path(audio_path).is_file()) else 0,
            "duration": round(duration, 3),
            "width": width,
            "height": height,
            "fps": fps,
            "effect": effect,
            "scale": transform_scale,
            "x": transform_x,
            "y": transform_y,
            "sub": subtitle_ass,
        }
        current_hash = hashlib.md5(json.dumps(current_state, sort_keys=True).encode()).hexdigest()
        if output_file.exists() and output_file.stat().st_size > 1000 and cache_hash_path.exists():
            try:
                if cache_hash_path.read_text(encoding="utf-8").strip() == current_hash:
                    log.info("Scene clip cache hit: %s", output_path)
                    return output_path
            except Exception:
                pass

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

        # --- Video / Image Processing ---
        is_video = bool(
            (media_type == "video" or str(media_path).lower().endswith((".mp4", ".mov", ".webm", ".mkv", ".avi", ".ts", ".flv")))
            and Path(media_path).is_file()
        )
        if is_video:
            inputs += ["-stream_loop", "-1", "-t", f"{duration:.3f}", "-i", media_path]
            filters.append(
                f"[0:v]scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height}:x='{crop_x}':y='{crop_y}',fps={fps},setpts=PTS-STARTPTS[vsrc]"
            )
            video_label = "[vsrc]"
        else:
            has_media = bool(media_path and Path(media_path).exists())
            if not has_media:
                inputs += ["-f", "lavfi", "-i", f"color=c=0x111827:s={width}x{height}:r={fps}:d={duration:.3f}"]
                filters.append("[0:v]setpts=PTS-STARTPTS[vsrc]")
                video_label = "[vsrc]"
            elif effect == "none":
                # Static image optimization: bypass zoompan filter completely!
                inputs += ["-loop", "1", "-i", media_path]
                filters.append(
                    f"[0:v]scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase,"
                    f"crop={width}:{height}:x='{crop_x}':y='{crop_y}',fps={fps},setpts=PTS-STARTPTS[vsrc]"
                )
                video_label = "[vsrc]"
            else:
                # Ken Burns with Pre-scaled bitmap
                zoom = {
                    "zoom_in": f"zoompan=z='min(1.0+0.0035*on,1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}",
                    "zoom_out": f"zoompan=z='max(1.15-0.0035*on,1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}",
                    "pan_left": f"zoompan=z=1.1:d=1:x='if(gte(on,1),x-1.2,0)':y=0:s={width}x{height}:fps={fps}",
                    "pan_right": f"zoompan=z=1.1:d=1:x='if(lt(on,1),0,x+1.2)':y=0:s={width}x{height}:fps={fps}",
                }.get(effect, f"zoompan=z='min(1.0+0.0035*on,1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}")

                inputs += ["-loop", "1", "-i", media_path]
                # Pre-scale image to 1.15x target canvas so zoompan operates on small buffers
                pre_w = int(width * 1.15)
                pre_h = int(height * 1.15)
                filters.append(
                    f"[0:v]scale={pre_w}:{pre_h}:force_original_aspect_ratio=increase,"
                    f"crop={pre_w}:{pre_h},"
                    f"{zoom},"
                    f"fps={fps},setpts=PTS-STARTPTS[vsrc]"
                )
                video_label = "[vsrc]"

        # --- Audio ---
        if audio_path and Path(audio_path).exists():
            inputs += ["-i", audio_path, "-t", f"{duration:.3f}"]
            filters.append(f"[1:a]volume={audio_volume:.4f},apad[aout]")
        else:
            inputs += ["-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={duration:.3f}"]
            filters.append("[1:a]anull[aout]")

        # --- Subtitles ---
        if subtitle_ass and Path(subtitle_ass).exists():
            escaped = self._escape(str(subtitle_ass))
            filters.append(f"{video_label}subtitles='{escaped}':fontsdir=/usr/share/fonts/truetype/dejavu[vf1]")
            video_label = "[vf1]"

        filter_complex = ";".join(filters)

        # Hardware vs Fallback CPU arguments
        hw_encoder = self.hw_info.get("encoder", "libx264")
        hw_enc_args = get_encoder_args(hw_encoder, mode=mode, crf=22, preset="ultrafast")
        cpu_enc_args = get_encoder_args("libx264", mode=mode, crf=22, preset="ultrafast")

        base_cmd = [
            "-threads", "0",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", video_label,
            "-map", "[aout]",
            "-c:a", "aac", "-b:a", "192k",
            "-t", f"{duration:.3f}",
        ]

        primary_args = [*base_cmd, *hw_enc_args, "-y", output_path]
        fallback_args = [*base_cmd, *cpu_enc_args, "-y", output_path]

        self.run_with_fallback(primary_args, fallback_args)

        try:
            cache_hash_path.write_text(current_hash, encoding="utf-8")
        except Exception:
            pass

        return output_path

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
        target_lufs: float = -14.0,
        mode: str = "fastest",
    ) -> str:
        """Compose all scene clips + audio + subtitles with hardware acceleration."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        available_clips = [p for p in clip_paths if Path(p).exists()]
        if not available_clips:
            raise RuntimeError("Không có cảnh nào để render")

        # 1) Concat clips
        concat_args: List[str] = []
        for clip in available_clips:
            concat_args += ["-i", clip]

        # Use concat demuxer / filter
        concat_tmp = str(Path(output_path).with_name("_concat_tmp.mp4"))
        n = len(available_clips)
        v_ins = "".join(f"[{i}:v]" for i in range(n))
        a_ins = "".join(f"[{i}:a]" for i in range(n))
        filter_str = f"{v_ins}concat=n={n}:v=1:a=0[vconcat];{a_ins}concat=n={n}:v=0:a=1[aconcat]"

        hw_encoder = self.hw_info.get("encoder", "libx264")
        hw_enc_args = get_encoder_args(hw_encoder, mode=mode, crf=crf or 22, preset=preset or "ultrafast")
        cpu_enc_args = get_encoder_args("libx264", mode=mode, crf=crf or 22, preset=preset or "ultrafast")

        c_base = [
            "-threads", "0",
            *concat_args,
            "-filter_complex", filter_str,
            "-map", "[vconcat]",
            "-map", "[aconcat]",
            "-c:a", "aac",
            "-b:a", "192k",
        ]

        primary_c = [*c_base, *hw_enc_args, "-y", concat_tmp]
        fallback_c = [*c_base[:-2], *cpu_enc_args, "-y", concat_tmp]

        try:
            self.run_with_fallback(primary_c, fallback_c)
        except Exception:
            Path(concat_tmp).unlink(missing_ok=True)
            raise

        # 2) Final Mix & Loudness Mastering
        inputs2: List[str] = ["-i", concat_tmp]
        file_count = 1
        filter_parts = []

        voice_gain = max(0.0, min(2.0, float(voice_volume)))
        if audio_path and Path(audio_path).exists():
            inputs2 += ["-i", audio_path]
            voice_in_idx = file_count
            file_count += 1
            filter_parts.append(f"[{voice_in_idx}:a]volume={voice_gain:.3f}[voice]")
        else:
            filter_parts.append(f"[0:a]volume={voice_gain:.3f}[voice]")

        if music_path and Path(music_path).exists():
            inputs2 += ["-i", music_path]
            music_in_idx = file_count
            file_count += 1
            filter_parts.append(f"[{music_in_idx}:a]volume={max(0.0, min(1.0, music_volume)):.3f},afade=t=in:d=2,afade=t=out:st=3:d=3[music]")
            if enable_ducking:
                filter_parts.append("[voice]asplit=2[v_main][v_sc]")
                filter_parts.append(
                    "[music][v_sc]sidechaincompress=threshold=0.03:ratio=8:attack=100:release=800[ducked]"
                )
                filter_parts.append("[v_main][ducked]amix=inputs=2:duration=first:dropout_transition=2:weights=1.0 0.5[amix_out]")
            else:
                filter_parts.append("[voice][music]amix=inputs=2:duration=first:dropout_transition=2:weights=1.0 0.5[amix_out]")
            final_audio_stream = "[amix_out]"
        else:
            final_audio_stream = "[voice]"

        if normalize_audio:
            filter_parts.append(
                f"{final_audio_stream}loudnorm=I={float(target_lufs or -14.0):.1f}:TP=-1.0:LRA=11,aformat=sample_rates=44100:channel_layouts=stereo[aout]"
            )
        else:
            filter_parts.append(f"{final_audio_stream}aformat=sample_rates=44100:channel_layouts=stereo[aout]")

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
                "[0:v]overlay=" + pos.replace("w", f"{width}").replace("h", f"{height}") + f":format=auto:eval=frame,format=yuv420p[vout]"
            )
        else:
            filter_parts.append("[0:v]format=yuv420p[vout]")

        # Global subtitles
        if subtitle_ass and Path(subtitle_ass).exists():
            escaped = self._escape(str(subtitle_ass))
            filter_parts.append(f"[vout]subtitles='{escaped}':fontsdir=/usr/share/fonts/truetype/dejavu[vf2]")
            video_label = "[vf2]"
        else:
            video_label = "[vout]"

        filter_complex = ";".join(filter_parts)

        hw_final = get_encoder_args(hw_encoder, mode=mode, crf=crf or 22, preset=preset or "veryfast")
        cpu_final = get_encoder_args("libx264", mode=mode, crf=crf or 22, preset=preset or "veryfast")

        # Probe exact duration of concatenated video to ensure audio mix matches exactly
        final_target_dur = 0.0
        try:
            probe_out = subprocess.check_output([
                FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", concat_tmp
            ], text=True).strip()
            final_target_dur = float(probe_out)
        except Exception:
            final_target_dur = 0.0

        f_base = [
            "-threads", "0",
            *inputs2,
            "-filter_complex", filter_complex,
            "-map", video_label,
            "-map", "[aout]",
            "-c:a", "aac",
            "-b:a", "192k",
        ]
        if final_target_dur > 0:
            f_base += ["-t", f"{final_target_dur:.3f}"]
        else:
            f_base.append("-shortest")

        primary_final = [*f_base, *hw_final, "-y", output_path]
        fallback_final = [*f_base, *cpu_final, "-y", output_path]

        try:
            self.run_with_fallback(primary_final, fallback_final)
        finally:
            Path(concat_tmp).unlink(missing_ok=True)

        return output_path
