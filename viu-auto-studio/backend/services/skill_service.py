"""Skill-aware prompt builders and optional Manus task runner.

Local builders are deterministic and return prompts/plans, never pretend that an
external generation or research task completed. Manus-backed skills require
MANUS_API_KEY and return the upstream task id for asynchronous follow-up.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
from sqlalchemy.orm import Session

from backend.models import SkillRun

SKILL_CATALOG = [
    {
        "id": "video-generator",
        "name": "Video Generator",
        "category": "Video",
        "execution": "local_prompt",
        "description": "Lập blueprint video, clip, keyframe, narration và BGM theo workflow sản xuất thật.",
        "requires_manus_api": False,
    },
    {
        "id": "tts-prompter",
        "name": "TTS Prompter",
        "category": "Voice",
        "execution": "local_prompt",
        "description": "Tạo prompt TTS tách chỉ dẫn giọng đọc khỏi phần văn bản được nói.",
        "requires_manus_api": False,
    },
    {
        "id": "music-prompter",
        "name": "Music Prompter",
        "category": "Music",
        "execution": "local_prompt",
        "description": "Tạo music blueprint theo duration, BPM, mood, instrumentation và arrangement.",
        "requires_manus_api": False,
    },
    {
        "id": "youtube-video-research",
        "name": "YouTube Video Research",
        "category": "Research",
        "execution": "manus_task",
        "description": "Nghiên cứu video YouTube bằng nguồn first-hand và yêu cầu trích dẫn có cấu trúc.",
        "requires_manus_api": True,
    },
    {
        "id": "youtube-transcript",
        "name": "YouTube Transcript Import",
        "category": "Research",
        "execution": "local_action",
        "description": "Lấy transcript/subtitle thật từ một video YouTube công khai để làm nguồn nghiên cứu; không tải video.",
        "requires_manus_api": False,
    },
    {
        "id": "seo-audit",
        "name": "SEO Audit",
        "category": "SEO",
        "execution": "manus_task",
        "description": "Tạo audit SEO dựa trên dữ liệu có bằng chứng và nêu giới hạn dữ liệu.",
        "requires_manus_api": True,
    },
    {
        "id": "seo-competitor-analysis-will",
        "name": "SEO Competitor Analysis",
        "category": "SEO",
        "execution": "manus_task",
        "description": "Phân tích chiến lược SEO của đối thủ theo góc nhìn target-first.",
        "requires_manus_api": True,
    },
    {
        "id": "skill-creator",
        "name": "Skill Creator",
        "category": "Meta",
        "execution": "advisory",
        "description": "Skill hướng dẫn tạo skill cho Manus, không phải runtime skill để chạy trong Viu Studio.",
        "requires_manus_api": False,
    },
]

CATALOG_BY_ID = {item["id"]: item for item in SKILL_CATALOG}
MANUS_API_BASE = os.getenv("MANUS_API_BASE", "https://api.manus.ai").rstrip("/")


def _text(data: dict[str, Any], key: str, default: str = "") -> str:
    return str(data.get(key, default) or "").strip()


def _build_tts(data: dict[str, Any], fallback: str) -> str:
    language = _text(data, "language", "Vietnamese")
    accent = _text(data, "accent", "standard Vietnamese accent")
    style = _text(data, "style", "natural, clear documentary narration")
    text = _text(data, "text", fallback)
    return f"Speak in {language} with a {accent}. Use a {style}. Keep the delivery natural and intelligible: {text}"


def _build_music(data: dict[str, Any], fallback: str) -> str:
    duration = int(data.get("duration_seconds") or 60)
    bpm = int(data.get("bpm") or 90)
    instrumental = bool(data.get("instrumental_only", True))
    genre = _text(data, "genre", "cinematic ambient")
    mood = _text(data, "mood", "focused, warm and slightly suspenseful")
    key = _text(data, "key", "D minor")
    instruments = _text(data, "instruments", "soft piano, warm strings, subtle synth pads and restrained percussion")
    structure = _text(data, "structure", "gentle intro, gradual build, restrained peak and clean outro")
    opening = f"{'Instrumental only, no vocals. ' if instrumental else ''}Create a {duration}-second track at {bpm} BPM in {key}."
    body = f"The genre is {genre}. The mood is {mood}. Use {instruments}. Arrange it as {structure}."
    if fallback:
        body += f" Context for the video: {fallback}"
    return f"{opening} {body} High-quality production, clean mix, consistent loudness, suitable as background music for a narrated video."


def _build_video(data: dict[str, Any], fallback: str) -> str:
    duration = int(data.get("duration_seconds") or 30)
    aspect = _text(data, "aspect_ratio", "16:9")
    if aspect not in {"16:9", "9:16"}:
        raise ValueError("aspect_ratio chỉ được là 16:9 hoặc 9:16")
    style = _text(data, "visual_style", "cinematic documentary")
    language = _text(data, "language", "Vietnamese")
    purpose = _text(data, "purpose", fallback or "Create a useful narrated video")
    clips = max(1, min(30, round(duration / 6)))
    return (
        f"VIDEO BLUEPRINT\nPurpose: {purpose}\nLanguage: {language}\nTotal duration: {duration}s\n"
        f"Aspect ratio: {aspect}\nVisual style: {style}\nTarget clips: {clips} clips, each 3-10 seconds.\n\n"
        "For every clip define: narrative_purpose, scene, content_action, a 2-4 sentence "
        "transition_description covering subject appearance, movement trajectory, state changes and "
        "what remains present, target_duration, camera_movement, first_keyframe_framing, "
        "first_keyframe_visible_content, inter_clip_boundary, narration_budget, narration_cue, "
        "sound_effects and bgm_cue. Generate reference images before video execution."
    )


def _youtube_video_id(value: str) -> str:
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{6,20}", value):
        return value
    parsed = urlparse(value)
    host = parsed.netloc.lower().split(":", 1)[0]
    if host in {"youtu.be", "www.youtu.be"}:
        return parsed.path.strip("/").split("/", 1)[0]
    if host.endswith("youtube.com"):
        query_id = parse_qs(parsed.query).get("v", [""])[0]
        if query_id:
            return query_id
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
            return parts[1]
    raise ValueError("Hãy nhập URL YouTube hợp lệ hoặc video ID; chỉ hỗ trợ nguồn youtube.com/youtu.be.")


def _run_youtube_transcript(data: dict[str, Any], fallback: str) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise RuntimeError("Chưa cài youtube-transcript-api. Chạy pip install -r backend/requirements.txt rồi thử lại.") from exc

    source = _text(data, "url") or _text(data, "video_id") or fallback
    video_id = _youtube_video_id(source)
    languages = data.get("languages") or ["vi", "en"]
    if isinstance(languages, str):
        languages = [item.strip() for item in languages.split(",") if item.strip()]
    if not isinstance(languages, list) or not languages:
        languages = ["vi", "en"]
    languages = [str(item).strip() for item in languages[:10] if str(item).strip()]

    transcript = YouTubeTranscriptApi().fetch(video_id, languages=languages)
    snippets = [
        {"text": str(item.text), "start": float(item.start), "duration": float(item.duration)}
        for item in transcript
    ]
    return json.dumps({
        "source": source,
        "video_id": video_id,
        "language": getattr(transcript, "language", ""),
        "language_code": getattr(transcript, "language_code", ""),
        "is_generated": bool(getattr(transcript, "is_generated", False)),
        "snippet_count": len(snippets),
        "text": " ".join(item["text"] for item in snippets),
        "snippets": snippets,
    }, ensure_ascii=False)


def build_local_prompt(skill_id: str, data: dict[str, Any], fallback: str = "") -> str:
    if skill_id == "tts-prompter":
        return _build_tts(data, fallback)
    if skill_id == "music-prompter":
        return _build_music(data, fallback)
    if skill_id == "video-generator":
        return _build_video(data, fallback)
    raise ValueError(f"Skill {skill_id} cần Manus API hoặc không phải runtime skill")


def _manus_prompt(skill_id: str, data: dict[str, Any], fallback: str) -> str:
    raw = json.dumps(data, ensure_ascii=False, indent=2) if data else fallback
    if skill_id == "youtube-video-research":
        return f"Research this topic using YouTube as first-hand evidence. Topic/input:\n{raw}\nUse the required high-density workflow: discover multiple themes, analyze relevant videos, extract direct quotes and all data points, cross-validate claims, and return source URLs with limitations."
    if skill_id == "seo-audit":
        return f"Create an evidence-led SEO audit from the supplied data only. Input:\n{raw}\nDo not fabricate metrics. State missing datasets, generate charts from normalized data when possible, and end with an ordered problem/fix prioritization."
    if skill_id == "seo-competitor-analysis-will":
        return f"Create a target-first SEO competitor analysis from the supplied data only. Input:\n{raw}\nOpen with strategies worth reviewing and replicating, use Similarweb/Ahrefs/Semrush/public crawl evidence when available, generate supporting charts, and state data limitations explicitly."
    raise ValueError(f"Unsupported Manus skill: {skill_id}")


def run_skill(db: Session, skill_id: str, data: dict[str, Any], fallback: str = "", project_id: int | None = None, use_manus: bool = True) -> SkillRun:
    item = CATALOG_BY_ID.get(skill_id)
    if not item:
        raise ValueError(f"Skill không tồn tại: {skill_id}")
    run = SkillRun(
        project_id=project_id,
        skill_id=skill_id,
        mode="local_prompt" if item["execution"] == "local_prompt" else "local_action" if item["execution"] == "local_action" else "manus_task",
        status="pending",
        input_json=json.dumps({"data": data, "prompt": fallback}, ensure_ascii=False),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        if item["execution"] == "advisory":
            raise RuntimeError("Skill Creator là skill hướng dẫn tạo skill cho Manus, không phải tác vụ runtime trong Viu Studio.")
        if item["execution"] == "local_action":
            run.output_text = _run_youtube_transcript(data, fallback)
            run.status = "completed"
            db.commit()
            return run
        if item["execution"] == "local_prompt" or not use_manus:
            run.output_text = build_local_prompt(skill_id, data, fallback)
            run.status = "completed"
            db.commit()
            return run

        api_key = os.getenv("MANUS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("Chưa cấu hình MANUS_API_KEY. Không chạy giả lập; hãy cấu hình key rồi thử lại.")
        response = requests.post(
            f"{MANUS_API_BASE}/v2/task.create",
            headers={"x-manus-api-key": api_key, "Content-Type": "application/json"},
            json={
                "message": {
                    "content": _manus_prompt(skill_id, data, fallback),
                    "force_skills": [skill_id],
                },
                "locale": "vi-VN",
            },
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        if not body.get("ok", True):
            raise RuntimeError(body.get("error", {}).get("message", "Manus API trả lỗi"))
        detail = body.get("task_detail") or body.get("task") or body.get("data") or body
        run.external_task_id = str(detail.get("task_id") or detail.get("id") or body.get("task_id") or "")
        run.output_text = json.dumps({"message": "Manus task đã được tạo; cần poll task để lấy kết quả.", "response": body}, ensure_ascii=False)
        run.status = "pending"
        db.commit()
        return run
    except Exception as exc:  # noqa: BLE001
        run.status = "failed"
        run.error_message = str(exc)
        db.commit()
        return run


def refresh_manus_run(db: Session, run: SkillRun) -> SkillRun:
    if run.mode != "manus_task" or not run.external_task_id:
        return run
    api_key = os.getenv("MANUS_API_KEY", "").strip()
    if not api_key:
        run.status = "failed"
        run.error_message = "Chưa cấu hình MANUS_API_KEY."
        db.commit()
        return run
    try:
        response = requests.get(
            f"{MANUS_API_BASE}/v2/task.listMessages",
            headers={"x-manus-api-key": api_key},
            params={"task_id": run.external_task_id, "order": "desc", "limit": 50},
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        run.output_text = json.dumps(body, ensure_ascii=False)
        serialized = json.dumps(body, ensure_ascii=False).lower()
        if "task_stopped" in serialized or "completed" in serialized or "success" in serialized:
            run.status = "completed"
        elif "task_failed" in serialized or '"failed"' in serialized or "error" in serialized:
            run.status = "failed"
            run.error_message = "Manus task báo lỗi; xem chi tiết phản hồi trong kết quả."
        else:
            run.status = "pending"
        db.commit()
        return run
    except Exception as exc:  # noqa: BLE001
        run.status = "failed"
        run.error_message = str(exc)
        db.commit()
        return run
