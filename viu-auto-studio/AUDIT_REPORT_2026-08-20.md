# Báo cáo audit ngoài luồng nghiệp vụ — Viu Auto Studio

**Ngày:** 20/08/2026  
**Workspace:** `D:\all_my_project\viu-auto-studio\viu-auto-studio`  
**Phạm vi:** bảo mật API và filesystem, SQLite/migration/backup, upload, FFmpeg/subprocess, cleanup, Electron lifecycle, Windows packaging, dependency và regression.  
**Git policy:** Không commit và không push. Tất cả thay đổi vẫn chỉ nằm ở local working tree.

## 1. Kết luận điều hành

Bản local đã vượt qua các kiểm tra chức năng chính của Factory Mode, approval pipeline, cấu hình kênh, database integrity, upload path security, FFmpeg wrapper, TypeScript và production build Desktop. Trong phiên audit này đã sửa thêm các điểm rủi ro ngoài nghiệp vụ có thể gây truy cập file không hợp lệ, upload không giới hạn, process mồ côi, tệp tạm tích tụ và render không dùng đúng thư mục project tùy chỉnh.

Hai hạng mục chưa đạt mức phát hành hoàn toàn cần xử lý ở bước tiếp theo là **ESLint chưa được cài/cấu hình** và **dependency audit đang báo 36 lỗ hổng Node production**, trong đó có cảnh báo mức high liên quan đến Electron. Tôi không tự ý nâng Electron major vì đây là thay đổi tương thích lớn đối với Electron 32, preload bridge, packaging và runtime; cần có một nhánh nâng cấp riêng và test đầy đủ.

## 2. Các thay đổi đã thực hiện trong phiên audit

| Khu vực | Thay đổi thực tế | Kết quả |
|---|---|---|
| Flow Connector token | Dùng `secrets.compare_digest` cho connector task endpoints và Factory heartbeat thay vì so sánh chuỗi trực tiếp. | Giảm rủi ro timing leak; vẫn giữ đúng chế độ local khi token chưa được cấu hình ở connector task layer, còn Factory heartbeat bắt buộc token. |
| Media file serving | `/api/media/file` không còn `pass` khi path nằm ngoài root. Endpoint chỉ đọc file media có suffix được hỗ trợ, nằm trong `PROJECTS_DIR`, `DATA_DIR/assets` hoặc thư mục project đã đăng ký. | Chặn path traversal và đọc arbitrary local file qua endpoint preview. |
| Reference image serving | Reference endpoint kiểm tra `realpath` và `commonpath` với project root trước khi trả file. | Không trả ảnh tham chiếu nằm ngoài thư mục project hợp lệ. |
| Upload API | Tạo helper streaming dùng chung, giới hạn 512MB, cleanup file khi lỗi, đóng `UploadFile` trong `finally`, sanitization tên file và xử lý Windows reserved names. Áp dụng cho project media upload và global library upload. | Không đọc toàn bộ file vào RAM; không cho tên file thoát khỏi assets directory; file dở dang được xóa khi request lỗi. |
| Render output | `/api/render/output/{project_id}` đọc `project.project_directory` thay vì luôn ghép `PROJECTS_DIR/project_{id}`. | Render/preview hoạt động đúng với project folder tùy chỉnh. |
| FFmpeg | `FFmpegEngine` có hard timeout mặc định 14.400 giây, cấu hình qua `VIU_FFMPEG_TIMEOUT_SECONDS`, dùng `communicate()` để đóng pipe, kill process khi timeout và luôn đóng log file. | Giảm nguy cơ FFmpeg treo vô hạn hoặc để lại pipe/log handle mở. |
| Render temp files | Các file `_xfade_*.mp4` và `_concat_tmp.mp4` được dọn khi render thành công hoặc thất bại. | Giảm rác trong thư mục project sau lỗi render. |
| Backend startup | Thêm cleanup upload chunks cũ hơn 24 giờ trong `DATA_DIR/upload_tmp` khi backend khởi động. | Khôi phục tốt hơn sau crash/restart mà không xóa upload mới. |
| Electron backend lifecycle | Đóng backend log stream; thêm kết thúc process tree tương thích Windows bằng `taskkill /T /F`, có fallback SIGTERM/SIGKILL trên Unix; cleanup khi backend không ready. | Giảm nguy cơ Python/Uvicorn descendants và log stream còn tồn tại sau quit. |
| Chrome Flow lifecycle | Chrome dedicated profile được kết thúc theo process tree, kể cả khi DevTools bootstrap hoặc extension configuration thất bại; Unix có graceful stop và force fallback. | Hạn chế Chrome/Flow Connector process mồ côi sau khi đóng app. |
| Database recovery audit | Thêm `scripts/audit_database_restore.py`, dùng SQLite online backup vào file tạm rồi chạy integrity check trên bản backup. | Đã xác minh backup mở lại được và có đủ 23 tables. |
| Regression audit | Thêm `scripts/audit_upload_security.py` và `scripts/audit_ffmpeg_wrapper.py`. | Có kiểm thử tự động cho path sanitization/containment và FFmpeg log/process wrapper. |

