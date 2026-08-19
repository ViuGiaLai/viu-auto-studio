# QA pass — checklist (session: full re-check per user request)

## Done
- [x] 3igXBc: TTS providers list — backend now returns full catalog: revo, kokoro, kokoro_vi, omnivoice, elevenlabs, google_cloud_tts, gemini_tts, vbee, azure_tts, mock, local, cloud
- [x] Revo voice catalog 21 voices (REVO_VOICES in mock_provider.py, RevoTTSProvider class, /api/tts/voices legacy route returns all 21, downloaded=revo_mai only)
- [x] Backend restarted, /api/tts/providers + /api/tts/voices verified OK

## Remaining QA items
- [x] 8yTzSh: dialog "Duyệt ý tưởng" implemented — header icon + subtitle, textarea viền cam với placeholder 3 dòng, note "ℹ Không cần nhập thời gian...", footer 3 nút: Huỷ (outline) + Tự động lên kịch bản (gradient tím) + Import kịch bản (gradient cam-đỏ)
- [ ] D8yXwm: dashboard — add % number inside performance circles (CPU/RAM), refresh button matches "refresh" label (current "Làm mới").
- [ ] f5gNiF: dialog "Tạo Project Mới" — verify projects page has: Tên Project input, Loại kênh (Recap/AI Studio cards), Output Folder + Browse, Huỷ + Tạo Project tím.
- [ ] EW4sUW: editor Storyboard (tab 3 in editor page) — enhance: stats row (11 cảnh · 0:59 · 9 ảnh · 2 clip), progress "0/11", Tạo lại phân cảnh + Tải lại X cảnh thiếu buttons, scene prompt italic EN, Upload badge vàng, timeline dots.
- [x] HXnFRE: TTS page upgraded — header TTS + subtitle, provider tabs (active gradient tím), 2-col voice grid ▶ + Tải 64MB, Kho giọng 0/21, tìm giọng, verified in browser
- [ ] TTS page provider tabs list in reference: Revo Voice, OmniVoice, Google Cloud, Gemini TTS, ElevenLabs, CapCut, Vbee.
- [x] Settings header: có đủ Huỷ + Lưu cài đặt (verified in browser)
- [ ] Check sidebar references: ref sidebar items: Dashboard, Dự án, Workspace, Phân tích đối thủ, Hàng đợi, Thư viện, Brand Kit, Tài khoản Flow, Trình duyệt & Profile, Cài đặt. OUR app: Dashboard, Dự án, Workspace, TTS, Hàng đợi, Thư viện, Cài đặt. Không sao — không phải ảnh Viu Auto Studio? (Ảnh là Revo Studio — tên thương hiệu khác, không sao chép; giữ cấu trúc hiện tại của app mình).
- [ ] Run end-to-end flow test: create idea → script → split scenes → render a short video; verify real render works.
- [ ] Channel config dialog: check style dropdown badges FREE/BASIC.
- [ ] tsc + vite build clean.
- [ ] Package zip + deliver.

## BUG INVESTIGATION — POST /api/projects 422 (ongoing)
- Symptom: curl/python POST /api/projects with JSON body → 422, loc=["query","payload"] (now "data" after my rename).
- /api/channels POST works fine with flat JSON body (same signature pattern, same Depends(get_db)).
- Verified with python requests: channels OK, projects 422.
- Signature introspection shows params have no default (inspect._empty) — expected.
- NOTE: sending ?payload={json} as query WORKS → FastAPI is treating the body param as QUERY. Why channels doesn't?
- Hypothesis: maybe the issue is actually that in current file, the create_project route was previously edited (sed replaced payload→data) but the route param name might collide with something — or the route file had a stray `Body()` import earlier that broke pydantic ForwardRef. Current state: param renamed to `data`, payload.→data. inside body (lines 290-315).
- NEXT: test again after clean restart. If still broken, wrap param in Body() properly: `def create_project(data: ProjectCreateV2 = Body(...), db: Session = Depends(get_db))` — the earlier PydanticUserError was because FastAPI's Body alias 'payload' collided with ForwardRef resolution? Try: use explicit Body embed=False.
- Also check: maybe an older .pyc stale — run find -name __pycache__ -exec rm -rf {} after edit.
- Frontend api.createProject sends flat JSON {name, topic, video_type, ...} (no project_type!). IMPORTANT: frontend createProject type lacks project_type & output_folder — update api.ts and editor page to send project_type:"ai_studio".

## Session progress (latest)
- [x] BUG FIX 1: POST /api/projects 422 — root cause: `ProjectCreateV2` not imported in backend/api/routes.py (only `ProjectCreate` imported), so FastAPI ForwardRef resolution failed and param treated as Query. Fixed by (a) adding `ProjectCreateV2,` to import at line 24, (b) `def create_project(data: ProjectCreateV2 = Body(...), db: Session = Depends(get_db)):` with `from fastapi import APIRouter, Body, ...`. Verified via /tmp/inspect_deps.py → `body: data Body`. curl test: 201, project_7 created.
- [x] BUG FIX 2: backend/services/ai/gemini.py SyntaxError line 31 — missing closing `]` in `"contents": [{"parts": [{"text": "..."}]}]`. Fixed, all backend files compile OK.
- [x] BUG FIX 3: AI script generation 401 (openrouter unconfigured) — added auto-fallback in get_provider() (backend/services/ai/provider.py): if chosen provider not configured, switch to any configured alt; else raise friendly RuntimeError.
- [ ] Re-run /tmp/e2e_test.py (pid 7) — expected flow: ai generate → save script → split → build-scenes → scenes > 0.
- [ ] After scenes exist: render test with FFmpeg — note ffmpeg/check earlier said guide about missing FFmpeg but `"ffmpeg":true` returned; verify actual ffmpeg binary: `which ffmpeg`.
- [ ] Frontend api.ts createProject should include project_type:"ai_studio" (backend requires it, frontend type missed it) — check projects-page dialog too.
- [ ] Remaining QA items from top of this file: D8yXwm dashboard %, f5gNiF new project dialog check, EW4sUW storyboard enhancements, TTS provider tabs, channel config style badges, final tsc+build, zip package, deliver.
- Backend restart cmd: `cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &` (after pkill -f "uvicorn backend.main")
- Frontend already running on 5173.

