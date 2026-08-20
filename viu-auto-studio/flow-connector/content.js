const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (element) => !!element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
function buttons() { return [...document.querySelectorAll('button,[role="button"],[role="tab"],[role="option"]')].filter(visible); }
function findByText(words) {
  const wanted = words.map(normalized);
  return buttons().find((el) => wanted.some((word) => normalized(el.textContent).includes(word)));
}
async function click(element) {
  if (!element) return false;
  element.scrollIntoView({ block: 'center' });
  element.click();
  await sleep(500);
  return true;
}
function editor() { return document.querySelector('[contenteditable="true"][data-slate-editor="true"],textarea,[contenteditable="true"]'); }
function isLoginPage() {
  const body = normalized(document.body?.innerText || '');
  return !editor() && /(sign in|log in|đăng nhập|iniciar sesión)/i.test(body);
}
function pageStatus() {
  const loggedIn = !isLoginPage();
  const ready = loggedIn && Boolean(editor());
  return { loggedIn, ready, reason: ready ? 'prompt_editor_ready' : loggedIn ? 'waiting_prompt_editor' : 'google_login_required' };
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
  if (!state.ready) throw new Error('Google Flow chưa sẵn sàng: chưa có prompt editor');
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
