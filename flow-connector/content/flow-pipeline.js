// flow-pipeline.js — Flow Connector main pipeline
// Polls FastAPI for per-scene media tasks, drives Google Flow autonomously, tracks tiles,
// triggers real downloads, and reports results back. Runs on labs.google/fx pages.
// Communication with background: window.__vasBgMessage / CustomEvent; background handles downloads.

(() => {
  if (window.__VASPipelineLoaded) return;
  window.__VASPipelineLoaded = true;

  const S = window.__VAS_SELECTORS || {};
  const A = window.__VASAutomation || {};
  const sleep = A?.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  let API_BASE = 'http://127.0.0.1:8000/api';
  let WORKER_ID = '';

  // ---------- API base URL — động, không hardcode máy phát triển ----------
  // Ưu tiên: chrome.storage.local vasApiBase (người dùng cấu hình ở options page)
  // Electron cũng có thể ghi %APPDATA%/ViuAutoStudio/extension-config.json — extension đọc qua storage.
  function loadApiBase() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get('vasApiBase', (st) => {
          if (st?.vasApiBase && String(st.vasApiBase).startsWith('http')) {
            API_BASE = String(st.vasApiBase).replace(/\/+$/, '') + '/api';
          }
          resolve();
        });
      } catch (_) { resolve(); }
    });
  }
  let running = false;
  let currentProjectId = null;

  const apiGet = async (path) => {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
    return res.json();
  };
  const apiPost = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try { const j = await res.json(); err = j.detail || j.message || JSON.stringify(j); } catch (_) {}
      throw new Error(`API ${path}: ${err}`);
    }
    return res.json();
  };

  // ---------- Bridge injection (MAIN world) ----------
  async function ensureBridge() {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: (await getSelfTabId()), allFrames: true },
        files: ['content/page-bridge.js'],
        world: 'MAIN',
      });
    } catch (_) { /* bridge may already be injected or scripting denied; page-bridge.js also declared web_accessible */ }
  }
  function getSelfTabId() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: '__VAS_GET_TAB_ID' }, (r) => {
        resolve(r?.tabId || 0);
      });
    });
  }

  // ---------- Worker identity ----------
  function getWorkerId() {
    return new Promise((resolve) => {
      chrome.storage.local.get('vasWorkerId', (st) => {
        if (st?.vasWorkerId) return resolve(st.vasWorkerId);
        const id = 'vas-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        chrome.storage.local.set({ vasWorkerId: id }, () => resolve(id));
      });
    });
  }

  // ---------- Task processing ----------
  async function processTask(task) {
    const reportProgress = async (phase, percent, message) => {
      try { await apiPost(`/connector/tasks/${task.task_id}/progress`, { phase, percent, message }); } catch (_) {}
    };

    await reportProgress('starting', 0, `Bắt đầu tạo media cho cảnh #${task.scene_order || task.scene_id}`);

    // 1. Navigate to Flow tools page
    await reportProgress('opening_flow', 2, 'Mở Google Flow...');
    await A.waitForEditorEmpty ? null : null;
    const url = 'https://labs.google/fx/vi/tools/flow';
    const currentUrl = window.location.href;
    if (!currentUrl.includes('tools/flow')) {
      window.location.href = url;
      // wait for navigation — content script reloads, but pipeline should re-init;
      // so instead of redirecting ourselves, we rely on background to open a NEW tab per task.
      throw new Error('[VAS] Nội dung script tải lại khi điều hướng — background sẽ mở tab mới');
    }

    // 2. Wait for Flow page ready
    await A.waitForElement(S.PROMPT_INPUT, 20000);

    // 3. Create new Flow project (editor + canvas)
    await reportProgress('creating_project', 5, 'Tạo dự án Flow mới...');
    const newBtn = await A.waitForNewProjectButton(25000);
    await A.simulateClick(newBtn);
    await sleep(4000);

    // 4. Configure mode / aspect / model
    await reportProgress('configuring', 10, `Cấu hình ${task.mode || 'image'} · ${task.aspect || '16:9'} · ${task.model}...`);
    const taskCfg = { mode: task.mode || 'image', aspect: task.aspect || '16:9', model: task.model };
    await A.configureFlowEditor(taskCfg);

    // 5. Fill prompt & submit
    await reportProgress('submitting', 25, 'Nhập prompt và bấm tạo...');
    const promptText = task.prompt || '';
    if (!promptText.trim()) throw new Error('[VAS] Prompt cảnh trống — không thể tạo media');
    await A.fillPrompt(promptText, true, 3);
    await sleep(800);
    const edText = document.querySelector(S.PROMPT_INPUT)?.textContent?.trim() || '';
    if (!edText) throw new Error('[VAS] Prompt không được nhập vào editor Flow — kiểm tra lại phiên đăng nhập');
    await A.submitWithVerification({ maxAttempts: 4, verifyTimeout: 15000 });
    await sleep(2500);

    // 6. Track tiles until media done
    await reportProgress('generating', 30, 'Chờ Flow tạo media...');
    const result = await A.waitForTileDone(600000, 1500, (p) => {
      reportProgress(p.phase, 30 + Math.round(p.percent * 0.6), p.message).catch(() => {});
    });

    // 7. Tải file media THẬT từ Flow và upload về backend qua /ingest
    //    (backend xác minh + lưu vào thư mục project — extension KHÔNG ghi thẳng vào project dir)
    const mediaName = result.name || (task.mode === 'video' ? `scene_${task.scene_id}.mp4` : `scene_${task.scene_id}.png`);
    await reportProgress('downloading', 90, 'Đang tải file media thật từ Flow...');
    const downloadUrl = `${S.MEDIA_URL}${encodeURIComponent(result.name || result.url.split('name=')[1]?.split('&')[0] || '')}`;

    // Cách chính: fetch Blob trực tiếp (đúng luồng: extension → backend ingest)
    try {
      const resp = await fetch(downloadUrl);
      if (!resp.ok) throw new Error(`Flow trả HTTP ${resp.status} khi tải media`);
      const blob = await resp.blob();
      if (!blob || blob.size < 1024) throw new Error('File Flow tải về quá nhỏ, không phải media thật');
      await reportProgress('downloading', 97, `File thật ${Math.round(blob.size / 1024)} KB — đang gửi để xác minh...`);
      const up = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'VAS_UPLOAD_FILE', url: downloadUrl, filename: mediaName, taskId: task.task_id, sceneId: task.scene_id, projectId: task.project_id },
          (r) => resolve(r)
        );
      });
      if (chrome.runtime.lastError || !up?.ok)
        throw new Error('Upload file về backend thất bại: ' + (chrome.runtime.lastError?.message || up?.error || 'background không phản hồi'));
    } catch (blobErr) {
      // Fallback: nhờ background dùng chrome.downloads rồi upload tiếp (máy chặn fetch cross-origin)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('[VAS] Tải file không phản hồi sau 120s')), 120000);
        window.addEventListener('__vasDownloadDone', (e) => {
          clearTimeout(timer);
          if (e.detail?.ok) resolve();
          else reject(new Error(e.detail?.error || '[VAS] Tải file thất bại'));
        }, { once: true });
        window.dispatchEvent(new CustomEvent('__vasStartDownload', {
          detail: { url: downloadUrl, filename: `scene_${task.scene_id}_${mediaName}`, projectId: task.project_id },
        }));
      });
    }

    await reportProgress('completing', 100, 'Hoàn tất — file thật đã được backend xác minh và gắn vào scene');
    return { url: downloadUrl, name: mediaName };
  }

  // ---------- Main loop ----------
  async function pollAndRun() {
    try {
      const tasks = await apiGet(`/connector/tasks?worker_id=${WORKER_ID}`);
      if (!tasks?.length) return;
      for (const task of tasks) {
        try {
          running = true;
          currentProjectId = task.project_id;
          await apiPost(`/connector/tasks/${task.task_id}/progress`, { phase: 'assigned', percent: 0, message: 'Extension nhận task' });
          await processTask(task);
        } catch (err) {
          try { await apiPost(`/connector/tasks/${task.task_id}/fail`, { error: String(err.message || err) }); } catch (_) {}
        } finally {
          running = false;
        }
      }
    } catch (_) { /* backend offline — retry next cycle */ }
  }

  async function init() {
    // Đọc API URL động từ storage (options page / Electron ghi)
    await loadApiBase();
    // Inject MAIN-world bridge
    await ensureBridge();
    WORKER_ID = await getWorkerId();
    // Register with backend
    try {
      await apiPost('/connector/register', { worker_id: WORKER_ID, version: '1.0.0' });
    } catch (_) {}
    // Poll every 4s
    setInterval(pollAndRun, 4000);
    pollAndRun().catch(() => {});
  }

  // Handle download start dispatched from processTask (via background relay)
  window.addEventListener('__vasStartDownload', (e) => {
    // Forward to background service worker which owns chrome.downloads
    chrome.runtime.sendMessage({ type: 'VAS_START_DOWNLOAD', ...e.detail }, (r) => {
      if (chrome.runtime.lastError || !r?.ok) {
        window.dispatchEvent(new CustomEvent('__vasDownloadDone', { detail: { ok: false, error: chrome.runtime.lastError?.message || 'background không phản hồi' } }));
      }
    });
  });

  if (document.readyState === 'complete') init().catch(() => {});
  else window.addEventListener('load', () => init().catch(() => {}));
})();
