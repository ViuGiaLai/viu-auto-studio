// scripts/background.js — Flow Connector service worker
// LUỒNG TẢI FILE ĐÚNG (không ghi thẳng vào thư mục project):
//   1. Extension tải file thật từ Flow về Downloads/ViuAutoStudio/{project_id}/{task_id}/
//   2. File hoàn tất → đọc Blob → upload multipart lên
//      POST /api/connector/tasks/{task_id}/ingest
//   3. Backend xác minh file (ffprobe/magic bytes), lưu vào
//      projects/project_X/scenes/scene_XXX_flow.{ext đúng định dạng thật}, gắn đúng scene_id
// - Đăng ký worker với backend khi khởi động (resume sau khi Chrome đóng/mở lại)
// - Heartbeat mỗi 10s; poll /tasks sẽ trả lại task pending đang chờ worker này

// ---------- API base URL — động, không hardcode máy phát triển ----------
// Người dùng cấu hình ở options page → lưu chrome.storage.local vasApiBase.
// Electron/ứng dụng cũng có thể ghi giá trị này tự động.
let API_BASE = 'http://127.0.0.1:8000/api';
let workerId = null;

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

// Cập nhật API_BASE khi người dùng đổi cấu hình ở options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vasApiBase) {
    const v = changes.vasApiBase.newValue;
    if (v && String(v).startsWith('http')) {
      API_BASE = String(v).replace(/\/+$/, '') + '/api';
    }
  }
});

// ---------- Worker identity ----------
function getWorkerId() {
  return new Promise((resolve) => {
    if (workerId) return resolve(workerId);
    chrome.storage.local.get('vasWorkerId', (st) => {
      if (st?.vasWorkerId) { workerId = st.vasWorkerId; return resolve(workerId); }
      const id = 'vas-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      chrome.storage.local.set({ vasWorkerId: id }, () => {
        workerId = id;
        resolve(id);
      });
    });
  });
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      try { const j = await res.json(); return { ok: false, error: j.detail || j.message || `HTTP ${res.status}` }; }
      catch (_) { return { ok: false, error: `HTTP ${res.status}` }; }
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ---------- Registration with backend ----------
async function registerWithBackend() {
  const id = await getWorkerId();
  workerId = id;
  await apiPost('/connector/register', { worker_id: id, version: '1.0.1' });
}

// ---------- Download session tracking ----------
// downloadId -> { taskId, sceneId, projectId, mediaType }
const downloadSessions = new Map();

chrome.downloads.onChanged.addListener((delta) => {
  const session = downloadSessions.get(delta.id);
  if (!session) return;
  if (delta.state?.current === 'complete') {
    // Upload file THẬT dạng multipart về backend (ingest)
    chrome.downloads.search({ id: delta.id }, (items) => {
      const item = items?.[0];
      if (!item) {
        apiPost(`/connector/tasks/${session.taskId}/fail`, { error: 'Không tìm thấy file đã tải' });
        downloadSessions.delete(delta.id);
        return;
      }
      fetch(item.url || item.fileUrl || chrome.downloads.getFileUrl?.(delta.id) || item.url)
        .then((r) => r.blob())
        .then((blob) => {
          if (!blob || blob.size < 1024) {
            apiPost(`/connector/tasks/${session.taskId}/fail`, { error: 'File tải về quá nhỏ, không phải media thật' });
            downloadSessions.delete(delta.id);
            return;
          }
          const fd = new FormData();
          const ext = (item.filename || 'media').split('.').pop() || 'bin';
          fd.append('file', blob, `scene_${session.sceneId}_flow.${ext}`);
          fetch(`${API_BASE}/connector/tasks/${session.taskId}/ingest`, { method: 'POST', body: fd })
            .then(async (res) => {
              if (!res.ok) {
                let txt = `HTTP ${res.status}`;
                try { const j = await res.json(); txt = j.detail || txt; } catch (_) {}
                apiPost(`/connector/tasks/${session.taskId}/fail`, { error: `Ingest lỗi: ${txt}` });
              } else {
                const j = await res.json();
                apiPost(`/connector/tasks/${session.taskId}/progress`, {
                  phase: 'completed',
                  percent: 100,
                  message: `File thật đã được backend xác minh và gắn vào scene (path: ${j.media_path || ''})`,
                });
              }
            })
            .catch((err) => {
              apiPost(`/connector/tasks/${session.taskId}/fail`, { error: `Upload ingest lỗi: ${String(err)}` });
            })
            .finally(() => downloadSessions.delete(delta.id));
        })
        .catch((err) => {
          apiPost(`/connector/tasks/${session.taskId}/fail`, { error: `Không đọc được file: ${String(err)}` });
          downloadSessions.delete(delta.id);
        });
    });
  } else if (delta.state?.current === 'interrupted' || delta.state?.current === 'cancelled') {
    apiPost(`/connector/tasks/${session.taskId}/fail`, {
      error: `Tải file bị gián đoạn: ${delta.state?.current}`,
    });
    downloadSessions.delete(delta.id);
  }
});

