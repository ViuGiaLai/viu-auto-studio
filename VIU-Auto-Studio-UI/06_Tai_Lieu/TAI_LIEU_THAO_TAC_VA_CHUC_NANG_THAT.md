# TÀI LIỆU THAO TÁC VÀ TRIỂN KHAI CHỨC NĂNG THẬT

## 1. Mục tiêu bắt buộc

Mỗi thành phần nhìn thấy trong ảnh phải có hành vi thật. Nút chỉ được báo thành công khi tác vụ đã hoàn thành và kết quả đã được kiểm tra. Không dùng dữ liệu giả, `FAKE_AUDIO_DATA`, tiến độ giả, timeout giả hoặc file không tồn tại.

Các lớp phải nối đầy đủ:

`React/Zustand → Electron preload IPC → FastAPI → SQLAlchemy/SQLite → AI/TTS/Flow/FFmpeg → file thật → FFprobe → SQLite → sự kiện realtime → React`.

## 2. Quy tắc đồng bộ toàn hệ thống

### 2.1 Định danh dùng chung

- `project_id`: một dự án từ khi tạo đến khi xuất bản.
- `scene_id`: một cảnh ngữ nghĩa; không đồng nhất với một dòng phụ đề.
- `asset_id`: một file ảnh, video, âm thanh, phụ đề hoặc output.
- `job_id`: một công việc nền.
- `job_step_id`: một bước có thể retry độc lập.
- `flow_task_id`: tác vụ gửi cho Chrome Extension.
- `timeline_id` và `clip_id`: bản dựng và clip trong Edit.
- `render_id`: lần render; một project có thể có nhiều phiên bản.

Mọi trang đọc và sửa cùng bản ghi theo các định danh này. Không sao chép trạng thái riêng ở frontend.

### 2.2 Trạng thái chuẩn

`pending`, `running`, `waiting_for_review`, `completed`, `failed`, `skipped`, `cancelled`, `paused`.

Chỉ backend được quyết định trạng thái cuối. Frontend chỉ hiển thị dữ liệu nhận từ API hoặc sự kiện realtime.

### 2.3 Hành vi chung của nút

1. Người dùng bấm nút.
2. Frontend khóa nút chống bấm lặp và hiển thị trạng thái đang gửi.
3. API kiểm tra quyền, project, trạng thái và dependency.
4. Backend tạo hoặc cập nhật bản ghi trong một transaction.
5. Nếu là công việc dài, API trả `202 Accepted` cùng `job_id`.
6. Worker nhận job, cập nhật `job_steps` và phát sự kiện SSE/WebSocket.
7. Frontend cập nhật từ sự kiện; khi reconnect phải gọi API lấy snapshot mới.
8. Chỉ khi output tồn tại, đọc được và đạt kiểm tra thì chuyển `completed`.
9. Lỗi phải lưu `error_code`, thông báo người dùng, log kỹ thuật và `retry_from_step`.

### 2.4 API URL và đường dẫn

- Electron chọn port trống, khởi động backend đóng gói, chờ `/api/health` và truyền `{RUNTIME_API_URL}` qua preload.
- React không chứa `localhost:8000` hoặc port cố định.
- Extension nhận URL runtime cùng pairing token, không tự đoán port.
- Dữ liệu dùng `{APP_USER_DATA}`, `{APP_LOGS}`, `{APP_TEMP}`, `{USER_PROJECTS}` và `{PROJECT_ROOT}` do Electron/backend phân giải theo hệ điều hành.
- SQLite, logs, cache và project nằm trong thư mục người dùng hiện tại.

## 3. Cấu trúc dữ liệu tối thiểu