## 3. Kết quả kiểm thử

| Kiểm thử | Kết quả |
|---|---|
| `python -m compileall -q backend` | **PASS** |
| `backend/test_flow_factory_smoke.py` | **PASS** — `FLOW_FACTORY_SMOKE_PASS` |
| `backend/test_approval_folder_smoke.py` | **PASS** — `APPROVAL_FOLDER_SMOKE_PASS` |
| `backend/test_channel_config_smoke.py` | **PASS** — `CHANNEL_CONFIG_SMOKE_PASS` |
| `scripts/audit_runtime.py` | **PASS** — `integrity=ok`, `journal=wal`, `foreign_keys=1`, `tables=23` |
| `scripts/audit_database_restore.py` | **PASS** — restored backup `integrity=ok`, `tables=23` |
| `scripts/audit_upload_security.py` | **PASS** — 4 filename/path traversal cases và root containment |
| `scripts/audit_ffmpeg_wrapper.py` | **PASS** — FFmpeg thật chạy xong, log được ghi/đóng, timeout `14400s` |
| `pnpm exec tsc --noEmit` | **PASS** |
| `pnpm build` | **PASS** — Vite renderer và Electron production bundles được tạo |
| `pnpm install --lockfile-only --offline` | **PASS** — lockfile consistency không lỗi |

Một cảnh báo không làm fail smoke test là SQLAlchemy `Query.get()` legacy warning trong `test_flow_factory_smoke.py`; đây là technical-debt nhỏ, chưa ảnh hưởng runtime hiện tại nhưng nên đổi dần sang `Session.get()`.

## 4. Dependency và packaging audit

Lệnh `pnpm audit --prod --audit-level high` trả về **36 vulnerabilities: 5 low, 23 moderate và 8 high**. Kết quả high được nêu rõ là Electron vulnerable dưới phiên bản `39.8.1`, trong khi project hiện đang dùng Electron 32.x. Đây là rủi ro phát hành cần ưu tiên xử lý bằng một kế hoạch nâng Electron có kiểm thử riêng, không nên nâng trực tiếp trong phiên audit này vì có thể ảnh hưởng preload, CDP/puppeteer, native packaging và Windows runtime.

Lệnh `pnpm lint` hiện **không chạy được** vì package không có `eslint` executable và cũng không có ESLint config. TypeScript check vẫn pass, nhưng trạng thái này có nghĩa là pipeline chất lượng chưa có lint thực sự. Cần bổ sung ESLint v9 + TypeScript/React configuration hoặc quyết định loại bỏ script `lint` nếu team không muốn duy trì linting; tôi chưa tự thêm dependency lớn để tránh làm thay đổi lockfile và quy tắc code ngoài phạm vi audit.

Lệnh `pnpm exec electron-builder --win --dir` đã đi qua các bước compile/package, nhưng bị chặn ở bước tải/giải nén `winCodeSign` bởi môi trường Windows hiện tại với lỗi tạo symbolic link: **“A required privilege is not held by the client.”** Output cũng xác nhận electron-builder đã dùng default Electron icon vì `desktop/build/icon.ico` chưa tồn tại. Đây là giới hạn môi trường/packaging asset, không phải lỗi TypeScript hay Vite. Khi phát hành thật cần chạy trên máy có quyền tạo symbolic link hoặc bật Developer Mode, đồng thời bổ sung icon Windows chính thức trước khi build installer.

