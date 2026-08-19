# Viu Auto Studio — Full Test Results

## ✅ Dashboard (/) — PASS
- Header: "Dashboard" + subtitle "Báo cáo hiệu năng và tiến trình sản xuất video" ✅
- Stat cards: TỔNG (5), HOÀN TẤT (2), ĐANG XỬ LÝ (0), LỖI KẾT XUẤT (1) ✅
- Table "Hiệu năng theo bước sản xuất" with BƯỚC/TB/LƯỢT/TỈ LỆ LỖI ✅
- CHI PHÍ ELEVENLABS: 0 ký tự ✅
- XUẤT/24H: 0 ✅
- HIỆU NĂNG HỆ THỐNG: CPU 42%, GPU N/A, RAM 88% ✅
- TRẠNG THÁI DỊCH VỤ: Sidecar Engine OK, GPU CPU only, Queue idle, Backend 8000 ✅
- HOẠT ĐỘNG RENDER LIVE: "Không có hoạt động kết xuất nào đang chạy" ✅
- Hoạt động gần đây: 5 projects listed with status pills ✅

## ✅ Projects (/projects) — PASS
- Search bar + Sort dropdown + Loại chips + Trạng thái chips ✅
- Project cards with thumbnails, badges, footer buttons ✅

## ✅ Workspace (/workspace) — PASS
- Channel selector, video type select, Sinh button ✅
- Tabs: Kịch bản & Giọng, Phân cảnh Visual, Nhân vật ✅
- Pipeline steps: Kịch bản & Giọng, Phân cảnh Visual, Nhân vật ✅

## ✅ TTS (/tts) — PASS
- Provider tabs: Revo Voice, OmniVoice, Google Cloud, Gemini TTS, ElevenLabs, CapCut, Vbee ✅
- Voice list with Nghe thử/Tải 64MB buttons ✅
- Config section with provider, voice, speed/volume, preview ✅

## ✅ Settings (/settings) — PASS
- All 7 tabs: Chung, Engine & Công cụ, AI Dịch & Ảnh, Giọng nói, Telegram, Đăng bài & Lập lịch, Hiệu năng ✅
- Voice config with preview audio ✅

## Remaining to test:
- Queue (/queue)
- Library (/library)
- Project Editor (/projects/3) with all tabs
- Channel Config Dialog
- Workspace pipeline production flow

## ✅ Queue (/queue) — PASS
- Header: "Hàng đợi" + "Quản lý các lệnh render đang chạy, chờ và hoàn tất" ✅
- Filter chips: Tất cả (3), Đang chạy (0), Đang chờ (0), Hoàn tất (2), Lỗi (1) ✅
- Table: ID | Dự án | Bước hiện tại | Trạng thái | Tiến độ | Thời gian | Thao tác ✅
- Human-readable step labels: "Hoàn tất", "Lỗi" (not raw values) ✅
- Status pills: Hoàn thành (green), Lỗi (red) ✅
- Thử lại button for failed jobs ✅

## ✅ Library (/library) — PASS
- Header: "Thư viện" + subtitle ✅
- "Tải lên media" button (top right) ✅
- Search input "🔍 Tìm kiếm media..." ✅
- Media grid with thumbnail, filename, size, date ✅
- test_img.png uploaded and displayed correctly ✅

## ✅ Settings (/settings) — PASS
- All 7 tabs: 📁 Chung, 🔧 Engine & Công cụ, ✨ AI Dịch & Ảnh, 🎙 Giọng nói, ✈ Telegram, ▶ Đăng bài & Lập lịch, ⚡ Hiệu năng ✅
- Huỷ + Lưu cài đặt buttons (top right) ✅
- Giọng nói tab: Provider dropdown, Voice dropdown, Status indicator ✅
- Nghe thử section with textarea, Tốc độ/Âm lượng sliders, ▶ Nghe thử button ✅
- Danh sách giọng with 3 voices and "Dùng giọng này" buttons ✅

## ✅ Project Editor (/projects/5) — PASS
- Header: "Tập #1 — Kênh Test" with 🦌 Kênh Test badge ✅
- Status pills: 16:9 · Bản nháp · 240s mục tiêu ✅
- ⚙️ Cấu hình kênh button visible ✅
- Thư mục dự án button ✅
- 5 tabs: Ý tưởng & Kịch bản, Trình soạn thảo, Storyboard, Phụ đề, Preview & Render ✅
- Tab 1 (Ý tưởng & Kịch bản): Chế độ tạo kịch bản, Định hướng cho AI form ✅

## ✅ Channel Config Dialog — PASS
- Opens when clicking ⚙️ button ✅
- Title: "⚙️ Cấu hình kênh — Kênh Test" ✅
- Sections: 🧠 Nội dung & Bộ não, 📝 Cách viết để AI thật sự rõ giọng, 🎙 Giọng & Hình, ⏰ Tự động & Lịch ✅
- All dropdowns, inputs, buttons visible ✅
- Đóng + 💾 Lưu cấu hình buttons ✅

## ✅ Workspace (/workspace) — PASS
- Header: "Kênh Kênh Test — dây chuyền sản xuất tập mới — chưa có ý tưởng chờ — bấm Sinh ý tưởng" ✅
- 💡 Ý tưởng card with 🎬 Video dài (16:9) dropdown + ✨ Sinh button ✅
- Episode card: "Tập #1 — Kênh Test" with 16:9 badge, tech topic, draft status ✅
- Tabs: Kịch bản & Giọng, Phân cảnh Visual, Nhân vật ✅
- Kịch bản & Giọng section: Giọng đọc (voiceover) info + Kịch bản placeholder ✅
- Tiến độ sản xuất: "Trạng thái: idle" + "Chọn một tập để xem tiến độ." ✅