| Bảng | Dữ liệu chính |
|---|---|
| `projects` | tên, loại, tỷ lệ, thư mục, trạng thái, bước hiện tại |
| `project_settings` | AI, TTS, Flow, review, retry, render policy |
| `channel_profiles` | ngách, mô tả, định hướng, phong cách, hook, độ dài |
| `ideas` | tiêu đề, hook, góc nhìn, outline, thumbnail prompt, trạng thái duyệt |
| `scripts` | nội dung chuẩn hóa, phiên bản, số từ, thời lượng ước tính |
| `voice_assets` | provider, voice, file, duration, checksum, verify state |
| `subtitle_cues` | start, end, text, style; độc lập với scene |
| `scenes` | thứ tự, start/end, narration, visual prompt, media type, status |
| `characters` | hồ sơ nhận diện và bộ ảnh tham chiếu dùng lại |
| `scene_characters` | quan hệ nhiều-nhiều giữa scene và character |
| `media_assets` | scene, file, loại, provider, codec, kích thước, checksum |
| `flow_connections` | extension, profile, token hash, heartbeat, selector version |
| `flow_tasks` | scene, prompt, mode, model, tile, attempt, phase, output |
| `jobs` | loại job, project, status, progress, checkpoint |
| `job_steps` | bước, dependency, attempt, log, lỗi, thời điểm |
| `timelines` | phiên bản bản dựng, duration, settings |
| `timeline_clips` | track, asset, start/end, transform, effects, keyframes |
| `renders` | timeline version, output, progress, ffprobe result |
| `publish_metadata` | title, description, tags, thumbnail, target, publish state |
| `app_settings` | cấu hình toàn cục theo người dùng |
| `audit_logs` | người dùng, hành động, đối tượng, trước/sau, thời gian |

## 4. API và kênh sự kiện tối thiểu

- Project: `/api/v1/projects`, `/projects/{id}`, `/projects/{id}/settings`.
- Ideas: `/projects/{id}/ideas/generate`, `/ideas/{id}/approve`.
- Script: `/projects/{id}/script`, `/script/normalize`, `/script/approve`.
- TTS: `/projects/{id}/voice/generate`, `/voice/{asset_id}/preview`.
- Scenes: `/projects/{id}/scenes/analyze`, `/scenes/{id}`, `/split`, `/merge`, `/approve`.
- Characters: `/characters`, `/projects/{id}/characters`, `/consistency/check`.
- Media: `/projects/{id}/media/generate`, `/scenes/{id}/media/regenerate`, `/media/{id}/verify`.
- Queue: `/jobs`, `/jobs/{id}/pause`, `/resume`, `/cancel`, `/retry`.
- Flow: `/connectors/flow/pair`, `/heartbeat`, `/tasks/claim`, `/progress`, `/complete`, `/fail`.
- Timeline: `/projects/{id}/timelines`, `/clips`, `/operations`.
- Render: `/projects/{id}/renders`, `/renders/{id}/pause`, `/resume`, `/cancel`.
- Library: `/assets`, `/assets/{id}`, `/assets/{id}/reveal`.
- Publish: `/projects/{id}/publish/validate`, `/publish`, `/schedule`.
- Settings: `/settings`, `/settings/test`, `/diagnostics`.
- Realtime: `/api/v1/events` hoặc WebSocket; sự kiện phải mang `project_id`, `job_id`, `scene_id`, `status`, `progress`, `updated_at`.

# 5. Đặc tả từng giao diện và từng thao tác

## 5.1 Tổng quan

Ảnh: `01_Toan_Cuc/01_Tong_Quan.png`

| Thao tác | Chức năng thật |
|---|---|
| Tạo dự án | Mở wizard bước 1; chưa ghi project chính thức cho đến khi hoàn tất hoặc chọn Lưu nháp. |
| Mở project gần đây | Điều hướng `/projects/:id/studio/:currentStage`; backend trả trạng thái mới nhất. |
| Xem tất cả dự án | Mở menu Dự án, giữ filter gần nhất trong Zustand. |
| Thẻ Đang chạy/Đang chờ/Lỗi | Mở Hàng đợi với query trạng thái tương ứng. |
| Tác vụ lỗi | Mở inspector đúng `job_id`; retry không chạy lại bước hoàn thành. |
| Trạng thái hệ thống | Gọi health backend, SQLite, FFmpeg, Flow heartbeat; không dùng trạng thái hard-code. |
| Thông báo | Đọc danh sách notification; đánh dấu đã đọc bằng API. |

## 5.2 Dự án — bước 1 Thông tin

Ảnh: `02_Tao_Du_An/01_Danh_Sach_Du_An_Va_Buoc_1_Thong_Tin.png`

