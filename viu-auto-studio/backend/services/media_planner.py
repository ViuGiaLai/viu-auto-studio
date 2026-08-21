"""Deterministic per-scene media planning for Flow Factory.

An image is generated for every storyboard scene.  In mixed mode only scenes
that benefit most from motion are promoted to video, keeping generation time
and Flow credits proportional to the story instead of the scene count.
"""
from __future__ import annotations

import math
from typing import Iterable

from sqlalchemy.orm import Session

from backend.models import Project, Scene
from backend.services.project_config import effective_project_config


IMAGE_ONLY_MODES = {"image", "images", "image_only", "static", "static_image"}
VIDEO_ONLY_MODES = {"video", "videos", "all_video", "video_only"}

_MOTION_CUES = (
    "action", "active", "animate", "camera move", "camera movement", "cinematic motion",
    "driving", "falling", "flying", "walking", "running", "explosion", "transform",
    "zoom", "pan ", "tracking shot", "orbit", "time lapse", "timelapse", "moving",
    "chuyển động", "di chuyển", "chạy", "bay", "rơi", "nổ", "biến đổi", "xoay",
    "tiến lại", "lùi lại", "robot", "máy móc hoạt động", "dòng chảy", "tăng tốc",
)
_STATIC_CUES = (
    "portrait", "still image", "infographic", "diagram", "logo", "document", "text card",
    "chân dung", "ảnh tĩnh", "sơ đồ", "biểu đồ", "văn bản", "tài liệu",
)


def project_media_policy(db: Session, project: Project) -> tuple[str, float, dict]:
    """Return normalized mode, mixed-video safety cap, and merged media config."""
    effective = effective_project_config(db, project)
    mode = str(effective.get("image_mode") or effective.get("mix_mode") or "mixed").strip().lower()
    if mode == "both":
        mode = "mixed"
    try:
        ratio = float(effective.get("max_video_scene_ratio", 0.4))
    except (TypeError, ValueError):
        ratio = 0.4
    # This is only a cost/time ceiling, never a target or fixed quota.
    ratio = min(0.75, max(0.1, ratio))
    return mode, ratio, effective


def _motion_score(scene: Scene) -> int:
    text = " ".join(
        str(value or "")
        for value in (scene.narration, scene.visual_prompt, scene.transition_description)
    ).lower()
    score = sum(3 for cue in _MOTION_CUES if cue in text)
    score -= sum(2 for cue in _STATIC_CUES if cue in text)
    # Explicit movement/camera verbs in the transition field are stronger than
    # generic prompt wording, while an empty transition is a good static signal.
    transition = str(scene.transition_description or "").lower().strip()
    if transition:
        score += sum(2 for cue in _MOTION_CUES if cue in transition)
    return score


def select_video_scene_ids(
    scenes: Iterable[Scene], mode: str = "mixed", max_video_ratio: float = 0.4
) -> set[int]:
    """Choose only motion-dependent scenes; the result count is content-driven."""
    ordered = sorted(list(scenes), key=lambda scene: (scene.order_index, scene.id))
    if not ordered or mode in IMAGE_ONLY_MODES:
        return set()
    if mode in VIDEO_ONLY_MODES:
        return {scene.id for scene in ordered}

    candidates = [scene for scene in ordered if _motion_score(scene) >= 3]
    if not candidates:
        return set()

    ratio = min(0.75, max(0.1, float(max_video_ratio or 0.4)))
    limit = max(1, min(len(candidates), math.ceil(len(ordered) * ratio)))
    if len(candidates) <= limit:
        return {scene.id for scene in candidates}

    # If many scenes contain motion, apply a ceiling and spread the strongest
    # candidates across the timeline. The ceiling controls cost; it does not
    # force a minimum number of videos.
    selected: set[int] = set()
    for bucket in range(limit):
        start = math.floor(bucket * len(candidates) / limit)
        end = math.floor((bucket + 1) * len(candidates) / limit)
        segment = candidates[start:max(start + 1, end)]
        center = (start + max(start, end - 1)) / 2
        best = max(
            segment,
            key=lambda scene: (
                _motion_score(scene),
                -abs(candidates.index(scene) - center),
                -scene.order_index,
            ),
        )
        selected.add(best.id)
    return selected


def planned_video_scene_ids(db: Session, project: Project, scenes: list[Scene] | None = None) -> set[int]:
    scenes = scenes if scenes is not None else (
        db.query(Scene).filter(Scene.project_id == project.id).order_by(Scene.order_index.asc()).all()
    )
    mode, max_ratio, _ = project_media_policy(db, project)
    return select_video_scene_ids(scenes, mode, max_ratio)
