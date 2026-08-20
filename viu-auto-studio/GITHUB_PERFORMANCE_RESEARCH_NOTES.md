# GitHub performance research notes

## Current Viu baseline

Viu Auto Studio currently uses FastAPI/Python/SQLite, Edge/Local/Cloud TTS adapters, an optional OmniVoice adapter, FFmpeg subprocess rendering, Google Flow Connector for image/video, and a PipelineManager with SQLite-backed status plus local threads. Recommendations must be optional, Windows-compatible, local-first, and must not force heavyweight model runtimes on weak machines.

## Verified official repository findings

### OpenVINO
URL: https://github.com/openvinotoolkit/openvino

Official GitHub page shows a highly active repository with current commits, releases, issues and pull requests. OpenVINO supports inference on x86/ARM CPU, Intel integrated/discrete GPU and Intel NPU. The repository advertises Apache-2.0 licensing. Best fit is optional Intel hardware backend for compatible exported ONNX/OpenVINO models, especially low-resource ASR/TTS/VLM or media-analysis helpers; it is not a direct replacement for Google Flow image/video generation and should not be installed on every Windows machine.

### Sherpa-ONNX
URL: https://github.com/k2-fsa/sherpa-onnx

Official GitHub page shows active releases (latest observed v1.13.6), over 2,000 commits, broad issue/PR activity, and Apache-2.0 licensing. It supports offline ASR streaming/non-streaming, TTS, speaker diarization/identification/verification, VAD, speech enhancement, source separation and related audio functions. It supports Windows, macOS, Linux, Android, iOS, WebAssembly, NodeJS and embedded platforms. This is the strongest candidate for a weak-machine audio backend and streaming/buffer architecture, with a potential Piper/Kokoro/VITS ONNX adapter to replace or complement Edge TTS/local placeholder. Model licensing must be checked separately per downloaded model.

### faster-whisper
URL: https://github.com/SYSTRAN/faster-whisper

Official GitHub page shows an active repository with recent VAD work, 263 commits, releases and an MIT license file. It uses CTranslate2, reports up to 4x speed with lower memory versus openai/whisper, supports INT8 quantization on CPU and GPU, and integrates Silero VAD with configurable silence thresholds. GPU execution requires compatible NVIDIA CUDA/cuDNN libraries. This is a strong candidate for Viu's subtitle/transcription and reference-audio transcription path, not for TTS generation itself. It can reduce CPU/RAM use and improve silence segmentation, which directly addresses choppy subtitle/voice workflows.

### nvitop
URL: https://github.com/XuehaiPan/nvitop

Official page shows active maintenance, 869 commits and recent dependency/release work. It provides NVIDIA GPU/device/process monitoring, process filtering, metrics, CUDA device selection, and a Python API such as `take_snapshots`; the repository exposes Apache-2.0 and GPL-3.0 licensing in its metadata, so only the Apache-licensed library/API parts should be considered for embedding and the GPL CLI/exporter should not be bundled without a legal review. Best use is a diagnostics/benchmark helper, not a hard runtime dependency.

### RQ
URL: https://github.com/rq/rq

Official page shows active maintenance, 2,108 commits and current 2.11 release. RQ supports background workers, retries with configurable intervals, scheduling and batch/group operations, but requires Redis/Valkey as the broker/backend. It is BSD-2-Clause licensed. RQ is reliable but not the first fit for Viu's single-machine SQLite/Electron product because adding a Redis service increases installer and support complexity. It can be an optional factory-scale backend later; current PipelineManager should first gain bounded workers, retry/backoff and persistent checkpoints without introducing Redis.

### Hugging Face Diffusers
URL: https://github.com/huggingface/diffusers

Official GitHub page shows active development, 6,818 commits, large documentation/benchmark surface, and Apache-2.0 licensing. Diffusers supports image, video and audio diffusion pipelines in PyTorch; official optimization docs cover CPU offload, VAE tiling/slicing, lower precision and quantization. This is a strong reference/integration candidate for a future local image/video backend, but not a drop-in replacement for Google Flow. It should be isolated behind a provider adapter and only enabled when hardware/model capability checks pass; weak machines should use CPU/offload or remain on Flow.

