"""Cấu hình nguồn tạo ảnh AI (Gemini / Google Labs / Pollinations).

Payload lưu trong bảng app_settings (key `labs_config`, giữ tên cũ vì
migrated data đã tồn tại ở máy người dùng):

    {
      "gemini_key": "AQ...",      # API key aistudio.google (tùy chọn)
      "gemini_enabled": true,     # bật Gemini làm nguồn chính
      "labs_enabled": true,       # bật Google Labs (browser automation)
      "pollinations_fallback": true  # cho phép Pollinations làm bước cuối
    }
"""

from __future__ import annotations

import json

_LABS_KEY = "labs_config"

_DEFAULTS = {
    "gemini_key": "",
    "gemini_enabled": False,
    "labs_enabled": False,  # Google Labs (bắt buộc đăng nhập Google trên máy)
    "pollinations_fallback": True,
    # Flow Connector (Chrome Extension): nguồn tạo media chính qua Google Flow
    "connector_enabled": False,
    "labs_model_image": "Nano Banana 2",
    "labs_model_video": "Veo 3.1 Lite",
    "labs_aspect": "16:9",
    "labs_media_type": "image",  # image | video
    "prompt_delay": 8,
}


def _row(db):
    from backend.models import AppSetting

    return db.query(AppSetting).filter(AppSetting.key == _LABS_KEY).first()


def _parse(row):
    settings: dict = {}
    if row is not None:
        try:
            settings = json.loads(row.value_encrypted or "{}")
        except (ValueError, TypeError):
            settings = {}
    return settings


def get_labs_config(db) -> dict:
    """Trả về cấu hình nguồn ảnh AI — giữ tên hàm cũ để tương thích toàn bộ code.

    Trường `enabled` ở đầu ra là ánh xạ tương thích ngược:
    True nếu Labs đã bật (hành vi cũ); True nếu Gemini key có + bật.
    Ngoài ra trả đầy đủ các trường mới để UI và pipeline dùng trực tiếp.
    """
    settings = _parse(_row(db))
    gemini_key = str(settings.get("gemini_key") or _DEFAULTS["gemini_key"]).strip()
    gemini_enabled = bool(settings.get("gemini_enabled", _DEFAULTS["gemini_enabled"]))
    labs_enabled = bool(settings.get("labs_enabled", _DEFAULTS["labs_enabled"]))
    return {
        # Tương thích ngược: nếu Labs hoặc Gemini bật thì hệ thống dùng AI thật
        # (trước đây "enabled" chỉ có Labs).
        "enabled": labs_enabled or (gemini_enabled and bool(gemini_key)),
        "gemini_key": gemini_key,
        "gemini_enabled": gemini_enabled and bool(gemini_key),
        "labs_enabled": labs_enabled,
        "pollinations_fallback": bool(settings.get("pollinations_fallback", _DEFAULTS["pollinations_fallback"])),
        # Flow Connector
        "connector_enabled": bool(settings.get("connector_enabled", _DEFAULTS["connector_enabled"])),
        "labs_model_image": str(settings.get("labs_model_image") or _DEFAULTS["labs_model_image"]),
        "labs_model_video": str(settings.get("labs_model_video") or _DEFAULTS["labs_model_video"]),
        "labs_aspect": str(settings.get("labs_aspect") or _DEFAULTS["labs_aspect"]),
        "labs_media_type": str(settings.get("labs_media_type") or _DEFAULTS["labs_media_type"]),
        "prompt_delay": int(settings.get("prompt_delay") or _DEFAULTS["prompt_delay"]),
        # Trạng thái tạm dừng hàng đợi media tasks (pause/resume của connector)
        "connector_paused": bool(settings.get("connector_paused", False)),
    }


def save_labs_config(db, enabled: bool | None = None, **fields) -> dict:
    """Lưu cấu hình. `enabled` (bool) duy trì API cũ — bật/tắt Labs.
    Các trường mới (gemini_key, gemini_enabled, labs_enabled,
    pollinations_fallback) truyền qua kwargs.
    """
    from backend.models import AppSetting

    row = _row(db)
    settings = _parse(row)
    if enabled is not None:
        # API cũ: bật Labs khi enabled=True
        settings["labs_enabled"] = bool(enabled)
    for k, v in fields.items():
        if k in ("gemini_key", "gemini_enabled", "labs_enabled", "pollinations_fallback",
                 "connector_enabled", "labs_model_image", "labs_model_video",
                 "labs_aspect", "labs_media_type", "prompt_delay", "connector_paused"):
            settings[k] = v
    payload = json.dumps(
        {"enabled": settings.get("labs_enabled", False), **settings}, ensure_ascii=False
    )
    if row is None:
        db.add(AppSetting(key=_LABS_KEY, value_encrypted=payload))
    else:
        row.value_encrypted = payload
    db.commit()
    return get_labs_config(db)


GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview"

