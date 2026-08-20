from backend.services.ai.niche_profiles import format_niche_prompt, normalize_niche
from backend.services.skill_service import _youtube_video_id

assert normalize_niche("technology") == "tech"
assert "Niche profile" in format_niche_prompt("tech")
assert _youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
assert _youtube_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
assert _youtube_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
try:
    _youtube_video_id("https://example.com/video")
except ValueError:
    pass
else:
    raise AssertionError("non-YouTube URL must be rejected")
print("topic integrations smoke: PASS")
