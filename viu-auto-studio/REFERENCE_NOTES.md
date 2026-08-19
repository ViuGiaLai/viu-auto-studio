# Reference screenshot notes (for UI verification)

## Reference source
All reference images live in /home/ubuntu/upload/ (46 files, mix of pasted_file_*_image.png and pasted_file_*_Screenshot*.png).
Key ones:
- pasted_file_9Cctbo_image.png — projects list (dark, filter chips, aspect badges)
- pasted_file_A7eHhN_image.png — "Duyệt ý tưởng" dialog (script paste, 3 buttons: Hủy / Tự động lên kịch bản (purple) / Import kịch bản (red))
- pasted_file_5YecsG_image.png — Settings Giọng nói tab (TTS provider select open showing Revo Voice/Kokoro/OmniVoice/ElevenLabs/Google Cloud TTS/Gemini TTS/Vbee/Azure TTS)
- pasted_file_sWKN5E_image.png — Settings Giọng nói: default voice select (Revo Mai (Nữ) · cần tải etc), "Tải & Cài đặt Revo Voice" purple button, voice list with "MẶC ĐỊNH" badge, "Kho giọng — đã tải 0/21", mỗi giọng ~63MB, ↓ Tải 64MB buttons
- pasted_file_aFxOG5_image.png — Workspace full reference (3-col: Ý tưởng list + Sinh button; center steps Kịch bản & Giọng/Phân cảnh Visual/Nhân vật with failed badge, idea card with failed banner, voiceover card "Đang tạo giọng... 72%", script card w/ timestamps, script lines; right sidebar Tiến độ sản xuất w/ dot+label+right-aligned status (skipped/success/pending/failed), Tiếp tục/Từ bước lỗi/Nhật ký buttons, Xem Queue kênh này (3 lần) button)
- pasted_file_X6h8Qg_Screenshot2026-08-17105037.png — Workspace reference (similar)
- pasted_file_vtqcoY_Screenshot2026-08-17103353.png — Cấu hình kênh modal full reference (Nội dung & Bộ não: Nguồn hình=AI tạo hình (Flow/Meta), Kiểu video dropdown w/ FREE/BASIC tier badges, Ngách kênh, Kiểu chuỗi tập, Phong cách viết kịch bản, voice style chips; bottom Đóng/Lưu cấu hình buttons)
- pasted_file_a5Jeln_image.png — Workspace with Flow login dialog: header badges (Flow O đăng nhập / Telegram O / Thống kê / Cấu hình), modal "TÀI KHOẢN GOOGLE FLOW +Thêm" với Đăng nhập nhanh (phiên mặc định)
- pasted_file_4o8BQk_image.png / pasted_file_D8yXwm... (others cover library, queue, dashboard, settings)

