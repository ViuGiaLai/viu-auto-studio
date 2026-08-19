import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox']});
const p = await b.newPage();
p.on('console', m => console.log('[CONSOLE]', m.type(), m.text()));
p.on('pageerror', e => console.log('[PAGEERR]', e.message));
await p.goto('http://127.0.0.1:38455/index.html', {waitUntil: 'networkidle0', timeout: 30000});
await new Promise(r => setTimeout(r, 8000));
const res = await p.evaluate(() => {
  const st = document.querySelector('[data-testid]') ? 't' : '';
  const hasAPI = !!window.electronAPI;
  const root = document.querySelector('#root');
  return {hasAPI, rootText: root ? root.innerText.slice(0, 300) : 'NO ROOT'};
});
console.log('EVAL:', JSON.stringify(res));
await b.close();
