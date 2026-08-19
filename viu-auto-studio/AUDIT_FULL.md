# AUDIT FULL — Viu Auto Studio (19-08, yêu cầu nâng cấp A→Z)

## Giai đoạn 1: Kiểm kê & phát hiện điểm yếu

### 1.1 Backend hiện có (31 file .py chính)
- api/routes.py (~1300 dòng), models, schemas, config, database
- services: ai (openrouter/gemini/local), tts (edge/mock/local/cloud/base), subtitles, media, script
- pipeline/queue.py (PipelineManager), render/ffmpeg_engine.py, render/preview.py

### 1.2 Frontend hiện có (8 trang + 1 layout + 2 dialog + 2 store + api.ts)

### Hạng mục kiểm tra (đánh dấu khi xong)

#### A. Kiểm tra luồng nghiệp vụ end-to-end thật
- [ ] Luồng "Dự án mới → Kênh → Sinh ý tưởng → Tạo tập → Kịch bản AI → Duyệt → Chia cảnh → Render" đầy đủ tự động
- [ ] Editor đầy đủ 5 tab hoạt động
- [ ] Pipeline tự động (Google Labs storyboard, media)
- [ ] Subtitle sync, preview
- [ ] Settings 7 tabs
- [ ] Upload media, dùng media trong cảnh

#### B. Điểm yếu kỹ thuật nghi ngờ cần xác minh
- [ ] 1. README/hướng dẫn sử dụng: chưa có tài liệu người dùng đầy đủ
- [ ] 2. Onboarding khi app mới: chưa có dự án mẫu/hướng dẫn bước đầu
- [ ] 3. Error boundary React: app crash trắng trang khi lỗi component (đã xảy ra 1 lần)
- [ ] 4. Auto-refresh hàng đợi/dashboard (polling interval hợp lý)
- [ ] 5. Quản lý workspace channel: chưa có tạo kênh inline?
- [ ] 6. Editor preview chưa stream video thực?
- [ ] 7. Pipeline auto: sau duyệt kịch bản → tự split → render? hay thủ công?
- [ ] 8. SEO tab: sinh title/hashtags thật?
- [ ] 9. Thumbnail: sinh ảnh thumbnail?
- [ ] 10. Publish tab (Đăng bài & Lập lịch) đang "đang phát triển" — có nên hoàn thiện?
- [ ] 11. Brand Kit chưa có?
- [ ] 12. Phân tích đối thủ chưa có?
- [ ] 13. Tài khoản Flow / Google Flow login — hiện chỉ nút Flow
- [ ] 14. Undo/redo script? autosave?
- [ ] 15. Export subtitles SRT/ASS riêng?
- [ ] 16. History render (nhiều phiên bản video)?
- [ ] 17. Dark theme nhất quán mọi component?
- [ ] 18. Loading states + skeletons khi tải?
- [ ] 19. Confirm dialog xóa dự án/media?
- [ ] 20. Thông báo lỗi thân thiện thay JSON kỹ thuật?
- [ ] 21. Pipeline status live update (WebSocket/SSE) thay polling?
- [ ] 22. Render progress chi tiết theo bước trong queue?
- [ ] 23. Music background thật: có kho nhạc nền?
- [ ] 24. Logo overlay: upload logo?
- [ ] 25. Transition chọn được? (hiện có transition_duration nhưng UI?)
- [ ] 26. Subtitle font/style chỉnh được trong editor? (có subtitle_config)
- [ ] 27. Voice riêng cho từng cảnh có UI chọn? (regenerate-voice endpoint có)
- [ ] 28. AI generate ideas: thật hay fake? (workspace "Sinh" tạo tập)
- [ ] 29. Stats dashboard có dữ liệu thật theo ngày?
- [ ] 30. Multi-language UI? (vi is enough)

### Kết quả kiểm tra thực tế (điền sau khi chạy)

### Kết quả kiểm tra thực tế (Aug 19 06:25)
Dashboard hiển thị dữ liệu thật (10 dự án, 3 hoàn tất, 1 lỗi, TB từng bước thật, FFmpeg 6.1.1, TTS edge). URL /projects/10/editor bị redirect về / (route cần kiểm tra: App.tsx editor route). Backend: pipeline _execute_steps có 3 bước chính (voice, media, subtitles) + composite render — KHÔNG có bước Google Labs tự động tạo media (chỉ là nút mở Flow trên UI), KHÔNG có sinh thumbnail, KHÔNG có sinh SEO tự động trong pipeline (chỉ script_service), không có music thật (background_music_path từ render_cfg).