| Điều khiển | Xử lý |
|---|---|
| Tên dự án | Validate trim, 1–120 ký tự, không trùng thư mục vật lý; lưu draft. |
| Loại project | Ghi `project_type`; thay đổi preset nhưng không xóa dữ liệu người dùng đã nhập. |
| Loại video | Ghi `video_type`; quyết định trường cấu hình hiển thị ở bước sau. |
| 16:9/9:16 | Ghi width/height; thay đổi sau khi có media phải cảnh báo và yêu cầu regenerate/reframe. |
| Thư mục lưu | Electron `selectDirectory`; backend kiểm tra quyền ghi và dung lượng. |
| Hủy | Nếu draft chưa lưu thì đóng; nếu đã có draft thì hỏi xóa hay giữ. |
| Lưu nháp | `POST /projects` với `status=draft`, transaction tạo project và settings mặc định. |
| Tiếp tục | Validate trường bắt buộc, lưu draft rồi mở bước 2. |

## 5.3 Dự án — bước 2 Kênh

Ảnh: `02_Tao_Du_An/02_Buoc_2_Cau_Hinh_Kenh.png`

- Nguồn hình quyết định `media_source_policy`; chọn Kết hợp cho phép từng scene dùng nguồn khác nhau.
- Kiểu video, ngách, chuỗi tập, mô tả, định hướng, phong cách và hook được lưu vào `channel_profiles`.
- Độ dài Video dài/Shorts là mục tiêu để AI ước lượng số từ và số scene, không cắt nội dung máy móc.
- `Lưu làm mẫu kênh` tạo template tái sử dụng; không tự đổi các project cũ.
- `Quay lại` giữ toàn bộ draft; `Tiếp tục` lưu profile rồi mở bước 3.

## 5.4 Dự án — bước 3 Giọng & Hình

Ảnh: `02_Tao_Du_An/03_Buoc_3_Giong_Va_Hinh.png`

| Nhóm | Hành vi |
|---|---|
| AI provider/model | Lấy danh sách model từ cấu hình khả dụng; Test tạo request nhỏ và lưu latency/error. |
| TTS/giọng | Chọn `voice_profile_id`; Nghe thử tạo hoặc phát cache hợp lệ. |
| Speed/pitch | Cập nhật preview, không ghi đè file giọng cũ cho đến khi người dùng xác nhận. |
| Đồng bộ nhân vật | Bật tham chiếu và mức khóa; Flow task phải mang character asset IDs. |
| Nguồn Flow | Kiểm tra extension heartbeat và quyền; nếu chưa ghép thì dẫn sang màn ghép. |
| Chế độ ảnh/video | Ghi policy cho scene analyzer; từng scene vẫn được phép chỉnh riêng. |
| Model/tỷ lệ | Lấy capability thật; không cho chọn tổ hợp model/tỷ lệ không hỗ trợ. |
| Tiếp tục | Chỉ mở bước 4 khi các provider bắt buộc đã test thành công. |

## 5.5 Dự án — bước 4 Tự động hóa

Ảnh: `02_Tao_Du_An/04_Buoc_4_Tu_Dong_Hoa.png`

- Chế độ tự động tạo dependency graph cho toàn pipeline.
- Mỗi toggle duyệt tạo checkpoint `waiting_for_review`; khi tắt, worker tự tiếp tục sau khi bước đạt kiểm tra.
- Retry lưu `max_attempts`, backoff và nhóm lỗi retryable; lỗi xác thực hoặc thiếu cấu hình là fatal.
- `Không chạy lại bước đã hoàn thành` dùng idempotency key theo `project_id + step + input_version`.
- Khôi phục hàng đợi đọc job `running/paused` khi app mở lại, kiểm tra process cũ rồi resume từ checkpoint.
- Chỉ một render chính được bảo vệ bằng mutex/DB lease.
- `Tạo dự án & mở Studio` commit toàn bộ wizard, tạo thư mục project, manifest và mở Ý tưởng.

## 5.6 Studio — Ý tưởng

Ảnh: `03_Studio_Quy_Trinh/01_Y_Tuong.png`

| Nút/ô | Chức năng |
|---|---|
| Sửa cấu hình kênh | Mở modal trên cùng project; thay đổi phải đánh dấu idea/script cũ là cần xem lại. |
| Tạo ý tưởng mới | Tạo job AI; trả ba ý tưởng có schema cố định, validate JSON trước khi lưu. |
| Chọn A/B/C | Cập nhật `selected_idea_id`; không xóa lựa chọn còn lại. |
| Chỉnh sửa | Tạo version mới, lưu lịch sử thay vì ghi đè âm thầm. |
| Tạo lại 3 ý tưởng | Tạo request mới; kết quả cũ vẫn có thể khôi phục trong lịch sử. |
| Duyệt ý tưởng | Chuyển idea `approved`, cập nhật project stage và tạo task kịch bản nếu tự động. |
| Tiếp tục | Chỉ bật sau khi có idea approved; mở Kịch bản & Giọng. |

