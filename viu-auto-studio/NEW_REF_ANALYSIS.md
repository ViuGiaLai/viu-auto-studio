# Phân tích 27 ảnh mẫu mới (Revo Studio / Viu Auto Studio v2)

## SS1 (UNsMA3): Cài đặt — Chung (scroll top)
- Header "Cài đặt — Cấu hình công cụ xử lý & API", buttons: Huỷ, Lưu cài đặt
- Tabs: Chung, Engine & Công cụ, AI Dịch & Ảnh, Giọng nói, Telegram, Đăng bài & Lập lịch (Đang phát triển), Hiệu năng
- Card "Tài khoản & Gói": Vu recap, workSOR.78@gmail.com, Pro·Full, Hạn dùng 24/8/2026, progress "Recap đã xuất tháng này — Không giới hạn", "AI Creator đã xuất tháng này — 4/50", card "Nâng cấp lên gói cao hơn" + btn "Xem bảng giá →", btn Đăng xuất
- Card "Chung": Output Folder (C:\Users\works\Videos\RevoStudio) + "Chọn thư mục"; Ngôn ngữ hiển thị (Tiếng Việt); "Chế độ hiển thị trình duyệt Chrome khi chạy Auto UI" (Hiển cửa sổ Chrome (Mặc định) để theo dõi & đăng nhập) — áp dụng cho Auto UI tasks (Google Flow, Meta AI, Grok, CapCut...)
- Sidebar mới: Dashboard, Dự án, Workspace, PHÂN TÍCH ĐỐI THỦ, Hàng đợi, Thư viện, TTS, Brand Kit, Tài khoản Flow, Trình duyệt & Profile, Cài đặt

## SS2 (9Cctbo): Cài đặt — Engine & Công cụ
- Card "Bộ Công Cụ Revo Studio" trạng thái "Chưa cài đặt". 3 modes: Cơ bản (máy yếu/laptop CPU, ~175MB), Cân bằng (máy trung bình, ~500MB, KHUYẾN NGHỊ), Hiệu năng cao (máy khỏe/RAM lớn, ~1.5GB, tới đa phân cứng). Info: "Sử dụng chế độ tương thích cao (chạy trên CPU)". Buttons: "Kiểm tra lại", "Tải Bộ Công Cụ" (primary)
- Card "Công cụ nâng cao": "Nhập video được phép sử dụng" (công cụ kiểm nguồn video được phép, giấy phép sở hữu/QH...) trạng thái "Sẵn sàng ✔", btn "Đã Cài Đặt ✔" (green); "Demucs — tách giọng / nhạc nền" (AI Movie Recap, NẶNG kéo theo PyTorch ~2GB, dùng PyTorch của OmniVoice nếu đã cài), btn "Tải & Cài đặt Demucs"

## SS3 (tpIqGC): Cài đặt — AI Dịch & Ảnh
- Card "Dịch & SEO (AI)": Nhà cung cấp dịch / SEO. 3 options: DeepSeek (API key - ổn định, tính phí), ChatGPT (tài khoản - dùng gói đã đăng ký, không cần API key), Gemini (tài khoản - đăng nhập Google, không cần API key)
- Section "Tài khoản ChatGPT": Status "Chưa đăng nhập", btn "Đăng nhập bằng Chrome/Edge". Note: Dùng endpoint nội bộ không chính thức, có rủi ro với tài khoản. Link: "Đăng nhập Google bị chặn? Dán session token thủ công"
- Section "Tài khoản Gemini (Google)": Status "Chưa đăng nhập", btn "Đăng nhập bằng Chrome/Edge".
- Model Gemini selection: 3.1 Flash-Lite (Nhanh nhất), 3.5 Flash (Mặc định, toàn diện), 3.1 Pro (Chất lượng cao, chậm hơn). Note: Dùng endpoint nội bộ không chính thức của Gemini.
- DeepSeek API Key input field with "Hiện" and "Test connection" button.

## SS4 (NnOIBV): Cài đặt — Giọng nói
- Section "Chuyển văn bản thành giọng nói": Nhà cung cấp mặc định (Revo Voice - giọng Việt có sẵn, offline), Giọng mặc định (Revo Mai (Nữ) · cần tải). Buttons: "Nghe thử", "Test kết nối"
- Card "Revo Voice (giọng Việt có sẵn)": Chạy offline, không cần API key/GPU. Engine ~35MB, mỗi giọng ~63MB. Status "Chưa cài đặt". Button "Tải & Cài đặt Revo Voice"
- List "Kho giọng — đã tải 0/21": Revo Mai (Mặc định), Revo Ban Mai, Revo Ngọc Huyền, Revo Mai Phương, Revo Thanh Phương, Revo Phương Trang. Each has "Tải 64MB" button.

