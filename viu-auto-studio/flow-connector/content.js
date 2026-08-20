const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (element) => !!element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

// === Auto-bootstrap: read config from URL hash (#vas-bootstrap=base64json) ===
(function autoBootstrap() {
  try {
    const hash = location.hash || '';
    const match = hash.match(/vas-bootstrap=([A-Za-z0-9+/=_-]+)/);
    if (!match) return;
    const json = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const cfg = JSON.parse(json);
    if (cfg.apiBaseUrl) {
      chrome.runtime.sendMessage({ type: 'VAS_BOOTSTRAP', config: cfg }, (resp) => {
        console.log('[VAS] Bootstrap from URL hash:', resp?.ok ? 'OK' : 'failed');
      });
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) {
    console.warn('[VAS] Auto-bootstrap error:', e);
  }
})();

function allClickable() {
  const list = [
    ...document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], a[href], div[tabindex], div[role="button"], span[role="button"]')
  ];
  return list.filter(visible);
}

function buttons() {
  return [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"]')].filter(visible);
}

function findByText(words) {
  const wanted = words.map(normalized);
  return buttons().find((el) => wanted.some((word) => normalized(el.textContent).includes(word)));
}

function findClickableByText(words) {
  const wanted = words.map(normalized);
  const elements = allClickable();
  const direct = elements.find((el) => wanted.some((word) => normalized(el.textContent).includes(word)));
  if (direct) return direct;

  // Search any visible element in DOM with matching text and return it or its closest interactive parent
  const allNodes = [...document.querySelectorAll('div, span, p, h1, h2, h3, a, button')].filter(visible);
  for (const node of allNodes) {
    const text = normalized(node.innerText || node.textContent || '');
    if (wanted.some((word) => text.includes(word))) {
      return node.closest('button, [role="button"], a, div[tabindex]') || node;
    }
  }
  return null;
}

async function click(element) {
  if (!element) return false;
  try {
    element.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(200);
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const eventOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
    element.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
    element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    element.dispatchEvent(new PointerEvent('pointerup', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    element.click();
    await sleep(500);
    return true;
  } catch (err) {
    try {
      element.click();
      await sleep(500);
      return true;
    } catch {
      return false;
    }
  }
}

function editor() {
  return document.querySelector('[contenteditable="true"][data-slate-editor="true"], textarea, [contenteditable="true"]');
}

function isLoginPage() {
  const body = normalized(document.body?.innerText || '');
  return !editor() && /(sign in|log in|đăng nhập|iniciar sesión)/i.test(body);
}

function isLandingPage() {
  if (editor()) return false;
  if (isLoginPage()) return false;
  const body = normalized(document.body?.innerText || '');
  return body.includes('google flow') || body.includes('create with') || body.includes('dự án mới') || body.includes('new project');
}

function pageStatus() {
  const loggedIn = !isLoginPage();
  const ready = loggedIn && Boolean(editor());
  const onLanding = isLandingPage();
  return {
    loggedIn,
    ready,
    onLanding,
    reason: ready ? 'prompt_editor_ready'
      : onLanding ? 'on_landing_page'
      : loggedIn ? 'waiting_prompt_editor'
      : 'google_login_required',
  };
}

/**
 * If on the Flow landing page (no prompt editor), navigate to the creation editor.
 * Tries: click "+ Dự án mới" / "New project" / "Create" -> wait for editor.
 * Fallback: navigate directly to known creation URLs or click existing project.
 */
async function ensureEditor() {
  if (editor()) return true;

  // 1. Try finding and clicking "Dự án mới" / "New project" / "+ Dự án mới" / "Tạo dự án"
  const createKeywords = [
    'dự án mới', '+ dự án mới', 'new project', '+ new project',
    'tạo project', 'tạo dự án', 'tạo mới', 'create project',
    'create new', 'start creating', 'create with google flow',
  ];
  const createEl = findClickableByText(createKeywords);
  if (createEl) {
    console.log('[VAS] Clicking create project element:', createEl);
    await click(createEl);
    for (let i = 0; i < 30; i++) {
      if (editor()) {
        console.log('[VAS] Prompt editor is ready!');
        return true;
      }
      await sleep(500);
    }
  }

  // 2. Try clicking any plus button
  const plusButtons = allClickable().filter((b) => {
    const text = normalized(b.textContent || '');
    const aria = normalized(b.getAttribute('aria-label') || '');
    return text === '+' || text.includes('dự án') || text.includes('project') || aria.includes('new') || aria.includes('create') || aria.includes('add');
  });
  for (const pb of plusButtons) {
    console.log('[VAS] Trying plus/project button:', pb);
    await click(pb);
    for (let i = 0; i < 20; i++) {
      if (editor()) return true;
      await sleep(500);
    }
  }

  // 3. Fallback: navigate to creation paths in Flow
  const creationPaths = [
    '/fx/vi/tools/flow/r/new',
    '/fx/tools/flow/r/new',
    '/fx/vi/tools/flow/create',
    '/fx/tools/flow/create',
  ];
  for (const p of creationPaths) {
    try {
      const testUrl = new URL(p, location.origin).href;
      console.log('[VAS] Navigating to:', testUrl);
      location.href = testUrl;
      for (let i = 0; i < 30; i++) {
        if (editor()) return true;
        await sleep(500);
      }
    } catch { /* continue */ }
  }

  return false;
}

// Auto-navigate to editor immediately without delay
let navTriggered = false;
async function tryAutoOpenEditor() {
  if (navTriggered || editor() || isLoginPage()) return;
  if (isLandingPage()) {
    navTriggered = true;
    console.log('[VAS] Landing page detected, opening project/editor immediately...');
    await ensureEditor();
  }
}

// Check immediately on script injection
void tryAutoOpenEditor();

// Also observe DOM to trigger immediately when buttons render
const observer = new MutationObserver(() => {
  if (!editor() && !isLoginPage() && isLandingPage() && !navTriggered) {
    void tryAutoOpenEditor();
  }
});
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
    void tryAutoOpenEditor();
  });
}