## 5.7 Studio — Kịch bản & Giọng

Ảnh: `03_Studio_Quy_Trinh/02_Kich_Ban_Va_Giong.png`

- `Dán nội dung` nhập text; `Nhập tệp` đọc TXT/DOCX/SRT được hỗ trợ và báo lỗi encoding.
- `AI chuẩn hóa` tạo version mới, giữ nghĩa, bỏ ký tự lỗi và không tự thêm dữ kiện chưa kiểm chứng.
- Các block Mở đầu/Vấn đề/Giải pháp/Kết là đoạn ngữ nghĩa, không phải mỗi dòng phụ đề.
- `Tạo giọng` gửi script version tới provider; tải audio thật, đo duration và FFprobe trước khi `completed`.
- `Nghe thử` phát file qua URL bảo vệ hoặc protocol app; không đọc đường dẫn trực tiếp trong renderer.
- `Tạo lại giọng` tạo asset version mới; timeline chỉ đổi sau khi xác nhận.
- Đồng bộ timestamp tạo cue theo word/phrase timing, sau đó tách subtitle độc lập scene.
- `Duyệt kịch bản` khóa version đầu vào cho scene analyzer.
- `Thử lại bước lỗi` retry đúng normalize/TTS/alignment dựa trên lỗi.

## 5.8 Studio — Phân cảnh Visual

Ảnh: `03_Studio_Quy_Trinh/03_Phan_Canh_Visual.png`

### Quy tắc chia cảnh

AI chia theo thay đổi ý nghĩa, địa điểm, nhân vật, hành động hoặc nhịp kể. Một scene có thể chứa nhiều câu lời đọc và nhiều subtitle cue. Không ánh xạ cứng một dòng phụ đề thành một ảnh.

### Thao tác scene

| Thao tác | Xử lý thật |
|---|---|
| AI phân cảnh lại | Tạo scene set version mới; yêu cầu xác nhận nếu scene đã có media. |
| Sửa lời dẫn/prompt | PATCH scene, tăng input version và đánh dấu media stale nếu prompt thay đổi. |
| Preview | Phát media hiện tại cùng đoạn voice/subtitle theo time range scene. |
| Tạo lại media | Tạo Flow task mới cho scene, giữ asset cũ đến khi output mới verified. |
| Tải media lên | Electron chọn file; backend copy vào project, FFprobe và tạo asset. |
| Tạo lại giọng | Tạo đoạn voice cho scene hoặc regenerate toàn voice theo policy. |
| Tách cảnh | Chọn điểm tách theo thời gian/câu; transaction tạo hai scene và cập nhật thứ tự. |
| Gộp cảnh | Gộp narration, time range, characters; media cũ chuyển archived. |
| Xóa | Kiểm tra dependency, xác nhận, cập nhật thứ tự và timeline. |
| Tạo toàn bộ media | Chỉ tạo task cho scene thiếu/stale; không tạo lại scene completed hợp lệ. |
| Duyệt phân cảnh | Khóa scene version dùng cho nhân vật/media. |

## 5.9 Studio — Nhân vật trong dự án

Ảnh: `03_Studio_Quy_Trinh/04_Nhan_Vat_Trong_Du_An.png`

- Chọn nhân vật tải cùng record từ thư viện toàn cục.
- Tải/Thay/Xóa ảnh tham chiếu tạo hoặc archived asset, không phá scene đang dùng.
- Thuộc tính diện mạo, trang phục, phụ kiện và negative prompt tạo version hồ sơ.
- Face/Outfit lock được chuyển thành Flow reference parameters hoặc prompt constraints.
- `Gắn ảnh tham chiếu vào mọi task Flow` chỉ áp dụng scene có character được phân bổ.
- `So sánh` chạy model/heuristic consistency và lưu score; score thấp không tự coi là hoàn thành.
- `Tạo lại cảnh 12` tạo task cho đúng scene, không chạy lại toàn project.
- `Áp dụng cho 12 cảnh` cập nhật quan hệ scene-character và đánh dấu media liên quan stale.
- `Duyệt nhân vật` khóa character assignment version rồi mở Media.

## 5.10 Studio — Media

Ảnh: `03_Studio_Quy_Trinh/05_Media.png`