### llama.cpp
URL: https://github.com/ggml-org/llama.cpp

Official GitHub page shows very active development, 10,538 commits, a large release history and MIT licensing. It supports 1.5–8 bit integer quantization, CPU SIMD, CUDA, HIP, Vulkan, SYCL, OpenVINO (in progress), Metal and CPU+GPU hybrid inference. It is highly relevant for local LLM/script/semantic-scene generation when Viu wants to reduce cloud API usage, but it is not a TTS/video renderer. The practical integration is a separate local LLM provider with GGUF model selection and resource-aware offload; do not replace Google Flow or add it to the default weak-machine profile without a small-model benchmark.

### ONNX Runtime
URL: https://github.com/microsoft/onnxruntime

Official GitHub page shows active maintenance with 15,262 commits and recent CUDA/WebGPU plugin and Windows work. It is MIT licensed and supports cross-platform inference with graph optimization and hardware execution providers. This is the best common runtime layer for Viu's future ONNX TTS/ASR/VAD adapters because it can select CPU, CUDA, DirectML, OpenVINO or WebGPU paths without changing the model API. Prefer `onnxruntime` or `onnxruntime-directml` as optional capability packages rather than forcing CUDA packages on weak machines.

### TensorRT-LLM
URL: https://github.com/NVIDIA/TensorRT-LLM

Official GitHub page shows active NVIDIA maintenance, 8,846 commits and a current release history. It offers custom kernels, FP/INT low precision and advanced parallelism for efficient LLM/visual generation on NVIDIA GPUs. It is a high-end optional accelerator, not suitable for the default Windows desktop/weak-machine installation; it also adds CUDA/TensorRT compatibility and packaging complexity. Use only in a dedicated NVIDIA profile after benchmark validation, never as the universal backend.

### ffmpeg-python
URL: https://github.com/kkroening/ffmpeg-python

Official page shows an Apache-2.0 license, 458 commits and a readable graph-builder API for complex FFmpeg filters. It does not itself accelerate FFmpeg; it generates and runs CLI commands. Since Viu already has a dedicated FFmpegEngine with timeout, process cleanup and project-aware temporary files, adding this wrapper is not necessary and could hide the existing resource controls. Borrow only its graph-builder concept if Viu later needs a typed filter graph; keep direct subprocess control for production safety.

### Kokoro
URL: https://github.com/hexgrad/kokoro

Official page describes Kokoro-82M as an open-weight TTS model with 82M parameters, Apache-2.0-licensed weights, faster/cost-efficient inference, ONNX compatibility work, batch examples and CPU/MPS-related updates. The GitHub repository has 71 commits and recent Python 3.13 maintenance, but less activity than Sherpa-ONNX/ONNX Runtime. This is the best low-resource quality candidate for Viu's default local TTS profile, preferably through Sherpa-ONNX or kokoro-onnx so the app can use CPU/ONNX and avoid a full PyTorch dependency. Exact language/voice model license should be checked per downloaded asset.

### MeloTTS
URL: https://github.com/myshell-ai/MeloTTS

Official page states multilingual TTS and CPU real-time inference, with MIT licensing. However, the latest repository commit observed is Dec 24, 2024 and latest release v0.1.2 is from Mar 2024, so maintenance is materially weaker than Kokoro/Sherpa-ONNX. It is a viable fallback for English/Chinese/Japanese/Korean/Spanish/French, but not the first choice for Viu's Vietnamese-first product and should not be installed by default.

### Dagu
URL: https://github.com/dagucloud/dagu

The initially guessed `dagu/dagu` URL is a 404; the active repository is `dagucloud/dagu`. Its official page shows a current repository with 2,951 commits and active workflow/retry/concurrency development. Dagu is a single-binary, local-first workflow engine with no external DB/broker, Windows support, declarative YAML DAGs, retries, run history, parallel/concurrency controls and logs. GitHub metadata shows GPL-3.0 licensing. It is architecturally relevant to Viu's resumable Factory workflow, but embedding a GPL-3 engine into a proprietary/closed desktop product needs legal review. Safer approach: borrow its concepts (DAG checkpoints, retry policy, concurrency budgets) and keep Viu's own SQLite/Python implementation unless licensing is explicitly accepted.
