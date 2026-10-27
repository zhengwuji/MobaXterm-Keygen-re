// e2e_singlefile.mjs — 验证单文件版 MobaXtermKeygen.html 在 file:// 下完整可用
// 断言：零网络请求（除 file:// 自身）、无模块/CORS 报错、生成+合并全链路 OK
//
// Run: node e2e_singlefile.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('./site/jszip.min.js');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = path.resolve('MobaXtermKeygen.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/');
const PORT = 9351;
const userDataDir = path.join(os.tmpdir(), 'mxt-single-' + Date.now());
const downloadDir = path.join(process.cwd(), 'e2e_downloads_single');
fs.rmSync(downloadDir, { recursive: true, force: true });
fs.mkdirSync(downloadDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  return !!cond;
}

const child = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let ws, msgId = 0;
const pending = new Map();
const events = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

async function main() {
  let version;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error('CDP not reachable');

  const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) events.push(m);
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});

  console.log('file:', URL, '\nbrowser:', version.Browser, '\n');
  await send('Page.navigate', { url: URL });
  await sleep(3500);

  /* ---------- 零网络 ---------- */
  const reqs = events.filter(e => e.method === 'Network.requestWillBeSent').map(e => e.params.request.url);
  const net = reqs.filter(u => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
  check('零网络请求', net.length === 0, net.slice(0, 3).join(', ') || `${reqs.length} 个请求全部是 file://`);
  check('无 failed 请求', events.filter(e => e.method === 'Network.loadingFailed').length === 0,
    events.filter(e => e.method === 'Network.loadingFailed').map(e => e.params.errorText).slice(0, 3).join(', '));

  /* ---------- 基础环境 ---------- */
  check('页面标题', (await evalJs('document.title')).includes('MobaXterm'), await evalJs('document.title'));
  check('Tailwind 已加载', await evalJs('typeof tailwind === "object"'));
  check('Vue 已加载', await evalJs('typeof Vue === "function"'));
  check('JSZip 已加载', await evalJs('typeof JSZip === "function"'));
  check('saveAs 已加载', await evalJs('typeof saveAs === "function"'));
  check('Vue 实例挂载', await evalJs('!!window.__app && window.__app._isVue'));
  check('算法函数在作用域内', await evalJs('typeof generateLicense === "function"'));
  check('合并函数在作用域内', await evalJs('typeof mergeZipFiles === "function"'));
  check('inspectZipSources 在作用域内', await evalJs('typeof inspectZipSources === "function"'));

  /* ---------- 生成 ---------- */
  const cases = [
    [1, 'defaultUser', '21.0', 1, '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a'],
    [3, 'School', '24.1', 50, '0s2GrAyJnQCN6xXer1HerpHf7lnf5tGerh3a4tG'],
    [4, 'bob', '23.0', 3, 'zsmKnoCN6tHert3a6t3e45Herh3a4tGerB'],
  ];
  for (const [type, user, ver, num, expected] of cases) {
    await evalJs(`(() => { const a = window.__app;
      a.licenseType = ${type}; a.userName = '${user}'; a.versionName = '${ver}'; a.userNum = ${num}; return true; })()`);
    await sleep(120);
    await evalJs(`document.querySelector('form').dispatchEvent(new Event('submit'))`);
    await sleep(800);
    const lic = await evalJs('window.__app.lastLicense');
    check(`生成 type=${type} ${user} v${ver} n=${num}`, lic === expected, lic === expected ? '' : `got ${lic}`);
  }

  /* ---------- file:// 下的下载 ---------- */
  await evalJs(`(() => { const a = window.__app;
    a.licenseType = 1; a.userName = 'defaultUser'; a.versionName = '21.0'; a.userNum = 1; return true; })()`);
  await sleep(150);
  fs.readdirSync(downloadDir).forEach(f => fs.rmSync(path.join(downloadDir, f)));
  await evalJs(`document.querySelector('form').dispatchEvent(new Event('submit'))`);
  await sleep(1500);
  const dls = fs.readdirSync(downloadDir).filter(f => !f.endsWith('.crdownload'));
  check('file:// 下仍能下载 Custom.mxtpro', dls.includes('Custom.mxtpro'), dls.join(','));
  const genPath = path.join(downloadDir, 'Custom.mxtpro');
  if (fs.existsSync(genPath)) {
    const z = await new JSZip().loadAsync(fs.readFileSync(genPath));
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    check('包内只有 Pro.key', names.join('|') === 'Pro.key', names.join(','));
    check('Pro.key 内容正确',
      (await z.file('Pro.key').async('string')) === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a');
  }

  /* ---------- 合并 ---------- */
  await evalJs(`window.__app.pushLicenseToMerger()`);
  await sleep(600);
  check('送到合并器', (await evalJs('window.__app.activeTab')) === 'customMerger');
  const b64 = fs.readFileSync('test.custom').toString('base64');
  await evalJs(`(() => {
    const bin = atob('${b64}');
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const f = new File([u8], 'MobaXterm customization.custom', { type: 'application/zip' });
    window.__app.handleCustomSettingsFileUpload({ target: { files: [f] } });
    return true;
  })()`);
  await sleep(800);
  check('.custom 解析通过', (await evalJs('JSON.stringify(window.__app.inspect.custom)')).includes('Plugins/demo.mxt3'));
  fs.readdirSync(downloadDir).forEach(f => fs.rmSync(path.join(downloadDir, f)));
  await evalJs('window.__app.mergeFiles()');
  await sleep(2000);
  const merged = path.join(downloadDir, 'Custom.mxtpro');
  check('合并下载成功', fs.existsSync(merged), fs.readdirSync(downloadDir).join(','));
  if (fs.existsSync(merged)) {
    const z = await new JSZip().loadAsync(fs.readFileSync(merged));
    const names = Object.keys(z.files).filter(n => !z.files[n].dir).sort();
    check('合并结果 4 条目',
      names.join('|') === ['Logos/custom_logo.png', 'MobaXterm customization.ini', 'Plugins/demo.mxt3', 'Pro.key'].sort().join('|'),
      names.join(','));
    check('合并后 Pro.key 未改写',
      (await z.file('Pro.key').async('string')) === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a');
  }

  /* ---------- 异常 ---------- */
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  check('无未捕获异常', exceptions.length === 0,
    exceptions.slice(0, 2).map(e => JSON.stringify(e.params.exceptionDetails?.text || '').slice(0, 120)).join('; '));
  const consoleErrs = events.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error'
    && !/favicon/.test(e.params.entry.url || ''));
  check('无 console error', consoleErrs.length === 0,
    consoleErrs.slice(0, 2).map(e => e.params.entry.text).join('; ').slice(0, 200));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log(' -', f.name, f.extra)); }
  process.exitCode = failed.length ? 1 : 0;
}

try { await main(); }
catch (e) { console.error('E2E ERROR:', e.message); process.exitCode = 1; }
finally {
  try { ws?.close(); } catch {}
  child.kill();
  await sleep(400);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
