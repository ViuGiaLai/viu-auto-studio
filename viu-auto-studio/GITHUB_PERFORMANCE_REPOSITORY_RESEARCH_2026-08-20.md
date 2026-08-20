# Nghiên cứu repository mã nguồn mở tối ưu hiệu năng cho Viu Auto Studio

**Ngày:** 20/08/2026  
**Phạm vi:** CPU/GPU inference, TTS, voice cloning, ONNX/quantization, VRAM/RAM, queue, cache, FFmpeg, video generation và giám sát tài nguyên.  
**Kết luận ngắn:** Bộ nền tảng tốt nhất cho Viu là **Sherpa-ONNX + Kokoro + ONNX Runtime + faster-whisper**, với **OpenVINO** là backend Intel tùy chọn và **Diffusers** là backend image/video local tùy chọn. Giữ Google Flow làm media provider chính; không thay thế bằng một stack local nặng trên máy yếu.

## 1. Tiêu chí đánh giá

Tôi đánh giá mỗi repository theo năm tiêu chí: mức độ hoạt động và chất lượng tài liệu; license của code và rủi ro license của model/weights; khả năng chạy Windows local; hiệu quả CPU/RAM/VRAM; và độ phù hợp với kiến trúc Electron + FastAPI + SQLite + FFmpeg + Google Flow Connector hiện tại. Một repository chỉ được đề xuất tích hợp khi nó giải quyết một điểm nghẽn thật và không tạo ra dịch vụ nền bắt buộc hoặc dependency nặng cho mọi người dùng.

> **Nguyên tắc quan trọng:** license của repository không tự động bao phủ model weights, voice files hoặc checkpoints tải từ Hugging Face. Mỗi model/voice phải được kiểm tra license riêng trước khi đóng gói hoặc dùng thương mại.

## 2. Shortlist đã xác minh

| Hạng | Repository | Nhóm | License quan sát được | Hoạt động/tài liệu | Phù hợp với Viu | Quyết định |
|---:|---|---|---|---|---|---|
| 1 | [Sherpa-ONNX][1] | TTS/STT/VAD/audio offline | Apache-2.0 | Rất cao; release v1.13.6, hơn 2.000 commits, tài liệu và nhiều binding | Rất cao | **Tích hợp ưu tiên số 1** |
| 2 | [Kokoro][2] | TTS nhẹ chất lượng cao | Apache-2.0 theo repository/weights được nêu | Khá cao; model 82M, ONNX/batch, cập nhật Python | Rất cao cho profile máy yếu | **Tích hợp cùng Sherpa-ONNX** |
| 3 | [ONNX Runtime][3] | Runtime CPU/GPU/DirectML/CUDA/OpenVINO | MIT | Rất cao; hơn 15.000 commits, execution-provider/plugin hoạt động | Rất cao | **Lớp runtime chung** |
| 4 | [faster-whisper][4] | ASR/subtitle/VAD | MIT | Cao; CTranslate2, INT8 CPU/GPU, VAD, tài liệu rõ | Rất cao cho subtitle/transcript | **Tích hợp ưu tiên số 2** |
| 5 | [OpenVINO][5] | Intel CPU/GPU/NPU inference | Apache-2.0 | Rất cao; release/commit hoạt động, tài liệu tốt | Cao nếu máy có Intel | **Backend tùy chọn** |
| 6 | [Diffusers][6] | Image/video/audio diffusion | Apache-2.0 | Rất cao; benchmark/docs lớn, CPU offload/VAE tiling/quantization | Cao nhưng nặng | **Provider local tùy chọn, không mặc định** |
| 7 | [llama.cpp][7] | LLM/VLM GGUF quantization | MIT | Rất cao; hơn 10.000 commits, nhiều backend | Cao cho script/semantic scene local | **Provider LLM tùy chọn** |
| 8 | [nvitop][8] | NVIDIA GPU/VRAM/process monitor | Metadata có Apache-2.0 và GPL-3.0 | Cao; API Python và snapshot monitor | Trung bình; chỉ cần cho diagnostics | **Tham khảo API; không bundle CLI GPL** |
| 9 | [RQ][9] | Redis job queue/retry/batch | BSD-2-Clause | Cao; release 2.11, retry và batch/group | Trung bình-thấp trên desktop single-node | **Không đưa vào mặc định** |
| 10 | [TensorRT-LLM][10] | NVIDIA GPU low precision/high throughput | Cần rà soát LICENSE theo bản phát hành trước khi bundle | Rất cao nhưng NVIDIA-only | Cao cho máy NVIDIA mạnh, thấp cho máy yếu | **Profile high-end riêng** |
| 11 | [ffmpeg-python][11] | Python graph builder cho FFmpeg | Apache-2.0 | Repository ổn định nhưng không phải accelerator | Thấp vì Viu đã có FFmpegEngine | **Không tích hợp; chỉ tham khảo graph API** |
| 12 | [Dagu][12] | Local workflow/DAG/retry | GPL-3.0 | Rất cao; single binary, Windows, no DB/broker, retry/concurrency | Kiến trúc phù hợp nhưng license rủi ro | **Không embed; chỉ mượn ý tưởng** |
| 13 | [MeloTTS][13] | TTS multilingual CPU | MIT | Chất lượng tốt nhưng commit/release quan sát được đã cũ hơn nhóm trên | Trung bình; không phải Vietnamese-first | **Không ưu tiên** |

