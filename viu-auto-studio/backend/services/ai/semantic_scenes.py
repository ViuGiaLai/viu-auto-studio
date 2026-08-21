"""Phân tích ngữ nghĩa kịch bản → chia "cảnh hình ảnh" hợp lý.

Không ánh xạ 1-1 câu-phụ đề-ảnh. Module này dùng LLM (OpenRouter với model
miễn phí làm mặc định, có thể thay bằng Gemini qua key người dùng) phân tích
TOÀN BỘ kịch bản rồi trả về danh sách đoạn (segment) — mỗi đoạn là một cảnh
hình ảnh độc lập với ranh giới câu:

    - Một đoạn có thể bao trùm nhiều câu nếu nội dung cùng một hành động/liên tục.
    - Một câu dài chứa nhiều sự kiện có thể bị tách thành nhiều đoạn.
    - Chuyển nhân vật / hành động / địa điểm / ý chính → đoạn mới.
    - Mỗi đoạn có: narration (lời đọc ghép), visual_prompt mô tả TOÀN đoạn,
      style_prompt (nhất quán nhân vật-bối cảnh-trang phục-phong cách),
      transition_description (chuyển động/camera/biến đổi trong clip), reason.

Subtitles vẫn được chia theo lời đọc + thời gian phát âm (lớp độc lập) —
1 cảnh hình ảnh có thể chứa nhiều dòng phụ đề.
"""

from __future__ import annotations

import json
import re

SYSTEM_INSTRUCTION = (
    "Bạn là đạo diễn storyboard cho video ngắn. Nhiệm vụ: phân tích TOÀN BỘ "
    "kịch bản và chia thành các CẢNH HÌNH ẢNH (visual scenes) hợp lý về ngữ nghĩa. "
    "NGUYÊN TẮC QUAN TRỌNG:\n"
    "- KHÔNG chia máy móc theo câu hay theo dòng phụ đề. Phụ đề sẽ được xử lý "
    "riêng theo lời đọc và thời gian phát âm — 1 cảnh hình có thể phủ nhiều "
    "dòng phụ đề.\n"
    "- Gộp các câu thành cùng 1 cảnh khi chúng mô tả một hành động liên tục, "
    "cùng nhân vật, cùng địa điểm, cùng ý chính.\n"
    "- Tách cảnh mới khi: chuyển nhân vật, chuyển hành động, chuyển địa điểm, "
    "chuyển thời gian, hoặc chuyển ý chính.\n"
    "- Một câu dài chứa nhiều sự kiện khác nhau có thể cần nhiều cảnh hình.\n"
    "- Nhịp dựng mục tiêu: hook 2-5 giây; cảnh nội dung thường 6-12 giây. "
    "Không cố tạo số cảnh bằng số câu và không đổi hình chỉ vì phụ đề sang câu mới.\n"
    "- Ưu tiên B-roll/chuyển động khi nội dung có hành động, biến đổi, quy trình, "
    "không gian hoặc cảm xúc tăng cao; cảnh giải thích tĩnh có thể giữ ảnh với "
    "Ken Burns/parallax.\n"
    "- visual_prompt phải mô tả đúng nội dung TOÀN cảnh (không lấy máy móc "
    "một dòng phụ đề làm prompt), viết bằng tiếng Anh, đủ chi tiết: nhân vật, "
    "hành động, địa điểm, ánh sáng, góc máy, phong cách.\n"
    "- Giữ NHẤT QUÁN: cùng nhân vật phải nhất quán ngoại hình/trang phục giữa "
    "các cảnh liên quan; cùng địa điểm giữ bối cảnh giống nhau. Trả style_prompt "
    "mô tả chuỗi nhất quán đó (được thêm vào cuối mọi visual_prompt).\n"
    "- transition_description phải viết bằng tiếng Anh, mô tả chuyển động chủ thể, "
    "chuyển động camera, biến đổi trạng thái hoặc chuyển cảnh phù hợp trong clip; "
    "không bịa thêm hành động trái với narration.\n"
    "- Trả về JSON đúng định dạng, không thêm ghi chú ngoài JSON."
)

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "narration": {"type": "string", "description": "Toàn bộ lời đọc của cảnh (ghép từ nhiều câu nếu cùng một cảnh)"},
                    "visual_prompt": {"type": "string", "description": "Prompt mô tả nội dung TOÀN cảnh bằng tiếng Anh"},
                    "style_prompt": {"type": "string", "description": "Mô tả ngắn về nhất quán phong cách/nhân vật/bối cảnh áp cho cảnh này"},
                    "transition_description": {"type": "string", "description": "Mô tả bằng tiếng Anh về chuyển động chủ thể, camera hoặc chuyển cảnh trong clip"},
                    "reason": {"type": "string", "description": "Lý do chia cảnh (bắt đầu nhân vật mới/hành động mới/địa điểm mới hay tiếp nối)"},
                },
                "required": ["narration", "visual_prompt", "style_prompt", "transition_description", "reason"],
            },
        }
    },
    "required": ["scenes"],
}


