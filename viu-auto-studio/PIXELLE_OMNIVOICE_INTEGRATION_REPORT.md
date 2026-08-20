# Báo cáo nghiên cứu và tích hợp Pixelle-Video + OmniVoice vào Viu Auto Studio

**Ngày:** 20/08/2026  
**Workspace:** `D:\all_my_project\viu-auto-studio\viu-auto-studio`  
**Trạng thái Git:** Không commit, không push.

## Kết luận

Tôi đã nghiên cứu hai repository từ nguồn chính thức và chỉ lấy các ý tưởng phù hợp với kiến trúc Electron + React/TypeScript/Vite + FastAPI/Python/SQLite hiện tại. Không copy nguyên project, không copy UI Streamlit, không copy model weights và không thay thế Factory Mode Google Flow đang hoạt động.

Phần được tích hợp thực tế là **OmniVoice adapter tùy chọn** cùng một voice-profile workflow có reference audio upload, reference transcript, voice design instruction, cached clone prompt, long-form chunking, normalization và provider capability detection. Đồng thời tôi sửa một lỗi vận hành thật trong TTS: khi lưu tốc độ/âm lượng hoặc cấu hình voice, UI không còn xóa nhầm cloud API key đã lưu.

Từ Pixelle-Video, tôi áp dụng các ý tưởng kiến trúc có giá trị nhưng không phá vỡ pipeline hiện tại: provider-agnostic capability selection, configuration theo từng provider, progress/checkpoint orientation, custom media/resource handling và optional local runtime. Các tính năng Pixelle phụ thuộc ComfyUI/RunningHub, Streamlit hoặc provider cloud cụ thể không được copy vì Viu đã có Google Flow Connector và cấu trúc desktop riêng.

## Nghiên cứu nguồn chính thức

| Nguồn | Ý tưởng xác minh được | Quyết định đối với Viu Auto Studio |
|---|---|---|
| [Pixelle-Video README][1] | Pipeline mô-đun từ script → image planning → frame processing → video composition; tách LLM, image/video, TTS, VLM, workflow và direct API; có template, BGM, custom media, progress, retry, batch và concurrency. | Giữ Factory Google Flow làm media backend chính; áp dụng tư duy adapter/provider, cấu hình rõ ràng, resumable stages và optional capability thay vì copy Streamlit/web architecture. |
| [Pixelle-Video config.example.yaml][2] | Cấu hình nhóm theo LLM, provider API, proxy, ComfyUI/RunningHub, TTS, image/video workflow và template. | Dùng làm đối chiếu cho cấu hình kênh/project hiện có; bổ sung thông tin voice profile vào cấu hình TTS và channel/project merge. |
| [OmniVoice README][3] | Ba chế độ auto voice, voice cloning và voice design; reference audio + transcript; expression tags; pronunciation control; batch inference. | Tích hợp adapter thật nhưng optional; khi runtime không có thì báo unavailable, không giả lập và không fallback âm thầm. |
| [OmniVoice generation parameters][4] | `num_step`, `speed`, `duration`, `normalize_text`, `postprocess_output`, `audio_chunk_duration`, `audio_chunk_threshold` và cache voice clone prompt. | Đưa các tham số này vào TTS config, preview, channel/project override và pipeline. |
| [OmniVoice model card][5] | Model hỗ trợ 600+ ngôn ngữ; reference audio 3–10 giây được khuyến nghị; model pretrained có ràng buộc CC-BY-NC. | Không bundle model vào installer; yêu cầu người dùng cài optional runtime riêng và kiểm tra giấy phép trước khi dùng thương mại. |

## Phần đã triển khai

### OmniVoice provider thật, không giả lập

File mới `backend/services/tts/omnivoice_provider.py` triển khai `TTSProvider` contract hiện có. Provider dynamically import `omnivoice`, `torch` và `soundfile`; nếu thiếu bất kỳ thành phần nào, `test_connection()` trả về `ok=false` với hướng dẫn rõ ràng. Vì vậy việc chọn OmniVoice không làm hỏng Edge TTS, Cloud TTS hoặc pipeline Factory trên máy chưa cài model.

Khi runtime có sẵn, adapter thật sự gọi `OmniVoice.from_pretrained()` và `model.generate()`. Adapter hỗ trợ auto voice, voice design qua `instruct`, voice cloning qua reference audio, cached `VoiceClonePrompt`, tốc độ, duration, số diffusion steps, normalize text, post-process và long-form chunking. Audio WAV được ghi trực tiếp ở 24kHz; MP3 được chuyển bằng FFmpeg thật với timeout 120 giây và cleanup file WAV tạm.

### Voice profile và reference audio workflow

TTS schema hiện nhận các trường `reference_audio`, `reference_text`, `voice_clone_prompt`, `voice_design`, `model_name`, `device`, `duration`, `num_step`, `normalize_text`, `postprocess_output`, `audio_chunk_duration` và `audio_chunk_threshold`. Các trường này được lưu trong app settings và được merge từ channel/project config vào `_tts_config_for_project`, nên cấu hình kênh có thể tác động thật đến pipeline sản xuất.

