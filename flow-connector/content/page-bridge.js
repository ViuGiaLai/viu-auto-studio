// page-bridge.js — MAIN world: inject directly into labs.google/fx pages to fill the Slate editor
// Runs as an injected script (web_accessible_resources) so it has access to __reactFiber.
// Protocol: __vasFillPrompt {text, replaceAll} -> __vasFillPromptDone {ok, error}

(() => {
  const findSlateEditor = () => {
    const editor = document.querySelector('[contenteditable="true"][data-slate-editor="true"]');
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

    // ping
    if (!text && !replaceAll) { done(true); return; }

    try {
      const { editor, slate } = findSlateEditor();
      editor.focus();

      if (replaceAll) {
        try {
          document.execCommand('selectAll');
          document.execCommand('delete');
        } catch (_) {}
        try {
          const point = { path: [0, 0], offset: 0 };
          if (slate.selection != null) slate.selection = { anchor: point, focus: point };
          if (slate.history) slate.history = { redos: [], undos: [] };
          if (slate.children) slate.children = [{ type: 'paragraph', children: [{ text: '' }] }];
        } catch (_) {}
      }

      // selection point: if [0,0] is a void node (attached image), use last leaf end
      let selPoint = { path: [0, 0], offset: 0 };
      if (!replaceAll) {
        try {
          const children = slate.children || [];
          if (children.length) {
            const lastIdx = children.length - 1;
            const lastNode = children[lastIdx];
            const leaves = (lastNode?.children) ? lastNode.children : [{ text: '' }];
            const leafIdx = leaves.length - 1;
            const leafText = (typeof leaves[leafIdx]?.text === 'string') ? leaves[leafIdx].text : '';
            selPoint = { path: [lastIdx, leafIdx], offset: leafText.length };
          }
        } catch (_) { selPoint = { path: [0, 0], offset: 0 }; }
      }
      slate.apply({
        type: 'set_selection',
        properties: null,
        newProperties: { anchor: selPoint, focus: selPoint },
      });
      slate.deleteFragment();
      if (text) slate.insertText(text);
      done(true);
    } catch (err) {
      done(false, err.message);
    }
  });

  // CDP click handler: background sends __vasCdpClick via content; content forwards here?
  // Actually background attaches debugger directly to the Flow tab (CDP_CLICK protocol from ref):
  // we listen in content, but this MAIN-world bridge also dispatches back for synthetic fallbacks.
  window.dispatchEvent(new CustomEvent('__vasBridgeReady'));
})();
