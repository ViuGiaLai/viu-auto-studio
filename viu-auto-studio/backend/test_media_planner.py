from types import SimpleNamespace

from backend.services.media_planner import select_video_scene_ids


def scene(scene_id: int, narration: str = "Static explanation", transition: str = ""):
    return SimpleNamespace(
        id=scene_id,
        order_index=scene_id - 1,
        narration=narration,
        visual_prompt=narration,
        transition_description=transition,
    )


def main() -> None:
    four = [scene(i) for i in range(1, 5)]
    four[2].transition_description = "Robot chạy nhanh, camera tracking shot và xoay quanh chủ thể"
    assert select_video_scene_ids(four, "mixed") == {3}
    four[0].transition_description = "A person running while the camera follows"
    assert select_video_scene_ids(four, "mixed") == {1, 3}
    twenty = [scene(i) for i in range(1, 21)]
    for index in (1, 7, 16):
        twenty[index].transition_description = "Fast moving action with a tracking shot"
    assert select_video_scene_ids(twenty, "mixed") == {2, 8, 17}
    assert select_video_scene_ids([scene(i) for i in range(1, 21)], "mixed") == set()
    assert select_video_scene_ids(four, "image") == set()
    assert select_video_scene_ids(four, "video") == {1, 2, 3, 4}
    print("MEDIA_PLANNER_PASS")


if __name__ == "__main__":
    main()