## 3. Phân tích theo nhu cầu của Viu

### 3.1 Bộ TTS cho máy yếu: Sherpa-ONNX + Kokoro

Đây là lựa chọn đáng làm nhất. Sherpa-ONNX hỗ trợ TTS, ASR streaming/non-streaming, VAD, diarization, enhancement và source separation offline trên Windows, Linux, macOS và embedded targets. Kokoro cung cấp model 82M nhẹ hơn nhiều so với các voice-cloning model lớn, có quality/performance tốt theo README chính thức và có ONNX/batch work trong repository. [1] [2]

Viu nên xây `SherpaOnnxTTSProvider` làm provider local mặc định khi model đã được cài, với `Kokoro` là model profile `balanced` hoặc `quality`, và một profile `tiny/piper-compatible` cho máy yếu hơn. Provider phải stream theo câu hoặc mệnh đề, ghi chunk WAV vào buffer, giữ sẵn chunk kế tiếp và nối gapless trước khi đưa vào timeline. Cấu hình nên có `sentence_chunk_chars`, `preload_next_chunk`, `buffer_ms`, `max_parallel_synthesis=1` trên máy yếu và `max_parallel_synthesis=2` trên máy khỏe.

Cách này giải quyết đúng triệu chứng người dùng mô tả là **giật, ngắt và chấm tiếng**: tách văn bản theo dấu câu không phá câu, chuẩn hóa ký hiệu/số, prefetch chunk tiếp theo, giữ sample rate thống nhất, đo duration thật và không khởi động nhiều model TTS đồng thời.

### 3.2 Runtime chung: ONNX Runtime và OpenVINO

ONNX Runtime là lớp runtime phù hợp nhất để tránh mỗi provider mang một bộ engine riêng. Nó có thể dùng CPU mặc định, DirectML cho GPU Windows tương thích, CUDA cho NVIDIA và OpenVINO cho Intel qua execution provider. [3]

OpenVINO nên được thiết kế thành backend tùy chọn, không phải dependency bắt buộc. Khi máy có Intel iGPU/NPU/CPU phù hợp và model đã export sang ONNX/OpenVINO IR, app có thể chạy audio analysis, VAD, ASR hoặc một số image pipeline nhẹ bằng OpenVINO. [5] Việc chọn backend phải dựa trên capability probe và benchmark lần đầu, không suy đoán theo tên GPU.

### 3.3 Subtitle, transcript và audio segmentation: faster-whisper

`faster-whisper` dùng CTranslate2, hỗ trợ INT8 trên CPU và GPU, đồng thời tích hợp Silero VAD với các ngưỡng silence tùy chỉnh. Đây là điểm phù hợp trực tiếp với pipeline subtitle và reference transcript của Viu, không phải TTS. [4]