- Card đọc trực tiếp `media_assets` theo `scene_id`.
- `Tạo media còn thiếu` tạo task chỉ cho scene chưa có asset verified.
- Tạm dừng/Thử lại truyền đến job thật và đồng bộ Hàng đợi.
- Chọn nhiều scene cho phép đổi model/regenerate/download; thao tác phải trả kết quả từng item.
- Preview phát asset thật; Download xuất bản sao; Replace kiểm tra file trước khi đổi active asset.
- Inspector hiển thị file tương đối, codec, kích thước, checksum, Flow task ID và FFprobe result.
- `Xác nhận Media` chỉ thành công khi mọi scene bắt buộc có asset active và verified.

## 5.11 Studio — Dựng phim cơ bản

Ảnh: `03_Studio_Quy_Trinh/06_Dung_Phim_Co_Ban.png`

- Preview dùng timeline state, không ghép video giả.
- Track Visual/Voice/Subtitle/Music/Logo đọc từ `timeline_clips`.
- Split/trim/move cập nhật clip với optimistic UI; lỗi lưu phải rollback.
- Subtitle độc lập visual clip; chỉnh cue cập nhật SRT/ASS.
- Inspector Scene chỉnh crop, duration, animation, speed, volume và tạo keyframe nếu cần.
- Render settings validate codec/encoder thật từ FFmpeg build.
- `Render bản nháp` tạo output nhẹ và không mở Xuất bản.
- `Bắt đầu render` tạo `render_main`; khóa bằng lease một-render.

## 5.12 Studio — Edit nâng cao

Ảnh: `03_Studio_Quy_Trinh/07_Edit_Nang_Cao.png`

### Panel tài nguyên

- Upload/Import tạo asset qua Electron và backend; không dùng blob chỉ sống trong trình duyệt.
- Kéo media vào timeline tạo `timeline_clip` với asset ID và time range.
- Media, Audio, Text, Subtitle, Effect, Transition, Filter, Sticker và Logo có loại clip riêng.

### Preview và inspector

- Transform X/Y, scale, rotation, opacity và flip hỗ trợ keyframe.
- Crop/Fit/Fill lưu thông số không phá file gốc.
- Blend/Mask/Feather/Chroma Key được dịch thành filter graph FFmpeg.
- Stabilize hoặc remove background là job nền; output tạo asset mới.
- Copy/Paste attributes kiểm tra loại clip tương thích.

### Timeline

- Razor cắt clip tại playhead nhưng vẫn tham chiếu cùng source asset.
- Trim thay in/out; ripple delete dịch các clip phía sau trong cùng scope.
- Group/ungroup lưu group ID; link/unlink audio bảo vệ đồng bộ A/V.
- Snap chỉ là hỗ trợ UI; thời gian cuối lưu theo timebase chính xác.
- Marker lưu vào timeline, không render trừ khi dùng làm chapter.
- Track lock chặn edit; hide/mute/solo ảnh hưởng preview và export theo quy tắc rõ ràng.
- Undo/redo lưu command stack theo phiên; autosave tạo timeline version checkpoint.
- `Tạo lại bằng Flow` gửi đúng scene ID, sau verify mới thay asset trong clip.

## 5.13 Render tiến độ và khôi phục

Ảnh: `03_Studio_Quy_Trinh/08_Render_Tien_Do_Va_Khoi_Phuc.png`

| Điều khiển | Hành vi |
|---|---|
| Tạm dừng | Gửi yêu cầu pause an toàn sau frame/segment; lưu checkpoint. |
| Tiếp tục | Worker kiểm tra checkpoint, input hashes và tiếp tục bước chưa xong. |
| Hủy render | Xác nhận; terminate process mềm rồi mạnh nếu cần; giữ log và file tạm phục vụ chẩn đoán. |
| Mở Hàng đợi | Mở đúng `render_main` trong trang Hàng đợi. |
| Retry segment lỗi | Xóa output segment lỗi, tăng attempt và chạy lại riêng segment. |
| Progress | Tính từ segment/frame/FFmpeg progress pipe, không dùng timer UI. |
| FFprobe final | Kiểm codec, duration, resolution, audio stream và file size; chỉ sau đó mở Xuất bản. |

Nếu app đóng, startup recovery đánh dấu process cũ mất, xác thực checkpoint và đưa job về `paused/recoverable`; không tự báo completed.

## 5.14 Xuất bản

Ảnh: `03_Studio_Quy_Trinh/09_Xuat_Ban.png`

