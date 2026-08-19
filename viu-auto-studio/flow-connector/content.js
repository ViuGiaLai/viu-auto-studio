const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (element) => !!element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
function buttons() { return [...document.querySelectorAll('button,[role="button"],[role="tab"],[role="option"]')].filter(visible); }
function findByText(words) { const wanted=words.map(normalized); return buttons().find((el) => wanted.some((word) => normalized(el.textContent).includes(word))); }
async function click(element) { if (!element) return false; element.scrollIntoView({ block:'center' }); element.click(); await sleep(500); return true; }
function editor() { return document.querySelector('[contenteditable="true"][data-slate-editor="true"],textarea,[contenteditable="true"]'); }
async function fillPrompt(text) {
  const field=editor(); if (!field) throw new Error('Không tìm thấy ô prompt Flow');
  field.focus();
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) { field.value=text; field.dispatchEvent(new Event('input',{bubbles:true})); }
  else { document.execCommand('selectAll'); document.execCommand('insertText',false,text); field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text})); }
  await sleep(400);
}
function submitButton() {
  return buttons().find((button) => {
    const label=normalized(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`);
    return label.includes('generate') || label.includes('tạo') || label.includes('send') || button.querySelector('i.google-symbols')?.textContent?.match(/arrow_forward|send/i);
  });
}
async function waitForMedia(timeoutMs=600000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
    const video=[...document.querySelectorAll('video')].find((el)=>visible(el)&&el.currentSrc);
    if(video?.currentSrc) return video.currentSrc;
    const image=[...document.querySelectorAll('img')].find((el)=>visible(el)&&/googleusercontent|gstatic|blob:/.test(el.currentSrc||el.src));
    if(image?.currentSrc||image?.src) return image.currentSrc||image.src;
    await sleep(2000);
  }
  throw new Error('Hết thời gian chờ media Flow');
}
async function run(task) {
  if (task.media_type === 'video') await click(findByText(['video'])); else await click(findByText(['image','hình ảnh']));
  if (task.aspect === '9:16') await click(findByText(['portrait','dọc','9:16'])); else await click(findByText(['landscape','ngang','16:9']));
  await fillPrompt([task.prompt, task.style_prompt].filter(Boolean).join('\n\n'));
  const submit=submitButton(); if(!submit) throw new Error('Không tìm thấy nút Generate của Flow');
  await click(submit);
  return { ok:true, mediaUrl:await waitForMedia() };
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=='VAS_RUN_TASK') return;
  run(message.task).then(sendResponse).catch((error)=>sendResponse({ok:false,error:String(error?.message||error)}));
  return true;
});