## SS5 (5YecsG): Cài đặt — Giọng nói (Provider list)
- Dropdown "Nhà cung cấp mặc định": Revo Voice (giọng Việt có sẵn, offline), Kokoro TTS (Anh/Mỹ/..., local), Kokoro Việt Nam (local), OmniVoice (clone đa ngữ, local), ElevenLabs, Google Cloud TTS (Studio 48kHz, $3...), Gemini TTS (AI Studio), Vbee (giọng Việt), Azure TTS.

## SS6 (sWKN5E): Cài đặt — Giọng nói (Voice list)
- Dropdown "Giọng mặc định": List of Revo voices (Mai, Ban Mai, Ngọc Huyền, Mai Phương, Thanh Phương, Phương Trang, Lạc Phi, Cúc...) with gender and "cần tải" status.

## SS7 (azjiuz): Dashboard (empty state)
- Header "Dashboard", subtitle "Báo cáo hiệu năng và tiến trình sản xuất video". Button "refresh" (outline).
- 4 stat cards: TỔNG VIDEO (0), HOÀN TẤT (0), ĐANG XỬ LÝ (0), LỖI KẾT XU... (0).
- Table "BƯỚC | TB (GIÂY) | LƯỢT | TỈ LỆ LỖI" with text "Chưa có dữ liệu chạy."
- 2 side cards: CHI PHÍ ELEVENLABS (0 ký tự), XUẤT / 24H (0).
- Right column: HIỆU NĂNG HỆ THỐNG (CPU 28% 2.5 GHz BỘ VI XỬ LÝ, GPU N/A không phát hiện GPU rồi CHỈ DÙNG CPU, RAM 70% 12GB/16GB BỘ NHỚ TRONG); TRẠNG THÁI DỊCH VỤ (Sidecar Engine Đang chạy (OK), Tăng tốc GPU Chỉ dùng CPU, Hàng đợi xử lý Đang rảnh); HOẠT ĐỘNG RENDER LIVE (Không có hoạt động kết xuất nào đang chạy).

## SS8 (RELTCZ): Dự án (empty state)
- Header "Dự án", "Danh sách kênh chiến dịch của bạn", button "+ Project Mới" (purple gradient).
- Search bar "Tìm kiếm dự án...", "Sắp xếp: Mới nhất".
- "Loại: Tất cả (0), Recap (0), ✨ AI Studio (0)". "Trạng thái: Tất cả (0), Đang chạy (0), Đang chờ (0), Lỗi (0)".
- Dashed card "Tạo project mới — Khởi tạo kênh AI Studio tự động hoặc Recap video Remake".
- Note: New project type "Recap" added alongside "AI Studio" (long/short).

## SS9 (f5gNiF): Modal "Tạo Project Mới"
- Fields: Tên Project, Loại kênh / Dự án (2 cards: Recap - Dịch lồng tiếng video của bạn; AI Studio - AI tự nghĩ ý tưởng -> tự dựng video).
- Thư mục đầu ra (Output Folder) with Browse button.
- Buttons: Huỷ, Tạo Project (purple gradient).

## SS10 (HXnFRE): Màn hình TTS (Text-to-Speech)
- Header "TTS — Giọng Việt offline · Đọc đoạn văn · Tải MP3/WAV".
- Provider tabs: Revo Voice (selected), OmniVoice, Google Cloud, Gemini TTS, ElevenLabs, CapCut, Vbee.
- Card "Kho giọng — đã tải 0/21": Search bar "Tìm giọng...". List of 21 voices with Play button, "Tải 64MB" button, description, gender.
- Note: This is a dedicated TTS tool page, not just settings.

## SS11 (S8CMXJ): Cài đặt — Engine (Downloading state)
- Shows progress bar "Đang chuẩn bị giọng đọc tiếng Việt Revo Voice... 89%".
- Card "Cân bằng" has green "Đang dùng ✔" badge.
- Main button "Đã Sẵn Sàng ✔" (green).