### Gap list xác nhận (quyết định nâng cấp):
1. Route /projects/:id/editor bị redirect về / → cần kiểm tra App.tsx route định nghĩa.
2. Không có Error Boundary toàn app → crash trắng trang khi lỗi component.
3. Không có onboarding/guide cho người dùng mới → cần trang hướng dẫn (tour/hướng dẫn A→Z).
4. Pipeline không có bước sinh media AI thật (Google Labs) — hiện fallback màu nền. Cần bước tự động dùng AI image gen? (API miễn phí?) — giải pháp: dùng AI local_provider để sinh prompt-to-media bằng cách gọi API ảnh miễn phí (ví dụ Pollinations.ai no-key) để mỗi cảnh có media thật tự động.
5. Không có sinh SEO thumbnail trong pipeline — thêm script_service dùng model đã có (local/gemini) sinh SEO khi script approve.
6. Không có export SRT — thêm endpoint.
7. Không có music nền + logo thật — có sẵn render_cfg slot; cần UI upload + kho nhạc nền mẫu; có sẵn thư viện media upload.
8. Queue page không có auto-refresh live, render progress không chi tiết — cải thiện polling 2s + thanh tiến độ chi tiết theo bước.
9. Editor preview tab: previewUrl là ass path — chưa có preview video thật sau render (output_path) — kiểm tra tab 5.
10. Không có tài liệu hướng dẫn sử dụng cho người dùng.

## FINAL UPGRADE PLAN (A→Z) — đã chốt

Khẳng định: Pollinations.ai image API hoạt động (200, ảnh 768x768 chất lượng tốt, miễn phí không key) → sẽ dùng làm AI media generator trong pipeline.

### Backend upgrades (Phase 2):
1. `backend/services/media/__init__.py` — thêm `generate_ai_image(prompt, out_path, width, height)` dùng Pollinations.ai (timeout 90s, retry 1 lần, validate JPEG).
2. `backend/pipeline/queue.py` _execute_steps Step 2 — khi cảnh chưa có media và `visual_prompt` có nội dung: gọi generate_ai_image → media thật tự động (cảnh báo khi prompt rỗng, fallback màu nền). Thêm trạng thái trung gian "generating_media" nếu cần.
3. `backend/services/script_service.py` hoặc endpoint mới — sinh SEO (title/hashtags/tags) khi script approve bằng provider AI đã có (ai_generate function trong openrouter.py/local_provider.py) — gọi qua `/projects/{id}/generate-seo`.
4. Endpoint `POST /projects/{id}/export-subtitles` — export SRT từ scenes (thời điểm thật từ audio).
5. Error handling: đảm bảo mọi route trả lỗi thân thiện (detail JSON tiếng Việt).
6. Pipeline status polling: thêm tổng thời lượng ước tính vào response (render/jobs đã có progress).

### Frontend upgrades (Phase 3):
1. Error Boundary toàn app (components/ErrorBoundary.tsx + App.tsx bọc).
2. App.tsx route: /projects/:id — ok rồi (redirect là do route khác). Kiểm tra lại.
3. Queue page: auto-refresh 2s khi có job đang chạy; progress bar chi tiết theo bước; log viewer cho từng job (endpoint /log đã có).
4. Editor: tab 5 thêm "Xuất SRT" button; khi render xong hiện video output (đã có line 1090 — kiểm tra hiển thị).
5. Trang HƯỚNG DẪN mới /guide: tour A→Z bằng tiếng Việt (tạo kênh → dự án → kịch bản → voice → media → render) với screenshots mô tả, lưu "đã đọc" vào localStorage. Thêm entry sidebar.
6. Onboarding: khi chưa có dự án nào → dashboard hiện hướng dẫn bắt đầu nhanh thay trống trơn.
7. Settings: kiểm tra 7 tabs đầy đủ.

### Phase 4: E2E test toàn luồng mới (tạo dự án → sinh kịch bản → approve → split → render auto media AI thật → video có giọng + phụ đề + media thật ~20-30s) + tsc + vite build + repackage.
### Phase 5: Hướng dẫn sử dụng BAO_CAO_KIEM_TRA + HDSD.md đầy đủ + deliver.

