// Tiny headless-Chrome driver (no deps): node tools/cdp.mjs <url> <jsExpr-that-becomes-truthy> [profileDir] [width] [height] [dark] [screenshot.png] [actionJs]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const [url, doneExpr = 'window.__EVAL', prof = 'C:/tz/.cdp-profile', W = '1440', H = '1000', dark = '0', shot = '', action = ''] = process.argv.slice(2);
mkdirSync(prof, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars',
  `--window-size=${W},${H}`, '--no-first-run', ...(dark === '1' ? ['--force-dark-mode'] : []), 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type))
    errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
if (dark === '1') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
if (+W < 720) await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: true });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.navigate', { url });
const t0 = Date.now();
if (action) { for (let i = 0; i < 100 && !(await ev('document.readyState==="complete"')); i++) await sleep(100); await sleep(500); await ev(action); }
let v;
while (Date.now() - t0 < 240000) { v = await ev(`(()=>{try{return ${doneExpr}}catch(e){return null}})()`); if (v) break; await sleep(300); }
console.log('RESULT', JSON.stringify(v));
const txt = await ev(`(document.getElementById('out')||{}).textContent||''`);
if (txt) console.log(txt);
if (shot) {
  await sleep(600);
  const m = await ev('JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight])');
  console.log('page size', m);
  const full = process.env.FULL === '1';
  if (full) { const [sw, sh] = JSON.parse(m); await send('Emulation.setDeviceMetricsOverride', { width: +W, height: sh, deviceScaleFactor: 1, mobile: +W < 720 }); await sleep(400); }
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shot, Buffer.from(s.result.data, 'base64'));
}
console.log('CONSOLE ERRORS/WARNINGS:', errors.length ? '\n' + errors.join('\n') : 'none');
ws.close(); chrome.kill();
process.exit(0);