## SS12 (P22tGl): Cài đặt — Engine (Ready state)
- Shows green banner "✔ Bộ công cụ đã sẵn sàng."
- Button "Đã Sẵn Sàng ✔" (green).

## SS13 (PBiv8b): Cài đặt — Engine (Upgrade state)
- Shows "Hiệu năng cao" selected. Button "Nâng cấp lên Hiệu năng cao".

## SS14 (dRKO3O): Workspace — Idea Approval UI
- Top bar: "✨ viu recap AI STUDIO", "🎬 Video", "📄 Bài viết FB", "AI 4/50".
- Subtitle: "Dây chuyền: chưa có tập - ý tưởng kế '7 Sự Thật Đáng Sợ...' đang chờ duyệt · 1 chờ duyệt".
- Idea card: #0 proposed, title, refresh button.
- Right panel: Shows idea title, hook quote, "Chưa có kịch bản. Duyệt ý tưởng để AI viết..." with "↩ Quay lại Ý Tưởng" button.
- "Thông tin ý tưởng" collapsible section.
- Bottom buttons: "✅ Duyệt & Sản xuất" (green), "❌ Bỏ" (red), "Tạo lại" (outline), "chưa sản xuất" (text).

## SS15 (WevncW): Workspace — Idea Details Expanded
- Collapsible "Thông tin ý tưởng" section shows:
  - Góc nhìn: "Tiết lộ những sự thật ít được chú ý về AI..."
  - Định dạng: long
  - Outline: "Phân đoạn 1: AI đang phát triển nhanh đến mức nào? → Phân đoạn 2: Những công việc có nguy cơ bị AI thay đổi → Phân đoạn 3: AI có thể hiểu và bắt chước con người đến đâu? → Phân đoạn 4: Những nguy cơ mà ít người để ý → Phân đoạn 5: Điều con người cần làm để thích nghi → Phân đoạn 6: Kết luận gây bất ngờ và câu hỏi dành cho người xem"
  - Thumbnail: "Một người đứng giữa thành phố tương lai..."
  - Series link: "Trống (Click để thêm)"
  - Thời lượng: 720
  - Visual: "Trống (Click để thêm)"
  - Vi sao ăn khách: "Trống (Click để thêm)"

## SS16 (A7eHhN): Modal "Duyệt ý tưởng" (Import Script)
- Modal title "Duyệt ý tưởng" with subtitle "7 Sự Thật Đáng Sợ Về Trí Tuệ Nhân Tạo Mà Bạn Ch..."
- Textarea: "Nhập kịch bản (text thuần):" — "Dán kịch bản vào đây... Mỗi câu nên nằm trên 1 dòng. Hệ thống sẽ tự tách câu nếu bạn dán cả đoạn văn."
- Note: "Không cần nhập thời gian. AI sẽ đọc giọng rồi tự trích xuất timing chuẩn cho từng câu."
- Buttons: "Huỷ" (outline), "🤖 Tự động lên kịch bản" (purple), "Import kịch bản" (red/outline).

## SS17 (lS8gPa): Workspace — Script Importing / Processing
- Status bar shows "Trạng thái: processing".
- Script lines with timestamps (0:04, 0:11, 0:19, 0:27, 0:36).
- Right panel "Tiến độ sản xuất": Dữ kiện (skipped), Kịch bản (skipped), Lồng tiếng (0%), Storyboard (pending), Ảnh/Video (pending), Dựng phim (pending), SEO (pending).
- Buttons: "⏹ Dừng" (red), "Nhật ký" (outline), "Xem Queue kênh này (3 lần) →".
- Bottom action buttons: "🎙 Lồng tiếng & Dựng" (gradient), "🔄 Tạo lại kịch bản" (outline), "↩ Quay lại Ý Tưởng" (outline).
- Toast: "Đã import kịch bản — bắt đầu sản xuất..."

