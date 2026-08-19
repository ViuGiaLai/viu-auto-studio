#!/usr/bin/env bash
# End-to-end flow test mirroring the frontend journey:
# Create project -> AI script (uses OpenRouter env if set, else errors gracefully) ->
# build scenes -> upload media -> start render -> poll until completed.
set -u
BASE="http://127.0.0.1:8000/api"
echo "=== 1. create project ==="
P=$(curl -s -X POST $BASE/projects -H 'Content-Type: application/json' -d '{"name":"E2E Flow Test","topic":"Lịch sử Internet","video_type":"short","aspect_ratio":"9:16","language":"vi","target_duration":60}')
echo "$P"
PID=$(echo "$P" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "PID=$PID"

echo "=== 2. save script (paste mode) ==="
curl -s -X POST "$BASE/projects/$PID/script" -H 'Content-Type: application/json' -d '{"title":"Internet bắt đầu như thế nào","hook":"","angle":"","outline":[],"full_script":"Internet ra đời vào những năm 1960 khi các nhà khoa học muốn kết nối máy tính với nhau. Sau đó mạng lưới này phát triển khắp thế giới. Ngày nay hàng tỷ người dùng Internet mỗi ngày. Công nghệ tiếp tục thay đổi cách chúng ta sống và làm việc.","thumbnail_concept":"","thumbnail_prompt":"","seo":{"youtube_title":"Internet bắt đầu như thế nào","description":"","hashtags":[],"tags":[]}}'
echo

echo "=== 3. approve ==="; curl -s -X POST "$BASE/projects/$PID/script/approve"; echo
echo "=== 4. build scenes ==="; curl -s -X POST "$BASE/projects/$PID/build-scenes"; echo
echo "=== 5. list scenes ==="; SCENES=$(curl -s "$BASE/projects/$PID/scenes"); echo "$SCENES"
SCENE_ID=$(echo "$SCENES" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d['scenes'][0]['id'])" 2>/dev/null)
echo "SCENE_ID=$SCENE_ID"

echo "=== 6. upload media ==="
python3 - <<'EOF'
from PIL import Image
img = Image.new("RGB", (1080, 1920), color=(30, 60, 120))
img.save("/tmp/e2e_media.png")
EOF
UP=$(curl -s -F "file=@/tmp/e2e_media.png;filename=e2e_media.png" "$BASE/upload/media?project_id=$PID")
echo "$UP"
MPATH=$(echo "$UP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('path') or d.get('media_path',''))")
MTYPE="image"

echo "=== 7. set scene media ==="
curl -s -X POST "$BASE/projects/$PID/scenes/$SCENE_ID/media" -H 'Content-Type: application/json' -d "{\"media_path\":\"$MPATH\",\"media_type\":\"$MTYPE\"}"
echo

echo "=== 8. start render ==="
R=$(curl -s -X POST "$BASE/render/start" -H 'Content-Type: application/json' -d "{\"project_id\":$PID,\"config\":{\"fps\":30,\"crf\":21,\"preset\":\"fast\",\"enable_subtitles\":true,\"music_volume\":0.25,\"transition_duration\":0.5,\"subtitle_config\":{\"font\":\"DejaVuSans\",\"font_size\":48,\"primary_color\":\"#FFFFFF\",\"border_color\":\"#000000\",\"border_width\":2,\"position\":\"bottom\",\"bottom_margin\":50,\"max_chars_per_line\":60,\"granularity\":\"sentence\"}}}")
echo "$R"
JID=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('job_id') or d.get('id'))")
echo "JOB=$JID"

echo "=== 9. poll job ==="
for i in $(seq 1 60); do
  sleep 5
  J=$(curl -s "$BASE/render/jobs/$JID")
  STATUS=$(echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")
  PROG=$(echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['progress'])")
  STEP=$(echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['current_step'])")
  echo "[$i] status=$STATUS progress=$PROG step=$STEP"
  case "$STATUS" in
    completed|failed|cancelled) break ;;
  esac
done

echo "=== 10. final output check ==="
OUT=$(echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin).get('output_path',''))")
if [ -n "$OUT" ] && [ -f "$OUT" ]; then
  echo "SUCCESS: $OUT"
  ls -la "$OUT"
else
  echo "OUTPUT PATH: $OUT"
fi