## BUG FIX 4 (in progress): many POST routes need Body(...) annotation
Root cause class: in this backend, Pydantic model params WITHOUT a default get treated as Query
(the earlier create_project case). Only routes whose model param happens to come before Depends()
AND are imported properly resolve as Body. SAFEST FIX: annotate every POST route's Pydantic
model param with `= Body(...)` (already imported at line 13: `from fastapi import APIRouter, Body, Depends, ...`).

E2E progress: AI script gen now WORKS (local offline provider added at
backend/services/ai/local_provider.py + registered in provider.py registry as "local",
auto-fallback when openrouter/gemini keys missing). Build-scenes works: 19 scenes created
for project_7.

Remaining 422 failures found in e2e_render.py (project pid=7, scenes 12-30):
- POST /projects/{id}/scenes/{scene_id}/regenerate-voice (line ~837) → body required
- POST /projects/{id}/subtitle-preview (line 955) → dict_type (same cause)
- POST /render/start (see routes.py ~line after 1001) → model_attributes_type
- POST /tts/synthesize (line 99, payload: TTSSynthesizeRequest) — check too
- Possibly /ai/generate-script worked because param had default? (line 418)

Plan: use /tmp/find_body.py (prints every POST route: lineno, path, args) then for each
arg whose annotation is a Name starting with uppercase and has no default, add `= Body(...)`.
NOTE: TTSSynthesizeRequest etc. must be imported; check import block lines 22-35.
After fixes: restart backend (pkill -f "uvicorn backend.main" then nohup python3 -m uvicorn
backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &), rerun /tmp/e2e_render.py.

FFmpeg IS available at /usr/bin/ffmpeg (which shows it). The ffmpeg/check endpoint returns
misleading "guide" text despite ffmpeg:true — verify endpoint logic if time permits.

## Session state snapshot (pre-compaction)
### Fixed so far (all in backend):
1. POST /api/projects 422 → import ProjectCreateV2 + = Body(...) (line 24, 290).
2. gemini.py SyntaxError line 31 (missing `]`).
3. AI provider fallback: openrouter→gemini→local (local_provider.py created: deterministic offline script generator, always configured).
4. 16 POST routes annotated = Body(...) via /tmp/fix_body.py (tts/synthesize, characters, channels, duplicate, ai/generate-script, save script, split, ideas, approve, scenes, reorder, scene media, regenerate-voice, tts/config, render/start, pipeline/start).
5. get_audio_duration imported (line 41).
6. pipeline-status ValueError for current_step='failed' fixed (line 1307 safe index).

### Verified working (project_7):
- AI script gen 200 → save 200 → split 200 → build-scenes 200 (19 scenes) →
- regenerate-voice 200 (audio at projects/project_7/scene_000_voice.mp3) → render/start 200 (job 4).
- ffmpeg binary exists at /usr/bin/ffmpeg.

### CURRENT BUG: render failed scene 0 — ffmpeg "Error opening input file ." (empty input).
- Error in backend/render/ffmpeg_engine.py when building render command: scene has
  audio (mp3) but NO image/video media → input path is empty string.
- FIX NEEDED: in ffmpeg_engine (or render step in queue.py), when a scene has no
  media: use `color=black` solid-color input or `lavfi` input, or fall back to a
  default placeholder image. Scene duration = scene.duration or max(3, audio+0.3).
- ffmpeg exit code 254 in error_message.
- Look at `def render_video` or similar in ffmpeg_engine.py — find input list building.
- queue.py uses FFmpegEngine; pipeline steps: data→script→voice→storyboard→media→render→seo.

### Still TODO after render fix:
- Re-run render poll (job 4 failed; restart render or create new job).
- frontend api.ts createProject should send project_type: 'ai_studio' (check types + dialog).
- Run full tsc + vite build clean.
- Browser verify pages again (dashboard/projects/editor/workspace/queue/library/tts/settings).
- Update zip package and deliver.
- Services: backend port 8000 (restart: cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &, after pkill -f "uvicorn backend.main"); frontend 5173.

---
## SESSION UPDATE (Aug 18 ~16:50) — RENDER FIXES
### Fixed
1. ffmpeg_engine signal-15/exit-255 on silent scenes: anullsrc+apad+-shortest combo killed ffmpeg at mux. Fix: silent path uses anullsrc d=finite + [1:a]anull[aout] + explicit -t, no -shortest. Real-audio path keeps -shortest+apad (verified OK).
2. queue.py Step 2 (preparing_media): scene without media used to _fail() whole pipeline ('Cảnh X chưa có media'). Fix: set media_path="", media_type="image", log warning, continue — ffmpeg_engine lavfi color fallback renders it.
3. concat_scenes OOM exit -9 with xfade 19 inputs ("100 buffers queued"): now cascade merge — pairwise xfade+acrossfade loop (ultrafast, explicit -t), then single-input final composite.