## SS18 (I1ryMd): Workspace — Production (Storyboard/Character)
- Top bar: "✨ viu recap AI STUDIO", "🎬 Video", "📄 Bài viết FB", "AI 5/50".
- Top right: "Flow ⭘ đăng nhập", "Telegram ⭘", "📊 Thống kê", "⚙ Cấu hình".
- Idea card shows "🎬 ảnh tạm" badge, 16:9 ratio, progress bar, refresh.
- Right panel "Nhân vật": "⭐ Nhân vật đại diện kênh" (🔒 Cố định — không tự sinh lại).
- "Chưa có nhân vật đại diện. Import ảnh của bạn hoặc để AI tạo."
- Inputs: "Tên host", "Mô tả host để AI tạo (vd: một chú sói đội m..."
- Buttons: "Tải ảnh lên" (outline), "AI tạo host" (gradient).
- Section "+ Thêm nhân vật cho kênh": Inputs "Tên (vd: Host)", "Mô tả ngoại hình (tiếng Anh tố...", "Thêm" (red).
- "Chưa có nhân vật. Thêm ở trên (vd người dẫn cố định), hoặc cứ sản xuất — AI sẽ tự rút nhân vật từ kịch bản."

## SS19 (a5Jeln): Workspace — Failed state + Flow Account Modal
- Shows "❌ Lỗi ở bước Storyboar..." / "Cấu hình để nhập API..."
- Modal "TÀI KHOẢN GOOGLE FLOW" with "+ Thêm" button and "Đăng nhập nhanh (phiên mặc định)".

## SS20 (EW4sUW): Workspace — Storyboard Visual Split (failed at Image/Video step)
- Warning: "⚠ Lỗi ở bước" + "cảnh chưa tạo được ảnh/video thật. Để bảo đảm chất lượng, phần mềm KHÔNG dựng/preview với ảnh tạm — bấm '⚙ Tải lại cảnh thiếu' để tạo lại đây đủ."
- Scene stats: "11 cảnh", "🕐 0:59", "🖼 9 ảnh", "🎬 2 clip".
- "Ảnh/clip thật từ Flow 0/11" with progress.
- Buttons: "🔄 Tạo lại phân cảnh" (outline), "🔧 Tải lại 10 cảnh thiếu" (orange).
- Scene cards #1, #2: thumbnail, "Upload" button, "🎬 Clip - 3.0s" / "🖼 Ảnh - 5.2s" badge, "pending" status, caption, "Nova" tag, "Prompt tạo ảnh:", "📁 Tải ảnh/clip" button, "Sửa prompt" link.
- Right panel: "▶ Tiếp tục" (green), "🔄 Từ bước lỗi" (outline), "Nhật ký" (outline).

## SS21 (vOiPDQ): Google Flow (labs.google) Integration
- Opens Google Flow browser window at `labs.google/fx/vi/tools/flow/project/...`
- Shows project "Revo 4bb87e3e 202..."
- Left sidebar: "Tất cả nội dung nghe...", "Hình ảnh", "Nhân vật", "Cảnh", "Công cụ", "Thùng rác".
- Shows generated image (cartoon character with annotations) and another image at 99%.
- Bottom: "Bạn muốn tạo gì?" with "Tác nhân" button and "Nano Banana 2 x2" model.

## SS24 (RubcgM): Google Flow — Uploaded Assets
- Shows "Tệp tải lên" tab in Google Flow.
- Lists uploaded files: `nova.png` (twice).
- "Tải nội dung nghe nhìn lên" button.

## SS25 (4o8BQk): Google Flow — Prompting
- Shows prompt input in Google Flow: "Bright bold flat vector cartoon illustration, clean thick outlines... wide medium shot of Mina... Nova giving a thumbs up...".
- Model: "Nano Banana 2 x2".

## SS26 (zEs5lj): Workspace — Storyboard (Ready/Export)
- Banner: "✔ Đã tạo xong ảnh cho mọi cảnh — 2 cảnh chờ quay clip. Xem/sửa ảnh rồi bấm 'Tạo clip & dựng phim'."
- Buttons: "🎬 Tạo clip & dựng phim (2 cảnh video)" (green gradient), "🔄 Tạo lại phân cảnh" (outline).
- Scene card #1: Shows real image from Flow, "🎬 Clip - 3.0s" badge, "đã có ảnh" status.
- Scene card #2: Shows "absorbed" status.
- Bottom: "🎬 Mở Studio Editor" button (purple).

## SS27 (ZOVqWi): Google Flow — Video Generation Settings
- Modal in Google Flow for video generation.
- Options: "Hình ảnh", "Video" (selected).
- "Khung hình": 9:16, 16:9 (selected).
- "Thành phần": button.
- Model: "Omni Flash".
- Duration: 4s, 6s, 8s (selected), 10s.
- Speed: x1, x2 (selected), x3, x4.
- "Quá trình tạo sẽ tốn 24 tín dụng".
- Button: "Video · 8s x2" (arrow).
