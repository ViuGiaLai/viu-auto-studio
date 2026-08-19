# Viu Auto Studio v2.0.0

> Bản này (19/08/2026): theme navy/teal + vàng cam (#0B0F12 / #FAAA02) khớp 27 ảnh mẫu; sidebar 10 mục; Studio 7 stage; pipeline đầy đủ (kịch bản → tách câu → chia cảnh AI → TTS Edge → ảnh AI thật → render FFmpeg → FFprobe verify); Flow Connector Chrome Extension (thư mục `flow-connector/`); backend tự chọn port trống + dữ liệu lưu trong thư mục người dùng (~/.viu-auto-studio) cho nhiều người dùng.

## New in v2.0

- **TTS Page** (`/tts`): Provider tabs (Revo Voice, OmniVoice, Google Cloud, Gemini TTS, ElevenLabs, CapCut, Vbee), voice list with Play/Tải buttons, text preview with download
- **Settings "Hiệu năng" tab**: System resource monitoring (CPU/RAM/GPU), service status
- **Workspace v2 Pipeline**: Kịch bản & Giọng → Phân cảnh Visual → Nhân vật tabs, production step tracking (Dữ kiện, Kịch bản, Lồng tiếng, Storyboard, Ảnh/Video, Dựng phim, SEO)
- **Google Flow Integration**: Auto-open labs.google/fx/vi/tools/flow/project/{id} at storyboard step
- **Characters**: Per-channel and per-project character management (host + supporting)
- **Recap project type**: New video type alongside long/short
- **Pipeline State**: Full auto-production pipeline with step-level status tracking
- **New sidebar items**: TTS navigation item

---

Ứng dụng desktop tạo video AI tự động từ kịch bản đến bản dựng MP4 cuối cùng, được xây dựng hoàn toàn theo 17 ảnh giao diện mẫu. Ứng dụng hỗ trợ toàn bộ luồng sản xuất: quản lý kênh, tạo dự án, sinh ý tưởng/kịch bản bằng AI, chia cảnh (storyboard), tạo giọng đọc (TTS), chọn hình/ảnh, tạo phụ đề, render video FFmpeg và quản lý hàng đợi.

## Kiến trúc

| Tầng | Công nghệ |
| --- | --- |
| Vỏ desktop | Electron (khởi động và quản lý vòng đời backend Python) |
| Giao diện | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| State | Zustand (app-store, editor-store) |
| Điều hướng | React Router v6 |
| Backend | Python FastAPI + SQLAlchemy + SQLite + Pydantic v2 |
| Render | FFmpeg (H.264/AAC, phụ đề ASS, hiệu ứng zoom/pan, fade) — không giả lập |
| TTS | Hệ adapter: MockTTS (mặc định, tạo giọng thật bằng `espeak-ng`), LocalTTS/CloudTTS (khung sẵn) |
| AI | Adapter OpenRouter / Gemini (cần API key; khi chưa cấu hình, sinh kịch bản mẫu logic) |

## Thư mục

```
viu-auto-studio/
├── backend/            # FastAPI: models, schemas, api routes, pipeline queue, render engine
├── desktop/            # Ứng dụng React + Electron (src/, electron/, vite config)
├── data/               # SQLite (app.db), tài nguyên thư viện
├── projects/           # Dữ liệu từng dự án: cảnh, giọng, video đầu ra
├── scripts/            # Công cụ hỗ trợ (migrate schema)
└── README.md
```

## Yêu cầu hệ thống

- Python 3.10+ với `uvicorn`, `fastapi`, `sqlalchemy`, `pydantic`, `python-multipart`
- Node.js 20+ và pnpm
- FFmpeg và FFprobe (cần cho render thật và TTS giọng đọc)
- (Tùy chọn) API key OpenRouter hoặc Gemini để sinh kịch bản AI

## Cài đặt và chạy trong chế độ phát triển

```bash
# 1. Backend Python
python3 -m venv venv && source venv/bin/activate
pip install uvicorn fastapi sqlalchemy "pydantic>=2" python-multipart
cd /path/to/viu-auto-studio
python3 -m uvicorn backend.main:app --port 8000

# 2. Frontend (cổng 5173, proxy /api sang backend 8000)
cd desktop && pnpm install && pnpm dev
```

Mở trình duyệt tại `http://localhost:5173` để dùng thử.

## Đóng gói desktop (Electron)

```bash
cd desktop
pnpm vite build            # build frontend tĩnh vào desktop/dist
pnpm electron-builder      # hoặc electron-builder --linux --win --mac
```

Khi chạy bản Electron, ứng dụng tự khởi động backend Python cùng tiến trình (xem `desktop/electron/main.ts` và backend lifecycle manager). Nút mở thư mục dự án sử dụng `shell.openPath` của Electron; ở chế độ trình duyệt, ứng dụng hiển thị đường dẫn thư mục qua toast.

## Các luồng chức năng chính

| Luồng | Mô tả |
| --- | --- |
| Dashboard | Thống kê dự án, tiến độ bước pipeline, hiệu năng hệ thống, trạng thái dịch vụ, hoạt động gần đây |
| Dự án | Tìm kiếm, sắp xếp (Mới nhất/Cũ nhất/Dung lượng), lọc theo loại (Video dài/Shorts/Bản nháp) và trạng thái; card dự án với thumbnail, huy hiệu tỉ lệ, nút Mở/Thư mục/Xóa (có hộp thoại xác nhận) |
| Trình soạn thảo | 5 tab: Ý tưởng & Kịch bản → Trình soạn thảo → Storyboard → Phụ đề → Preview & Render; nút ⚙️ Cấu hình kênh cho dự án gắn kênh |
| Workspace | Quản lý kênh, sinh ý tưởng, pipeline sản xuất tự động theo từng bước |
| Hàng đợi | Lệnh render thật với trạng thái, tiến độ, retry, hủy |
| Thư viện | Upload ảnh/video thật, lưu về thư mục `data/assets` |
| Cài đặt | Tabs Chung/Engine/AI/Giọng nói/Telegram/Đăng bài; cấu hình giọng, xem trước giọng đọc |

## Ghi chú dữ liệu

- Cơ sở dữ liệu SQLite: `data/app.db` (tạo tự động khi khởi động lần đầu).
- Thư mục dự án: `projects/project_<id>/` chứa cảnh, giọng đọc MP3, phụ đề ASS, video preview/output.
- Mọi dữ liệu hiển thị trong giao diện đều được đọc/ghi thật vào SQLite và hệ tập tin — không có dữ liệu giả, nút giả hay UI-only.


<!-- internal note marker (remove in delivery) -->
