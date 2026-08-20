const VERSION = chrome.runtime.getManifest().version;
const WORKER_ID_KEY = 'workerId';
let busy = false;

async function config() {
  return chrome.storage.local.get([
    'apiBaseUrl',
    'paired',
    'bootstrapToken',
    'factorySessionId',
    'flowUrl',
    'autoFactory',
    WORKER_ID_KEY,
  ]);
}

async function workerId() {
  const saved = await config();
  if (saved[WORKER_ID_KEY]) return saved[WORKER_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [WORKER_ID_KEY]: id });
  return id;
}

function base(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('API URL không hợp lệ');
  return url.origin;
}

async function request(path, init = {}) {
  const saved = await config();
  if (!saved.apiBaseUrl) throw new Error('Flow Connector chưa có API URL');
  const headers = new Headers(init.headers || {});
  if (saved.bootstrapToken) headers.set('x-viu-flow-token', saved.bootstrapToken);
  const response = await fetch(`${base(saved.apiBaseUrl)}${path}`, { ...init, headers });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function activeFlowTab() {
  const tabs = await chrome.tabs.query({ url: 'https://labs.google/fx/*' });
  return tabs.find((tab) => tab.id) || null;
}

async function flowPageStatus() {
  const tab = await activeFlowTab();
  if (!tab?.id) return { loggedIn: false, ready: false, reason: 'flow_tab_missing' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'VAS_GET_STATUS' });
    return { loggedIn: Boolean(result?.loggedIn), ready: Boolean(result?.ready), reason: result?.reason || '' };
  } catch (error) {
    return { loggedIn: false, ready: false, reason: String(error?.message || error) };
  }
}

async function syncFlowState() {
  const saved = await config();
  if (!saved.apiBaseUrl || !saved.bootstrapToken) return { ready: false, loggedIn: false };
  const page = await flowPageStatus();
  const state = await request('/api/flow-connection/factory/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      extension_id: await workerId(),
      extension_version: VERSION,
      extension_name: 'Viu Flow Connector',
      profile_name: 'Viu Flow Chrome profile',
      factory_session_id: saved.factorySessionId || '',
      logged_in: page.loggedIn,
      ready: page.ready,
      flow_reason: page.reason,
    }),
  });
  return { ...page, backend: state };
}

async function heartbeat() {
  const saved = await config();
  if (!saved.paired || !saved.apiBaseUrl || !saved.bootstrapToken) return;
  const id = await workerId();
  const state = await syncFlowState();
  await request('/api/flow-connection/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      extension_id: id,
      extension_version: VERSION,
      extension_name: 'Viu Flow Connector',
      profile_name: 'Viu Flow Chrome profile',
      logged_in: state.loggedIn,
      ready: state.ready,
    }),
  });
  await request('/api/connector/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worker_id: id, version: VERSION }),
  });
  return state;
}

async function progress(taskId, phase, percent, message) {
  await request(`/api/connector/tasks/${taskId}/progress`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phase, percent, message }),
  });
}

async function attachReference(task, tab) {
  if (!task.reference_url || !tab?.id) return;
  const saved = await config();
  const response = await fetch(task.reference_url, { headers: { 'x-viu-flow-token': saved.bootstrapToken } });
  if (!response.ok) throw new Error(`Tải ảnh tham chiếu thất bại: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const result = await chrome.tabs.sendMessage(tab.id, {
    type: 'VAS_SET_REFERENCE',
    buffer,
    mime: response.headers.get('content-type') || 'image/png',
    name: `scene-${task.scene_id || task.task_id}-reference.png`,
  });
  if (!result?.ok) throw new Error(result?.error || 'Flow không nhận ảnh tham chiếu');
}

async function upload(task, mediaUrl) {
  await progress(task.task_id, 'download', 88, 'Đang tải media thật từ Flow');
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) throw new Error(`Tải media thất bại: HTTP ${mediaResponse.status}`);
  const blob = await mediaResponse.blob();
  if (blob.size < 1024) throw new Error('Media tải về quá nhỏ');
  const form = new FormData();
  const ext = task.media_type === 'video' ? 'mp4' : (blob.type.includes('jpeg') ? 'jpg' : 'png');
  form.append('file', blob, `${task.task_id}.${ext}`);
  await progress(task.task_id, 'upload', 94, 'Đang upload FastAPI và xác minh');
  await request(`/api/connector/tasks/${task.task_id}/ingest`, { method: 'POST', body: form, headers: {} });
}

async function runOnce() {
  if (busy) return;
  const saved = await config();
  if (!saved.paired || !saved.apiBaseUrl || !saved.bootstrapToken || !saved.autoFactory) return;
  busy = true;
  let task;
  try {
    const state = await heartbeat();
    if (!state?.ready || !state.loggedIn) return;
    task = await request(`/api/connector/tasks/next?worker_id=${encodeURIComponent(await workerId())}`);
    if (!task || !task.task_id) return;
    const tab = await activeFlowTab();
    if (!tab) {
      await progress(task.task_id, 'waiting_login', 2, 'Đang chờ tab Google Flow sẵn sàng');
      return;
    }
    const phase = task.media_type === 'video' ? 'generate_video' : 'generate_image';
    if (task.media_type === 'video' && task.reference_url) {
      await progress(task.task_id, phase, 6, 'Đang đưa ảnh tham chiếu thật vào Google Flow');
      await attachReference(task, tab);
    }
    await progress(task.task_id, phase, 5, `Bắt đầu tạo ${task.media_type === 'video' ? 'video' : 'hình ảnh'} trên Google Flow`);
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'VAS_RUN_TASK', task });
    if (!result?.ok || !result.mediaUrl) throw new Error(result?.error || 'Flow không trả media URL');
    await upload(task, result.mediaUrl);
  } catch (error) {
    if (task?.task_id) {
      await request(`/api/connector/tasks/${task.task_id}/fail`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: String(error?.message || error) }),
      }).catch(() => {});
    }
  } finally {
    busy = false;
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('vas-poll', { periodInMinutes: 0.25 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('vas-poll', { periodInMinutes: 0.25 }));
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'vas-poll') void runOnce(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'VAS_GET_CONFIG') {
    config().then(sendResponse);
    return true;
  }
  if (message?.type === 'VAS_CONFIG_UPDATED') void runOnce();
  if (message?.type === 'VAS_TASK_PROGRESS' && message.taskId) {
    void progress(message.taskId, message.phase || 'processing', message.percent || 0, message.message || 'Flow đang xử lý');
  }
  return false;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBaseUrl || changes.bootstrapToken || changes.factorySessionId || changes.autoFactory) void runOnce();
});
void runOnce();
