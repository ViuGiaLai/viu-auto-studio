const VERSION = chrome.runtime.getManifest().version;
const WORKER_ID_KEY = 'workerId';
let busy = false;

async function config() { return chrome.storage.local.get(['apiBaseUrl', 'paired', WORKER_ID_KEY]); }
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
  const response = await fetch(`${base(saved.apiBaseUrl)}${path}`, init);
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function heartbeat() {
  const saved = await config();
  if (!saved.paired || !saved.apiBaseUrl) return;
  const id = await workerId();
  await request('/api/flow-connection/heartbeat', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ extension_id:id, extension_version:VERSION, extension_name:'Viu Flow Connector', profile_name:'Chrome' }) });
  await request('/api/connector/register', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ worker_id:id, version:VERSION }) });
}
async function progress(taskId, phase, percent, message) {
  await request(`/api/connector/tasks/${taskId}/progress`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ phase, percent, message }) });
}
async function activeFlowTab() {
  const tabs = await chrome.tabs.query({ url:'https://labs.google/fx/*' });
  return tabs.find((tab) => tab.id) || null;
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
  await request(`/api/connector/tasks/${task.task_id}/ingest`, { method:'POST', body:form });
}
async function runOnce() {
  if (busy) return;
  const saved = await config();
  if (!saved.paired || !saved.apiBaseUrl) return;
  busy = true;
  let task;
  try {
    await heartbeat();
    task = await request(`/api/connector/tasks/next?worker_id=${encodeURIComponent(await workerId())}`);
    if (!task || !task.task_id) return;
    const tab = await activeFlowTab();
    if (!tab) { await progress(task.task_id, 'waiting_for_flow', 2, 'Hãy mở Google Flow trong Chrome'); return; }
    await progress(task.task_id, 'automation', 5, 'Bắt đầu điều khiển Google Flow');
    const result = await chrome.tabs.sendMessage(tab.id, { type:'VAS_RUN_TASK', task });
    if (!result?.ok || !result.mediaUrl) throw new Error(result?.error || 'Flow không trả media URL');
    await upload(task, result.mediaUrl);
  } catch (error) {
    if (task?.task_id) {
      await request(`/api/connector/tasks/${task.task_id}/fail`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ error:String(error?.message || error) }) }).catch(() => {});
    }
  } finally { busy = false; }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('vas-poll', { periodInMinutes:0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('vas-poll', { periodInMinutes:0.5 }));
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'vas-poll') void runOnce(); });
chrome.runtime.onMessage.addListener((message) => { if (message?.type === 'VAS_CONFIG_UPDATED') void runOnce(); });
void runOnce();
