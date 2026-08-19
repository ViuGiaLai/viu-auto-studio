// options.js — trang cấu hình API URL backend cho Flow Connector
document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('apiBase');
  const status = document.getElementById('status');
  const workerInfo = document.getElementById('workerInfo');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');

  // Đọc cấu hình hiện tại
  chrome.storage.local.get(['vasApiBase', 'vasWorkerId'], (st) => {
    input.value = st?.vasApiBase || 'http://127.0.0.1:8000';
    workerInfo.textContent = st?.vasWorkerId || 'chưa đăng ký';
  });

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : '';
    setTimeout(() => { status.textContent = ''; }, 6000);
  }

  function normalize(v) {
    return String(v || '').trim().replace(/\/+$/, '');
  }

  saveBtn.addEventListener('click', () => {
    const v = normalize(input.value);
    if (!v.startsWith('http://') && !v.startsWith('https://')) {
      setStatus('URL phải bắt đầu bằng http:// hoặc https://', 'bad');
      return;
    }
    chrome.storage.local.set({ vasApiBase: v }, () => {
      if (chrome.runtime.lastError) { setStatus('Lỗi khi lưu: ' + chrome.runtime.lastError.message, 'bad'); return; }
      setStatus('Đã lưu cấu hình — extension sẽ dùng URL mới ngay', 'ok');
    });
  });

  testBtn.addEventListener('click', async () => {
    const base = normalize(input.value);
    setStatus('Đang kiểm tra...', '');
    try {
      const res = await fetch(`${base}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setStatus(`Kết nối OK — backend trả về: ${JSON.stringify(j)}`, 'ok');
    } catch (err) {
      setStatus(`Không kết nối được backend: ${err.message}`, 'bad');
    }
  });

  // Cập nhật trạng thái worker từ background
  try {
    const reg = await chrome.runtime.sendMessage({ type: 'VAS_REGISTER_DONE' });
    // VAS_REGISTER_DONE chỉ xác nhận kênh message; thông tin chi tiết qua storage
    chrome.storage.local.get('vasWorkerId', (st) => {
      if (st?.vasWorkerId) workerInfo.textContent = st.vasWorkerId;
    });
  } catch (_) { /* extension context chưa sẵn sàng */ }
});
