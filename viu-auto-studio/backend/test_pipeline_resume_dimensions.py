from pathlib import Path


def main() -> None:
    from backend.render.ffmpeg_engine import get_audio_duration

    assert callable(get_audio_duration)
    source = Path(__file__).with_name("pipeline").joinpath("queue.py").read_text(encoding="utf-8")
    setup = 'width, height = (1080, 1920) if (project and project.aspect_ratio == "9:16") else (1920, 1080)'
    assert source.count(setup) == 2  # job-wide setup + final render refresh
    job_setup = source.index(setup)
    subtitle_step = source.index("# Step 3: subtitles")
    assert job_setup < subtitle_step
    print("PIPELINE_RESUME_DIMENSIONS_PASS")


if __name__ == "__main__":
    main()