- Banner thành công chỉ hiện khi render output tồn tại và FFprobe passed.
- Play/Open folder/Copy path thao tác trên file output thật qua IPC an toàn.
- Title/description/hashtag/keyword lưu `publish_metadata`, có giới hạn theo platform.
- Thumbnail regenerate tạo task riêng; upload kiểm tra tỷ lệ, kích thước, MIME.
- Tệp đầu ra lấy từ asset records, không tạo tên giả.
- Kiểm tra xuất bản phải xác minh video, audio, subtitle, thumbnail và metadata.
- `Xuất bản lên YouTube` chỉ bật khi OAuth/channel hợp lệ; upload thật và theo dõi resumable upload.
- Schedule lưu timezone; backend không gửi trước thời gian.
- `Lưu gói xuất bản` tạo thư mục/ZIP gồm video, subtitle, thumbnail và metadata.
- Sau upload thành công mới ghi published URL và cho Phân tích lấy số liệu.

## 5.15 Hàng đợi xử lý

Ảnh: `04_Van_Hanh/01_Hang_Doi_Xu_Ly.png`

- Summary được COUNT từ SQLite theo status.
- Filter/search chạy server-side với phân trang.
- Tạm dừng tất cả không dừng tác vụ không hỗ trợ pause giữa bước; chúng dừng ở safe point.
- Retry lỗi tạo attempt mới của cùng job step, giữ lịch sử cũ.
- Cancel selected yêu cầu xác nhận và không xóa output completed.
- Inspector hiển thị dependency và nguyên nhân; `Mở Scene` điều hướng đúng Studio/Media/scene.
- Recovery banner chỉ hiện khi startup thực sự khôi phục job.
- Lease đảm bảo chỉ một render chính; heartbeat worker giải phóng lease chết.

## 5.16 Thư viện media

Ảnh: `04_Van_Hanh/02_Thu_Vien_Media.png`

- Tabs/filter lấy metadata asset thật.
- Preview theo MIME; file hỏng hiển thị lỗi và nút xác minh lại.
- Mở Studio dùng quan hệ project/scene để điều hướng.
- Reveal folder qua Electron, không cho renderer truy cập filesystem tùy ý.
- Delete kiểm tra reference count; nếu đang dùng phải chặn hoặc yêu cầu thay thế trước.
- Cleanup cache chỉ xóa derivative/temp không còn tham chiếu.

## 5.17 Thư viện giọng đọc

Ảnh: `04_Van_Hanh/03_Thu_Vien_Giong_Doc.png`

- Danh sách provider và voice lấy từ cấu hình/cache API.
- Play preview dùng sample có thật hoặc tạo sample job.
- Dùng làm mặc định cập nhật settings; project cũ giữ voice đã khóa.
- Từ điển phát âm có version và được gửi vào provider hỗ trợ.
- Tạo tệp thử lưu asset test có nhãn, không trộn vào project output.
- `Xem trong Studio` mở project/bước Kịch bản & Giọng đang sử dụng profile.

## 5.18 Thư viện nhân vật

Ảnh: `04_Van_Hanh/04_Thu_Vien_Nhan_Vat.png`

- Tạo/nhập/nhân bản hồ sơ tạo ID mới và reference set version.
- Dùng cho dự án tạo association, không copy hồ sơ không đồng bộ.
- Sửa global profile yêu cầu chọn cập nhật project đang dùng hay giữ version cũ.
- Consistency history đọc score thật từ media generations.
- Delete bị chặn nếu reference count lớn hơn 0.

## 5.19 Flow Connector trung tâm

Ảnh: `04_Van_Hanh/05_Flow_Connector_Trung_Tam.png`

- Header dựa trên heartbeat Extension.
- Cấu hình mode/model/ratio gửi vào task; extension thực thi trên Flow.
- Bảng task dùng cùng `flow_tasks` với Hàng đợi và Media.
- Timeline phase cập nhật bởi extension; mỗi phase có timestamp và selector evidence.
- `Thử lại từ Theo dõi tile` bắt đầu đúng phase thất bại, không click Generate lần nữa nếu tile đã được tạo.
- `Mở task trong Flow` mở tab/project liên quan; không tự coi là hoàn thành.
- `Mở Scene 12` quay về đúng scene.

## 5.20 Ghép Flow lần đầu

Ảnh: `04_Van_Hanh/06_Flow_Connector_Ghep_Lan_Dau.png`