## PROGRESS LOG (Phase 2)
DONE backend: generate_ai_image (media/__init__.py, Pollinations, validate JPEG); pipeline queue.py Step 2 auto-sinh ảnh AI từ visual_prompt + fallback nền màu; generate_text helper (provider.py) + OpenRouterProvider.generate_text + GeminiProvider.generate_text; routes: POST /projects/{id}/generate-seo + GET /projects/{id}/export-subtitles (SRT); imports re/Response added; py_compile OK.

REMAINING backend: nothing critical. Restart backend after clearing pycache, test new endpoints.
Phase 3 frontend: api.ts add exportSubtitles + generateSeo + subtitlesDownload; ErrorBoundary; queue auto-refresh + log viewer; editor SRT export button; guide page /guide + sidebar entry; dashboard empty-state onboarding.
Phase 4: E2E test luồng mới (dự án mới → sinh kịch bản → approve → build-scenes → render pipeline auto media AI → video ~20-30s có giọng thật + media thật), tsc, build, zip.
Phase 5: HDSD.md (hướng dẫn người dùng A→Z) + cập nhật BAO_CAO_KIEM_TRA.md + deliver.

## STATE SNAPSHOT (Aug 19 06:30)
Backend restarted OK. generate-seo endpoint fixed: local provider now returns real templated SEO (title/description/hashtags/tags) instead of placeholder JSON. export-subtitles works (project 10 has no scenes yet — expected "Chưa có phân cảnh"). Next: test generate-seo again → expect real SEO saved. Then Phase 3 frontend.

Frontend phase-3 tasks:
1. api.ts: add generateSeo(id), exportSubtitles(id) → download trigger.
2. components/ErrorBoundary.tsx + wrap in App.tsx.
3. queue-page: auto-refresh 2s when running job; job log modal (endpoint /render/jobs/{id}/log exists).
4. editor page: "Xuất SRT" button in subtitles tab (line ~905); SEO tab: "Sinh SEO AI" button.
5. New page: guide-page /guide (bước A→Z hướng dẫn), add sidebar entry in app-layout.tsx.
6. dashboard empty-state onboarding (optional).
7. Then E2E test: create project → generate script → approve → build-scenes → render pipeline (auto AI media + voice + subtitles) → verify video ~20-30s.
8. tsc + vite build + repackage zip + update BAO_CAO_KIEM_TRA.md + write HDSD.md → deliver.
Services: backend :8000 (started via cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &), frontend :5173 (cd desktop && nohup pnpm dev > /tmp/vas_vite.log 2>&1 &).
Zip: cd /home/ubuntu && rm -f viu-auto-studio.zip && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"

## STATE SNAPSHOT (Aug 19 06:55)
Phase 3 progress DONE: api.ts generateSeo + exportSubtitles; ErrorBoundary.tsx created + wrapped App.tsx with /guide route; queue-page: log viewer modal (openLog via fetch /api/render/jobs/{id}/log, handles data.lines array), refresh 2s, FileText import; editor: generateSeoAi button (seoGenerating state, re-fetches script after) + Xuất SRT button (Download icon, link download trigger) in SubtitleConfigPanel; guide-page.tsx created (10 steps + FAQ, uses useAppStore markOnboarded/localStorage vas.onboarded); app-layout.tsx added "Hướng dẫn" nav (BookOpen); app-store.ts onboarded + markOnboarded added.

REMAINING Phase 3: (a) dashboard onboarding CTA when total_projects=0 — stats renders at line 107 `stats[s.key as keyof DashboardStats]`; maybe add a banner above activity. (b) run tsc --noEmit.
Phase 4: backend restarted? last restart OK. E2E test: tạo dự án mới → sinh kịch bản → approve → build-scenes → render (auto AI media) → verify video ~20-30s with voice+media. Then tsc + vite build + zip repack.
Phase 5: HDSD.md + BAO_CAO_KIEM_TRA.md update + deliver.
Zip cmd: cd /home/ubuntu && rm -f viu-auto-studio.zip && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"
Services: backend :8000 (start: cd /home/ubuntu/viu-auto-studio && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &; pkill -f "uvicorn backend.main" alone first), frontend :5173.
Note: guide-page.tsx imports `navigate` from useLocation (unused var — tsc may warn but not error; also markOnboarded on mount — fine).
Dashboard stats keys: total_projects, completed_projects etc (line 24+); DashboardStats type in types/index.ts.