## 5. Danh sách rủi ro còn lại

1. **Google Flow/Labs vẫn phụ thuộc trạng thái đăng nhập, giao diện web và quota của Google.** Dedicated Chrome profile và extension bootstrap đã được nối thật, nhưng thay đổi DOM/selector hoặc yêu cầu xác minh bổ sung của Google vẫn có thể làm automation chuyển sang `failed`/`waiting_login`.

2. **Electron 32 còn cảnh báo dependency mức high.** Không nên xem production build pass là đã đạt security release; cần nâng Electron lên bản đã vá, sau đó kiểm thử lại preload bridge, `contextIsolation`, Chrome Flow bootstrap, backend launch và installer.

3. **Lint chưa hoạt động.** TSC không thay thế lint; các lỗi style, import không dùng, React hooks và pattern nguy hiểm chưa được eslint kiểm tra tự động.

4. **Packaging Windows chưa được xác nhận end-to-end trong sandbox.** Cần build lại trên máy Windows có quyền symbolic link/Developer Mode, có icon `.ico`, Python runtime đóng gói thật và bộ FFmpeg/FFprobe đầy đủ.

5. **Python requirements mới dùng khoảng version (`>=`, `<`) thay vì lock version.** Điều này thuận tiện cho cài mới nhưng làm build reproducibility yếu hơn. Nên tạo lock/constraints file cho release CI và kiểm tra dependency bằng môi trường sạch.

6. **Các warning SQLAlchemy legacy còn tồn tại trong smoke test.** Nên đổi `Query.get()` sang `Session.get()` trong các test và module còn lại khi có đợt cleanup riêng.

7. **Upload limit hiện là giới hạn theo từng request.** Nếu nhiều upload đồng thời, tổng disk usage vẫn có thể tăng nhanh; sản phẩm phát hành nên bổ sung quota theo project/user và cleanup policy cho asset không còn tham chiếu.

## 6. Danh sách thay đổi local hiện tại

Các file đang modified trong working tree gồm: `backend/api/connector_routes.py`, `backend/api/pages_routes.py`, `backend/api/routes.py`, `backend/core/database.py`, `backend/main.py`, `backend/pipeline/queue.py`, `backend/render/ffmpeg_engine.py`, `backend/schemas/__init__.py`, `backend/services/ai/semantic_scenes.py`, `backend/services/media/google_labs.py`, `desktop/electron/backend-manager.ts`, `desktop/electron/flow-browser.ts`, `desktop/electron/main.ts`, `desktop/electron/preload.ts`, `desktop/package.json`, `desktop/src/components/channel-config-dialog.tsx`, `desktop/src/pages/project-editor-page.tsx`, `desktop/src/pages/projects-page.tsx`, `desktop/src/pages/settings-page.tsx`, `desktop/src/pages/wizard-page.tsx`, `desktop/src/services/api.ts` và `desktop/vite.config.ts`.

Các file mới chưa commit gồm: `.gitignore`, `scripts/audit_database_restore.py`, `scripts/audit_ffmpeg_wrapper.py`, `scripts/audit_runtime.py`, `scripts/audit_upload_security.py`, `backend/test_approval_folder_smoke.py` và `backend/test_channel_config_smoke.py`.

## 7. Khuyến nghị trước khi cho phép commit/push

Trước khi commit, nên quyết định riêng ba vấn đề: kế hoạch nâng Electron theo security advisory, bổ sung ESLint hoặc bỏ lint script, và bổ sung icon/bộ installer assets. Sau đó chạy lại installer trên máy Windows có quyền symbolic link, kiểm tra một lần Factory Mode từ approval đến Chrome Flow image/video, rồi mới chia commit theo nhóm: core pipeline, Flow Connector, security/runtime audit và tests.

Tôi chưa thực hiện commit hoặc push. Khi người dùng xác nhận rõ ràng, có thể lập commit có tổ chức và push lên repository theo đúng yêu cầu ban đầu.

## Tài liệu tham khảo

[1]: https://github.com/advisories/GHSA-532v-xpq5-8h95 "GitHub Advisory GHSA-532v-xpq5-8h95 — Electron use-after-free in offscreen child window paint callback"