def _get_gemini_key():
    """Lấy API key Gemini người dùng đã lưu trong Cài đặt → AI (nếu có)."""
    try:
        from backend.services.media.config import get_labs_config

        db_session = None
        try:
            from backend.core.database import SessionLocal

            db_session = SessionLocal()
            cfg = get_labs_config(db_session)
            key = (cfg.get("gemini_key") or "").strip() if isinstance(cfg, dict) else ""
        finally:
            if db_session is not None:
                db_session.close()
        return key
    except Exception:  # noqa: BLE001
        return ""


def _call_llm(messages: list[dict], text_only: bool = True):
    """Gọi LLM theo thứ tự: (1) Gemini text API bằng key người dùng — chính xác cơ chế
    của Flow Factory 1.1.8_0 (generateContent), (2) OpenRouter model miễn phí.

    Trả văn bản phản hồi; ném RuntimeError nếu không gọi được.
    """
    user_prompt = "\n\n".join(m["content"] for m in messages if m.get("role") == "user")
    sys_text = "\n\n".join(m["content"] for m in messages if m.get("role") == "system")
    full_prompt = (f"{sys_text}\n\n" if sys_text else "") + user_prompt
    full_prompt += "\n\nTrả JSON đúng định dạng, không thêm ghi chú ngoài JSON."

    key = _get_gemini_key()
    if key:
        try:
            from backend.services.media.gemini_provider import _call_gemini_text, _extract_text

            data = _call_gemini_text(key, full_prompt, json_mode=True)
            text = _extract_text(data)
            if text:
                return text
        except Exception:  # noqa: BLE001
            pass
    try:
        from backend.services.ai.gemini import GeminiProvider

        prov = GeminiProvider()
        text = prov.generate_text(messages=messages, json_schema=OUTPUT_SCHEMA)
        if text:
            return text
    except Exception:  # noqa: BLE001
        pass
    try:
        from backend.services.ai.openrouter import OpenRouterProvider

        prov = OpenRouterProvider()
        text = prov.generate_text(messages=messages, json_schema=OUTPUT_SCHEMA)
        if text:
            return text
    except Exception:  # noqa: BLE001
        pass
    raise RuntimeError("Không thể gọi AI để phân tích kịch bản — kiểm tra kết nối/API")