## STATE SNAPSHOT (Aug 19 07:05)
Phase 3 & 4 in progress. Done so far in round 4: guide page + sidebar nav + onboarded store + dashboard onboarding CTA + ErrorBoundary + queue log viewer + Xuất SRT + Sinh SEO AI + tsc clean + guide page verified in browser.

E2E test (project 11, 29 scenes short 9:16): script submitted/approved/split/build-scenes OK, render started job 11. Pollinations AI images take ~45s each; 29 scenes too slow but works. Fixed: per-scene progress 35→55% during preparing_media (queue.py). Backend restarted → job 11 daemon killed → added retry recovery for stuck/active jobs (queue.py retry: non-final status resets to pending and retries).

NEXT STEPS:
1. pkill -f "uvicorn backend.main" alone; sleep 2; then restart: cd /home/ubuntu/viu-auto-studio && find backend -name __pycache__ -exec rm -rf {} + && nohup python3 -m uvicorn backend.main:app --port 8000 > /tmp/vas_backend.log 2>&1 &
2. Retry job 11: curl -X POST http://localhost:8000/api/render/jobs/11/retry -H "Content-Type: application/json" -d '{"config":{}}' — should restart from preparing_media, resuming at scene 21 (media already exists). Then poll until completed (~10 min for 8 remaining scenes + concat + subtitles + composite).
3. IMPORTANT: while render runs, also verify in browser: dashboard onboarding hidden (project 11 exists), queue page log viewer, SEO button, SRT export.
4. After completion: verify output.mp4 exists, duration ~30-40s (29 scenes short) — note user asked ~20s; project_11 is test only; final demo video already delivered (output_demo_ngan.mp4 ~22s, project 7 based).
5. tsc --noEmit + vite build. Repackage: cd /home/ubuntu && rm -f viu-auto-studio.zip && zip -r viu-auto-studio.zip viu-auto-studio/ --exclude "*/node_modules/*" --exclude "*/.git/*" --exclude "*/dist/*" --exclude "*/data/*.db-wal" --exclude "*/data/*.db-shm"
6. Update BAO_CAO_KIEM_TRA.md with round-4 (nâng cấp toàn diện A-Z) section.
7. Phase 5: write HDSD.md (detailed user guide file) and deliver: zip + report + HDSD + demo video.
Existing deliverables: /home/ubuntu/BAO_CAO_KIEM_TRA.md, /home/ubuntu/output_demo_ngan.mp4, /home/ubuntu/viu-auto-studio.zip (stale, needs repack).
Frontend :5173 dev server running.

## ROUND 5 — Google Labs image integration (Aug 19 07:25)

User sent: /home/ubuntu/upload/2026-08-1913-52-24.mkv (demo video, converted to /tmp/demo_user.mp4) and /home/ubuntu/upload/1.1.8_0.zip (Revo Studio Chrome extension sample, extracted at /home/ubuntu/revo_sample/1.1.8_0). Full analysis saved at /home/ubuntu/viu-auto-studio/ANALYSIS_GOOGLE_LABS.md.

**Key findings:** Revo Studio = Chrome Extension automating labs.google/fx: content-script on labs.google tab types prompt into slate editor [contenteditable="true"][data-slate-editor="true"], clicks IMAGE tab button[id*="trigger-IMAGE"], LANDSCAPE/PORTRAIT button[id*="trigger-PORTRAIT"], submit icon i.google-symbols text arrow_forward, waits for [data-tile-id] img with src, gets media via labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=... Prompts use Gemini with style prefix "Bright flat vector cartoon illustration, clean lines, vibrant colors, minimalist style, no text, no watermark, high detail". Model Nano Banana 2.

**Verified in sandbox:** labs.google redirects to new "Google Flow" surface (labs.google/fx/vi/tools/flow, title "Google Flow – Studio sáng tạo AI..."). Editor exists at labs.google/fx/vi/tools/flow/imagen with contenteditable editor, BUT requires Google sign-in (sign_in_wall=True). So Labs automation works on user's real machine after Google login; in sandbox it falls back to Pollinations.

