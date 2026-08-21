"""Smoke test cho quy tắc dựng nhịp hình độc lập với câu phụ đề."""

from backend.services.ai.semantic_scenes import _heuristic_semantic_scenes


def main() -> None:
    subtitle_units = [
        "Bạn có biết AI đang thay đổi thế giới?",
        "Mỗi ngày các hệ thống mới xử lý hàng tỷ dữ liệu.",
        "Chúng nhận diện hình ảnh và dự đoán hành vi nhanh hơn trước.",
        "Nhưng tốc độ đó cũng tạo ra những rủi ro khó kiểm soát.",
        "Dữ liệu sai có thể khiến quyết định tự động trở nên nguy hiểm.",
        "Vì vậy con người vẫn phải giám sát ở những thời điểm quan trọng.",
    ]
    result = _heuristic_semantic_scenes(
        " ".join(subtitle_units),
        existing_narrations=subtitle_units,
    )
    scenes = result["scenes"]

    assert 1 < len(scenes) < len(subtitle_units), result
    assert scenes[0]["narration"] == subtitle_units[0]
    assert any(len(scene["narration"].split()) >= 20 for scene in scenes[1:])
    assert all(scene["transition_description"] for scene in scenes)
    assert "1 câu" not in result.get("note", "")
    print(f"SEMANTIC_STORYBEATS_PASS units={len(subtitle_units)} visual_beats={len(scenes)}")


if __name__ == "__main__":
    main()
