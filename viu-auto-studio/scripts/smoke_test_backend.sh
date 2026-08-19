#!/usr/bin/env bash
# Smoke test for the Viu Auto Studio backend API
set -u
BASE="http://127.0.0.1:8000/api"
echo "=== health ==="; curl -s $BASE/health; echo
echo "=== ffmpeg check ==="; curl -s $BASE/ffmpeg/check; echo
echo "=== dashboard ==="; curl -s $BASE/dashboard; echo
echo "=== create channel ==="; curl -s -X POST $BASE/channels -H 'Content-Type: application/json' -d '{"name":"Kênh Test","niche":"tech","default_aspect_ratio":"16:9"}'; echo
echo "=== list channels ==="; curl -s $BASE/channels; echo
echo "=== create project ==="; curl -s -X POST $BASE/projects -H 'Content-Type: application/json' -d '{"name":"Dự án test","topic":"AI là gì","video_type":"long","aspect_ratio":"16:9","language":"vi","target_duration":60}'; echo
echo "=== list projects ==="; curl -s "$BASE/projects?search="; echo
echo "=== save script ==="; curl -s -X POST $BASE/projects/1/script -H 'Content-Type: application/json' -d '{"title":"AI là gì?","hook":"Bạn có biết AI đang thay đổi thế giới?","angle":"giải thích đơn giản","outline":["Mở đầu","Nội dung","Kết luận"],"full_script":"Trí tuệ nhân tạo là một công nghệ đang phát triển rất nhanh. Nó giúp máy tính hiểu và xử lý thông tin như con người. Trong tương lai gần, AI sẽ xuất hiện ở khắp mọi nơi.","thumbnail_concept":"Robot và não người","thumbnail_prompt":"futuristic robot brain concept","seo":{"youtube_title":"AI là gì?","description":"giải thích AI","hashtags":["#ai"],"tags":["ai"]}}'; echo
echo "=== get script ==="; curl -s $BASE/projects/1/script; echo
echo "=== approve script ==="; curl -s -X POST $BASE/projects/1/script/approve; echo
echo "=== build scenes ==="; curl -s -X POST $BASE/projects/1/build-scenes; echo
echo "=== list scenes ==="; curl -s $BASE/projects/1/scenes; echo
echo "=== tts providers ==="; curl -s $BASE/tts/providers; echo
echo "=== tts config get ==="; curl -s $BASE/tts/config; echo
echo "=== tts voices ==="; curl -s $BASE/tts/voices; echo
echo "=== tts preview ==="; curl -s -X POST $BASE/tts/preview -H 'Content-Type: application/json' -d '{"text":"Đây là đoạn giọng đọc mẫu của Viu Auto Studio.","provider":"mock","voice":"mock_vi_female","speed":1.0}'; echo
echo "=== render start ==="; curl -s -X POST $BASE/render/start -H 'Content-Type: application/json' -d '{"project_id":1,"config":{"fps":30,"crf":21,"preset":"medium","enable_subtitles":true,"music_volume":0.25,"transition_duration":0.5,"subtitle_config":{"font":"DejaVuSans","font_size":48,"primary_color":"#FFFFFF","border_color":"#000000","border_width":2,"position":"bottom","bottom_margin":50,"max_chars_per_line":60,"granularity":"sentence"}}}'; echo