1. App phát hiện extension bằng handshake có version.
2. Người dùng đăng nhập Google Flow trực tiếp trên trình duyệt; app không lưu mật khẩu.
3. Backend tạo mã một lần, lưu hash + expiry.
4. Extension gửi mã, extension ID và nonce đến API runtime.
5. Backend cấp token theo user/device; lưu mã hóa bằng hệ thống credential của OS.
6. Test end-to-end chạy một task kiểm tra an toàn, tải output, upload và verify.
7. Chỉ khi toàn chuỗi passed mới bật Hoàn tất.

## 5.21 Phân tích

Ảnh: `04_Van_Hanh/07_Phan_Tich.png`

- KPI tổng hợp từ jobs/renders/publish records, không random frontend.
- Click biểu đồ mở Hàng đợi với filter thời gian/status.
- Provider reliability tính từ attempt logs.
- Lỗi thường gặp liên kết Flow hoặc job inspector.
- Hiệu suất xuất bản chỉ hiển thị khi platform đã kết nối và video thật sự published; draft ghi Chưa xuất bản.
- Export report tạo CSV/PDF từ query hiện tại.

## 5.22 Cài đặt — Chung

Ảnh: `05_Cai_Dat/01_Chung.png`

- Ngôn ngữ/theme/UI scale cập nhật app và được lưu theo user.
- Default project chỉ áp dụng project mới.
- Notification được phát từ sự kiện backend và Electron notification.
- Restore queue sau restart nối startup recovery thật.
- Telemetry mặc định tắt; crash report hỏi trước khi gửi.
- Export/import config loại bỏ secret hoặc mã hóa secret theo lựa chọn.
- Reset defaults hiển thị diff và xác nhận.

## 5.23 Cài đặt — Engine & Công cụ

Ảnh: `05_Cai_Dat/02_Engine_Va_Cong_Cu.png`

- Hiển thị port runtime do Electron chọn; không phải cấu hình cứng.
- Kiểm tra quyền các thư mục theo user hiện tại.
- FFmpeg/FFprobe/backend/Python dùng binary đóng gói; test bằng lệnh version và tác vụ nhỏ.
- Startup tuần tự: chọn port → spawn backend → health → truyền config → mở React → sync Extension.
- Chẩn đoán xuất gói log đã loại secret.

## 5.24 Cài đặt — AI & Ảnh

Ảnh: `05_Cai_Dat/03_AI_Va_Anh.png`

- Secret phải lưu trong OS credential store hoặc encrypted store, không plaintext SQLite/log.
- Test provider chỉ kiểm tra auth/capability và không tiêu tốn generation lớn.
- Gemini trong cấu hình này dùng phân tích/tạo prompt; media do nguồn đã chọn như Flow tạo.
- Scene splitting giữ đoạn nghĩa; target duration là gợi ý.
- Fallback chỉ chạy với lỗi cho phép và phải ghi provider thực tế vào output.
- Quota lấy từ provider nếu API hỗ trợ; nếu không ghi Không xác định.

## 5.25 Cài đặt — Giọng nói

Ảnh: `05_Cai_Dat/04_Giong_Noi.png`

- Provider priority/fallback được worker dùng tuần tự.
- API keys xử lý như secret.
- Preview tạo audio thật và verify.
- Word timestamp chỉ bật khi provider/aligner hỗ trợ.
- Loudness/peak/fade được đưa vào filter FFmpeg.
- Clear cache không xóa asset đang được project tham chiếu.

## 5.26 Cài đặt — Flow Connector

Ảnh: `05_Cai_Dat/05_Flow_Connector.png`

- `{RUNTIME_API_URL}` và token được Electron/backend cấp động.
- `{APP_TEMP}`, `{PROJECT_ROOT}`, `{APP_LOGS}` được phân giải theo user và OS.
- Re-pair thu hồi token cũ trước khi cấp token mới.
- Selector health chạy định kỳ nhưng không click tạo media.
- End-to-end test tạo task test riêng, không gắn vào scene sản xuất.
- Thay selector làm pause task đang ở phase liên quan; completed task không bị mất.
- Screenshot lỗi phải che thông tin nhạy cảm trước khi export.

## 5.27 Cài đặt — Hiệu năng

Ảnh: `05_Cai_Dat/06_Hieu_Nang.png`

