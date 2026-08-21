"""Subtitle generation service (SRT + ASS).

Bắt buộc theo đặc tả: thời gian phụ đề lấy từ thời lượng audio THẬT bằng
FFprobe, không chỉ ước tính theo số chữ. Thời lượng audio thật được dùng làm
khung thời gian tổng; văn bản được chia đều theo tỷ lệ độ dài câu (word count)
trong khung đó.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List

from backend.schemas import SubtitleConfig
from backend.services.media import get_audio_duration


# ---------------------------------------------------------------------------
# Text splitting
# ---------------------------------------------------------------------------

def split_sentences(text: str, max_chars: int = 90) -> List[str]:
    """Split subtitle text into chunks respecting max_chars per line.
    Never breaks inside a sentence: splits only at sentence punctuation
    (or commas when a sentence is too long for one line)."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks: List[str] = []
    # Sentence boundaries in Vietnamese: . ? ! ; :
    segments = re.split(r"([.?!;:] )", text)
    if len(segments) <= 3:
        # Single sentence longer than max_chars: split at comma boundaries.
        # If there are no commas, prefer keeping the whole sentence intact
        # (libass will word-wrap it) rather than breaking words mid-text.
        comma_segments = re.split(r"(, )", text)
        if len(comma_segments) > 3:
            segments = comma_segments
    current = ""
    for segment in segments:
        candidate = (current + segment).strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current.strip():
                chunks.append(current.strip())
            current = segment
        # If a single segment itself exceeds max_chars, force-split at the last
        # word boundary so Vietnamese words are never broken mid-word. When the
        # segment has no space within range, keep it whole (libass word-wraps).
        while len(current) > max_chars:
            space = current[:max_chars].rfind(" ")
            if space > max_chars // 2:
                split_at = space
                chunks.append(current[:split_at].strip())
                current = current[split_at:].lstrip()
            else:
                # No good word boundary: keep the whole segment as one chunk
                break
    if current.strip():
        chunks.append(current.strip())
    return chunks


def split_phrases(text: str, max_chars: int = 60, words_per_chunk: int = 6) -> List[str]:
    """Split subtitle text into phrase-sized chunks by word count."""
    words = text.split()
    chunks: List[str] = []
    buffer: List[str] = []
    for word in words:
        buffer.append(word)
        joined = " ".join(buffer)
        if len(joined) > max_chars or len(buffer) >= words_per_chunk:
            chunks.append(joined)
            buffer = []
    if buffer:
        chunks.append(" ".join(buffer))
    return [c for c in chunks if c]


def split_text(text: str, config: SubtitleConfig) -> List[str]:
    if config.granularity == "phrase":
        return split_phrases(text, config.max_chars_per_line)
    return split_sentences(text, config.max_chars_per_line)


# ---------------------------------------------------------------------------
# Timing from REAL audio duration
# ---------------------------------------------------------------------------

class SubtitleEntry:
    __slots__ = ("start", "end", "text")

    def __init__(self, start: float, end: float, text: str) -> None:
        self.start = start
        self.end = end
        self.text = text


def compute_entries(
    text: str, audio_path: str, config: SubtitleConfig, scene_start: float = 0.0
) -> List[SubtitleEntry]:
    """Compute subtitle entries whose timings come from real audio duration.

    Uses ffprobe to get the TRUE audio duration of the scene, then distributes
    chunk durations proportionally by word count within that span.
    """
    chunks = split_text(text, config)
    if not chunks:
        return []

    total_duration = get_audio_duration(audio_path)
    if total_duration <= 0:
        # Fallback: estimate from text (only when audio is unavailable)
        total_duration = max(1.0, len(text.split()) / 2.5)

    # Duration of each entry is proportional to its character count within
    # the REAL audio span, so longer phrases hold the subtitle longer.
    total_chars = sum(max(1, len(c)) for c in chunks)
    entries: List[SubtitleEntry] = []
    cursor = scene_start
    for chunk in chunks:
        share = max(1, len(chunk)) / total_chars * total_duration
        entries.append(SubtitleEntry(start=cursor, end=cursor + share, text=chunk))
        cursor += share
    # Clamp the last entry to the true audio end so subtitles never
    # overflow into the next scene.
    if entries:
        entries[-1].end = scene_start + total_duration
    return entries


# ---------------------------------------------------------------------------
# SRT writer
# ---------------------------------------------------------------------------

