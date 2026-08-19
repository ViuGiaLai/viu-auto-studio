"""Gemini integration theo cơ chế của Flow Factory (1.1.8_0):

1. Text API (generateContent) — GEMINI_TEXT_API — dùng để:
   - Kiểm tra key hợp lệ
   - Phân tích kịch bản → cảnh + prompt hình theo ngữ nghĩa
   - AI viết lại prompt hình của một cảnh (giữ style nhất quán)
   Dùng model text ổn định: gemini-3-flash-preview / gemini-2.5-flash.
   Text API có quota rộng hơn hẳn image API (free tier dùng được ngay).

2. Sinh ẢNH/VIDEO: Gemini Image API bị NGƯỜI DÙNG VÔ HIỆU HÓA (quota 429).
   Nguồn ảnh/video chính là UTO Flow (labs.google/fx — browser automation),
   Pollinations.ai là bước cuối khi được bật cho phép.

429 → phân biệt rõ rate-limit (thử lại) / hết quota ngày (báo người dùng),
không fallback âm thầm sang ảnh nền màu.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import requests

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

TEXT_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"]

DEFAULT_STYLE_SUFFIX = (
    "Cinematic photorealistic illustration, consistent character design and "
    "wardrobe continuity, warm natural lighting, high detail, 16:9 video frame"
)


class GeminiTextError(Exception):
    """Lỗi khi gọi Gemini text API."""


class GeminiQuotaError(Exception):
    """Key hợp lệ nhưng hết quota Gemini (rate limit / quota ngày)."""


def _call_gemini_text(api_key: str, prompt: str, json_mode: bool = False, timeout: float = 180.0):
    """Gọi text generateContent. Trả JSON response dict hoặc ném lỗi rõ."""
    last_err: Exception | None = None
    for model in TEXT_MODELS:
        url = f"{GEMINI_API_BASE}/{model}:generateContent"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "topP": 0.95,
                "topK": 40,
            },
        }
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        try:
            resp = requests.post(url, params={"key": api_key}, json=body, timeout=timeout)
        except requests.RequestException as exc:
            last_err = GeminiTextError(f"Lỗi kết nối Gemini text API: {exc}")
            continue
        if resp.status_code == 429:
            detail = ""
            try:
                viol = (
                    resp.json()
                    .get("error", {})
                    .get("details", [{}])[0]
                    .get("violations", [])
                )
                quota_ids = " ".join(str(v.get("quotaId", "")) for v in viol)
                detail = quota_ids
            except Exception:
                detail = resp.text[:200]
            if re.search(r"PerDay|PerMonth|daily", detail, re.IGNORECASE):
                last_err = GeminiQuotaError(
                    "Gemini đã hết quota NGÀY (PerDay/PerMonth) — chờ đến 17:00 giờ "
                    "Khu vực Đông Nam Á để reset, hoặc nâng cấp gói Google AI Studio. "
                    "Hãy bật Pollinations fallback trong Cài đặt → AI."
                )
            else:
                last_err = GeminiQuotaError(
                    "Gemini hết quota PHÚT (rate limit) — chờ ~60 giây rồi thử lại. "
                    "Key vẫn hợp lệ."
                )
            continue
        if resp.status_code != 200:
            try:
                msg = resp.json().get("error", {}).get("message", "")
            except ValueError:
                msg = resp.text[:200]
            last_err = GeminiTextError(
                f"Gemini text API trả HTTP {resp.status_code}: {msg or resp.text[:200]}"
            )
            continue
        try:
            return resp.json()
        except ValueError:
            last_err = GeminiTextError("Phản hồi Gemini text không phải JSON hợp lệ")
            continue
    if last_err is not None:
        raise last_err
    raise GeminiTextError("Gemini text API thất bại sau tất cả các model")


def _extract_text(data: dict) -> str:
    for candidate in data.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            txt = part.get("text", "")
            if txt:
                return txt
    finish = data.get("candidates", [{}])[0].get("finishReason", "")
    raise GeminiTextError(f"Gemini text không trả nội dung (finishReason={finish!r})")


def check_gemini_key(key: str) -> dict:
    """Kiểm tra API key Gemini bằng text API (ổn định hơn image API)."""
    key = (key or "").strip()
    if not key:
        return {"valid": False, "note": "Chưa nhập API key"}
    try:
        resp = requests.get(GEMINI_API_BASE, params={"key": key}, timeout=20)
        if resp.status_code != 200:
            return {"valid": False, "note": f"Key không hợp lệ (HTTP {resp.status_code})"}
        names = [m["name"].replace("models/", "") for m in resp.json().get("models", [])]
    except requests.RequestException as exc:
        return {"valid": False, "note": f"Lỗi kết nối: {exc}"}

    note = f"Key hợp lệ. Text models: {', '.join(n for n in names if 'flash' in n)[:80]}"
    try:
        data = _call_gemini_text(key, "Trả lời ngắn gọn: 1+1 bằng bao nhiêu?")
        text_ok = bool(_extract_text(data))
    except GeminiTextError as exc:
        return {"valid": True, "note": f"{note} | ⚠ Text API lỗi: {exc}"}
    except GeminiQuotaError as exc:
        return {"valid": True, "note": f"{note} | ⚠ {exc}"}
    return {"valid": text_ok, "note": note if text_ok else f"{note} | ⚠ Text API không trả nội dung"}


def analyze_semantic_scenes(
    api_key: str,
    full_script: str,
    existing_narrations: list[str] | None = None,
    style_memory: str = "",
    max_scenes: int = 0,
) -> dict:
    """AI phân tích TOÀN BỘ kịch bản → danh sách cảnh theo ngữ nghĩa + prompt hình riêng.

    Trả {"scenes": [...], "common_style": str} với mỗi scene:
    {narration, visual_prompt, style_prompt, reason}.
    """
    if not api_key:
        raise GeminiTextError("Chưa có API key Gemini — hãy nhập trong Cài đặt → AI")
    narration_list = "\n".join(f"- {n}" for n in existing_narrations or [])
    max_hint = ""
    if max_scenes and max_scenes > 0:
        max_hint = f"Giới hạn {max_scenes} cảnh."

    prompt = f"""Bạn là đạo diễn hình ảnh AI. Phân tích TOÀN BỘ kịch bản dưới đây theo NGỮ NGHĨA
