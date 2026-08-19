"""Offline (local) script generator — deterministic, no external API required.

Generates a complete, structured video script by composing a topic-aware outline,
hook, full script text, thumbnail concept and SEO metadata. Used as the reliable
fallback when no external AI provider key (OpenRouter / Gemini) is configured.
"""

from __future__ import annotations

import re

from backend.schemas import ScriptSchema, ScriptGenerateRequest
from backend.services.ai.provider import AIProvider

_SECTIONS = [
    "mở đầu", "nội dung chính", "mẹo thực hành", "lưu ý", "kết luận",
]


def _topic_words(topic: str) -> list:
    """Extract Vietnamese topic tokens for sentence templating."""
    return [w for w in re.split(r"[^a-zA-ZàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀ-ỹ\s]+", topic.lower()) if w]


def _join(items: list, sep: str = " ") -> str:
    return sep.join(str(i) for i in items if i)


class LocalScriptProvider(AIProvider):
    """Deterministic offline script generator."""

    @property
    def name(self) -> str:
        return "local"

    def is_configured(self) -> bool:
        # The offline generator is always available — no key needed.
        return True

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Trình tạo kịch bản cục bộ sẵn sàng (không cần API key)"}

    def generate_script(self, request: ScriptGenerateRequest) -> ScriptSchema:
        topic = (request.topic or "chủ đề của bạn").strip()
        lang = (request.language or "vi").lower()
        is_short = (request.video_type or "short") == "short"
        duration = int(request.target_duration or 60)
        outline_items = list(request.outline) if request.outline else self._default_outline(topic, is_short)
        hook = (request.hook or "").strip() or self._default_hook(topic)
        seo_title = self._seo_title(topic, is_short)

        # Build full script: paragraphs for hook + each outline point + closing.
        paragraphs = [hook]
        for idx, item in enumerate(outline_items, start=1):
            paragraphs.append(self._paragraph(topic, idx, len(outline_items), item))
        paragraphs.append(self._closing(topic, is_short))
        full_script = "\n\n".join(paragraphs)

        # Thumbnail concept: simple descriptive concept derived from the topic.
        thumb_concept = f"Một cảnh minh họa trực quan về {topic.lower()}, chữ tiêu đề nổi bật, nền màu tương phản cao"
        thumb_prompt = (request.thumbnail_prompt_en or "").strip() or f"A vibrant thumbnail about {topic}, bold title text, high contrast background, professional YouTube thumbnail style"

        return ScriptSchema(
            title=seo_title,
            hook=hook,
            angle=(request.angle or "").strip() or "chia sẻ kiến thức dễ hiểu và ứng dụng ngay",
            outline=outline_items,
            full_script=full_script,
            thumbnail_concept=thumb_concept,
            thumbnail_prompt=thumb_prompt,
            seo={
                "youtube_title": seo_title,
                "description": f"Video chia sẻ về {topic.lower()}. "
                f"Xem ngay để nắm những kiến thức quan trọng nhất chỉ trong {duration} giây.",
                "hashtags": [f"#{topic.split()[0].lower()}"] if topic.split() else [],
                "tags": [topic, f"kiến thức {topic.split()[0].lower()}" if topic.split() else ""],
            },
        )

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _default_outline(topic: str, is_short: bool) -> list:
        if is_short:
            return [
                f"Vì sao {topic.lower()} lại quan trọng với bạn",
                f"Điều đầu tiên bạn cần biết về {topic.lower()}",
                f"Bước đơn giản nhất để bắt đầu ngay hôm nay",
            ]
        return [
            f"{topic} là gì và vì sao bạn cần quan tâm",
            "Những hiểu lầm phổ biến cần tránh",
            "Các bước thực hành cụ thể",
            "Mẹo tối ưu kết quả trong thời gian ngắn",
            "Câu hỏi thường gặp và cách giải quyết",
        ]

    @staticmethod
    def _default_hook(topic: str) -> str:
        return (
            f"Bạn có biết {topic.lower()} ảnh hưởng trực tiếp đến cuộc sống hàng ngày của bạn? "
            f"Hãy cùng khám phá ngay trong {60} giây tới."
        )

    @staticmethod
    def _paragraph(topic: str, idx: int, total: int, item: str) -> str:
        lead = f"Thứ {idx}, {item}. " if item else f"Điểm {idx}, {topic.lower()}. "
        mid = (
            "Đây là một trong những điều quan trọng nhất bạn cần nắm. "
            "Khi hiểu rõ điểm này, bạn sẽ thấy mọi thứ trở nên đơn giản hơn rất nhiều. "
            "Hãy áp dụng ngay vào thực tế để cảm nhận sự khác biệt."
        )
        close = (
            f"Nhớ rằng, đây là bước {idx}/{total} trong hành trình của bạn. "
            "Mỗi bước nhỏ đều góp phần tạo nên kết quả lớn."
        )
        return lead + mid + close

    @staticmethod
    def _closing(topic: str, is_short: bool) -> str:
        if is_short:
            return (
                f"Đó là những điều cốt lõi về {topic.lower()} bạn cần nhớ hôm nay. "
                "Theo dõi để không bỏ lỡ những chia sẻ tiếp theo nhé!"
            )
        return (
            f"Cảm ơn bạn đã theo dõi đến cuối video về {topic.lower()}. "
            "Nếu thấy hữu ích, đừng quên để lại bình luận và theo dõi kênh để cập nhật những nội dung mới nhất."
        )

    @staticmethod
    def _seo_title(topic: str, is_short: bool) -> str:
        base = f"{topic}"
        if is_short:
            return f"{base} — Bạn cần biết ngay! (Shorts)"
        return f"{base} | Hướng dẫn đầy đủ từ A đến Z"
