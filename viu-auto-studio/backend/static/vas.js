// Injected once into the Flow page to verify DOM automation (partial test, NOT extension E2E).
// Combines: selectors + bridge + automation from the flow-connector extension.
(() => {
  // ---- selectors ----
  window.__VAS_SELECTORS = {
    IMAGE_TAB: 'button[id*="trigger-IMAGE"]',
    VIDEO_TAB: 'button[id*="trigger-VIDEO"]',
    LANDSCAPE: 'button[id*="trigger-LANDSCAPE"]',
    PORTRAIT: 'button[id*="trigger-PORTRAIT"]',
    COUNT_X1: 'button[id*="trigger-1"]',
    PROMPT_INPUT: '[contenteditable="true"][data-slate-editor="true"]',
    TILE: '[data-tile-id]',
    DONE_URL_KEY: 'getMediaUrlRedirect',
    PROGRESS_REGEX: /(\d+)%/,
    NEW_PROJECT_TEXTS: ['Dự án mới', 'Tạo dự án', 'New project', 'Create project'],
    PROJECT_KEYWORDS: ['dự án', 'project'],
  };
  const S = window.__VAS_SELECTORS;

  // ---- bridge (Slate fill) ----
  const findSlateEditor = () => {
    const editor = document.querySelector(S.PROMPT_INPUT);
    if (!editor) throw new Error('Editor không tồn tại');
    const fiberKey = Object.keys(editor).find((k) => k.startsWith('__reactFiber'));
    let fiber = editor[fiberKey];
    let slate = null;
    while (fiber) {
      if (fiber.memoizedProps?.editor) { slate = fiber.memoizedProps.editor; break; }
      if (fiber.stateNode?.editor) { slate = fiber.stateNode.editor; break; }
      fiber = fiber.return;
    }
    if (!slate) throw new Error('Slate instance không tìm thấy');
    return { editor, slate };
  };
  window.addEventListener('__vasFillPrompt', (e) => {
    const text = e.detail?.text;
    const replaceAll = !!e.detail?.replaceAll;
    const done = (ok, error) => window.dispatchEvent(new CustomEvent('__vasFillPromptDone', { detail: { ok, error } }));
    if (!text && !replaceAll) { done(true); return; }
    try {
      const { editor, slate } = findSlateEditor();
      editor.focus();
      if (replaceAll) {
        try { document.execCommand('selectAll'); document.execCommand('delete'); } catch (_) {}
        try {
          const point = { path: [0, 0], offset: 0 };
          if (slate.selection != null) slate.selection = { anchor: point, focus: point };
          if (slate.history) slate.history = { redos: [], undos: [] };
          if (slate.children) slate.children = [{ type: 'paragraph', children: [{ text: '' }] }];
        } catch (_) {}
      }
      slate.apply({ type: 'set_selection', properties: null, newProperties: { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } });
      slate.deleteFragment();
      if (text) slate.insertText(text);
      done(true);
    } catch (err) { done(false, err.message); }
  });

  // ---- helpers ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const findSubmitButton = () => {
    for (const icon of document.querySelectorAll('i.google-symbols')) {
      const t = (icon.textContent || '').trim();
      if (t !== 'arrow_forward' && t !== 'send' && t !== 'North') continue;
      const btn = icon.closest('button');
      if (btn && isVisible(btn)) return btn;
    }
    return null;
  };
  const simulateClick = async (el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await sleep(60);
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    if ((el.id || '').includes('trigger-') || el.getAttribute('role') === 'tab' || el.hasAttribute?.('aria-expanded')) el.click();
    await sleep(400);
  };
  const findNewProjectButton = () => {
    const normNew = S.NEW_PROJECT_TEXTS.map(normalize);
    const normKw = S.PROJECT_KEYWORDS.map(normalize);
    const candidates = [...document.querySelectorAll('button')].filter(isVisible);
    for (const btn of candidates) {
      const t = normalize(btn.textContent);
      if (t && normNew.some((p) => t.includes(p))) return btn;
    }
    for (const btn of candidates) {
      const t = normalize(btn.textContent);
      if (t && t.length <= 60 && normKw.some((k) => t.includes(k))) return btn;
    }
    return null;
  };
  const fillPrompt = async (text) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fillPrompt timeout')), 8000);
      window.addEventListener('__vasFillPromptDone', (e) => {
        clearTimeout(timer);
        e.detail?.ok ? resolve() : reject(new Error(e.detail?.error));
      }, { once: true });
      window.dispatchEvent(new CustomEvent('__vasFillPrompt', { detail: { text, replaceAll: true } }));
    });
  };
  const captureTileGroups = () =>
    [...document.querySelectorAll(S.TILE)].map((tile, domIndex) => {
      const src = tile.querySelector('img')?.src || '';
      const percent = parseInt(((tile.innerText || '').match(S.PROGRESS_REGEX) || [])[1] || '0', 10);
      const name = src.match(/[?&]name=([^&]+)/)?.[1] || '';
      let state = 'waiting';
      if (src.includes(S.DONE_URL_KEY)) state = 'done';
      else if (percent > 0) state = 'generating';
      return { domIndex, src, name, state, percent };
    });
  const waitForTileDone = (timeoutMs = 420000) => {
    const start = Date.now();
    let stableDone = 0;
    return new Promise((resolve, reject) => {
      const iv = setInterval(async () => {
        const groups = captureTileGroups();
        const done = groups.find((g) => g.state === 'done');
        if (done) {
          stableDone++;
          if (stableDone >= 3) {
            clearInterval(iv);
            resolve({ url: done.src, name: done.name });
          }
        } else stableDone = 0;
        if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('tile timeout')); }
      }, 2000);
    });
  };

  // ---- orchestrator (called by console) ----
  window.__VAS_RUN = async (promptText) => {
    const log = [];
    const L = (m) => { console.log('[VAS]', m); log.push(m); };
    try {
      // 1. New project
      L('Bước 1: tìm nút Dự án mới...');
      const newBtn = findNewProjectButton();
      if (!newBtn) throw new Error('Không tìm thấy nút Dự án mới');
      await simulateClick(newBtn);
      await sleep(3000);
      const urlNow = location.href;
      L('Bước 2: đã mở dự án mới: ' + urlNow);

      // 2. Mode: IMAGE
      const imgTab = document.querySelector(S.IMAGE_TAB);
      if (imgTab) { await simulateClick(imgTab); await sleep(400); L('Bước 3: chọn IMAGE mode'); }
      else L('Bước 3: IMAGE tab không tìm thấy, giữ mặc định');

      // 3. Landscape 16:9
      const landTab = document.querySelector(S.LANDSCAPE);
      if (landTab) { await simulateClick(landTab); await sleep(350); L('Bước 4: chọn LANDSCAPE'); }
      else L('Bước 4: LANDSCAPE tab không tìm thấy');

      // 4. Model Nano Banana 2 via settings
      const submitBtn = findSubmitButton();
      if (submitBtn) {
        const gear = [...submitBtn.querySelectorAll('i.google-symbols')].find((i) =>
          (i.textContent || '').toLowerCase().includes('settings'));
        if (gear) {
          await simulateClick(gear.closest('button') || gear);
          await sleep(900);
          const nb2 = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button')].filter(isVisible)
            .find((b) => normalize(b.textContent).includes('nanobanana2'));
          if (nb2) { await simulateClick(nb2); await sleep(400); L('Bước 5: chọn model Nano Banana 2'); }
          else L('Bước 5: không thấy mục model Nano Banana 2 trong menu (có thể đã chọn sẵn)');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(400);
        } else L('Bước 5: không tìm thấy nút settings');
      }

      // 5. Fill prompt
      L('Bước 6: điền prompt qua page-bridge...');
      await fillPrompt(promptText);
      await sleep(800);
      const editorText = document.querySelector(S.PROMPT_INPUT)?.textContent || '';
      L('Editor text: ' + editorText.slice(0, 120));

      // 6. Submit
      L('Bước 7: submit...');
      const tilesBefore = document.querySelectorAll(S.TILE).length;
      const sb = findSubmitButton();
      if (!sb) throw new Error('Submit button không tìm thấy');
      await simulateClick(sb);
      await sleep(1500);
      const tilesAfter = document.querySelectorAll(S.TILE).length;
      L(`Bước 8: tiles trước=${tilesBefore} sau=${tilesAfter}`);

      // 7. Wait tile
      L('Bước 9: chờ tile hoàn thành (tối đa 7 phút)...');
      const result = await waitForTileDone();
      L('Bước 10: tile HOÀN THÀNH — media URL: ' + result.url);
      return { ok: true, mediaUrl: result.url, mediaName: result.name, projectUrl: location.href, log };
    } catch (err) {
      L('LỖI: ' + err.message);
      return { ok: false, error: err.message, log, projectUrl: location.href };
    }
  };
  console.log('[VAS] Automation đã inject. Chạy: await __VAS_RUN("PROMPT")');
})();