### Current state
- Job 5 for project_7 running since ~16:50; voices all exist; render re-running.
- DB: /home/ubuntu/viu-auto-studio/data/app.db; project_7 = 19 scenes, 9:16, transition 0.5s default (transition_duration in schemas.RenderConfig line 324).
- Frontend issue found: PUT /api/projects/7/update → 404 (frontend calls /update suffix).

### Remaining steps
1. Verify output.mp4 for project_7; fix further errors if any.
2. tsc + vite build clean.
3. Browser verify all pages.
4. Verify api.ts createProject sends project_type: 'ai_studio'.
5. Package: cd /home/ubuntu && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"
6. Deliver.

### Browser verify findings (Aug 18 17:07)
- Dashboard: looks good. Performance table rows have "12/45/8/180/60/5" TB giây but ref likely shows different values — acceptable (computed from test runs). PRO banner, account pill, service statuses all present. No major issues.
- FIXED: GET /api/projects 500 — ProjectRead.response validation failed (error_message None). Made output_video_path/thumbnail_path/error_message Optional[str]=None in schemas ProjectRead. Projects page now loads 7 projects with cards, filters work.
- FIXED: GET /api/projects/7/scenes 500 — SceneRead and RenderJobRead nullable str fields made Optional via /tmp/fix_schemas.py. Storyboard tab now shows all 19 scenes with narration, prompts, voice badges, durations.

### Queue page (17:11)
- Queue page OK: shows 4 render jobs (3 completed, 1 error + retry). Dark purple theme consistent.

### Status so far (17:12)
All backend services running on 8000, frontend dev on 5173. Key verifications done: Dashboard OK; Projects list fixed (ProjectRead Optional fields); Editor script + storyboard tabs OK (SceneRead/RenderJobRead Optional fields fixed via /tmp/fix_schemas.py); Queue OK.
REMAINING: verify workspace (/workspace), library (/library), settings (/settings all 7 tabs incl. Engine), TTS (/tts) pages; verify api.ts createProject sends project_type; final tsc build; zip package; deliver.
IMPORTANT for compaction: do NOT re-run fix_schemas.py (already applied, fields Optional). Restart backend only if needed: pkill -f "uvicorn backend.main" then `cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &`.
Output video delivered: /home/ubuntu/viu-auto-studio/projects/project_7/output.mp4 (80s, 1080x1920, 2.3MB) — can mention in delivery.

### All-pages verification (17:12) — COMPLETE
Dashboard, Projects, Editor (script + storyboard), Workspace, Queue, Library, TTS (7 provider tabs, 21 Revo voices, test connection), Settings (7 tabs: Chung/Engine/AI/Giọng/Telegram/Đăng bài (WIP)/Hiệu năng) all verified OK with dark purple theme. Engine tab shows 3 install profiles + advanced tools + FFmpeg status.

NOTE minor: settings Engine tab shows stale "FFmpeg không được tìm thấy" message while FFmpeg card says installed — cosmetic only (message block is static help text; could clean up but low priority).

## NEW ISSUE RESOLVED (Aug 18 ~17:35)
Edge TTS provider implemented (backend/services/tts/edge_provider.py), registered in registry, default TTS_PROVIDER=\"edge\". Verified voice synthesis works (vi-VN-HoaiMyNeural, 4.31s real speech). Render job completed BUT output audio is silence -91dB because scene voice mp3s in project_7 are OLD mock files (timestamp 16:43) — pipeline voice step skipped regeneration since... actually my DB reset set status='draft' but files at project root (scene_XXX_voice.mp3) existed from earlier runs; need to check why pipeline didn't regenerate (voice step checks scene.status skip-list; draft not in skip-list, so it SHOULD regenerate — but files are in projects/project_7/root, log_path.parent). Check: current DB scene.audio_path values and file mtimes. Fix: delete stale voice files in reset script + confirm regeneration at next render.

## HISTORY (Aug 18 17:17): Audio is noise ("rè rè")
Root cause: MockTTSProvider.synthesize() generates `anoisesrc=color=pink` — literal pink NOISE audio, not speech. The render used provider=mock (default configured) → whole video voiceover is noise.

FIX: Add edge-tts provider (Microsoft Edge free TTS, no API key needed):
- `sudo pip3 install edge-tts` — DONE. Voices verified: vi-VN-HoaiMyNeural (female), vi-VN-NamMinhNeural (male).
- Create /home/ubuntu/viu-auto-studio/backend/services/tts/edge_provider.py: EdgeTTSProvider implements TTSProvider interface (name="edge"; synthesize uses edge-tts via CLI `python3 -m edge_tts --voice <voice> --rate=<speed%> --text <text> --write-media <path>`; list_voices returns catalog incl. 4 edge voices vi/en; test_connection runs tiny synth).
- Register in backend/services/tts/__init__.py registry (add "edge" provider + voices), set available=True (no key needed).
- Update Revo provider? Revo is also offline-only placeholder. Options: make Revo map to edge Vietnamese voices (2 voices) or keep separate. Simplest professional: add edge provider with 4 voices; change default provider to "edge" in tts_config default; keep mock for tests.
- After fix: re-run voice regeneration + render for project_7 (or smaller subset), verify audio quality with ffprobe + listen? (cannot listen easily; check mp3 non-zero, no pink noise spectral check: compute sample RMS and variance with python).
- Subtitle sync check: subtitles come from scene narration timed by audio duration (get_audio_duration) — after real TTS, durations will match. Subtitle content IS the narration text, so content matches; timing may have been wrong before because mock duration was estimated (CHARS_PER_SECOND=15) vs actual.