Viu nên thêm `FasterWhisperProvider` cho transcription và audio alignment với model profile `tiny/base/small`, chọn `int8` trên CPU và `float16` hoặc `int8_float16` trên NVIDIA khi có CUDA. VAD phải dùng `min_silence_duration_ms` và các tham số cắt câu để không tạo subtitle quá vụn hoặc audio bị ngắt bất thường.

### 3.4 Image/video generation local: Diffusers, nhưng không thay Google Flow

Diffusers là framework lớn cho image/video/audio diffusion, có tài liệu về CPU offload, VAE tiling/slicing, lower precision và quantization. [6] Nó phù hợp để tạo một `LocalDiffusionProvider` cho máy có GPU đủ mạnh hoặc chạy CPU/offload khi người dùng chấp nhận chậm. Tuy nhiên, nó không nên trở thành đường mặc định của Factory Mode vì model video thường có footprint lớn, dễ làm máy yếu swap hoặc hết VRAM.

Google Flow Connector nên vẫn là provider chính cho Factory Mode hiện tại. Diffusers chỉ nên dùng cho preview/local fallback, batch offline, hoặc các model ảnh nhẹ đã benchmark. Mỗi model phải khai báo `min_ram_gb`, `min_vram_gb`, `supports_cpu`, `supports_offload`, `license` và `estimated_seconds_per_frame` trước khi được bật.

### 3.5 Local LLM cho script và semantic scenes: llama.cpp

llama.cpp hỗ trợ GGUF quantization từ 1.5-bit đến 8-bit, CPU SIMD, CUDA, HIP, Vulkan, SYCL, Metal và CPU+GPU hybrid. [7] Nó có thể giảm phụ thuộc API cloud cho script generation, semantic scene analysis và prompt refinement.

Nên tích hợp dưới dạng `LocalLLMProvider` tùy chọn với model catalog nhỏ, ví dụ profile 3B–8B quantized. Không nên cài model vào installer hoặc tự tải model ngầm. App cần hiển thị RAM/VRAM dự kiến, context length, quantization và thời gian benchmark trước khi người dùng bật.

### 3.6 Queue, retry và workflow: giữ SQLite hiện tại, mượn ý tưởng từ RQ/Dagu

RQ là một job queue trưởng thành với retry interval, worker và batch/group, nhưng yêu cầu Redis/Valkey. [9] Điều này không phù hợp với sản phẩm desktop single-node hiện tại vì người dùng phải chạy thêm broker.

Dagu phù hợp về mặt kỹ thuật hơn: single binary, Windows, không cần DB/broker, YAML DAG, retry, history, concurrency và logs. Tuy nhiên repository hiển thị GPL-3.0; không nên embed vào sản phẩm đóng nếu chưa có legal approval. [12]

Vì vậy Viu nên giữ `PipelineManager + SQLite` và nâng cấp nội bộ theo các nguyên tắc này: mỗi stage có checkpoint idempotency key; retry có exponential backoff và jitter; job có `attempt`, `next_retry_at`, `resource_class`, `max_concurrency`; Factory scene có dependency graph; và recovery sau crash đọc checkpoint thay vì chạy lại toàn bộ. Đây là cách đạt lợi ích của RQ/Dagu mà không thêm Redis hoặc rủi ro GPL.

### 3.7 Render FFmpeg: không thay FFmpegEngine bằng wrapper

`ffmpeg-python` giúp xây complex filter graph dễ đọc và Apache-2.0, nhưng bản thân nó không làm FFmpeg nhanh hơn. [11] Viu đã có FFmpegEngine với timeout, process cleanup, log handling và temporary-file cleanup, nên thay bằng wrapper sẽ không tạo lợi ích hiệu năng tương xứng và có thể làm mất kiểm soát lifecycle subprocess.

Thay vào đó, Viu nên bổ sung một capability probe cho encoder: kiểm tra `h264_nvenc`, `h264_qsv`, `h264_amf`, `vaapi` và software `libx264`, sau đó benchmark một clip ngắn. Chọn hardware encoder chỉ khi probe chạy thật; nếu không, dùng libx264 với preset phù hợp máy yếu. Không hardcode NVENC/QSV theo hệ điều hành.

