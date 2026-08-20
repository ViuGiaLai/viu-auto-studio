"""Built-in, editable niche profiles for evidence-aware short-form script generation."""

from __future__ import annotations

from typing import Any


NICHE_PROFILES: dict[str, dict[str, Any]] = {
    "general": {
        "display_name": "Nội dung tổng quát",
        "tone": "rõ ràng, hữu ích, tự nhiên và không cường điệu",
        "pacing": "nhịp vừa, ưu tiên câu ngắn dễ đọc bằng voiceover",
        "hooks": ["mở bằng một câu hỏi cụ thể", "nêu lợi ích hoặc vấn đề người xem đang gặp"],
        "visual_style": "clean documentary, ánh sáng tự nhiên, bố cục rõ ràng",
        "music_mood": "subtle, focused, instrumental background",
        "avoid": ["claim không có nguồn", "giật tít quá mức", "lặp CTA"],
    },
    "tech": {
        "display_name": "Công nghệ và AI",
        "tone": "am hiểu, hơi phản biện, hội thoại nhưng chính xác",
        "pacing": "nhanh vừa, giàu thông tin, không filler",
        "hooks": ["bắt đầu bằng điều nhiều người đang hiểu sai", "đặt một so sánh rõ ràng"],
        "visual_style": "clean dark backgrounds, neon accents, product/UI close-ups, data visuals",
        "music_mood": "subtle ambient electronic, no vocals, medium energy",
        "avoid": ["số liệu không có nguồn", "thuật ngữ không giải thích", "dự đoán như sự thật"],
    },
    "education": {
        "display_name": "Giáo dục và giải thích",
        "tone": "kiên nhẫn, dễ hiểu, có ví dụ cụ thể",
        "pacing": "ổn định, có khoảng nghỉ giữa các ý",
        "hooks": ["nêu câu hỏi mà người mới thường hỏi", "dùng một ví dụ đời thường để mở bài"],
        "visual_style": "bright explanatory diagrams, simple labels, clean compositions",
        "music_mood": "calm, curious, lightly suspenseful instrumental",
        "avoid": ["nhồi quá nhiều khái niệm trong một cảnh", "nói tuyệt đối khi dữ liệu còn thiếu"],
    },
    "finance": {
        "display_name": "Tài chính phổ thông",
        "tone": "thận trọng, minh bạch, giải thích rủi ro trước lợi ích",
        "pacing": "vừa phải, số liệu và định nghĩa phải rõ",
        "hooks": ["đặt vấn đề bằng một sai lầm phổ biến", "nêu câu hỏi về chi phí hoặc rủi ro"],
        "visual_style": "restrained editorial graphics, legible charts, neutral lighting",
        "music_mood": "low-key, confident, unobtrusive instrumental",
        "avoid": ["cam kết lợi nhuận", "tư vấn cá nhân hóa không đủ dữ liệu", "số liệu không dẫn nguồn"],
    },
    "cooking": {
        "display_name": "Ẩm thực",
        "tone": "thân thiện, trực quan, giàu cảm giác nhưng cụ thể",
        "pacing": "nhanh ở thao tác, chậm ở bước cần chính xác",
        "hooks": ["bắt đầu bằng thành phẩm hoặc lỗi thường gặp", "nêu thời gian và nguyên liệu chính"],
        "visual_style": "warm food photography, overhead prep shots, close-up texture",
        "music_mood": "warm upbeat instrumental, light percussion, no vocals",
        "avoid": ["định lượng mơ hồ", "bỏ qua cảnh báo dị ứng hoặc an toàn thực phẩm"],
    },
    "entertainment": {
        "display_name": "Giải trí và bình luận",
        "tone": "có cá tính, nhanh, nhưng phân biệt rõ nhận xét và sự thật",
        "pacing": "nhanh, hook rõ, chuyển ý dứt khoát",
        "hooks": ["nêu một chi tiết đáng chú ý", "đặt hai góc nhìn cạnh nhau"],
        "visual_style": "high-contrast editorial montage with readable source labels",
        "music_mood": "energetic but voiceover-safe instrumental",
        "avoid": ["khẳng định tin đồn là факт", "dùng hình ảnh không có quyền sử dụng"],
    },
}


def normalize_niche(value: str | None) -> str:
    key = (value or "general").strip().lower().replace(" ", "-")
    aliases = {"ai": "tech", "technology": "tech", "khoa-hoc": "education", "hoc-tap": "education"}
    return aliases.get(key, key if key in NICHE_PROFILES else "general")


def get_niche_profile(value: str | None) -> dict[str, Any]:
    key = normalize_niche(value)
    profile = dict(NICHE_PROFILES[key])
    profile["id"] = key
    return profile


def format_niche_prompt(value: str | None) -> str:
    profile = get_niche_profile(value)
    hooks = "; ".join(profile["hooks"])
    avoid = "; ".join(profile["avoid"])
    return (
        f"- Niche profile: {profile['display_name']} ({profile['id']})\n"
        f"- Tone: {profile['tone']}\n"
        f"- Pacing: {profile['pacing']}\n"
        f"- Hook patterns: {hooks}\n"
        f"- Visual vocabulary: {profile['visual_style']}\n"
        f"- Background music direction: {profile['music_mood']}\n"
        f"- Avoid: {avoid}"
    )