// ---------- Message handling ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === '__VAS_GET_TAB_ID') {
      sendResponse({ tabId: sender.tab?.id || 0 });
      return;
    }
    if (msg.type === 'VAS_START_DOWNLOAD') {
      try {
        const filename = `ViuAutoStudio/${msg.projectId}/${msg.taskId}/scene_${msg.sceneId}_${Date.now()}.${(msg.filename || 'media').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const dlId = await new Promise((resolve) => {
          chrome.downloads.download({
            url: msg.url,
            filename: filename,
            saveAs: false,
            conflictAction: 'uniquify',
          }, (id) => resolve(id));
        });
        if (dlId === undefined) {
          sendResponse({ ok: false, error: 'chrome.downloads không hỗ trợ filename lồng thư mục trên máy này; dùng Blob upload trực tiếp từ content script thay thế' });
          return;
        }
        downloadSessions.set(dlId, {
          taskId: msg.taskId,
          sceneId: msg.sceneId,
          projectId: msg.projectId,
          mediaType: msg.mediaType,
        });
        sendResponse({ ok: true, downloadId: dlId, filename });
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg.type === 'VAS_UPLOAD_FILE') {
      // Content script đã lấy Blob (fetch từ URL media của Flow) → upload multipart
      try {
        const blob = await (await fetch(msg.url)).blob();
        if (!blob || blob.size < 1024) {
          sendResponse({ ok: false, error: 'Blob quá nhỏ, không phải media thật' });
          return;
        }
        const fd = new FormData();
        const ext = (msg.filename || 'media').split('.').pop() || 'bin';
        fd.append('file', blob, `scene_${msg.sceneId}_flow.${ext}`);
        const res = await fetch(`${API_BASE}/connector/tasks/${msg.taskId}/ingest`, { method: 'POST', body: fd });
        if (!res.ok) {
          let txt = `HTTP ${res.status}`;
          try { const j = await res.json(); txt = j.detail || txt; } catch (_) {}
          sendResponse({ ok: false, error: txt });
        } else {
          const j = await res.json();
          apiPost(`/connector/tasks/${msg.taskId}/progress`, {
            phase: 'completed',
            percent: 100,
            message: `File thật đã được backend xác minh và gắn vào scene (path: ${j.media_path || ''})`,
          });
          sendResponse({ ok: true, media_path: j.media_path, format: j.media_format });
        }
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg.type === 'VAS_REGISTER_DONE') {
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: 'unknown message' });
  })();
  return true; // keep message channel open for async response
});

// ---------- Startup ----------
async function startup() {
  await loadApiBase();
  await registerWithBackend();
}
chrome.runtime.onInstalled.addListener(() => { void startup(); });
void startup();

// Heartbeat registration every 10s (kể cả sau khi Chrome đóng/mở lại)
setInterval(() => registerWithBackend().catch(() => {}), 10000);
