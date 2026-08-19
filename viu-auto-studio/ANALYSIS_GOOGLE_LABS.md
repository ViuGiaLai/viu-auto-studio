# Phân tích tham chiếu: Revo Studio (1.1.8_0) + video demo

## Kiến trúc của hệ tham chiếu (Revo Studio)
- Là **Chrome Extension (Manifest V3)** + app web: extension chạy trong browser có đăng nhập Google Labs (labs.google/fx).
- Luồng: web app → content-script (page-bridge.js) → background.js → content-scripts trên tab `labs.google/fx` → tự động thao tác DOM (nhập prompt, chọn model Nano Banana 2, tab IMAGE, LANDSCAPE/PORTRAIT, bấm submit) → chờ tile ảnh hoàn thành → lấy URL media qua `labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=` → tải ảnh về.
- Prompt ảnh: dùng Gemini (gemini.js ~5000 dòng) sinh prompt tiếng Anh có prefix phong cách cố định, vd. "Bright flat vector cartoon illustration, clean lines...".
- Video demo người dùng: 7 cảnh có ảnh AI minh họa phong cách vector đồng nhất → video có HÌNH ẢNH thật, không phải nền màu.

## Điểm khác biệt với Viu Auto Studio hiện tại
- VAS hiện dùng Pollinations.ai (bên ngoài, không cần đăng nhập) — đã cho ảnh thật, nhưng người dùng muốn đúng theo luồng video: **Google Labs (ImageFX/Flow, model Nano Banana 2)**.
- Google Labs KHÔNG có API công khai → cách duy nhất của Revo là tự động hóa browser (extension) trên tài khoản Google đã đăng nhập.
- Yêu cầu thực chất: Viu Auto Studio (Electron desktop) phải tự động mở tab Google Labs, tự điền prompt, lấy ảnh về, gán vào từng cảnh.

## Phương án khả thi cho VAS (Electron)
1. **Phương án A (chính xác với yêu cầu)**: Dùng CDP (Chrome DevTools Protocol) qua Chrome profile của người dùng hoặc headless Chrome:
   - Tự động mở https://labs.google/fx/vi/tools/flow (ImageFX Flow)
   - Tự động nhập prompt, chọn model Nano Banana 2, chọn tỉ lệ (9:16 cho shorts), submit
   - Chờ ảnh xong, lấy media URL hoặc chụp tile ảnh → tải về gán cảnh
2. **Phương án B (backup tin cậy)**: Pollinations hiện tại vẫn là backup khi Labs chưa đăng nhập/không dùng được.

## Ghi chú kỹ thuật
- Media URL của Labs: `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=<mediaId>`
- Tabs DOM: IMAGE tab `button[id*="trigger-IMAGE"]`, LANDSCAPE/PORTRAIT trigger, model dropdown Nano Banana 2, prompt input `[contenteditable="true"][data-slate-editor="true"]`, submit = icon `i.google-symbols` text `arrow_forward`, tile ảnh `[data-tile-id] img`.
- Trong Electron: có thể dùng puppeteer-core với Chrome cài sẵn ở `/usr/bin/google-chrome` (sandbox) hoặc chrome của người dùng.

## Quyết định thực hiện
- Thêm service backend mới `services/media/google_labs.py` + worker CDP tự động (puppeteer-core, headful với profile riêng `/home/ubuntu/viu-auto-studio/data/labs_profile`) để:
  1. Mở labs.google/fx/vi/tools/flow
  2. Nếu chưa đăng nhập → log + fallback Pollinations (không treo pipeline)
  3. Nhập prompt, chọn Nano Banana 2, chọn PORTRAIT/LANDSCAPE theo aspect_ratio
  4. Submit, chờ tile img có src, lấy ảnh, lưu vào scene media_path
- UI: giữ nút "Sinh ảnh AI" cho từng cảnh; cài đặt provider ảnh ở Settings (Google Labs / Pollinations / AI image provider tab).