- Detect hardware từ Electron/backend, không dùng mẫu cố định.
- Hồ sơ An toàn 16 GB đặt một render, media concurrency 2 và threshold RAM.
- Worker phải lấy semaphore trước khi chạy và trả khi hoàn thành/hủy.
- Hardware encoder chỉ dùng nếu test encode passed; nếu lỗi fallback software và ghi log.
- Benchmark là job có thể dừng, lưu kết quả theo máy.
- Pause on battery/prevent sleep dùng API hệ điều hành qua Electron.

# 6. Đồng bộ nút điều hướng

| Nút nguồn | Đích bắt buộc |
|---|---|
| Dashboard → Tạo dự án | Dự án → Wizard bước 1 |
| Wizard hoàn tất | Studio → Ý tưởng |
| Duyệt ý tưởng | Kịch bản & Giọng |
| Duyệt kịch bản | Phân cảnh Visual |
| Duyệt phân cảnh | Nhân vật |
| Duyệt nhân vật | Media |
| Xác nhận Media | Dựng phim |
| Render verified | Xuất bản |
| Media → Đồng bộ Hàng đợi | Hàng đợi filter project/job |
| Hàng đợi → Mở Scene | Studio → đúng stage và scene |
| Flow → Mở Scene | Studio → Media → scene |
| Thư viện → Mở Studio | đúng project/stage/asset |
| Giọng đọc → Xem trong Studio | Kịch bản & Giọng |
| Nhân vật → Mở trong Studio | Nhân vật trong dự án |
| Phân tích → lỗi Flow | Flow với filter lỗi |

# 7. Điều kiện báo hoàn thành

## AI/Text

- Response hợp lệ theo schema.
- Đã lưu version vào SQLite.
- Không báo completed nếu parse hoặc transaction lỗi.

## TTS

- HTTP/provider hoàn tất.
- File có kích thước hợp lệ, decode được, có audio stream và duration lớn hơn 0.
- Checksum và metadata đã lưu.

## Flow media

- Extension nhận task và báo đầy đủ phase.
- File đã tải, upload backend, lưu vào project.
- Ảnh decode được; video có stream/codec/duration/resolution hợp lệ.
- `scene_id` và `asset_id` đã gắn transactionally.

## Render

- FFmpeg exit code 0.
- File tồn tại, size lớn hơn 0.
- FFprobe khớp resolution, duration, codec và audio policy.
- Render record cùng output asset đã commit.

## Publish

- Upload platform trả asset/video ID thật.
- Trạng thái remote được xác minh.
- Chỉ lúc đó lưu published URL và phát sự kiện thành công.

# 8. Checklist kiểm thử bắt buộc

1. Cài app trên tài khoản Windows mới không có Python/Node/FFmpeg.
2. Backend tự chọn port khác nhau qua nhiều lần mở.
3. Dữ liệu hai user Windows không dùng chung.
4. Tạo project đủ bốn bước và đóng/mở lại không mất draft.
5. Duyệt bật/tắt dừng đúng checkpoint.
6. Một scene chứa nhiều câu và nhiều subtitle cue.
7. Flow tự thao tác từ task đến file mà người dùng không bấm thủ công.
8. Tắt app giữa Flow/render rồi mở lại và resume.
9. Retry scene lỗi không chạy lại scene completed.
10. Hàng đợi, Media và Flow hiển thị cùng status/progress.
11. Edit timeline lưu và undo/redo chính xác.
12. Subtitle độc lập scene và xuất đúng SRT/ASS.
13. Chặn hai render chính đồng thời trên cấu hình 16 GB.
14. Không mở Xuất bản nếu FFprobe thất bại.
15. Thư viện không xóa asset đang được timeline dùng.
16. Không log API key, pairing token hoặc Google session.
17. Không còn `localhost:5173`, `localhost:8000`, `/home/ubuntu`, `/workspace` hoặc ổ đĩa cố định trong production bundle.
18. Installer và auto-update hoạt động trên máy sạch.

# 9. Tiêu chí nghiệm thu giao diện

- Cùng 10 menu, đúng thứ tự và chỉ một mục active.
- Trong project luôn cùng 7 stage.
- Mọi nút có loading, disabled, success và error state.
- Destructive action có xác nhận.
- Progress dài hạn lấy từ backend.
- Lỗi có nguyên nhân, log và retry đúng bước.
- Không có nút chỉ để trang trí.
- Không báo thành công trước khi xác minh output thật.