async function fillPrompt(text) {
  const field = editor();
  if (!field) throw new Error('Không tìm thấy ô prompt Flow');
  field.focus();
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
  await sleep(500);
}

function submitButton() {
  return buttons().find((button) => {
    const label = normalized(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`);
    return label.includes('generate') || label.includes('tạo') || label.includes('send') || button.querySelector('i.google-symbols')?.textContent?.match(/arrow_forward|send/i);
  });
}

function mediaSources() {
  return new Set([
    ...[...document.querySelectorAll('video')].map((el) => el.currentSrc || el.src).filter(Boolean),
    ...[...document.querySelectorAll('img')].map((el) => el.currentSrc || el.src).filter((src) => /googleusercontent|gstatic|blob:/.test(src || '')),
  ]);
}

async function waitForMedia(before, mediaType, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidates = mediaType === 'video'
      ? [...document.querySelectorAll('video')].map((el) => el.currentSrc || el.src).filter(Boolean)
      : [...document.querySelectorAll('img')].map((el) => el.currentSrc || el.src).filter((src) => /googleusercontent|gstatic|blob:/.test(src || ''));
    const fresh = candidates.find((src) => !before.has(src));
    if (fresh) return fresh;
    await sleep(2000);
  }
  throw new Error(`Hết thời gian chờ ${mediaType === 'video' ? 'video' : 'hình ảnh'} Flow`);
}

function notifyProgress(task, phase, percent, message) {
  void chrome.runtime.sendMessage({ type: 'VAS_TASK_PROGRESS', taskId: task.task_id, phase, percent, message });
}

async function attachReferenceFile(file) {
  const input = document.querySelector('input[type="file"]');
  if (!input) {
    const uploadButton = findByText(['upload', 'reference', 'ảnh tham chiếu', 'add image']);
    await click(uploadButton);
    await sleep(500);
  }
  const target = document.querySelector('input[type="file"]');
  if (!target) throw new Error('Không tìm thấy input upload ảnh tham chiếu của Flow');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  target.files = transfer.files;
  target.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1000);
}

async function chooseMode(task) {
  if (task.media_type === 'video') await click(findByText(['video']));
  else await click(findByText(['image', 'hình ảnh']));
  if (task.aspect === '9:16') await click(findByText(['portrait', 'dọc', '9:16']));
  else await click(findByText(['landscape', 'ngang', '16:9']));
}

async function run(task) {
  const state = pageStatus();
  if (!state.loggedIn) throw new Error('Google Flow chưa đăng nhập trong Chrome profile');

  // If on landing page or no editor, auto-navigate to creation page
  if (!state.ready) {
    notifyProgress(task, 'navigate', 2, 'Đang mở trang tạo mới trên Google Flow...');
    const ok = await ensureEditor();
    if (!ok) throw new Error('Không thể mở trang tạo project trên Google Flow. Vui lòng bấm "+ Dự án mới" thủ công.');
  }

  const before = mediaSources();
  const phase = task.media_type === 'video' ? 'generate_video' : 'generate_image';
  notifyProgress(task, phase, 8, `Đang chọn chế độ ${task.media_type === 'video' ? 'video' : 'hình ảnh'} và tỷ lệ ${task.aspect}`);
  await chooseMode(task);
  if (task.media_type === 'video' && task.reference_url) {
    notifyProgress(task, phase, 12, 'Đang chuẩn bị ảnh tham chiếu thật của cảnh trong Flow');
  }
  const prompt = [task.prompt, task.style_prompt, task.transition_description].filter(Boolean).join('\n\n');
  if (!prompt.trim()) throw new Error('Task không có prompt hợp lệ');
  await fillPrompt(prompt);
  const submit = submitButton();
  if (!submit) throw new Error('Không tìm thấy nút Generate của Flow');
  notifyProgress(task, phase, 15, 'Đã gửi prompt vào Google Flow; đang chờ media thật');
  await click(submit);
  const mediaUrl = await waitForMedia(before, task.media_type);
  notifyProgress(task, phase, 82, 'Google Flow đã tạo media; đang chuẩn bị upload');
  return { ok: true, mediaUrl };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'VAS_GET_STATUS') {
    sendResponse(pageStatus());
    return false;
  }
  if (message?.type === 'VAS_NAVIGATE_EDITOR') {
    ensureEditor().then((ok) => sendResponse({ ok })).catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (message?.type === 'VAS_SET_REFERENCE') {
    const blob = new Blob([message.buffer], { type: message.mime || 'image/png' });
    const file = new File([blob], message.name || 'reference.png', { type: blob.type });
    attachReferenceFile(file).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type !== 'VAS_RUN_TASK') return false;
  run(message.task).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
