if(typeof console!=="undefined"){console.log=function(){};console.warn=function(){};console.error=function(){};}
// MAIN world: Slate __reactFiber 직접 접근
// CSP 때문에 inline script inject 불가 → 별도 파일로 분리

// 준비 완료 신호
window.dispatchEvent(new CustomEvent('__flowBridgeReady'));

window.addEventListener('__flowFillPrompt', (e) => {
  const text = e.detail?.text;
  const replaceAll = !!e.detail?.replaceAll;

  // 빈 텍스트 + replaceAll 아님 = ping, 바로 완료 응답
  if (!text && !replaceAll) {
    window.dispatchEvent(new CustomEvent('__flowFillPromptDone', { detail: { ok: true } }));
    return;
  }

  try {
    const editor = document.querySelector('[contenteditable="true"][data-slate-editor="true"]');
    if (!editor) throw new Error('에디터 없음');

    const fiberKey = Object.keys(editor).find(k => k.startsWith('__reactFiber'));
    let fiber = editor[fiberKey];
    let slateEditor = null;
    while (fiber) {
      if (fiber.memoizedProps?.editor) { slateEditor = fiber.memoizedProps.editor; break; }
      if (fiber.stateNode?.editor) { slateEditor = fiber.stateNode.editor; break; }
      fiber = fiber.return;
    }
    if (!slateEditor) throw new Error('Slate 인스턴스 없음');

    editor.focus();

    // replaceAll: 기존 내용(플레이스홀더 "무엇을..." 등) 전부 지우고 교체 — 대본투이미지와 동일한 깨끗한 입력
    if (replaceAll) {
      try {
        editor.focus();
        document.execCommand('selectAll');
        document.execCommand('delete');
      } catch (_) {}
      try {
        const point = { path: [0, 0], offset: 0 };
        if (slateEditor.selection != null) slateEditor.selection = { anchor: point, focus: point };
        if (slateEditor.history) slateEditor.history = { redos: [], undos: [] };
        if (slateEditor.children) slateEditor.children = [{ type: 'paragraph', children: [{ text: '' }] }];
      } catch (_) {}
    }

    // selection 강제 설정 (새 프로젝트 시 null 방지 — Flow submit이 state를 올바르게 읽도록)
    // ★ v1.1.8: replaceAll=false(이미지투동영상·팩토리 비디오)일 때는 [0,0]이 이미지 void 노드일 수 있음.
    //   그 위치에 insertText 하면 텍스트가 무시되어 "Prompt must be provided" 발생.
    //   → 이미지가 있으면 문서 끝(마지막 텍스트 노드)으로 selection을 이동시켜 거기에 입력.
    let selPoint = { path: [0, 0], offset: 0 };
    if (!replaceAll) {
      try {
        const children = slateEditor.children || [];
        if (children.length) {
          const lastIdx = children.length - 1;
          const lastNode = children[lastIdx];
          const leaves = (lastNode && lastNode.children) ? lastNode.children : [{ text: '' }];
          const leafIdx = leaves.length - 1;
          const leafText = (leaves[leafIdx] && typeof leaves[leafIdx].text === 'string') ? leaves[leafIdx].text : '';
          selPoint = { path: [lastIdx, leafIdx], offset: leafText.length };
        }
      } catch (_) { selPoint = { path: [0, 0], offset: 0 }; }
    }
    slateEditor.apply({
      type: 'set_selection',
      properties: null,
      newProperties: { anchor: selPoint, focus: selPoint }
    });

    // collapsed selection이므로 deleteFragment는 no-op (이미지 노드 보존). replaceAll일 때만 의미 있음.
    slateEditor.deleteFragment();
    if (text) slateEditor.insertText(text);

    window.dispatchEvent(new CustomEvent('__flowFillPromptDone', { detail: { ok: true } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('__flowFillPromptDone', { detail: { ok: false, error: err.message } }));
  }
});
