const apiInput = document.querySelector('#apiBaseUrl');
const codeInput = document.querySelector('#pairingCode');
const status = document.querySelector('#status');

async function workerId() {
  const saved = await chrome.storage.local.get(['workerId']);
  if (saved.workerId) return saved.workerId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ workerId:id });
  return id;
}

function normalizedBase(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Runtime API phải là địa chỉ loopback do Viu Auto Studio cung cấp.');
  }
  return url.origin;
}

function show(message, ok = false) {
  status.textContent = message;
  status.className = ok ? 'ok' : 'error';
}

async function api(path, init = {}) {
  const apiBaseUrl = normalizedBase(apiInput.value);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json();
}

chrome.storage.local.get(['apiBaseUrl'], (saved) => { apiInput.value = saved.apiBaseUrl || ''; });

document.querySelector('#test').addEventListener('click', async () => {
  try {
    const data = await api('/api/health');
    show(`Backend ${data.status === 'ok' ? 'hoạt động' : 'phản hồi'} — kết nối thành công.`, true);
  } catch (error) { show(error.message); }
});

document.querySelector('#pair').addEventListener('click', async () => {
  try {
    const apiBaseUrl = normalizedBase(apiInput.value);
    const pairing_code = codeInput.value.trim();
    if (!/^\d{6}$/.test(pairing_code)) throw new Error('Mã ghép phải gồm đúng 6 chữ số.');
    const extension_id = await workerId();
    await api('/api/flow-connection/pair', { method:'POST', body:JSON.stringify({ pairing_code, extension_id, extension_version:chrome.runtime.getManifest().version, extension_name:'Viu Flow Connector' }) });
    await chrome.storage.local.set({ apiBaseUrl, paired:true });
    await chrome.runtime.sendMessage({ type:'VAS_CONFIG_UPDATED' });
    show('Đã ghép thành công. Extension sẽ tự heartbeat và nhận task.', true);
  } catch (error) { show(error.message); }
});