**Implementation done so far:**
1. NEW file /home/ubuntu/viu-auto-studio/backend/services/media/google_labs.py — playwright persistent-context automation (executable /usr/bin/chromium, headless=False, profile /home/ubuntu/viu-auto-studio/data/labs_profile), generate_labs_image(prompt, out_path, portrait) → True/None. Playwright installed (system python: /usr/local/lib/python3.12/dist-packages/playwright). NOTE: rewrite to use launch_persistent_context NOT args --user-data-dir (playwright rejects it).
2. queue.py media step: tries Labs if get_labs_config(db)["enabled"], falls back to Pollinations. get_labs_config NOT YET DEFINED — must add to routes.py (like get_tts_config).
3. Job 11 render already completed earlier (output.mp4 at /home/ubuntu/viu-auto-studio/projects/project_11/output.mp4).

**Still TODO:**
1. Add get_labs_config(db) — store in same settings table or a labs_config DB model (like TTSConfig); add API routes /settings/labs (get/set enabled) and maybe check-signed-in endpoint.
2. Frontend: Settings page new tab or section "Nguồn ảnh AI" — toggle Google Labs on/off + note "yêu cầu đăng nhập Google trên máy tính của bạn". Keep Pollinations fallback documented.
3. Backend syntax check: python3 -c "import backend.main" ; restart backend; frontend tsc.
4. E2E: labs disabled by default → pipeline uses Pollinations (already proven working with job 11). Verify a scene image in output. Test labs flow manually with playwright against flow/imagen editor if needed (sign-in wall in sandbox).
5. Re-check memory pressure warning (free -m). Job 11 ffmpeg completed.
6. Phase 4: tsc, vite build, repack zip (exclude node_modules/.git/dist/data/*.db-wal), update BAO_CAO_KIEM_TRA.md with round-5 section, write HDSD user guide (phase 5), deliver zip + report + HDSD + output_demo_ngan.mp4.
7. Guide page already exists at /guide (10 steps); update step 6 to mention Google Labs provider option.

## ROUND 4 — GOOGLE LABS IMAGE INTEGRATION (Aug 19 ~07:15)

### Reference system analysis (user's 1.1.8_0.zip + video):
- Revo Studio = Chrome Extension that automates labs.google in the USER's real browser:
  opens labs.google/fx (Flow/ImageFX), types visual prompt, selects Nano Banana 2 model,
  submits, waits for image, downloads it, assigns to each scene.
- In sandbox: labs.google requires Google sign-in → automation blocked unless signed in.
- Solution: keep Pollinations.ai as default (free, no key), add Google Labs as optional provider.

### Implemented:
1. `backend/services/media/google_labs.py` — Playwright headful automation with
   `launch_persistent_context` (data/labs_profile), opens labs.google/fx/vi/tools/flow,
   checks signed-in via contenteditable editor + no sign-in button, clicks IMAGE tab,
   fills prompt, submits, waits for generation, downloads image. Returns False if not signed-in.
2. `backend/services/media/config.py` — labs_config settings (enabled bool) stored in app_settings.
3. `backend/pipeline/queue.py` — media step now: if labs enabled → try google_labs → on fail/not-signed-in → Pollinations fallback → else keep existing scene media.
4. `backend/api/routes.py` — new endpoints: GET/POST /labs/config, GET /labs/check (checks chromium+playwright on machine).
5. `desktop/src/services/api.ts` — labsGetConfig, labsSaveConfig, labsCheck.
6. `desktop/src/pages/settings-page.tsx` — AI tab now has "Nguồn tạo ảnh AI cho từng cảnh" card with switch,
   capability check badge, "Mở Google Labs để đăng nhập" button, "Kiểm tra lại" button.
7. Verified in browser: settings AI tab renders correctly, labs/check returns
   {can_automate:true, has_chromium:true, has_playwright:true}.

### Remaining:
- Verify labs automation works against labs.google with a signed-in test (sandbox blocked;
  document for user: must sign in on their machine).
- Update guide page with Labs setup steps (step about image source).
- Run full pipeline test with labs enabled (will fall back to Pollinations in sandbox).
- tsc/vite build clean already confirmed before UI edit.