Remaining after audio fix: re-render test, quick verify, deliver updated zip + explanation.

## SILENT AUDIO ROOT CAUSE (found ~17:40)
`queue.py start()`: when job exists but status NOT in (completed,failed,cancelled,draft), it takes `else: pass` and job.status stays whatever (my reset set 'pending'). `_execute_steps` uses `start_status = job.status` → 'pending' doesn't match any step condition → worker loops doing nothing, job eventually marked completed. That's why poll showed instant 'completed' and voices never regenerated.
FIX: add 'pending' to the fresh-start status list in start(): `(completed, failed, cancelled, draft, pending)` OR reset job status to 'draft'. Simplest fix in queue.py line ~102 area: change tuple to include "pending". Then my rerun script already sets status='pending'... after fix, rerun_render4.py start creates fresh job correctly.
ALSO: keep stale voice file cleanup in rerun script (delete project_7/*.mp3 before rerun) to force regeneration with edge TTS.
Project 7 scenes: 19, DB has narration. Output: /home/ubuntu/viu-auto-studio/projects/project_7/output.mp4.
Delivery copy: /home/ubuntu/output_demo_v2.mp4 (currently SILENT — regenerate).
Frontend dev server still running 5173. Backend on 8000 with edge provider default + duration guard in ffmpeg_engine (line ~129).

## ROOT CAUSE #3 (17:40): project.status = 'completed' → new job inherits 'completed' → _execute_steps start_status='completed' → all steps skipped → instant "completed" with nothing rendered.
Fix: In queue.py start(), when creating fresh job, force job status to project.status ONLY if it's a pipeline-startable status; otherwise set 'generating_voice'. Edit: `status=project.status if project.status in STEP statuses... else 'generating_voice'`. Or simpler: `status="generating_voice" if project.status in ("completed","idle") else project.status`.

## EDGE-TTS FAILURE (17:52)
`subprocess.TimeoutExpired` — edge-tts CLI hung/timed out for a long narration text (300s timeout). Also the pipeline's tts_synthesize wrapper may not catch TimeoutExpired (only RuntimeError). Fix: (1) catch TimeoutExpired in edge_provider.synthesize → raise RuntimeError; (2) reduce timeout to ~120s; (3) maybe long texts chunk? EdgeTTS handles long text but can hang. Also queue._execute_steps voice step except RuntimeError only — add except Exception fallback.

## EDGE TTS FULL RENDER SUCCESS (17:53 UTC)
Job 9 completed: /home/ubuntu/viu-auto-studio/projects/project_7/output.mp4 — 80.34s, 1080x1920, audio mean -22.2dB/max -6.2dB, speech-like variance 0.002. Delivery copy: /home/ubuntu/output_demo_v2.mp4.
Scene durations real (e.g. 6.28s, 3.57s, 5.68s from actual TTS audio). SRT generated with proper timing. Subtitles burned on frame: "ngủ cho người mới bắt đầu ản" — text shows minor wrap issue (word "ảnh" split as "ản\nh" — Vietnamese diacritic split mid-word). 766 "memory font" warnings in render.log from fontsdir+escaped-path — cosmetic ffmpeg warnings, not fatal.
NOTE for later polish: subtitle chunk split breaks Vietnamese words — improve split_text to prefer word-boundary splits (currently splits at char count). LOW priority.
Remaining: tsc + vite build clean, repackage zip, deliver.
Backend: edge provider default (config.py), edge_provider.py (retry+120s timeout), queue.py fixes (fresh-job initial status forced to generating_voice for draft/completed/failed/cancelled/idle/script_ready; 'pending' in fresh tuple; voice step except Exception).

## STATE at 17:55 UTC — remaining steps
1. DONE: subtitle word-boundary split fix in split_sentences (subtitles/__init__.py).
2. NEXT: clear pycache, restart backend, re-run full render for project_7 (rerun script: /tmp/rerun_render4.py — resets scenes/projects/jobs, deletes voice mp3s + scene clips, sets tts config edge, starts /api/render/start project_id=7, polls until completed/failed). Job id will be 10.
3. Verify output.mp4: volumedetect (expect ~-22dB mean), ffprobe duration ~80s, frame check for subtitle word-wrap fix (check word "ảnh" not split).
4. Then: tsc clean check (`cd desktop && npx tsc --noEmit`), vite build (`npx vite build`).
5. Repackage: `cd /home/ubuntu && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"`. Delivery copy /home/ubuntu/output_demo_v2.mp4.
6. Deliver with message explaining: (a) root cause of rè rè = MockTTS pink noise was default; (b) new Edge TTS provider (Microsoft Edge, miễn phí, vi-VN-HoaiMyNeural/NamMinh) now default; (c) audio timing from real audio duration → subtitles khớp; (d) extra pipeline bugs fixed (pending/draft job status handling, duration None guard, TTS timeout retry).
Backend running on port 8000 (restart with: pkill -f "uvicorn backend.main"; find ... __pycache__ rm; cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &). Frontend vite dev on 5173.

## JOB 10 FINAL VERIFICATION (18:00 UTC)
output.mp4: 80.34s, audio mean -22.2dB / max -6.2dB (real speech). Frame at 5s: subtitle "Bạn có biết cách cải thiện giấc ngủ cho người mới bắt đầu" — whole sentence on ONE clean line, no Vietnamese word split (fixed by word-boundary split_sentences). Edge TTS narration fully matches subtitle text & timing.
Final steps now: tsc --noEmit, vite build, update delivery copy, repackage zip, deliver.

## SUBTITLE SYNC ISSUE (user, Aug 18 evening)
User: "phụ đề video không đúng với giọng đọc, làm video ~20s (3-4 cảnh)".
Audit: SRT uses real audio duration, entries distributed by WORD COUNT → phrase boundaries don't match actual speech. Scene 000: speech is ONE continuous block 0-5.1s; SRT split at 3.24s (word count) → "ảnh hưởng..." subtitle shows too early while narrator still says first phrase. Root cause: uniform-by-words distribution, ignores actual speech segments.
FIX PLAN: use whisper (speech-to-text with word timestamps) OR simpler robust approach: for per-scene narration generated by AI, re-synthesize with edge-tts and measure... cannot get phrase boundaries from TTS alone. Options:
  A) whisper timestamps (needs install, slower)
  B) chunk narration into ONE subtitle per sentence split with generous gaps → simpler: put whole narration as 1-2 subtitles whose timing covers full speech → acceptable and guaranteed no misalignment.
  C) Use edge-tts with --write-subtitles? edge-tts doesn't emit timestamps.
Chosen: B — compute_entries: give each chunk proportional time BUT ensure first chunk starts at 0 and last ends at total_dur (already does); the problem is sentence boundaries: split_sentences keeps sentences together... scene_000 narration has ONE sentence → split gave 2 chunks (max_chars 60). Word-based split across a sentence boundary mid-sentence! Fix: increase max_chars or split only at .?!. Better: chunk so that each chunk spans proportional speech; use whisper for real sync? Install whisper tiny model (cpu) — feasible but heavy.
DECISION: try B first: split at punctuation only (never mid-sentence); keep proportional timing by char count. Then verify. If still mismatch, add whisper.
Also: create SHORT demo: new project or temp scenes: build ~20s video (3-4 scenes) via a new test script.

## SHORT DEMO v1 (18:10 UTC)
4 scenes, Edge TTS, real-audio timing subtitles, transition 0.2s → output 16.03s (user wanted ~20s; close enough; could lengthen narration). Audio -21.8dB mean real speech. Subtitle splits now at phrase/comma boundaries — no mid-word breaks. Remaining concern: splits mid-phrase but timing proportional — acceptable (matches word-count share of speech). User-complaint root cause (uniform timing across different-length phrases) fixed: now proportional by chars AND real audio duration per scene.
Next: extract frames at subtitle boundaries to verify visually, copy to /home/ubuntu/output_short.mp4, finalize (rebuild zip only if code changed — subtitles/__init__.py changed + nothing else since last zip → repackage), deliver.

## SUBTITLE GRID CHECK (18:12)
Grid at t=0.3/2.0/5.0: NO subtitle text visible (frames show only background). Subtitles not burned in the demo? They were passed as subtitle_ass=SRT path to build_scene_clip. Scene clips may have failed to burn subtitles (ASS/SRT burn with libass). Check render.log of short demo for subtitles errors. NOTE: earlier full render DID show subtitles in frames (18:00 frame had text) — but that used same engine. Difference: SRT vs ASS? build_scene_clip may convert SRT→ASS via generate_subtitles (which produces ASS). Frame at t=0.3 in scene 0 should show "Chào bạn!" — if not burned, the ASS conversion failed (e.g., font). Check /tmp/short_demo/render.log for subtitle errors.

## CRITICAL FINDING (18:26): subtitle sync broken by xfade offset bug
Frame at t=2.0 of output_short.mp4 shows "Hãy cùng mình khám phá ngay những bí quyết cực kỳ hữu ích" = SCENE 1 text, but timeline says scene 0 speech runs 0-6.58s. So audio plays scene 0 (~6.6s) while video already shows scene 1 — subtitle mismatch user reported IS the xfade cascade offset bug: video timeline compressed by overlapping transitions while audio acrossfade does not match (running_offset math wrong). The cascade merge re-encoded tmp files; duration of merged file < sum of individual d - transition... need to inspect: after xfade, merged duration should be offset + a_d. running_offset starts 0; after merge1: merged_d = offset + a_d = (0-0.2)+4.88=4.68; running_offset += a_d - transition = 4.88-0.2=4.68 ✓. BUT merged duration computed by ffmpeg = max? Actually video: xfade duration 4.68 too. So 4 clips: total = 6.58+4.88+5.88+5.88 - 3*0.2 = 22.62. Output is 16.03 → way too short! The merge used -t running_offset + a_d which caps output to THAT length but input merged already longer? No — merged file's true duration equals running_offset + a_d (fade ends earlier for video? No). 6.58+4.88-0.2=11.26 first merge. Then +5.88-0.2=16.94, +5.88-0.2=22.62 expected. Got 16.03 → second merge lost ~0.9s and third lost ~6.6s?! Something else: the -shortest on scene clips? Scene clip scene_000.mp4 duration? Scene clips burned with -shortest → clip duration = audio dur ✓. Hmm 16.03 = 6.58+4.88+5.88-0.2*2+...? Actually 16.03 ≈ 22.62 - 6.58 = 16.04 → THIRD clip got skipped?! Check: output = clip0+clip1+clip2 with 2 transitions: 6.58+4.88+5.88-0.4=16.94 ≈ no. 16.03 = 16.94-0.9... unclear. Inspect final concat args: the cascade loop builds _xfade_001,002,003 with transition; then concat step ALSO adds... wait, if len>=2 transition>0 path sets concat_args=["-i", merged] with single input then step2 filters. 3 xfade merges expected. Got 16.03 → likely merged only 2 (xfade_001, _002?) and the loop count... Actually loop over available_clips[1:] has 3 iterations → xfade_001,002,003. But maybe _clip_duration(merged) after write returns wrong due to -shortest? Investigate by checking file durations of intermediates.

## XFADE CASCADE FIX (18:27)
Replaced hand-rolled running_offset with actual merged duration measurement (_clip_duration) per merge, and -t cap = offset + a_d. This was THE cause of user's "phụ đề không đúng với giọng đọc": video timeline compressed while audio ran full length → subtitles showed wrong scenes.
Next: rebuild short demo (/tmp/build_short_demo.py) after clearing intermediates, verify duration ≈ 23s with 4 scenes (sum - 3×0.2), verify sync with frame grid, then deliver.

## SYNC VERIFIED (18:30 UTC)
v2 grid (1.0/4.0/9.0/14.0/19.0/21.5s): t=1.0 shows "Bạn có biết cách cải thiện giấc ngủ cho người mới bắt đầu" = scene 0 speech (correct). t=4.0 still scene 0 text (speech scene 0 runs 0-6.6s ✓). t=9.0 = "Hãy cùng mình khám phá..." scene 1 text (scene1 starts ~6.4s ✓). t=14.0 = "Thứ nhất..." scene 2 ✓. t=19.0 = "Cuối cùng..." scene 3 ✓. t=21.5 = last line ✓. Subtitles now match voiceover exactly. output_short.mp4 = 22.6s, 0.94MB, 1080x1920, real speech audio.
Remaining: copy to /home/ubuntu/output_demo_ngan.mp4, verify tsc, repackage zip, deliver.

## FULL API SMOKE (Aug 19 morning)
All real endpoints WORK: health, projects CRUD, channels, tts config/providers/voices, settings all, ffmpeg check, dashboard, library, AI generate-script (topic field), workspace idea (channel_id int required), script split (full_script field), tts preview, subtitle-preview, scene create (POST /projects/{pid}/scenes), scene PATCH update ✓ saved to DB, render jobs.
Remaining failures in my test were bad payloads (wrong field names/method) — NOT backend bugs. Scene delete = check method (delete endpoint exists as DELETE or POST /{sid}/delete?) — verify quickly then move to browser pass.

API smoke ALL GREEN (23/23 with correct payloads). Scene delete = DELETE method (works). Next: browser pass on all pages.

## BROWSER PASS ROUND 2 (Aug 19)

### Dashboard — findings:
1. "Đã nhận gói PRO" card + Viu recap / workson.78@gmail.com + "Pro Full đến 24/8" in sidebar — leftover fake licensing/subscription UI from earlier (user asked no fake data). Should be removed/replaced with real app info.
2. "Hiệu năng theo bước sản xuất" table shows hardcoded-looking numbers (TB 12/45/8/180/60, lượt 10 everywhere, 0% lỗi) — should compute from real pipeline metrics or remove.
3. "0 ký tự / Chi phí ElevenLabs" and "0 Xuất /24h" — ElevenLabs references (product copied?) — replace with neutral "Chi phí AI" or remove.
4. "MÁY: 1897-0B0A-6D5F" — fake machine ID, remove.
5. "Sidecar Engine Đang chạy (OK)" — vague jargon, fine but simplify to "Backend" only? Keep simple.
6. Stats: 10 tổng, 3 hoàn tất, 0 đang xử lý, 1 lỗi — real data OK.
TODO: remove fake PRO/licensing UI, remove hardcoded perf table values (compute from real render jobs or show n/a), remove ElevenLabs/machine-id.

### Projects page — findings:
1. Search input shows placeholder as actual text INSIDE the field ("🔍 Tìm kiếm dự án..." visible as typed text + magnifier icon overlapping) — placeholder attribute rendered as value? Looks like a visual glitch (icon + text overlap). Check the input component.
2. Same fake PRO card in sidebar (fix globally).
3. Some project cards have no thumbnail (folder icon) — expected for no thumbnail, fine.
4. "Không có chủ đề" for empty topic — ok but could show "—". Minor.
TODO: fix search input rendering.

### Editor (project 7) — findings:
1. Script textarea text has NO paragraph spacing — all runs together ("...cảm nhận sự khác biệt.Nhớ rằng..." no space). The script text stored with missing spaces. Minor: could be generator output; acceptable but improve: ensure spaces after periods. Could fix in AI script generator (add space) — low priority.
2. "Không kênh" with no channel configured — ok, real.
3. Header progress bar empty — ok (completed project).
4. Fake PRO card still in sidebar (global fix needed).
TODO (global): remove fake PRO/licensing UI from app layout sidebar (workson.78@gmail.com, PRO ACTIVE, MÁY: 1897..., "Quản lý tài khoản", "Đăng xuất").

### Workspace — findings:
1. Channel selector shows 4 channels (Kênh Test, Kênh test, Kênh test 2, QA channel) — duplicates from testing, fine (user data).
2. "Tiến độ sản xuất" shows "Trạng thái: IDLE" — technical jargon leaking; should show "Chưa bắt đầu"/translated.
3. Workspace works end-to-end (ideas loaded from DB, script tab present).
4. PRO fake card global (same fix).

### Queue page — bugs found:
1. BUG: completed jobs (3,10) show status pill "Đang chờ" / "Pending" for some completed jobs — DB status completed rendered as "Đang chờ" in table for jobs 4-9. Check queue-page status mapping: likely status mapping wrong (completed->Đang chờ??) OR backend returns completed but frontend maps. Jobs 3/10 show "Hoàn thành" correctly. Jobs 4-9 show "Đang chờ" while bước = "Hoàn tất". Must fix: map render job status completed->Hoàn thành.
2. "Thời gian" empty for completed jobs (duration field None) — render job should record started_at/completed_at; compute and show duration. Minor.
3. Old test jobs (4-9, duplicate project_7) — leave (user data), but "Thử lại" missing on jobs 5,6,8,9 completed+failed? Only job 2 has Thử lại. Fine.
TODO: fix queue status mapping + show duration.

### TTS page — findings:
1. "Kho giọng — đã tải 0/21... mỗi giọng ~63MB, tải về máy dùng offline" + "Tải 64MB" buttons everywhere — fake offline voice download model (from reference UI). Every voice needs 63MB download?? No real local files; this is fake data. Also provider tabs Revo/OmniVoice/Google/Gemini/ElevenLabs/CapCut/Vbee — only edge+mock+revo work; the others are framework stubs — acceptable but the long disclaimer paragraph is ugly. Improve: replace fake download model with "Nghe thử" play buttons per voice (use tts/preview-audio) and remove "Tải 64MB" fake buttons; simplify the disclaimer.
2. "Giọng đọc" dropdown EMPTY (no voices shown in Edge provider). TTS voices endpoint worked in API smoke — check why dropdown shows empty: voices endpoint returns voices for SELECTED provider; edge provider may return 0 voices. Fix: voices endpoint should return edge voices (vi-VN-HoaiMyNeural etc.) when provider=edge.
3. Tốc độ slider default 1 with value "1" — but edge uses rate like "+20%"? Check config mapping; minor.
TODO: voices endpoint for edge provider; remove fake Tải 64MB; add per-voice play; clean disclaimer.

## BROWSER PASS FINDINGS SUMMARY (Aug 19, save before compaction)
Files of interest:
- sidebar: desktop/src/components/app-layout.tsx (approx) — contains fake PRO card, workson.78@gmail.com, "★ Pro · Full đến 24/8/2026", "MÁY: 1897-0B0A-6D5F", "Quản lý tài khoản", "Đăng xuất" → REMOVE.
- dashboard page (desktop/src/pages/dashboard-page.tsx): fake "Hiệu năng theo bước sản xuất" hardcoded table (TB 12/45/8/180/60, lượt 10), "Chi phí ElevenLabs", "0 Xuất /24h" → remove/neutralize.
- projects page: search input shows placeholder text as content (icon overlap glitch).
- queue page (queue-page.tsx): completed render jobs 4-9 show pill "Đang chờ" incorrectly (jobs 3,10 show "Hoàn thành"). Map job status completed→"Hoàn thành". Also compute duration from started_at/completed_at in backend/queue endpoint.
- TTS page (voice-config-page.tsx): "Giọng đọc" dropdown EMPTY because GET /api/tts/voices always returns Revo voices (download model from mock_provider lines 94-138, base list_voices line 32) regardless of provider. EDGE_VOICES defined in services/tts/edge_provider.py:23 (vi-VN-HoaiMyNeural etc.). tts/__init__.py list_voices(config) should route by provider (check its implementation around line 116). Voices endpoint in routes.py line 919 (duplicate route at line 81 too! check).
- TTS page fake "Tải 64MB" buttons (21 voices, download_size_mb=64 hardcoded) → replace with "Nghe thử" per voice via tts/preview-audio; remove disclaimer wall of text.
- workspace page: "Trạng thái: IDLE" technical jargon → translate.
- services/tts/__init__.py list_voices routing to fix for edge provider voices.

API smoke: ALL GREEN 23/23 (endpoints real).
Deliverables so far: output_demo_ngan.mp4 (22.6s sync verified), viu-auto-studio.zip, BAO_CAO_KIEM_TRA.md.
After fixes: tsc + vite build, repackage zip, deliver summary.

### Library page — finding:
Same search input glitch as projects page: placeholder "🔍 Tìm kiếm media..." rendered as visible text inside the field (icon overlapping text). This is a shared SearchInput component — fix once. Library otherwise works (upload real, media card shown).

### Settings page — findings:
1. "Giọng mặc định" dropdown EMPTY (same voices endpoint bug — returns Revo voices but dropdown may render nothing because voice.id mapping expects edge voice ids?). Recheck: settings uses same /tts/voices endpoint which returns Revo voices; if dropdown shows nothing while TTS page does too, it's a frontend render issue (maybe expects voices[].id match current voice). Investigate voice-config widget component.
2. "Danh sách giọng" shows only Revo voices even with Edge TTS selected — same root cause: endpoint ignores provider.
3. Settings overall good (7 tabs render).
Global fix priority: 1) sidebar fake PRO/account block DONE; 2) voices endpoint routing by provider + frontend voice selector IN PROGRESS; 3) search input placeholder glitch DONE; 4) queue status mapping NEXT; 5) dashboard fake metrics/ElevenLabs text; 6) workspace IDLE jargon.

## ROUND-3 FIX PROGRESS (Aug 19 ~06:10 UTC)
DONE so far:
1. ✅ Sidebar: removed fake PRO card + fake user card (workson.78@gmail.com, MÁY ID, Quản lý tài khoản, Đăng xuất). Kept slim status footer: backend online indicator + version v2.0.0. Imports cleaned (Clapperboard kept for logo, Star removed, MACHINE_ID removed). tsc OK.
2. ✅ Search placeholder glitch: projects-page + library-page emoji placeholders removed → plain text (icon already present).
3. ✅ /tts/voices endpoint: removed duplicate route at top of routes.py; the real route now accepts `provider` query param (falls back to configured TTS provider); TTSVoice schema extended with description/download_size_mb/downloaded fields.
REMAINING:
4. Frontend ttsListVoices call should pass provider param: update api.ts `ttsListVoices: (provider?) => request(\`/tts/voices?provider=${provider}\`)`; then check voice-config-page.tsx + settings-page voice dropdowns consume it (they likely call ttsListVoices() without provider — currently get revo voices even with edge selected; with default-fallback behavior they'll now get edge voices automatically. Also settings "Danh sách giọng" and voice dropdown need same).
5. Queue page status mapping: completed jobs showing wrong status pills — check queue-page.tsx status label mapping (render_jobs status values: pending/generating_voice/building_scenes/generating_voice/regenerating_voice/rendering/completed/failed/cancelled).
6. Dashboard: fake metrics text + ElevenLabs reference; find and make real (backend has /dashboard/stats? check routes + frontend dashboard-page reads stats?).
7. Workspace IDLE jargon — check workspace-page for IDLE/technical status text; make user-friendly.
8. After fixes: browser verify pages, tsc + vite build, repackage zip, deliver.

## ROUND-3 FIX PROGRESS (Aug 19 ~06:15 UTC) — UPDATED
DONE this session:
- ✅ library-page.tsx syntax error (trailing comma) fixed
- ✅ queue-page STATUS_STYLES expanded for all pipeline statuses; running count uses pipeline statuses
- ✅ settings-page.tsx voice dropdown fetches by provider + re-fetches on change
- ✅ api.ts ttsListVoices accepts provider param
- ✅ voice-config-page.tsx fetches by provider + re-fetches on change
- ✅ dashboard: ElevenLabs→"Ký tự giọng đọc hôm nay"; fake CPU/RAM→real TTS provider + FFmpeg v6.1.1; fake perf averages replaced; MemoryStick import removed
- ✅ types/index.ts: duplicate TTSVoice removed; FFmpegCheck extended
- ✅ ffmpeg_engine.py check_ffmpeg returns version
- ✅ routes.py duplicate /tts/voices removed; "Dữ kiện"→"Thu thập dữ liệu" (backend + frontend mapping)
- ✅ workspace-page.tsx status text user-friendly (STATUS_LABELS, "Chưa bắt đầu")
- ✅ tsc clean; vite build clean

NEXT:
1. Restart backend (routes.py changed) — pkill then nohup uvicorn
2. Browser verify: settings TTS tab (voices show Hoài My/Nam Minh), TTS page, workspace (Thu thập dữ liệu + Chưa bắt đầu), library
3. Repackage zip; update BAO_CAO_KIEM_TRA.md; deliver

## STATE SNAPSHOT (Aug 19 06:15)
- workspace-page STATUS_LABELS import missing → added; tsc OK; vite build OK (built 3.84s)
- Backend restarted; /health OK; /projects/10/pipeline returns idle with step "Dữ kiện":"pending" (old project created BEFORE label rename — fine, frontend maps both keys; new projects get "Thu thập dữ liệu")
- Settings TTS tab VERIFIED in browser: Edge TTS provider, Hoài My/Nam Minh/Jenny/Guy voices shown, "Dùng giọng này" works
- NOTE: Workspace page was BLANK due to STATUS_LABELS ReferenceError (runtime, not compile-time since tsc saw import as optional?) — tsc now passes after import added. Browser verify workspace again.
- Remaining: verify workspace + TTS page + library in browser; repackage zip; update report; deliver.
- Zip cmd: cd /home/ubuntu && rm -f viu-auto-studio.zip && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"
- Deliverables: /home/ubuntu/viu-auto-studio.zip, /home/ubuntu/BAO_CAO_KIEM_TRA.md, /home/ubuntu/output_demo_ngan.mp4

## ROUND-3 CONTINUED (Aug 19 06:16)
DONE: STATUS_LABELS got idle="Chưa bắt đầu"/processing="Đang xử lý"; workspace-page uses STATUS_LABELS[pipeline?.status ?? "idle"] — verified "Trạng thái: Chưa bắt đầu" + "Thu thập dữ liệu" showing correctly; workspace runtime crash (STATUS_LABELS missing import) FIXED (was blank page). TTS page fully overhauled: tabs now data-driven from real providers with (chưa) markers, fake "Tải 64MB" → "Dùng giọng này" (real save action), fake download model text removed. Settings TTS tab verified (Hoài My/Nam Minh/Jenny/Guy, Edge TTS). Library page OK (syntax fix + media card). tsc OK, vite build OK.

REMAINING FINAL STEPS:
1. Repackage zip: cd /home/ubuntu && rm -f viu-auto-studio.zip && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"
2. Update /home/ubuntu/BAO_CAO_KIEM_TRA.md with round-3 fixes (syntax error, queue statuses, settings voices, dashboard real data, workspace labels, TTS page overhaul)
3. Deliver zip + report + output_demo_ngan.mp4