def _heuristic_semantic_scenes(
    script: str,
    existing_narrations: list[str] | None = None,
    style_memory: str = "",
) -> dict:
    """Chia cảnh dự phòng theo câu/đoạn khi LLM không khả dụng (chưa có API key hoặc offline).

    Tự động sinh visual_prompt chi tiết, style_prompt và transition_description
    cho từng cảnh để storyboard và Flow Factory luôn hoạt động đầy đủ.
    """
    from backend.services.script_service import split_into_sentences

    if existing_narrations and any(str(n).strip() for n in existing_narrations):
        raw_items = [str(n).strip() for n in existing_narrations if str(n).strip()]
    else:
        raw_items = split_into_sentences(script)
        if not raw_items:
            raw_items = [s.strip() for s in re.split(r"[\r\n]+|[.!?]+\s+", script) if s.strip()]

    if not raw_items:
        return {"scenes": [], "note": "Kịch bản rỗng"}

    # Turn subtitle/sentence units into editorial story beats. A hook may own a
    # short opening shot; related following sentences share one visual. Very
    # long sentences are split at semantic clause boundaries first.
    clauses: list[str] = []
    for item in raw_items:
        words = item.split()
        if len(words) <= 34:
            clauses.append(item)
            continue
        pieces = [part.strip() for part in re.split(r"(?<=[;:,.])\s+", item) if part.strip()]
        clauses.extend(pieces if len(pieces) > 1 else [item])

    visual_beats: list[str] = []
    buffer: list[str] = []
    word_count = 0
    for index, clause in enumerate(clauses):
        count = len(clause.split())
        is_hook = index == 0 and count <= 16 and ("?" in clause or "!" in clause or count <= 10)
        if is_hook:
            visual_beats.append(clause)
            continue
        if buffer and word_count + count > 34:
            visual_beats.append(" ".join(buffer))
            buffer, word_count = [], 0
        buffer.append(clause)
        word_count += count
        if word_count >= 20:
            visual_beats.append(" ".join(buffer))
            buffer, word_count = [], 0
    if buffer:
        tail = " ".join(buffer)
        if visual_beats and len(tail.split()) < 10 and len((visual_beats[-1] + " " + tail).split()) <= 42:
            visual_beats[-1] = visual_beats[-1] + " " + tail
        else:
            visual_beats.append(tail)

    scenes = []
    default_style = style_memory.strip() or "Cinematic, photorealistic, 8k resolution, detailed lighting"

    camera_moves = (
        "Slow cinematic push-in, subtle parallax depth",
        "Smooth lateral camera tracking from left to right",
        "Gentle pull-back revealing the wider context",
        "Controlled rack focus followed by a slow pan",
    )
    for i, narration in enumerate(visual_beats):
        clean_text = narration.strip()
        prompt = f"Cinematic detailed illustration portraying: {clean_text}. Photorealistic, realistic lighting, 8k resolution, high quality"
        if default_style and default_style not in prompt:
            prompt = f"{prompt}, {default_style}"

        scenes.append({
            "narration": clean_text,
            "visual_prompt": prompt,
            "style_prompt": default_style,
            "transition_description": camera_moves[i % len(camera_moves)],
            "reason": f"Nhịp hình #{i+1}: gộp lời đọc cùng ý/chủ thể thay vì tách theo phụ đề",
        })

    return {
        "scenes": scenes,
        "common_style": default_style,
        "note": f"Đã biên tập {len(raw_items)} đơn vị lời đọc thành {len(visual_beats)} nhịp hình",
    }