### 3.8 CPU/GPU/VRAM monitoring: API nhẹ trước, nvitop chỉ cho diagnostics

nvitop cung cấp monitor NVIDIA và Python snapshot API, phù hợp để tham khảo cách thu thập GPU/process metrics. [8] Tuy nhiên metadata hiển thị cả Apache-2.0 và GPL-3.0; vì vậy không nên bundle nguyên CLI vào installer. Viu có thể dùng `nvidia-ml-py` cho NVIDIA, `psutil` cho CPU/RAM/disk và các probe riêng cho DirectML/OpenVINO/AMD.

Resource monitor nên ghi sample mỗi 1–2 giây khi job chạy: CPU percent, RSS, RAM available, GPU utilization, VRAM used/free, encoder utilization nếu lấy được, nhiệt độ nếu có, queue depth và stage duration. UI chỉ hiển thị dữ liệu thật và degradation mode khi metric không khả dụng.

## 4. Bộ repository tối ưu nên tích hợp

| Giai đoạn | Repository/bộ phận | Phần triển khai trong Viu | Lý do |
|---|---|---|---|
| P0 | ONNX Runtime | Capability registry và runtime factory | Là nền chung cho ONNX CPU/DirectML/CUDA/OpenVINO; tránh nhiều engine trùng nhau. |
| P0 | Sherpa-ONNX | `SherpaOnnxTTSProvider`, VAD, audio streaming/buffer | Tác động trực tiếp đến máy yếu, offline và Windows. |
| P0 | Kokoro | Model profile local TTS `balanced` | 82M, chất lượng/tốc độ tốt hơn các model TTS local nặng; dùng qua ONNX/Sherpa. |
| P0 | faster-whisper | ASR, reference transcript, subtitle alignment | INT8 CPU/GPU và VAD giải quyết chi phí RAM/CPU và cắt câu. |
| P1 | OpenVINO | Intel execution provider | Bật cho máy Intel sau capability probe và benchmark. |
| P1 | llama.cpp | Local LLM provider cho script/semantic scenes | GGUF quantization giúp chạy local trên CPU/RAM khi người dùng muốn giảm cloud API. |
| P1 | Diffusers | Local image/video provider có offload | Chỉ dùng khi model/hardware profile đạt ngưỡng; Flow vẫn là provider chính. |
| P1 | nvidia-ml-py, tham khảo nvitop | Monitor NVIDIA/VRAM | Không bundle nvitop CLI GPL; chỉ lấy metrics API cần thiết. |
| P2 | TensorRT-LLM | NVIDIA high-end profile | Chỉ cho máy NVIDIA mạnh, build/driver riêng, có benchmark bắt buộc. |

## 5. Những repository không nên tích hợp mặc định

`MeloTTS` có MIT license và tuyên bố CPU real-time, nhưng hoạt động repository quan sát được cũ hơn Kokoro/Sherpa-ONNX và không phải lựa chọn Vietnamese-first. Nó nên là fallback nghiên cứu chứ không đưa vào installer.

`RQ` tốt nhưng cần Redis/Valkey; không phù hợp desktop single-node nếu mục tiêu là cài một lần và chạy ngay. `Dagu` có kiến trúc rất phù hợp nhưng GPL-3.0 cần đánh giá pháp lý trước khi embed. `ffmpeg-python` không phải accelerator và không cần thiết khi Viu đã kiểm soát FFmpeg subprocess trực tiếp. `TensorRT-LLM` quá đặc thù NVIDIA và không phù hợp máy yếu. nvitop chỉ nên dùng làm công cụ diagnostics ngoài hoặc tham khảo API, không bundle nguyên CLI do license metadata hỗn hợp.

## 6. Kiến trúc tích hợp đề xuất

