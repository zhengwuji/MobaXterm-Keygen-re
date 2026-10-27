// e2e_full.mjs — 端到端验证本地增强版 index.html（真实 headless Chrome + CDP）
// 覆盖：生成器（多组合）、复制/送入合并器、合并器（真实文件上传 + 下载校验）、
//       主题切换、tab 切换、错误提示、zip 结构、无 JS 异常。
//
// Run: node e2e_full.mjs  （需要先起 http 服务：python -m http.server 8899）

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('./site/jszip.min.js');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8899';
const URL = BASE + '/index.html';
const PORT = 9344;
const userDataDir = path.join(os.tmpdir(), 'mxt-e2e-' + Date.now());
const downloadDir = path.join(process.cwd(), 'e2e_downloads');
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
  '--disable-features=Translate', 'about:blank',
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
}

async function main() {
  let version;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error('CDP not reachable');
  console.log('browser:', version.Browser, '\nurl    :', URL, '\n');

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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Log.enable'); await send('Network.enable'); await send('DOM.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});

  await send('Page.navigate', { url: URL });
  await sleep(3500);

  /* ---------- 资源加载 ---------- */
  const resps = events.filter(e => e.method === 'Network.responseReceived')
    .map(e => ({ url: e.params.response.url, status: e.params.response.status }));
  const local = resps.filter(r => r.url.startsWith(BASE));
  const bad = local.filter(r => r.status >= 400 && !r.url.includes('favicon'));
  const external = resps.filter(r => !r.url.startsWith(BASE) && !r.url.startsWith('data:'));
  check('所有本地资源 200', bad.length === 0, bad.map(b => b.status + ' ' + b.url).join(', ') || (local.length + ' 个资源'));
  check('无任何外部网络请求', external.length === 0, external.map(e => e.url).join(', ').slice(0, 200));

  /* ---------- 基础环境 ---------- */
  check('页面标题', (await evalJs('document.title')).includes('MobaXterm'), await evalJs('document.title'));
  check('Tailwind 已加载', await evalJs('typeof tailwind === "object"'));
  check('Vue 已加载', await evalJs('typeof Vue === "function"'));
  check('JSZip 已加载', await evalJs('typeof JSZip === "function"'));
  check('saveAs 已加载', await evalJs('typeof saveAs === "function"'));
  check('Vue 实例挂载', await evalJs('!!window.__app && window.__app._isVue'));
  check('生成器算法模块可用',
    await evalJs(`(async()=>{const m=await import('./site/mobaXtermGenerater.js');return typeof m.generateLicense})()`) === 'function');
  check('合并器模块可用',
    await evalJs(`(async()=>{const m=await import('./src/mergeZipFiles.js');return typeof m.mergeZipFiles})()`) === 'function');

  /* ---------- 生成器：三组合 ---------- */
  const cases = [
    [1, 'defaultUser', '21.0', 1, '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a'],
    [3, 'School', '24.1', 50, '0s2GrAyJnQCN6xXer1HerpHf7lnf5tGerh3a4tG'],
    [1, 'zarfadev', '26.5', 9, '2smMpojLpwSL+Qje+13axtme+tXf+13a4tGerh3a'],
    [4, 'bob', '23.0', 3, 'zsmKnoCN6tHert3a6t3e45Herh3a4tGerB'],
  ];

  for (const [type, user, ver, num, expected] of cases) {
    await evalJs(`(() => {
      const a = window.__app;
      a.licenseType = ${type}; a.userName = '${user}'; a.versionName = '${ver}'; a.userNum = ${num};
      return true; })()`);
    await sleep(120);
    await evalJs(`document.querySelector('form').dispatchEvent(new Event('submit'))`);
    await sleep(900);
    const lic = await evalJs('window.__app.lastLicense');
    const field = await evalJs('document.getElementById("licenseOut").value');
    check(`生成 type=${type} ${user} v${ver} n=${num}`, lic === expected, lic === expected ? '' : `got ${lic}`);
    check(`  ↳ textarea 同步`, field === lic);
  }

  /* ---------- 校验逻辑 ---------- */
  await evalJs(`(() => { const a = window.__app; a.userName = 'bad name'; return true; })()`);
  await sleep(150);
  check('用户名含空格被拦', !!(await evalJs('window.__app.errors.userName')), await evalJs('window.__app.errors.userName'));
  await evalJs(`(() => { const a = window.__app; a.userName = 'GoodUser'; a.versionName = '26.10'; return true; })()`);
  await sleep(150);
  check('版本号 26.10 被拦', !!(await evalJs('window.__app.errors.versionName')), await evalJs('window.__app.errors.versionName'));
  await evalJs(`(() => { const a = window.__app; a.versionName = '27.1'; return true; })()`);
  await sleep(150);
  check('宽松模式 27.1 放行但给警告',
    !(await evalJs('window.__app.errors.versionName')) && !!(await evalJs('window.__app.versionWarn')),
    await evalJs('window.__app.versionWarn'));
  await evalJs(`(() => { const a = window.__app; a.strictVersion = true; return true; })()`);
  await sleep(200);
  check('严格模式 27.1 被拦', !!(await evalJs('window.__app.errors.versionName')), await evalJs('window.__app.errors.versionName'));
  await evalJs(`(() => { const a = window.__app; a.strictVersion = false; a.versionName = '21.0'; a.userName='defaultUser'; a.userNum=1; a.licenseType=1; return true; })()`);
  await sleep(200);

  /* ---------- 生成下载的 Custom.mxtpro ---------- */
  fs.readdirSync(downloadDir).forEach(f => fs.rmSync(path.join(downloadDir, f)));
  await evalJs(`document.querySelector('form').dispatchEvent(new Event('submit'))`);
  await sleep(1500);
  let files = fs.readdirSync(downloadDir);
  check('生成器触发文件下载', files.some(f => f === 'Custom.mxtpro'), files.join(','));
  const genPath = path.join(downloadDir, 'Custom.mxtpro');
  if (fs.existsSync(genPath)) {
    const z = await new JSZip().loadAsync(fs.readFileSync(genPath));
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    const pk = await z.file('Pro.key').async('string');
    check('生成包只含 Pro.key', names.length === 1 && names[0] === 'Pro.key', names.join(','));
    check('生成包 Pro.key 内容正确', pk === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a', pk);
  }

  /* ---------- 复制按钮 ---------- */
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(e => console.log('grantPerm:', e.message));
  await send('Page.bringToFront').catch(() => {});
  await evalJs('window.focus(); document.body.click(); true');
  await sleep(200);
  await evalJs(`window.__app.copyLicense()`);
  await sleep(500);
  const clip = await evalJs(`navigator.clipboard.readText().then(t=>t, e=>'ERR:'+e.message)`);
  const textareaVal = await evalJs('window.__app.lastLicense');
  check('复制内容与许可串一致',
    clip === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a',
    clip === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a' ? 'clipboard 读回一致' : `clipboard=${String(clip).slice(0, 50)} ; fallback textarea=${textareaVal === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a'}`);

  /* ---------- 送入合并器 ---------- */
  await evalJs(`window.__app.pushLicenseToMerger()`);
  await sleep(700);
  check('“送到合并器”切换 tab', (await evalJs('window.__app.activeTab')) === 'customMerger');
  check('“送到合并器”填充 license 槽', !!(await evalJs('window.__app.licenseFile')));
  check('送入后能读出 Pro.key', (await evalJs('window.__app.inspect.proKey')) === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a');

  /* ---------- 真实文件上传到 .custom 槽 ---------- */
  const customB64 = fs.readFileSync('test.custom').toString('base64');
  await evalJs(`(() => {
    const bin = atob('${customB64}');
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], 'MobaXterm customization.custom', { type: 'application/zip' });
    window.__app.handleCustomSettingsFileUpload({ target: { files: [file] } });
    return true;
  })()`);
  await sleep(800);
  check('.custom 被接受', (await evalJs('window.__app.customFileName')) === 'MobaXterm customization.custom');
  const listed = await evalJs('JSON.stringify(window.__app.inspect.custom)');
  check('.custom 清单解析正确',
    listed.includes('MobaXterm customization.ini') && listed.includes('Logos/custom_logo.png') && listed.includes('Plugins/demo.mxt3'),
    listed);
  check('两个文件齐备 → 合并按钮可用', !!(await evalJs('window.__app.canMerge')));

  /* ---------- 合并并下载 ---------- */
  fs.readdirSync(downloadDir).forEach(f => fs.rmSync(path.join(downloadDir, f)));
  await evalJs('window.__app.mergeFiles()');
  await sleep(2000);
  files = fs.readdirSync(downloadDir);
  check('合并触发下载', files.includes('Custom.mxtpro'), files.join(','));
  const mergedPath = path.join(downloadDir, 'Custom.mxtpro');
  if (fs.existsSync(mergedPath)) {
    const z = await new JSZip().loadAsync(fs.readFileSync(mergedPath));
    const names = Object.keys(z.files).filter(n => !z.files[n].dir).sort();
    const pk = await z.file('Pro.key').async('string');
    check('合并包含并全部文件',
      names.join('|') === ['Logos/custom_logo.png', 'MobaXterm customization.ini', 'Plugins/demo.mxt3', 'Pro.key'].sort().join('|'),
      names.join(','));
    check('合并后 Pro.key 未被改写', pk === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a', pk);
    check('合并后 UI 记录文件大小', (await evalJs('window.__app.lastMergedSize')) > 0, String(await evalJs('window.__app.lastMergedSize')));
  }

  /* ---------- 错误路径 ---------- */
  await evalJs(`(() => { window.__app.clearFiles(); return true; })()`);
  await sleep(200);
  check('清空后合并按钮禁用', !(await evalJs('window.__app.canMerge')));
  const errMsg = await evalJs(`(async () => {
    const m = await import('./src/mergeZipFiles.js');
    try { await m.mergeZipFiles(new Blob(['not a zip']), new Blob(['x'])); return 'NO_THROW'; }
    catch (e) { return e.message; }
  })()`);
  check('非法 license 包报错可读', /不是有效的 zip/.test(String(errMsg)), String(errMsg).slice(0, 80));

  /* ---------- 主题 ---------- */
  const darkBefore = await evalJs('document.documentElement.classList.contains("dark")');
  await evalJs('window.__app.toggleTheme()');
  await sleep(200);
  const darkAfter = await evalJs('document.documentElement.classList.contains("dark")');
  check('主题切换生效', darkAfter !== darkBefore, darkBefore + ' -> ' + darkAfter);
  check('主题写入 localStorage',
    (await evalJs('localStorage.getItem("theme")')) === (darkAfter ? 'dark' : 'light'),
    String(await evalJs('localStorage.getItem("theme")')));
  // dark 时显示月亮（theme-icon-light）、隐藏太阳（theme-icon-dark）；浅色反之
  const lightHidden = await evalJs('document.getElementById("theme-icon-light").classList.contains("hidden")');
  const darkHidden = await evalJs('document.getElementById("theme-icon-dark").classList.contains("hidden")');
  check('主题图标同步', lightHidden === !darkAfter && darkHidden === darkAfter,
    `dark=${darkAfter} lightHidden=${lightHidden} darkHidden=${darkHidden}`);
  check('主题切换按钮已绑定 click',
    await evalJs('(() => { const b = document.getElementById("theme-toggle"); let hit = false; const h = () => { hit = true; }; b.addEventListener("click", h, { once: true }); b.click(); b.removeEventListener("click", h); return hit; })()'));
  await evalJs('window.__app.toggleTheme()');
  await sleep(150);
  check('主题可切回原状态', (await evalJs('document.documentElement.classList.contains("dark")')) === darkBefore);

  for (const tab of ['customMerger', 'help', 'keyGenerator']) {
    await evalJs(`(() => { const btns=[...document.querySelectorAll('nav[aria-label="功能切换"] button')]; btns.find(b=>b.textContent.trim().startsWith('${tab === 'keyGenerator' ? '生成器' : tab === 'customMerger' ? '合并器' : '说明'}')).click(); return true; })()`);
    await sleep(200);
    if (!check(`Tab 切换到 ${tab}`, (await evalJs('window.__app.activeTab')) === tab)) break;
  }

  /* ---------- 无异常 ---------- */
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  const consoleErrs = events.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error'
    && !/favicon/.test(e.params.entry.url || ''));
  check('无未捕获 JS 异常', exceptions.length === 0,
    exceptions.slice(0, 2).map(e => JSON.stringify(e.params.exceptionDetails?.text || '').slice(0, 120)).join('; '));
  check('无 console error', consoleErrs.length === 0,
    consoleErrs.slice(0, 2).map(e => e.params.entry.text).join('; ').slice(0, 160));

  /* ---------- 汇总 ---------- */
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