def analyze_semantic_scenes(
    script: str,
    existing_narrations: list[str] | None = None,
    style_memory: str = "",
) -> dict:
    """Phân tích kịch bản → danh sách cảnh hình ảnh ngữ nghĩa.

    Nếu có LLM (Gemini / OpenRouter), gọi LLM.
    Nếu LLM chưa cấu hình API key hoặc thất bại, tự động chuyển sang _heuristic_semantic_scenes
    để đảm bảo pipeline luôn tạo được scenes và visual prompts.
    """
    script = (script or "").strip()
    if not script and not existing_narrations:
        return {"scenes": [], "note": "Kịch bản rỗng"}
    user_ctx = ""
    if existing_narrations:
        ctx_lines = "\n".join(f"- Cảnh {i+1}: {n}" for i, n in enumerate(existing_narrations))
        user_ctx = (
            "\nDưới đây là các ĐƠN VỊ LỜI ĐỌC/phụ đề hiện có, không phải ranh giới "
            "cảnh bắt buộc. Hãy tự do GỘP nhiều đơn vị thành một nhịp hình khi cùng "
            "ý/chủ thể/bối cảnh, hoặc tách một đơn vị dài khi có nhiều sự kiện. Tuyệt "
            "đối không tạo một hình cho mỗi dòng chỉ vì danh sách có sẵn:\n" + ctx_lines
        )
    if style_memory.strip():
        user_ctx += (
            "\nĐây là định hướng bắt buộc của kênh. Hãy áp dụng nhất quán vào "
            "visual_prompt và style_prompt của mọi cảnh, không tự đổi tone:\n" + style_memory.strip()
        )
    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {"role": "user", "content": f"Kịch bản:\n\n{script}{user_ctx}"},
    ]
    try:
        raw = _call_llm(messages)
        try:
            data = json.loads(raw)
        except ValueError:
            m = re.search(r"\{.*\}", raw, re.S)
            data = json.loads(m.group(0)) if m else {"scenes": []}
        if isinstance(data, list):
            data = {"scenes": data}
        scenes = data.get("scenes") or []
        if not scenes:
            for key in ("scene", "segment", "items"):
                cand = data.get(key) or []
                if isinstance(cand, list) and cand:
                    scenes = cand
                    break
        for s in scenes:
            narration = (s.get("narration") or "").strip()
            if not narration:
                narration = (s.get("script_segment") or s.get("script_content") or s.get("text") or s.get("subtitle") or "").strip()
            if not narration:
                subs = s.get("subtitles") or []
                narration = " ".join(str(t) for t in subs).strip()
            s["narration"] = narration
            s["visual_prompt"] = (s.get("visual_prompt") or "").strip() or f"Cinematic scene portraying: {narration}"
            s["style_prompt"] = (s.get("style_prompt") or "").strip() or style_memory.strip()
            s["transition_description"] = (s.get("transition_description") or "").strip() or "Smooth cinematic camera motion"
            s["reason"] = (s.get("reason") or "").strip() or "Phân cảnh ngữ nghĩa AI"
        if scenes:
            return {"scenes": scenes, "note": "Đã phân tích ngữ nghĩa qua AI"}
    except Exception:
        # LLM không khả dụng hoặc chưa có API key → chuyển sang fallback
        pass

    return _heuristic_semantic_scenes(script, existing_narrations, style_memory)


def rewrite_scene_prompt(
    scene_narration: str,
    current_prompt: str = "",
    neighboring_narrations: list[str] | None = None,
    style_memory: str = "",
) -> str:
    """Viết lại visual_prompt của 1 cảnh dựa trên toàn bộ nội dung cảnh + bối cảnh.

    Trả chuỗi prompt tiếng Anh mô tả TOÀN cảnh (kèm hậu tố style nhất quán).
    """
    ctx = ""
    if neighboring_narrations:
        ctx = "\nCác cảnh lân cận (để giữ nhất quán):\n" + "\n".join(
            f"- {n}" for n in neighboring_narrations
        )
    style = (
        f"\nChuỗi nhất quán phong cách/nhân vật (phải thêm vào cuối prompt): {style_memory}"
        if style_memory else ""
    )
    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {
            "role": "user",
            "content": (
                f"Lời đọc của 1 cảnh video:\n{scene_narration}\n{ctx}{style}\n"
                f"Prompt hiện tại: {current_prompt or '(chưa có)'}\n"
                "Hãy viết lại visual_prompt tiếng Anh mô tả đúng nội dung TOÀN cảnh "
                "(không chỉ lặp lại 1 câu). Trả JSON: {\"visual_prompt\": \"...\"}."
            ),
        },
    ]
    try:
        raw = _call_llm(messages)
        try:
            data = json.loads(raw)
        except ValueError:
            m = re.search(r"\{.*\}", raw, re.S)
            data = json.loads(m.group(0)) if m else {}
        prompt = (data.get("visual_prompt") or "").strip()
        if prompt:
            if style_memory and style_memory not in prompt:
                prompt = prompt.rstrip(". ") + ". " + style_memory
            return prompt
    except Exception:
        pass

    # Heuristic fallback if LLM is unavailable
    clean_narration = scene_narration.strip()
    fallback_prompt = f"Cinematic detailed illustration portraying: {clean_narration}. Photorealistic, realistic lighting, 8k resolution, high quality"
    if style_memory and style_memory not in fallback_prompt:
        fallback_prompt = f"{fallback_prompt}, {style_memory}"
    return fallback_prompt