Settings → Giọng nói hiện có khu vực OmniVoice hiển thị có điều kiện khi provider là `omnivoice`. Người dùng có thể upload reference audio thật qua `/api/tts/reference-audio`, nhập transcript, voice design instruction, cache prompt path, model và các tham số long-form. Reference audio được lưu trong thư mục dữ liệu ứng dụng với filename sanitization và giới hạn upload chung.

Nếu người dùng không chỉ định cache prompt path, adapter tự tạo cache fingerprint trong `DATA_DIR/voices/omnivoice`. Fingerprint phụ thuộc nội dung reference audio và transcript, giúp tái sử dụng clone prompt giữa các phiên mà không phải tạo lại mỗi lần.

### Preview và pipeline dùng chung cấu hình

`/api/tts/config`, `/api/tts/preview`, `/api/tts/providers`, `/api/tts/voices` và `/api/tts/test-connection` đã được nối với provider mới. Nút **Nghe thử** trong Desktop truyền các trường OmniVoice thật xuống backend. Pipeline tự động cũng nhận các trường này từ cấu hình channel/project, không chỉ preview UI.

### Sửa lỗi bảo toàn credential

Trước đây khi UI lưu một thay đổi không liên quan, ví dụ speed hoặc volume, request không chứa cloud API key nhưng backend có thể ghi đè key hiện có bằng chuỗi rỗng. `TTSConfigRequest.cloud_api_key` hiện phân biệt trường bị bỏ qua với trường người dùng chủ động xóa; các lần lưu OmniVoice/voice profile không làm mất cloud key đã lưu.

## Kiểm thử đã chạy

| Kiểm thử | Kết quả |
|---|---|
| `python -m compileall -q backend` | **PASS** |
| `backend/test_flow_factory_smoke.py` | **PASS** |
| `backend/test_approval_folder_smoke.py` | **PASS** |
| `backend/test_channel_config_smoke.py` | **PASS** |
| `backend/test_omnivoice_adapter_smoke.py` | **PASS** — môi trường hiện tại báo `available=False` một cách trung thực |
| `scripts/audit_runtime.py` | **PASS** — SQLite integrity, WAL, foreign keys, 23 tables |
| `scripts/audit_database_restore.py` | **PASS** — backup/restore integrity `ok` |
| `scripts/audit_upload_security.py` | **PASS** |
| `scripts/audit_ffmpeg_wrapper.py` | **PASS** |
| `pnpm exec tsc --noEmit` | **PASS** |
| `pnpm build` | **PASS** |

Smoke test Factory vẫn giữ cảnh báo SQLAlchemy legacy `Query.get()` ở test cũ; cảnh báo không làm test fail và không liên quan đến adapter OmniVoice.

## Các file chính đã thêm hoặc sửa

Các phần mới nổi bật gồm `backend/services/tts/omnivoice_provider.py`, `backend/test_omnivoice_adapter_smoke.py`, `docs/OMNIVOICE_SETUP.md` và `RESEARCH_PIXELLE_OMNIVOICE.md`. Các file đã mở rộng gồm `backend/services/tts/__init__.py`, `backend/schemas/__init__.py`, `backend/api/routes.py`, `backend/pipeline/queue.py`, `backend/requirements.txt`, `desktop/src/types/index.ts`, `desktop/src/services/api.ts` và `desktop/src/pages/settings-page.tsx`.

Working tree cũng còn các thay đổi từ các phiên trước như Factory Google Flow, security audit, custom project folder, Electron lifecycle, smoke tests và audit scripts. Tôi không commit hoặc push bất kỳ thay đổi nào.

## Giới hạn và rủi ro còn lại

OmniVoice chưa được cài trong environment hiện tại, vì vậy tôi đã kiểm thử contract/unavailable behavior chứ chưa chạy inference model end-to-end. Việc chạy thật cần PyTorch tương thích CPU/CUDA, `omnivoice`, `soundfile`, model weights và đủ VRAM/RAM. Model card của OmniVoice có ràng buộc CC-BY-NC; không nên đưa model vào bộ cài thương mại trước khi rà soát giấy phép.

Pixelle-Video có các provider cloud và ComfyUI/RunningHub riêng. Tôi không tích hợp chúng trực tiếp vì sẽ tạo thêm dependency, credential surface và đường chạy trùng với Google Flow Factory. Các ý tưởng provider registry và batch/concurrency có thể mở rộng tiếp trong một phase riêng nếu cần chạy nhiều project song song.

## Tài liệu cài đặt

Hướng dẫn cài đặt và vận hành nằm tại [docs/OMNIVOICE_SETUP.md](docs/OMNIVOICE_SETUP.md). Ghi chú nghiên cứu thô có kiểm chứng nằm tại [RESEARCH_PIXELLE_OMNIVOICE.md](RESEARCH_PIXELLE_OMNIVOICE.md).

## References

[1]: https://github.com/ATH-MaaS/Pixelle-Video/blob/main/README_EN.md "Pixelle-Video README_EN.md"
[2]: https://github.com/ATH-MaaS/Pixelle-Video/blob/main/config.example.yaml "Pixelle-Video configuration example"
[3]: https://github.com/k2-fsa/OmniVoice "OmniVoice GitHub repository"
[4]: https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md "OmniVoice generation parameters"
[5]: https://huggingface.co/k2-fsa/OmniVoice "OmniVoice Hugging Face model card"
