# Factory Mode — Video mẫu analysis

**Nguồn:** `2026-08-1913-52-24.mkv`, converted to MP4 only for analysis. The analysis records visible behavior and does not infer hidden implementation.

## Observed flow

At 00:00–00:16 the user creates a project from the Projects view, selects AI Studio, chooses an output folder, creates the project and enters the workspace.

At 00:17–01:05 the user selects a long video/16:9 mode and fills an idea modal containing title, hook, angle, outline, thumbnail concept and English thumbnail prompt. The idea is created with `proposed` state.

At 01:06–02:29 the user opens channel configuration and selects a content type/niche, recurring or anthology episode mode, writing style, long/short duration presets, ChatGPT provider, Revo Mai voice, Google Flow (Veo/Imagen) image/video source, Omni Flash video model and Vietnamese language. The configuration is saved.

At 02:30–03:13 the user approves the idea, pastes the full script and chooses automatic script conversion. A new browser tab opens Google Flow at `labs.google.com/tv/tools/flow`. The studio shows `Processing`, and the extension interacts with Google Flow to select a project and begin media creation from the generated prompts.

At 03:14–04:19 the user opens the characters tab and starts AI character generation. The UI shows progress from 22% to 90%. The Flow extension receives English prompts and enters them into the Google Flow chat/input UI.

At 04:20–04:40 the visual-scenes tab displays scene time ranges, script text, image/video prompts, upload or completed-media states. The right progress rail shows data/script/voice/storyboard completed, image/video processing, and SEO/render pending. The user clicks approve/continue to move the pipeline forward.

## Product behavior to reproduce

The visible product flow is a single Factory Mode run: project and channel configuration → script approval → scene/character generation → Flow media tasks → returned media → visual-scene review → final continuation into render. The user does not copy prompts into Flow and does not manually operate each scene.

The extension must visibly receive structured tasks, enter prompts, report task progress and return verified media. App state must distinguish login waiting from connector readiness and from per-scene generation. A failed scene must expose its error and retry only the failed work; it must not claim the overall pipeline completed.

## Important distinction

The video visibly shows a browser tab opening Google Flow during the first connection. The user's requested target behavior is stricter: the app may launch the dedicated Chrome/extension profile automatically, but it must not add a manual `Mở Google Flow` UI button. First-time Google login remains a user-controlled browser step; after the session is ready, the workflow must resume automatically.