và diễn biến (nhân vật, hành động, địa điểm, thời gian, ý chính) — KHÔNG chia máy móc
1 câu = 1 ảnh, KHÔNG chia 1 dòng phụ đề = 1 ảnh.

NGUYÊN TẮC CHIA CẢNH:
- 1 hình ảnh bao phủ nhiều dòng phụ đề nếu chúng cùng một nội dung/hành động liên tục.
- Tạo cảnh mới KHI nội dung chuyển nhân vật, hành động, địa điểm hoặc ý chính.
- Giữ NHẤT QUÁN: nhân vật, trang phục, bối cảnh, phong cách giữa các cảnh liên quan.
{max_hint}

KỊCH BẢN (từng đoạn lời đọc):
{narration_list or full_script}

PHONG CÁCH CẦN GIỮ NHẤT QUÁN (style memory): {style_memory or "photorealistic cinematic illustration"}

Trả JSON:
{{
  "common_style": "mô tả phong cách chung nhất quán cho TẤT CẢ cảnh (tiếng Anh)",
  "scenes": [
    {{
      "narration": "toàn bộ lời đọc thuộc cảnh này (tiếng Việt, giữ nguyên lời gốc)",
      "visual_prompt": "prompt tiếng Anh mô tả TOÀN CẢNH: chủ thể + hành động + bối cảnh + ánh sáng + góc máy. Bao gồm {style_memory or 'character/wardrobe consistency tags'} để giữ nhất quán",
      "style_prompt": "phrase phong cách chung nhất quán (tiếng Anh, dùng cho mọi cảnh)",
      "reason": "lý do chia cảnh này (1 câu tiếng Việt)"
    }}
  ]
}}"""
    data = _call_gemini_text(api_key, prompt, json_mode=True)
    raw = _extract_text(data)
    raw = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        # fallback: lấy khối JSON đầu tiên
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise GeminiTextError(f"Gemini trả về không phải JSON: {raw[:200]}")
        payload = json.loads(m.group(0))
    if isinstance(payload, list):
        payload = {"scenes": payload}
    scenes = payload.get("scenes") or []
    common_style = payload.get("common_style") or style_memory or DEFAULT_STYLE_SUFFIX
    out = []
    for s in scenes:
        narration = (s.get("narration") or "").strip()
        vp = (s.get("visual_prompt") or "").strip()
        if not narration and not vp:
            continue
        out.append({
            "narration": narration,
            "visual_prompt": vp,
            "style_prompt": s.get("style_prompt") or common_style,
            "reason": s.get("reason") or "",
        })
    return {"scenes": out, "common_style": common_style}


def rewrite_scene_prompt(
    api_key: str,
    narration: str,
    style_memory: str = "",
    character_context: str = "",
) -> dict:
    """AI viết lại prompt hình của 1 cảnh theo TOÀN CẢNH (không lấy máy móc dòng phụ đề)."""
    if not api_key:
        raise GeminiTextError("Chưa có API key Gemini")
    prompt = f"""Bạn là đạo diễn hình ảnh. Viết prompt tiếng Anh mô tả hình ảnh cho cảnh video sau.
Prompt phải mô tả TOÀN CẢNH: chủ thể, hành động, bối cảnh, ánh sáng, góc máy — không chỉ dịch dòng phụ đề.
Giữ phong cách nhất quán: {style_memory or DEFAULT_STYLE_SUFFIX}
{("Context nhân vật/bối cảnh trước đó: " + character_context) if character_context else ""}

Lời đọc của cảnh: {narration}

Trả JSON: {{"visual_prompt": "...", "style_prompt": "..."}}"""
    data = _call_gemini_text(api_key, prompt, json_mode=True)
    raw = _extract_text(data)
    raw = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise GeminiTextError(f"Gemini trả về không phải JSON: {raw[:200]}")
        payload = json.loads(m.group(0))
    return {"visual_prompt": payload.get("visual_prompt", ""), "style_prompt": payload.get("style_prompt", "")}



def build_image_prompt(narration: str, visual_prompt: str, style_prompt: str, portrait: bool = False) -> str:
    """Gộp visual_prompt + style_prompt + aspect → prompt hoàn chỉnh cho engine sinh ảnh (UTO Flow / Pollinations)."""
    aspect = "vertical 9:16" if portrait else "landscape 16:9"
    parts = [(visual_prompt or narration or "").strip()]
    if style_prompt:
        parts.append(style_prompt.strip())
    parts.append(f"{aspect} aspect ratio, video frame")
    return ". ".join(p.rstrip(".") for p in parts if p)
