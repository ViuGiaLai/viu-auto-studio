# GitHub Topic Research — Viu Auto Studio

**Ngày khảo sát:** 2026-08-20. **Phạm vi:** các topic do người dùng cung cấp, GitHub Topic pages và repository README metadata. Đây là tài liệu nghiên cứu trung gian; chưa có repository nào được clone vào project và chưa có commit/push.

## Topic sources

1. [ai-video](https://github.com/topics/ai-video)
2. [video-generation](https://github.com/topics/video-generation)
3. [storyboard](https://github.com/topics/storyboard)
4. [prompt-engineering](https://github.com/topics/prompt-engineering)
5. [youtube-api](https://github.com/topics/youtube-api)
6. [marketing-automation](https://github.com/topics/marketing-automation)
7. [text-to-speech](https://github.com/topics/text-to-speech)
8. [audio-processing](https://github.com/topics/audio-processing)
9. [full-stack](https://github.com/topics/full-stack)
10. [api-integration](https://github.com/topics/api-integration)
11. [database-design](https://github.com/topics/database-design)
12. [ai-agent](https://github.com/topics/ai-agent)
13. [workflow-automation](https://github.com/topics/workflow-automation)

## Initial evidence from topic pages

| Topic | Promising candidates observed | Initial relevance |
|---|---|---|
| ai-video | [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft), [Generative-Media-Skills](https://github.com/SamurAIGPT/Generative-Media-Skills), [autoclip](https://github.com/zhouxiaoka/autoclip), [youtube-shorts-pipeline](https://github.com/rushindrasinha/youtube-shorts-pipeline) | Shot recipes, prompt assets, clip extraction and short-form production patterns. |
| video-generation | [OpenMontage](https://github.com/calesthio/OpenMontage), [ViMax](https://github.com/HKUDS/ViMax), [Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app), [nexu-io/html-video](https://github.com/nexu-io/html-video) | End-to-end pipeline, agent loop, storyboard/keyframe continuity, and programmatic rendering. |
| storyboard | [ArcReel](https://github.com/ArcReel/ArcReel), [wonderunit/storyboarder](https://github.com/wonderunit/storyboarder), [worldwonderer/drama-skills](https://github.com/worldwonderer/drama-skills) | Scene/asset consistency, visual planning and reusable storyboard skill patterns. |
| prompt-engineering | [Prompt-Engineering-Guide](https://github.com/dair-ai/Prompt-Engineering-Guide), [promptfoo](https://github.com/promptfoo/promptfoo), [headroom](https://github.com/headroomlabs-ai/headroom), [langfuse](https://github.com/langfuse/langfuse) | Prompt quality, evaluation, token budgeting and observability. Avoid system-prompt leak repositories. |
| youtube-api | [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api), [youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent), [youtubeuploader](https://github.com/porjo/youtubeuploader) | Research transcript ingestion and eventual YouTube upload; OAuth and policy review required. |
| marketing-automation | [claude-seo](https://github.com/AgriciDaniel/claude-seo), [MultiPost-Extension](https://github.com/leaperone/MultiPost-Extension), [growth-lab](https://github.com/tsingyuai/growth-lab), [ALwrity](https://github.com/ALwrity/ALwrity) | SEO/content distribution patterns; most are separate products rather than drop-in libraries. |
| text-to-speech | [edge-tts](https://github.com/rany2/edge-tts), [piper](https://github.com/rhasspy/piper), [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS), [CosyVoice](https://github.com/QwenAudio/CosyVoice) | Edge TTS/Piper are realistic desktop options; cloning models require large dependencies, licensing and consent safeguards. |
| audio-processing | [spleeter](https://github.com/deezer/spleeter), [speechbrain](https://github.com/speechbrain/speechbrain), [pedalboard](https://github.com/spotify/pedalboard), [auto-editor](https://github.com/WyattBlue/auto-editor) | Voice/music separation, effects and silence-aware editing; need Windows dependency and resource checks. |
| full-stack | [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template), [highlight](https://github.com/highlight/highlight) | Useful architectural references, but Viu already has its own Electron/FastAPI/SQLite runtime. Avoid replacing the stack. |
| api-integration | [Nango](https://github.com/NangoHQ/nango), [api200](https://github.com/API-200/api200), [orbital](https://github.com/orbitalapi/orbital), [nango-workflow-builder](https://github.com/makafeli/n8n-workflow-builder) | Integration retry/auth/caching patterns; likely too large to embed, but patterns may improve provider adapters. |
| database-design | [Azimutt](https://github.com/azimuttapp/azimutt), [thoth-blueprint](https://github.com/AHS12/thoth-blueprint) | Schema documentation and migration ideas; no direct runtime dependency recommended. |
| ai-agent | [Agent-Reach](https://github.com/Panniantong/Agent-Reach), [nanobot](https://github.com/HKUDS/nanobot), [CopilotKit](https://github.com/CopilotKit/CopilotKit) | Research connectors, lightweight agent loops and agent UI patterns; must preserve local-first Desktop control. |
| workflow-automation | [n8n](https://github.com/n8n-io/n8n), [activepieces](https://github.com/activepieces/activepieces), [Conductor](https://github.com/conductor-oss/conductor), [Temporal](https://github.com/temporalio/temporal) | Durable workflows and external integrations; embedding a full workflow engine is likely too heavy for Desktop now. |

## README evidence opened

### OpenMontage
[OpenMontage README](https://github.com/calesthio/OpenMontage) describes a Python + FFmpeg + Node/Remotion production system with pipeline definitions, provider selection, storyboard approval gates, research, subtitles, audio mixing, cost/audit logging, and quality checks. It is **AGPL-3.0**, so copying code into a proprietary/local product would require a careful license decision. The best immediate use is architectural comparison and selective prompt/schema ideas, not wholesale code import.

### ViMax
[ViMax README](https://github.com/HKUDS/ViMax) is **MIT** and describes Idea2Video, Script2Video, Novel2Video, AutoCameo, agent loop/TUI, Web UI, storyboard previews, provider settings, render checkpoints, reference/first-frame continuity, and parallel compatible shot generation. It is architecturally close to Viu, but it remains a separate Python/uv/web runtime; code import must be selective and tested rather than replacing Electron/FastAPI/SQLite.

### waoowaoo
[waoowaoo README](https://github.com/waooAI/waoowaoo) describes a Next.js 15 + React 19 + MySQL/Prisma + Redis/BullMQ + NextAuth web application. It is explicitly an early test release. It is useful for product-flow comparison but not a direct dependency for Viu's Desktop/local-first architecture.

### YouTube Shorts Pipeline / Verticals
[README](https://github.com/rushindrasinha/youtube-shorts-pipeline) describes an MIT short-form pipeline with niche YAML profiles, research gates, multi-provider LLM/TTS, Edge TTS, Whisper word-level captions, FFmpeg assembly, music ducking, resumable stages, and private-by-default YouTube OAuth upload. This is the strongest architectural reference for Viu's currently missing publish/research/niche-profile capabilities, but it should be ported as concepts and provider adapters, not copied wholesale.

## Preliminary decision

The most promising implementation targets are: **(1) niche profiles and evidence-gated research, (2) prompt evaluation and run observability, (3) real YouTube OAuth/upload after a separate security/consent design, (4) optional Piper/ONNX local TTS, and (5) scene continuity/reference-keyframe metadata**. Full replacements such as n8n, Temporal, OpenMontage, waoowaoo or ViMax are not justified inside the Desktop app until a concrete product requirement demonstrates the need.

## Implemented from this review

- Added a real `youtube-transcript` local action to Skill Lab using the MIT `youtube-transcript-api` package. It accepts a YouTube URL or video ID, requests preferred languages, returns source/video/language metadata plus timestamped snippets, and records the result in the existing `SkillRun` history. It never downloads the video and reports missing dependency or upstream access errors instead of fabricating output.
- Added built-in niche profiles inspired by the niche-profile pattern in Verticals. The Project Editor now passes `niche` into `/ai/generate-script`; cloud providers receive tone, pacing, hook patterns, visual vocabulary, music direction and avoidance constraints, while the offline provider also changes its generated hook/angle/SEO description.

## Deferred after compatibility review

- Full OpenMontage/ViMax/waoowaoo replacement: rejected as too large and architecturally invasive for Electron + FastAPI + SQLite; OpenMontage is AGPL-3.0, while ViMax is a separate MIT runtime and waoowaoo is a Next.js/MySQL/Redis product.
- n8n, Activepieces, Temporal, Conductor and Nango embedding: rejected for now because they add a second orchestration/auth/runtime platform. Viu already has a local queue, PipelineState and ConnectorTask model; the next value is consuming saved automation config, not adding another workflow engine.
- Piper direct integration: deferred because the original `rhasspy/piper` README states development moved to `OHF-Voice/piper1-gpl`; a fresh license/dependency review is required before shipping it. Edge TTS remains the current default.
- Promptfoo/Langfuse/Headroom: retained as engineering references for a future prompt-evaluation/observability phase, not bundled as production runtime dependencies.
- YouTube upload/OAuth: not implemented in this pass because it requires user-authorized credentials and a security/consent flow; current publish UI still verifies local render metadata only.