## Implemented so far
- All pages restyled dark purple theme (#080b14 bg, #111827 cards, purple #7c3aed gradients)
- Settings Engine tab: rebuilt with "Bộ Công cụ Viu Studio" 3 install profile cards (Cơ bản ~175MB / Cân bằng ~500MB KHUYẾN NGHỊ / Hiệu năng cao ~1.5GB) + Công cụ nâng cao (Nhịp video đã cài + Demucs) + current tool status
- Settings publish tab label now "▶ Đăng bài & Lập lịch (Đang phát triển)"
- Storyboard toolbar: added "Mở Google Flow (Labs) để tạo media" button → /api/flow/project-url?project_id= → opens via electronAPI.openExternal or window.open
- tsc clean, vite build OK

## Remaining discrepancies noted
- Workspace page still uses Card import but was already restyled; page looks mostly aligned
- Workspace progress sidebar: labels show status right-aligned (skipped/success/pending/failed) — matches ref
- Workspace header: ref shows "Flow O đăng nhập / Telegram O / Thống kê / Cấu hình" buttons on right of channel bar — current has Thống kê + Cấu hình. Flow login state button not present (modal exists in ref).

## 3igXBc (102818) — Settings Giọng nói
Header page có 2 nút góc phải: "Huỷ" + "Lưu cài đặt" (gradient tím). TTS provider select có các mục: Revo Voice (giọng Việt có sẵn, offline) [highlight], Kokoro TTS (Anh/Mỹ/..., local), Kokoro Việt Nam (local), OmniVoice (clone đa ngữ, local), ElevenLabs, Google Cloud TTS (Studio 48kHz, $300 C...), Gemini TTS (AI Studio), Vbee (giọng Việt), Azure TTS. Mỗi voice row có nút "↓ Tải 64MB" tím viền. Đang mở dropdown provider — hiện có overlay list riêng, không phải radix default. Right side: "Chưa cài đặt" dot, "Tải & Cài đặt Revo Voice" purple full button. So sánh current: voice list mỗi giọng có Tải 64MB? Đã có "↓ Tải 64MB" ở row. Provider dropdown items: current chỉ có mock/local/cloud — CẦN NÂNG: thêm các provider đầy đủ theo ref.

## 8yTzSh (102452) — Dialog "Duyệt ý tưởng"
Modal tối, header có icon clipboard cam + tiêu đề "Duyệt ý tưởng" + phụ đề là title video. Nội dung: "Nhập kịch bản (text thuần):" + textarea border cam nhạt placeholder "Dán kịch bản vào đây...", helper text "Mỗi câu nên nằm trên 1 dòng. Hệ thống sẽ tự tách câu nếu bạn dán cả đoạn văn." Footer: 3 nút — "Huỷ" (outline tối), "Tự động lên kịch bản" (purple, icon AI), "Import kịch bản" (đỏ đậm, icon file). Dòng note: "ℹ Không cần nhập thời gian. AI sẽ đọc giọng rồi tự trích xuất timing chuẩn cho từng câu." → Kiểm tra editor có dialog Duyệt ý tưởng chưa.

## 3igXBc: provider list hiện tại thiếu — cần mở rộng TTS provider options trong TTS page + channel config.

## D8yXwm (090114) — Dashboard reference
Dashboard ref khớp gần đúng current (stat cards 4 khối, bảng BƯỚC/TB GIÂY/LƯỢT/TỈ LỆ LỖI "Chưa có dữ liệu chạy.", CHI PHÍ ELEVENLABS 0 ký tự, XUẤT/24H 0, HIỆU NĂNG HỆ THỐNG CPU 49%/GPU N/A/RAM 93%, TRẠNG THÁI DỊCH VỤ Sidecar Engine Đang chạy (OK), Tăng tốc GPU Chỉ dùng CPU, Hàng đợi xử lý Đang rảnh; HOẠT ĐỘNG RENDER LIVE trống). Current dashboard có thêm: nút "Làm mới" + "+ Project Mới" (ref có nút "refresh" trắng). Ref header Dashboard không có nút +Project — minor. Perf circle hiện % số ở giữa: current chỉ có icon Cpu — nên thêm số % vào giữa vòng tròn như ref (CPU 49%, RAM 93%). Ref giá trị RAM/GPU/CPU là số động thật → hiện tại static, chấp nhận.

## EW4sUW — Workspace "Phân cảnh Visual" tab reference (1792x1125)
Giao diện gần như identical aFxOG5 (cùng workspace ref). Detail mới ở tab Phân cảnh Visual:
- Banner cam đậm: "⚠ Còn 10 cảnh chưa tạo được ảnh/video thật. Để bảo đảm chất lượng, phần mềm KHÔNG dựng/preview với ảnh tạm — bấm '↻ Tải lại 10 cảnh thiếu' để tạo lại đầy đủ."
- Stats row: "11 cảnh · 🎙 0:59 · 🖼 9 ảnh · 🎞 2 clip" (badges đậm)
- "Ảnh/clip thật từ Flow  0/11" + progress bar nhỏ + 2 nút: "🌐 Tạo lại phân cảnh" (outline xanh) và "↻ Tải lại 10 cảnh thiếu" (cam)
- Scene cards: timeline vertical với dot orange bên trái, card có #1 badge xanh, nút "🖼 Upload" vàng ở góc, media preview ảnh placeholder giữa card, dưới media có "0:00-0:03" duration; bên phải: badge "🎞 Clip · 3.0s | pending" (pending xám), text câu kịch bản, "👥 Nova" badge xanh, dòng "🎨 Prompt tạo ảnh: 🖼 Tải ảnh/clip (link vàng)  Sửa prompt (cam)", italic prompt EN truncated "Bright bold flat vector cartoon illustration, clean thick..."
- Scene #2 tương tự "🎞 Ảnh · 5.2s | pending"
- Timeline line dọc nối các dots; cuối có "video 4bb87e3e"
=> Current editor storyboard đã có scene cards w/ Upload nhưng thiếu: stats row 11 cảnh/0:59/9 ảnh/2 clip, progress "0/11", nút "Tạo lại phân cảnh"/"Tải lại X cảnh thiếu", prompt italic EN, Upload badge màu vàng. Có thể nâng cấp editor storyboard theo hướng này.

## f5gNiF — Dialog "Tạo Project Mới"
Form tối với các trường: "Tên Project" (input placeholder "Ví dụ: Kênh TikTok Sức Khỏe"), "Loại kênh / Dự án" với 2 lựa chọn dạng card lớn: "🎬 Recap — Dịch lồng tiếng video của bạn" (viền tím, selected) và "✨ AI Studio — AI tự nghĩ ý tưởng → tự dựng video". "Thư mục đầu ra (Output Folder)" input + nút "Browse" (input path + nút cạnh). Footer: "Huỷ" (text trắng) + "Tạo Project" (button tím đậm). Kiểm tra projects-page có dialog này chưa.
