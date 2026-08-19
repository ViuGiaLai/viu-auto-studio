// flow-automation.js — Flow Connector: DOM automation helpers for labs.google/fx
// Learned from Auto Flow Factory 1.1.8: multilingual detection, synthetic+CDP clicks,
// Slate editor fill via page-bridge, submit verification with escalating retries.

(() => {
  if (window.__VASAutomationLoaded) return;
  window.__VASAutomationLoaded = true;

  const S = window.__VAS_SELECTORS || {};

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  const NORM_NEW = S.NEW_PROJECT_TEXTS.map(normalize);
  const NORM_KW = S.PROJECT_KEYWORDS.map(normalize);

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  async function waitForElement(selector, timeout = 15000, visible = true) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el && (!visible || isVisible(el))) return el;
      await sleep(250);
    }
    throw new Error(`waitForElement timeout: ${selector}`);
  }

  // ---------- New Flow project button (multilingual, 5-level fallback) ----------
  function findNewProjectButton() {
    const candidates = [...document.querySelectorAll('button')].filter(isVisible);
    // 1. exact multilingual text
    for (const btn of candidates) {
      const t = normalize(btn.textContent);
      if (!t) continue;
      for (const p of NORM_NEW) if (t.includes(p)) return btn;
    }
    // 2. project keyword + google-symbols icon
    for (const btn of candidates) {
      const t = normalize(btn.textContent);
      if (!t || t.length > 60) continue;
      if (!NORM_KW.some((k) => t.includes(k))) continue;
      if (btn.querySelector('i.google-symbols')) return btn;
    }
    // 3. add-icon text (chrome-translated: thêm, 添加, 추가 ...)
    const addPatterns = ['add', 'plus', '+', 'thêm', 'thêm_2', 'thêm_dòng_tròn', '追加', '添加', '新增', 'append', 'circle'];
    for (const icon of document.querySelectorAll('i.google-symbols')) {
      const it = (icon.textContent || '').toLowerCase();
      if (!addPatterns.some((p) => it.includes(p))) continue;
      const btn = icon.closest('button');
      if (!btn || !isVisible(btn)) continue;
      const txt = btn.textContent?.trim() || '';
      if (txt.length > 0 && txt.length <= 60) return btn;
    }
    // 4. button-overlay + google-symbols, size >= 80x30
    for (const ov of document.querySelectorAll('[data-type="button-overlay"]')) {
      const btn = ov.closest('button');
      if (!btn || !isVisible(btn)) continue;
      if (!btn.querySelector('i.google-symbols')) continue;
      const r = btn.getBoundingClientRect();
      if (r.width < 80 || r.height < 30) continue;
      return btn;
    }
    // 5. project keyword alone (primary button first)
    for (const btn of candidates) {
      const t = normalize(btn.textContent);
      if (!t || t.length > 60) continue;
      if (NORM_KW.some((k) => t.includes(k))) return btn;
    }
    return null;
  }

  async function waitForNewProjectButton(timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const btn = findNewProjectButton();
      if (btn) return btn;
      await sleep(200);
    }
    throw new Error('[VAS] Nút tạo dự án Flow không xuất hiện (hết thời gian chờ)');
  }

  // ---------- Model settings / dropdown / submit ----------
  function findModelSettingsBtn() {
    const submitBtn = findSubmitButton();
    if (submitBtn) {
      const gear = [...submitBtn.querySelectorAll('i.google-symbols')].find((i) =>
        (i.textContent || '').toLowerCase().includes('settings')
      );
      if (gear) return gear.closest('button') || gear;
    }
    return null;
  }

  function findModelDropdownBtn() {
    const submitBtn = findSubmitButton();
    if (!submitBtn) return null;
    // dropdown trigger within submit parent row (Radix trigger has aria-expanded)
    const triggers = [...submitBtn.parentElement?.querySelectorAll?.('button') || []].filter(
      (b) => b.hasAttribute('aria-expanded') && isVisible(b)
    );
    if (triggers.length) return triggers[0];
    // fallback: button with chevron icon near submit
    const chev = [...submitBtn.parentElement?.querySelectorAll?.('i.google-symbols') || []].find((i) =>
      (i.textContent || '').toLowerCase().includes('keyboard_arrow_down')
    );
    return chev ? chev.closest('button') : null;
  }

  function findSubmitButton() {
    // submit = i.google-symbols with text arrow_forward, within visible toolbar
    for (const icon of document.querySelectorAll('i.google-symbols')) {
      const t = (icon.textContent || '').trim();
      if (t !== 'arrow_forward' && t !== 'send' && t !== 'North') continue;
      const btn = icon.closest('button');
      if (btn && isVisible(btn)) return btn;
    }
    return null;
  }

  function findClearOnSubmitBtn() {
    const submitBtn = findSubmitButton();
    if (!submitBtn) return null;
    const btns = [...submitBtn.parentElement?.querySelectorAll?.('button') || []];
    return btns.find((b) => {
      const ic = [...b.querySelectorAll('i.google-symbols')].find((i) =>
        (i.textContent || '').toLowerCase().includes('clear')
      );
      return !!ic;
    }) || null;
  }

  // ---------- Clicks ----------
  let clickMutex = false;
  async function simulateClick(el) {
    if (!el) throw new Error('simulateClick: không tìm thấy phần tử');
    if (clickMutex) await sleep(100);
    clickMutex = true;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      await sleep(60);
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy };
      const submitIcon = el.querySelector?.('i.google-symbols');
      const isSubmitBtn = submitIcon && submitIcon.textContent.trim() === 'arrow_forward';

      el.dispatchEvent(new PointerEvent('pointerover', opts));
      el.dispatchEvent(new PointerEvent('pointerenter', opts));
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new MouseEvent('mouseenter', opts));
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));

      if (isSubmitBtn) {
        // Submit: try CDP real click via background (mouse.isTrusted = true), fallback native click
        const cdp = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, error: 'no response' }), 4000);
          window.addEventListener('__vasCdpClickDone', (e) => {
            clearTimeout(timer);
            resolve(e.detail || { ok: false, error: 'no detail' });
          }, { once: true });
          window.dispatchEvent(new CustomEvent('__vasCdpClick', { detail: { x: Math.round(cx), y: Math.round(cy) } }));
        });
        if (!cdp.ok) el.click();
      } else {
        el.dispatchEvent(new MouseEvent('click', opts));
      }
      // Radix tabs need native .click() too
      const id = el.id || '';
      if (id.includes('trigger-') || el.getAttribute('role') === 'tab' || el.hasAttribute?.('aria-expanded')) {
        el.click();
      }
      await sleep(350);
    } finally {
      clickMutex = false;
    }
  }

  async function clickEmptyAreaToClose() {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
    const active = document.activeElement;
    if (active && active !== document.body) {
      active.dispatchEvent(new KeyboardEvent('keydown', opts));
      active.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
    await sleep(350);
  }

  async function waitForDropdownClosed(timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!document.querySelector('[role="menu"]')) return true;
      await sleep(100);
    }
    return true;
  }

  async function waitForPanelClosed(timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const panel = document.querySelector(S.IMAGE_TAB || 'button[id*="trigger-IMAGE"]');
      if (!panel || panel.offsetParent === null) return true;
      await sleep(100);
    }
    return true;
  }

  // ---------- Slate editor ----------
  async function waitForEditorFilled(timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const t = document.querySelector(S.PROMPT_INPUT || '[contenteditable="true"][data-slate-editor="true"]')?.textContent?.trim() || '';
      if (t.length > 0) return true;
      await sleep(120);
    }
    return false;
  }

  async function waitForEditorEmpty(timeout = 8000) {
    const start = Date.now();
    const sel = S.PROMPT_INPUT || '[contenteditable="true"][data-slate-editor="true"]';
    while (Date.now() - start < timeout) {
      if ((document.querySelector(sel)?.textContent?.trim() || '') === '') return true;
      await sleep(200);
    }
    return false;
  }

  async function fillPrompt(text, replaceAll = true, retry = 3) {
    // page-bridge.js (MAIN world) listens to __vasFillPrompt and responds __vasFillPromptDone
    for (let attempt = 0; attempt < retry; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('fillPrompt timeout')), 6000);
          window.addEventListener('__vasFillPromptDone', (e) => {
            clearTimeout(timer);
            e.detail?.ok ? resolve() : reject(new Error(e.detail?.error || 'input failed'));
          }, { once: true });
          window.dispatchEvent(new CustomEvent('__vasFillPrompt', { detail: { text, replaceAll } }));
        });
        if (await waitForEditorFilled()) return true;
        throw new Error('editor not updated');
      } catch (err) {
        if (attempt === retry - 1) throw err;
        await sleep(600);
      }
    }
    return false;
  }

  // ---------- Submit with verification ----------
  async function waitForSubmitEnabled(timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const btn = findSubmitButton();
      if (btn) return btn;
      await sleep(200);
    }
    throw new Error('[VAS] Nút gửi (submit) không kích hoạt');
  }

  function detectCreditExhausted() {
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const signals = ['hết credit', 'sắp hết', 'exhausted', 'out of credits', 'not enough',
      'không đủ', 'thanh toán', 'nâng cấp gói', 'upgrade', 'charge limit', 'unusual activity'];
    // Toast/notice elements
    for (const sig of signals) {
      if (bodyText.includes(sig)) {
        // restrict: only if near an active notice/banner element
        const notices = [...document.querySelectorAll('[role="alert"], .alert, [class*="toast"], [class*="snackbar"]')];
        if (notices.some((n) => (n.innerText || '').toLowerCase().includes(sig))) return sig;
        if (signals.indexOf(sig) < 5) return sig; // credit signals are strong enough
      }
    }
    return null;
  }

  function isUnusualActivityText(text) {
    const t = (text || '').toLowerCase();
    return /non ho|không hợp|unusual|bị chặn|blocked/i.test(t);
  }

  function pickModelItem(items, modelName) {
    const norm = normalize(modelName);
    return items.find((it) => {
      const t = normalize(it.textContent);
      return t && (t.includes(norm) || norm.includes(t.replace(/[^a-z0-9]/g, '')));
    });
  }

  async function submitWithVerification(options = {}) {
    const { maxAttempts = 4, verifyTimeout = 15000 } = options;
    let submitBtn = findSubmitButton();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const tilesBefore = document.querySelectorAll(S.TILE || '[data-tile-id]').length;
      let preAction = 'none';
      if (attempt === 3 && submitBtn) {
        preAction = 'editor-refocus';
        const editor = document.querySelector(S.PROMPT_INPUT);
        if (editor) {
          editor.focus();
          editor.dispatchEvent(new Event('focus', { bubbles: true }));
          await sleep(350);
        }
      } else if (attempt === 4 && submitBtn) {
        preAction = 'editor-reset';
        const editor = document.querySelector(S.PROMPT_INPUT);
        if (editor) {
          const original = editor.textContent || '';
          if (original.trim()) {
            await fillPrompt('', true);
            await sleep(250);
            await fillPrompt(original.trim(), true);
            await sleep(400);
            submitBtn = findSubmitButton() || submitBtn;
          }
        }
      }
      if (!submitBtn) {
        await sleep(800);
        submitBtn = findSubmitButton();
        if (!submitBtn) {
          if (detectCreditExhausted()) throw new Error('[VAS] Credit Flow đã hết — không thể gửi lệnh tạo');
          continue;
        }
      }
      await simulateClick(submitBtn);
      // Fast-fail: "Prompt must be provided" detection in 3s
      let fastFail = false;
      const ffStart = Date.now();
      while (Date.now() - ffStart < 3000) {
        const t = (document.body?.innerText || '').toLowerCase();
        if (t.includes('prompt must be provided') || t.includes('provide a prompt') ||
            t.includes('nhập prompt') || t.includes('vui lòng nhập')) {
          fastFail = true;
          break;
        }
        await sleep(150);
      }
      if (fastFail) {
        await sleep(1500 + attempt * 800);
        continue;
      }
      // Verify: editor empty OR new tile appeared
      const accepted = await new Promise((resolve) => {
        const start = Date.now();
        const iv = setInterval(() => {
          const editorText = document.querySelector(S.PROMPT_INPUT)?.textContent?.trim() || '';
          const tilesNow = document.querySelectorAll(S.TILE).length;
          if (editorText === '' || tilesNow > tilesBefore) {
            clearInterval(iv);
            resolve(true);
          } else if (Date.now() - start > verifyTimeout) {
            clearInterval(iv);
            resolve(false);
          }
        }, 350);
      });
      if (accepted) return { accepted: true, attempt, preAction };
      await sleep(1800 + attempt * 700);
    }
    throw new Error('[VAS] Gửi lệnh tạo không thành công sau nhiều lần thử — kiểm tra thông báo trên trang Flow');
  }

  // ---------- Configure mode/aspect/model ----------
  async function configureFlowEditor(task) {
    // task: {mode: 'image'|'video', aspect: '16:9'|'9:16'|..., model: string}
    const settingsBtn = findModelSettingsBtn() || await new Promise(async (res) => {
      for (let i = 0; i < 25; i++) {
        const b = findModelSettingsBtn();
        if (b) { res(b); return; }
        await sleep(250);
      }
      res(null);
    });
    if (!settingsBtn) throw new Error('[VAS] Không tìm thấy nút cài đặt model trong Flow');
    await simulateClick(settingsBtn);
    await sleep(900);

    // Mode tab
    const modeTab = task.mode === 'video'
      ? (document.querySelector(S.VIDEO_TAB) || document.querySelector('button[id*="trigger-VIDEO"]'))
      : (document.querySelector(S.IMAGE_TAB) || document.querySelector('button[id*="trigger-IMAGE"]'));
    if (!modeTab) throw new Error(`[VAS] Tab ${task.mode} không có trong bảng model`);
    await simulateClick(modeTab);
    await sleep(400);

    // Direction / aspect
    const isPortrait = /^(9:16|4:5|2:3)$/i.test(task.aspect || '');
    const dirTab = isPortrait
      ? (document.querySelector(S.PORTRAIT) || document.querySelector('button[id*="trigger-PORTRAIT"]'))
      : (document.querySelector(S.LANDSCAPE) || document.querySelector('button[id*="trigger-LANDSCAPE"]'));
    if (dirTab) { await simulateClick(dirTab); await sleep(350); }

    // Count x1
    const x1Tab = document.querySelector(S.COUNT_X1) || document.querySelector('button[id*="trigger-1"]');
    if (x1Tab) { await simulateClick(x1Tab); await sleep(350); }

    // Model dropdown
    const ddBtn = findModelDropdownBtn();
    if (ddBtn) {
      await simulateClick(ddBtn);
      await sleep(600);
      const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button')].filter(isVisible);
      const target = pickModelItem(items, task.model || (task.mode === 'video' ? 'Veo 3.1 Lite' : 'Nano Banana 2'));
      if (target) {
        await simulateClick(target);
        await sleep(400);
      }
    }

    await clickEmptyAreaToClose();
    await waitForPanelClosed();
    await sleep(800);
  }

  // ---------- Tile tracking ----------
  function captureTileGroups() {
    const tiles = [...document.querySelectorAll(S.TILE)];
    return tiles.map((tile, domIndex) => {
      const src = tile.querySelector('img')?.src || '';
      const percent = parseInt(((tile.innerText || '').match(S.PROGRESS_REGEX) || [])[1] || '0', 10);
      const name = src.match(/[?&]name=([^&]+)/)?.[1] || '';
      let state = 'waiting';
      if (src.includes(S.DONE_URL_KEY)) state = 'done';
      else if (percent > 0) state = 'generating';
      return {
        tileId: tile.getAttribute('data-tile-id') || '',
        domIndex,
        src,
        url: state === 'done' ? src : '',
        name,
        state,
        percent,
        blocked: isUnusualActivityText(tile.textContent),
      };
    });
  }

  async function waitForTileDone(timeoutMs = 600000, pollMs = 1500, onProgress) {
    const start = Date.now();
    let stableDone = 0;
    let lastPercent = -1;
    while (Date.now() - start < timeoutMs) {
      const groups = captureTileGroups();
      const done = groups.find((g) => g.state === 'done');
      const blocked = groups.find((g) => g.blocked);
      const gen = groups.filter((g) => g.state === 'generating');
      const pct = Math.max(...gen.map((g) => g.percent), done ? 100 : 0);
      if (pct !== lastPercent && onProgress) {
        lastPercent = pct;
        onProgress({ percent: Math.min(pct, 100), phase: 'generating', message: `Flow đang tạo media: ${pct}%` });
      }
      if (blocked) throw new Error('[VAS] Google chặn hoạt động bất thường — Flow trả về tile chặn. Đăng nhập lại hoặc đợi sau vài phút rồi thử lại.');
      if (done) {
        stableDone++;
        if (stableDone >= 3) {
          const name = done.name || done.url.match(/name=([^&]+)/)?.[1] || '';
          return { url: done.url, name, percent: 100 };
        }
      } else {
        stableDone = 0;
      }
      await sleep(pollMs);
    }
    throw new Error('[VAS] Hết thời gian chờ tạo media trong Flow (10 phút) — có thể server Flow đang quá tải');
  }

  window.__VASAutomation = {
    sleep, isVisible, waitForElement, findNewProjectButton, waitForNewProjectButton,
    findModelSettingsBtn, findModelDropdownBtn, findSubmitButton, findClearOnSubmitBtn,
    simulateClick, clickEmptyAreaToClose, waitForDropdownClosed, waitForPanelClosed,
    waitForEditorFilled, waitForEditorEmpty, fillPrompt, waitForSubmitEnabled,
    submitWithVerification, detectCreditExhausted, pickModelItem, configureFlowEditor,
    captureTileGroups, waitForTileDone,
  };
})();