```text
System Capability Probe
  ├─ CPU cores / RAM / Windows build
  ├─ NVIDIA NVML / AMD / Intel OpenVINO / DirectML
  ├─ FFmpeg encoders and hwaccels
  └─ disk and VRAM budget
          ↓
Resource Profile: weak | balanced | high
          ↓
RuntimePlan
  ├─ TTS: Sherpa-ONNX + Kokoro → Edge fallback
  ├─ ASR: faster-whisper INT8 → existing fallback
  ├─ Local LLM: llama.cpp GGUF (optional)
  ├─ Image/video: Google Flow → Diffusers optional fallback
  └─ Render: tested hw encoder → libx264 fallback
          ↓
SQLite Job Scheduler
  ├─ idempotency key / checkpoint
  ├─ retry with backoff and jitter
  ├─ resource semaphore and queue depth
  ├─ model cache with file lock and last-used metadata
  └─ real-time CPU/RAM/GPU/VRAM metrics
```

Các model phải được preload theo nhu cầu, không preload toàn bộ lúc mở app. Model cache cần có lock file, checksum, size, last-used, provider, license metadata và giới hạn dung lượng. Khi RAM/VRAM xuống dưới ngưỡng, scheduler phải hạ concurrency hoặc unload model trước khi job tiếp theo chạy.

## 7. Lộ trình triển khai tối ưu

**Phase A — audio ổn định trên máy yếu.** Tích hợp ONNX Runtime capability probe, Sherpa-ONNX adapter, Kokoro model profile, sentence/buffer pipeline và faster-whisper INT8. Benchmark cùng một script trên CPU-only, DirectML và CUDA nếu có. Đây là phase có lợi ích trực tiếp nhất.

**Phase B — resource-aware runtime.** Bổ sung `ResourceProfile`, model cache, preload/unload policy, GPU/VRAM sampler, FFmpeg encoder probe và queue semaphore. Không thêm Redis hay workflow engine mới.

**Phase C — local AI tùy chọn.** Thêm llama.cpp GGUF cho script/semantic scenes và Diffusers cho image/local preview. Mỗi model phải có manifest tài nguyên và license; không tự tải model dung lượng lớn nếu chưa có sự đồng ý.

**Phase D — high-end acceleration.** Chỉ khi benchmark chứng minh lợi ích, thêm OpenVINO Intel profile, DirectML profile và TensorRT-LLM NVIDIA profile. Mỗi profile cần installer/runtime riêng hoặc optional package, không làm phình bản cài mặc định.

## 8. Kết luận cuối

Nếu chỉ chọn một bộ nhỏ để nâng cấp thật, tôi chọn **Sherpa-ONNX + Kokoro + ONNX Runtime + faster-whisper**. Đây là bộ cân bằng tốt nhất giữa hiệu năng máy yếu, khả năng Windows/offline, chất lượng audio, quantization, streaming và rủi ro triển khai. **OpenVINO** và **llama.cpp** là lớp mở rộng có giá trị sau đó. **Diffusers** chỉ nên là local provider tùy chọn, còn Google Flow vẫn là đường video chính. Queue, cache, preload và resource scheduling nên được triển khai nội bộ trên SQLite theo các ý tưởng đã xác minh từ RQ/Dagu thay vì thêm Redis hoặc embed một engine GPL.

## References

[1]: https://github.com/k2-fsa/sherpa-onnx "k2-fsa/sherpa-onnx"
[2]: https://github.com/hexgrad/kokoro "hexgrad/kokoro"
[3]: https://github.com/microsoft/onnxruntime "microsoft/onnxruntime"
[4]: https://github.com/SYSTRAN/faster-whisper "SYSTRAN/faster-whisper"
[5]: https://github.com/openvinotoolkit/openvino "openvinotoolkit/openvino"
[6]: https://github.com/huggingface/diffusers "huggingface/diffusers"
[7]: https://github.com/ggml-org/llama.cpp "ggml-org/llama.cpp"
[8]: https://github.com/XuehaiPan/nvitop "XuehaiPan/nvitop"
[9]: https://github.com/rq/rq "rq/rq"
[10]: https://github.com/NVIDIA/TensorRT-LLM "NVIDIA/TensorRT-LLM"
[11]: https://github.com/kkroening/ffmpeg-python "kkroening/ffmpeg-python"
[12]: https://github.com/dagucloud/dagu "dagucloud/dagu"
[13]: https://github.com/myshell-ai/MeloTTS "myshell-ai/MeloTTS"
