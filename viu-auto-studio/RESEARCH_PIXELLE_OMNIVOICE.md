# Verified research notes: Pixelle-Video and OmniVoice

## Pixelle-Video

Source: https://github.com/ATH-MaaS/Pixelle-Video/blob/main/README_EN.md and repository tree.

Pixelle-Video uses a modular automatic short-video pipeline: script generation, image planning, frame-by-frame processing, and final video composition. It separates atomic capabilities so image, video, TTS, VLM, ComfyUI/RunningHub workflows, and direct APIs can be swapped independently. Its configuration groups LLM, direct API providers, ComfyUI/RunningHub, TTS, image/video workflow defaults, prompt prefixes, template, proxy, and concurrency limits.

Useful product ideas for Viu Auto Studio are: a provider-agnostic capability registry; per-provider base URL, credentials, proxy, and model settings; explicit generation modes; template/style selection; custom media analysis; background music; real-time per-frame progress; retry/download handling; content-neutralization retry; batch task creation; configurable concurrency; and reusable workflow templates. Viu already has stronger Electron + FastAPI + SQLite + Google Flow Connector behavior, so only the modular capability configuration, batch/concurrency and resumable checkpoint ideas should be adapted rather than copying Pixelle's Streamlit/web structure.

## OmniVoice

Source: https://github.com/k2-fsa/OmniVoice, https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md, and https://huggingface.co/k2-fsa/OmniVoice.

OmniVoice exposes three TTS modes: voice cloning from a short reference audio, voice design through speaker attributes, and automatic voice. It supports reference audio plus reference transcript, cached reusable voice-clone prompts, speed and fixed-duration control, non-verbal tags such as [laughter] and [sigh], pronunciation overrides, long-form chunking for stable VRAM usage, and batch inference. The repository states a 3–10 second reference clip is recommended and the model requires a substantial PyTorch runtime; the model card indicates a 0.6B model and a CC-BY-NC license for the pretrained model.

Useful ideas for Viu are: a first-class voice profile with reference audio, transcript, cached clone prompt path, voice design instruction, speed/duration, pronunciation and expression controls; long narration chunking; deterministic preview; and a provider capability probe. The first implementation should be an optional adapter/configuration layer that gracefully reports unavailable when OmniVoice is not installed. It must not silently download multi-GB model weights or block the normal Edge TTS/Factory flow.

## Integration decision

Implement the safe, high-value architecture ideas locally: a persistent provider/capability configuration for voice profiles and media generation, resumable job checkpoints, per-stage progress metadata, bounded concurrency settings, and an optional OmniVoice adapter contract. Do not copy repository code, model weights, Streamlit UI, or hosted assets. Respect Apache-2.0 repository licenses and the OmniVoice model-card CC-BY-NC constraint; any future bundled OmniVoice model must be reviewed separately for commercial-use compatibility.
