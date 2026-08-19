# Reference Screenshots Analysis (17 images)

The user provided 17 screenshots of the target UI. Here is the complete analysis:

## Overall Theme
- **Dark navy blue theme** (#0b0f19, #0e1320, #141a28 for cards)
- Purple primary (#7c5cff-ish), orange/pink gradients for CTAs, orange accents
- Green/cyan/red/blue status colors
- Bold headers, muted subtitles

## Sidebar (from SS1, SS5, SS11, SS14, SS15, SS16, SS17)
- Dark sidebar (~220px), logo + "v1.2.7", collapse icon
- Nav items: **Dashboard, Dự án, Workspace, Hàng đợi, Thư viện** (+TTS, Brand Kit, Tài khoản Flow, Trình duyệt & Profile, Cài đặt in some views)
- Bottom: PRO ACTIVE badge card "Đã nhận gói PRO 🎉 / Chúc mừng bạn đã kích hoạt dùng thử Pro 7 ngày thành công!"
- User card: "Viu recap / workson.78@gmail.com" green dot, "★ Pro·Full" badge, "đến 24/8/2026", "MÁ MÁY 1897-0B0A-6D5F" copy icon, "Quản lý tài khoản" button + logout

## New Screen: Workspace (SS12 - key new screen)
- Top bar: channel pills ("🦌 kenh recap", "AI STUDIO" orange badge, "🎬 Video" selected orange, "📄 Bài viết FB", "AI 3/50"); right buttons: "Flow ○ đăng nhập", "Telegram ○", "📊 Thống kê" (outline), "⚙ Cấu hình" (outline)
- Subtitle: "Dây chuyền chưa có tập - chưa có ý tưởng chờ — bấm Sinh ý tưởng"
- Left column "Ý tưởng": dropdown "🎬 Video dài ⌄" + orange "✨ Sinh" button
- Idea cards: teal bg, "#0 · failed" pill + "🖼 16:9" badge; thumbnail; "⚠ ảnh tạm" badge; refresh button; title (orange highlight); subtitle
- Steps bar: "Kịch bản & Giọng" (active), "Phân cảnh Visual", "Nhân vật" + red "failed" badge
- Error banner: "⚠ Lỗi ở bước Storyboard · DEEPSEEK_AUTH — API key DeepSeek trống..."
- "🎙 Giọng đọc (voiceover)" card: "🕔 Đang tạo giọng..." pill + "Đang tạo lại giọng đọc — 72%"
- "📋 Kịch bản" card: "60 câu · 1013 từ · ~3:53"; rows with timestamps "0:00", "0:05"; bottom "video ec318248"
- Right panel "Tiến độ sản xuất": "Trạng thái: failed"; pipeline steps with dots+progress bars: "Dữ kiện" green skipped, "Kịch bản" green skipped, "Lồng tiếng" orange 72%, "Storyboard" red failed, "Ảnh/Video" gray pending, "Dựng phim" pending, "SEO" pending
- Error box "DEEPSEEK_AUTH API key DeepSeek trống..."
- Bottom buttons: red gradient "▶ Tiếp tục", outline "↻ Từ bước lỗi", "📋 Nhật ký"; wide "Xem Queue kênh này (3 lần) →"

## New Screen: Settings (SS5, SS6, SS11)
- Sub-nav tabs: "📁 Chung", "🔧 Engine & Công cụ", "✨ AI Dịch & Ảnh", "🎙 Giọng nói" (active, underline purple), "✈ Telegram", "▶ Đăng bài & Lập lịch (Đang phát triển)", "⚡ Hiệu năng"
- "🎙 Chuyển văn bản thành giọng nói" card: "Nhà cung cấp mặc định" dropdown (Revo Voice, Kokoro TTS, Kokoro Việt Nam, OmniVoice, ElevenLabs, Google Cloud TTS, Gemini TTS, Vbee, Azure TTS) + "Giọng mặc định" dropdown (with TIẾNG VIỆT section) + "▶ Nghe thử" + "Test kết nối"
- Provider card with desc + status dot "● Sẵn sàng" or "● Chưa cài đặt"
- Big purple "Tải & Cài đặt Revo Voice" button
- Voice rows: "Revo Mai" with "MẶC ĐỊNH ✓" badge + desc; each with "⬇ Tải 64MB" / "Xoá" buttons
- "Kho giọng — đã tải 1/21"

## New Screen: Cấu hình kênh modal (SS7, SS8, SS9, SS10)
- Header: gear icon + "Cấu hình kênh" + subtitle "bộ não AI, giọng, lịch tự đề xuất"
- Section "🧠 Nội dung & Bộ não":
  - "Nguồn hình" dropdown "🤖 AI tạo hình (Flow/Meta)"
  - "Kiểu video (bộ não AI)" dropdown with styles: "Hoạt hình Doodle vẽ tay FREE", "Sự thật thú vị / Top-List FREE", "Tài chính cá nhân FREE", "Tâm lý học & Hành vi FREE", "Truyện ngụ ngôn FREE", "Truyện thiếu nhi / Cổ tích FREE", "Ẩm thực & Du lịch BASIC" (with FREE/BASIC badges)
  - "Ngách của kênh" input
  - "Kiểu chuỗi tập" dropdown "Tuyển tập — mỗi tập một chủ đề MỚI (khuyên dùng)"
  - Warning: "⚠ Bạn chưa nhập Mô tả & Định hướng — ý tưởng sẽ dễ chung chung..."
  - "Mô tả chi tiết kênh" textarea + "Định hướng kênh" textarea
  - "Phong cách viết kịch bản" with "🎓 Học từ kênh đối thủ..." button + textarea
  - "📝 Cách viết để AI thật sự rõ giọng — 5 trục": 5 mini-cards (Xưng hô, Nhịp câu, Vào đề, Cấm gì, Kết) each with ✗ bad example + ✓ good example
  - "Hook của kênh" textarea
  - "Độ dài Video dài mục tiêu" + "Độ dài Shorts mục tiêu" dropdowns
  - Section "🎙 Giọng & Hình": "AI provider (văn bản)", "Giọng đọc (TTS)", "Giọng cụ thể", "Đồng bộ nhân vật" dropdown, "Tạo ảnh/video bằng" = "Google Flow (Veo/Imagen)", "Chế độ hình" = "Trộn ảnh + video", "Thời gian ảnh tĩnh" number inputs 5s—8s, "Model video" = "Omni Flash (mặc định)"
  - Section "⏰ Tự động & Lịch": "Chế độ duyệt" = "📄 Duyệt kịch bản trước (Mặc định)", "Giờ đề xuất" input "07:00", "Ngôn ngữ sản xuất" = "Tiếng Việt (vi)"
  - Footer: "Thay đổi áp dụng cho ý tưởng / video mới." + "Đóng" + gradient "Lưu cấu hình"

## Dashboard (SS14, SS16, SS17)
- Header: "Dashboard" bold + "Báo cáo hiệu năng và tiến trình sản xuất video" + "refresh" button
- BETA banner card (optional, purple gradient with rocket)
- 4 stat cards: "TỔNG VIDEO 0", "HOÀN TẤT 0" (green), "ĐANG XỬ LÝ 0" (cyan), "LỖI KẾT XU... 0" (red)
- Big table card: "BƯỚC | TB (GIÂY) | LƯỢT | TỈ LỆ LỖI" empty state "Chưa có dữ liệu chạy."
- Right cards: "CHI PHÍ ELEVENLABS 0 ký tự", "XUẤT / 24H 0"
- Right column: "● HIỆU NĂNG HỆ THỐNG" (CPU/RAM donuts, GPU N/A), "● TRẠNG THÁI DỊCH VỤ" (Sidecar Engine ● Đang chạy (OK), Tăng tốc GPU Chỉ dùng CPU, Hàng đợi xử lý Đang rảnh), "● HOẠT ĐỘNG RENDER LIVE" (sparkle "Không có hoạt động kết xuất nào đang chạy")

## Projects list (SS15)
- Header: "Dự án" + "Danh sách kênh chiến dịch của bạn" + purple "+ Project Mới" button
- Search input "🔍 Tìm kiếm dự án..." + "Sắp xếp: Mới nhất ⌄"
- Filter chips: "Loại: Tất cả (0) | 🎬 Recap (0) | ✨ AI Studio (0)" + "Trạng thái: Tất cả (0) | Đang chạy (0) | Đang chờ (0) | Lỗi (0)"
- Empty state: dashed card with "+" button, "Tạo project mới / Khởi tạo kênh AI Studio tự động hoặc Recap video Remake"
