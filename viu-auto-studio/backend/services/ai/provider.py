"""Base interface and registry for AI script-generation providers."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import List

from backend.core.config import AI_PROVIDER, GEMINI_MODEL, GEMINI_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL
from backend.schemas import ScriptSchema, ScriptGenerateRequest
from backend.services.ai.niche_profiles import format_niche_prompt


class AIProvider(ABC):
    """Adapter interface for LLM script generation."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def test_connection(self) -> dict:
        """Return {"ok": bool, "message": str}."""

    @abstractmethod
    def generate_script(self, request: ScriptGenerateRequest) -> ScriptSchema:
        """Generate a fully structured script JSON from the request."""


def _build_script_prompt(req: ScriptGenerateRequest) -> str:
    """Build the system+user prompt that forces JSON-structured output."""
    outline = "\n".join(f"- {item}" for item in req.outline) if req.outline else "(AI tự do lên dàn ý)"
    niche_context = format_niche_prompt(req.niche)
    return f"""Bạn là biên kịch video YouTube/TikTok chuyên nghiệp, viết bằng tiếng {req.language}.

TẠO MỘT KỊCH BẢN VIDEO HOÀN CHỈNH CHO:
- Chủ đề: {req.topic}
- Loại video: {"video ngắn (shorts/reels)" if req.video_type == "short" else "video dài (YouTube)"}
- Tỷ lệ khung hình: {req.aspect_ratio}
- Độ dài mục tiêu: {req.target_duration} giây
- Hook mở đầu: {req.hook or "(AI tự chọn)"}
- Góc tiếp cận: {req.angle or "(AI tự chọn)"}
- Dàn ý yêu cầu: {outline}
- Phong cách viết: {req.writing_style or "(AI tự chọn)"}
- Đối tượng khán giả: {req.audience or "(AI tự chọn)"}
{niche_context}
- Concept thumbnail: {req.thumbnail_concept or "(AI tự chọn)"}
- Prompt thumbnail tiếng Anh: {req.thumbnail_prompt_en or "(AI tự viết prompt tiếng Anh)"}

YÊU CẦU BẮT BUỘC:
1. Trả về ĐÚNG MỘT đối tượng JSON, không thêm văn bản tự do bên ngoài JSON.
2. full_script phải được chia thành nhiều đoạn văn ngắn, mỗi đoạn 1-2 câu, phân cách bằng dòng trống. Mỗi đoạn sẽ trở thành một cảnh video.
3. Nội dung phải tự nhiên, cuốn hút, phù hợp cho voiceover đọc to.
4. SEO phải được tối ưu cho nền tảng tương ứng với loại video.

Trả về JSON theo cấu trúc này:
{{
  "title": "...",
  "hook": "...",
  "angle": "...",
  "outline": ["...", "..."],
  "full_script": "...",
  "thumbnail_concept": "...",
  "thumbnail_prompt": "...",
  "seo": {{
    "youtube_title": "...",
    "description": "...",
    "hashtags": ["...", "..."],
    "tags": ["...", "..."]
  }}
}}"""


def _extract_json(text: str) -> dict:
    """Best-effort extraction of the first JSON object from free text."""
    text = text.strip()
    # If it already starts with '{', try parsing directly
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    # Find the first '{' and last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            # Try to fix common issues: unescaped newlines inside strings
            candidate = re.sub(r'(?<!\\)"(?![,\]}])', '\\"', candidate)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
    raise ValueError("Không tìm thấy JSON hợp lệ trong phản hồi của AI")


def _parse_script_schema(data: dict) -> ScriptSchema:
    """Convert raw LLM JSON into a validated ScriptSchema."""
    seo = data.get("seo") or {}
    return ScriptSchema(
        title=str(data.get("title", "")),
        hook=str(data.get("hook", "")),
        angle=str(data.get("angle", "")),
        outline=list(data.get("outline", []) or []),
        full_script=str(data.get("full_script", "")),
        thumbnail_concept=str(data.get("thumbnail_concept", "")),
        thumbnail_prompt=str(data.get("thumbnail_prompt", "")),
        seo={
            "youtube_title": str(seo.get("youtube_title", "")),
            "description": str(seo.get("description", "")),
            "hashtags": [str(h) for h in (seo.get("hashtags") or [])],
            "tags": [str(t) for t in (seo.get("tags") or [])],
        },
    )


_REGISTRY: dict[str, AIProvider] = {}


def get_provider(name: str | None = None) -> AIProvider:
    """Resolve a provider by name (or the configured default)."""
    if not _REGISTRY:
        from backend.services.ai.openrouter import OpenRouterProvider
        from backend.services.ai.gemini import GeminiProvider
        from backend.services.ai.local_provider import LocalScriptProvider

        _REGISTRY["openrouter"] = OpenRouterProvider()
        _REGISTRY["gemini"] = GeminiProvider()
        _REGISTRY["local"] = LocalScriptProvider()

    resolved = (name or AI_PROVIDER).lower()
    if resolved not in _REGISTRY:
        raise ValueError(f"AI provider '{resolved}' không được hỗ trợ. "
                         f"Chỉ hỗ trợ: {', '.join(_REGISTRY)}")
    provider = _REGISTRY[resolved]
    # Tự động chuyển sang provider khác đã cấu hình key nếu provider được chọn chưa sẵn sàng
    if not provider.is_configured():
        for alt_name, alt in _REGISTRY.items():
            if alt_name != resolved and alt.is_configured():
                return alt
        raise RuntimeError(
            f"Chưa cấu hình API key cho AI provider '{resolved}'. "
            "Vui lòng nhập key trong Cài đặt → AI Dịch & Ảnh "
            f"(hỗ trợ: {', '.join(_REGISTRY)})."
        )
    return provider


def list_providers() -> List[dict]:
    from backend.services.ai.openrouter import OpenRouterProvider
    from backend.services.ai.gemini import GeminiProvider

    from backend.services.ai.local_provider import LocalScriptProvider

    providers = [OpenRouterProvider(), GeminiProvider(), LocalScriptProvider()]
    return [{"id": p.name, "configured": p.is_configured} for p in providers]


def generate_text(system_prompt: str, user_prompt: str, model_override: str | None = None) -> str:
    """Sinh văn bản chung bằng LLM provider đang cấu hình (fallback local nếu không có key).

    Trả về chuỗi văn bản. Raise RuntimeError nếu không sinh được.
    Dùng cho SEO, tiêu đề thumbnail, mô tả, v.v.
    """
    provider = get_provider()
    if provider.name == "local":
        # Provider offline không gọi LLM được — trả user_prompt như gợi ý + cảnh báo
        return f"(AI offline không hỗ trợ tạo nội dung tùy biến. Vui lòng cấu hình API key ở Cài đặt → AI. Nội dung gốc: {user_prompt})"

    # Dùng trực tiếp endpoint chat của provider đã cấu hình
    try:
        if provider.name == "openrouter":
            return provider.generate_text(system_prompt, user_prompt)
        if provider.name == "gemini":
            return provider.generate_text(system_prompt, user_prompt)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Sinh văn bản AI thất bại: {exc}") from exc
    raise RuntimeError(f"Provider '{provider.name}' chưa hỗ trợ sinh văn bản tùy biến")