def _timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000)) % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def write_srt(entries: List[SubtitleEntry], output_path: str) -> str:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    lines: List[str] = []
    for idx, entry in enumerate(entries, start=1):
        lines.append(str(idx))
        lines.append(f"{_timecode(entry.start)} --> {_timecode(entry.end)}")
        lines.append(entry.text)
        lines.append("")
    Path(output_path).write_text("\n".join(lines), encoding="utf-8")
    return output_path


# ---------------------------------------------------------------------------
# ASS writer
# ---------------------------------------------------------------------------

def _color_to_ass(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &HBBGGRR& format."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
        return f"&H{int(b, 16):02X}{int(g, 16):02X}{int(r, 16):02X}&"
    return "&HFFFFFF&"


def _margin_from_position(config: SubtitleConfig, canvas_height: int) -> int:
    pos = (getattr(config, "position", None) or "bottom").lower()
    bottom_margin = getattr(config, "bottom_margin", None) or 60
    if pos == "top":
        return max(50, canvas_height - 150)
    if pos == "center":
        return max(50, canvas_height // 2 - 50)
    # Alignment 2 in ASS is Bottom-Center; MarginV is the offset from the bottom edge.
    return max(30, int(bottom_margin))


ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{size},{primary},{secondary},{outline},&H00000000,-1,0,0,0,100,100,0,0,1,{border},0,2,10,10,{margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def write_ass(entries: List[SubtitleEntry], output_path: str, config: SubtitleConfig, canvas_width: int = 1920, canvas_height: int = 1080) -> str:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    header = ASS_HEADER.format(
        width=canvas_width,
        height=canvas_height,
        font=(config.font or "DejaVuSans").replace(",", " "),
        size=int(config.font_size or 48),
        primary=_color_to_ass(config.primary_color or "#FFFFFF"),
        secondary=_color_to_ass(config.primary_color or "#FFFFFF"),
        outline=_color_to_ass(config.border_color or "#000000"),
        border=int(config.border_width or 2),
        margin=_margin_from_position(config, canvas_height),
    )
    lines = [header]
    for entry in entries:
        lines.append(
            f"Dialogue: 0,{_timecode(entry.start)[:-4].replace(',', '.') if ',' in _timecode(entry.start) else _timecode(entry.start)},{_timecode(entry.end)[:-4].replace(',', '.') if ',' in _timecode(entry.end) else _timecode(entry.end)},Default,,0,0,0,,{entry.text}"
        )
    Path(output_path).write_text("\n".join(lines), encoding="utf-8")
    return output_path


def _ass_timecode(seconds: float) -> str:
    return _timecode(seconds).replace(",", ".")


def write_ass_v2(entries: List[SubtitleEntry], output_path: str, config: SubtitleConfig, canvas_width: int = 1920, canvas_height: int = 1080) -> str:
    """Write ASS with properly formatted H:MM:SS.cc timecodes."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    header = ASS_HEADER.format(
        width=canvas_width,
        height=canvas_height,
        font=(config.font or "DejaVuSans").replace(",", " "),
        size=int(config.font_size or 48),
        primary=_color_to_ass(config.primary_color or "#FFFFFF"),
        secondary=_color_to_ass(config.primary_color or "#FFFFFF"),
        outline=_color_to_ass(config.border_color or "#000000"),
        border=int(config.border_width or 2),
        margin=_margin_from_position(config, canvas_height),
    )
    lines = [header]
    for entry in entries:
        lines.append(
            f"Dialogue: 0,{_ass_timecode(entry.start)},{_ass_timecode(entry.end)},Default,,0,0,0,,{entry.text}"
        )
    Path(output_path).write_text("\n".join(lines), encoding="utf-8")
    return output_path


def generate_subtitles(
    text: str, audio_path: str, output_dir: str, config: SubtitleConfig,
    scene_start: float = 0.0, canvas_width: int = 1920, canvas_height: int = 1080,
) -> dict:
    """Generate both SRT and ASS files for a scene. Return their paths."""
    entries = compute_entries(text, audio_path, config, scene_start)
    base = Path(output_dir)
    srt_path = write_srt(entries, str(base / "subtitles.srt"))
    ass_path = write_ass_v2(entries, str(base / "subtitles.ass"), config, canvas_width, canvas_height)
    return {
        "srt": srt_path,
        "ass": ass_path,
        "entry_count": len(entries),
    }
