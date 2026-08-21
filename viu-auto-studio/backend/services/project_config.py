"""Resolve the effective channel/project configuration in one place."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from backend.models import Channel, Project


def as_config(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}
    return {}


def effective_project_config(db: Session, project: Project) -> dict:
    """Channel defaults overlaid by the selected project's private settings."""
    inherited: dict = {}
    if project.channel_id:
        channel = db.query(Channel).filter(Channel.id == project.channel_id).first()
        if channel:
            inherited = as_config(channel.config_json)
            inherited.setdefault("niche", channel.niche or "")
            inherited.setdefault("script_style", channel.script_style or "")
            inherited.setdefault("voice", channel.default_voice or "")
    raw = as_config(project.config_json)
    private_channel = raw.get("channel") if isinstance(raw.get("channel"), dict) else {}
    media = raw.get("media") if isinstance(raw.get("media"), dict) else {}
    voice = raw.get("voice") if isinstance(raw.get("voice"), dict) else {}
    flat_keys = {k: v for k, v in raw.items() if not isinstance(v, dict)}

    merged = {**inherited, **private_channel, **media, **voice, **flat_keys}
    # Sanitize default placeholders so global settings aren't clobbered by string "default"
    for k in list(merged.keys()):
        if merged[k] in ("default", "__default__", "none", ""):
            merged.pop(k, None)
    return merged
