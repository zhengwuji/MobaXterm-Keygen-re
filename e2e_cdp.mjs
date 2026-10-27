// End-to-end test of local.html in a REAL browser (headless Chrome via CDP).
// - loads LOCALURL
// - fills the form, clicks 生成
// - captures the license string textarea + the downloaded Custom.mxtpro bytes
// - verifies the zip contains Pro.key and that it matches the expected JS/python output
//
// Run: node e2e_cdp.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('./site/jszip.min.js');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'LOCALURL';
const PORT = 9333;
const userDataDir = path.join(os.tmpdir(), 'mxtpro-e2e-' + Date.now());
const downloadDir = path.join(process.cwd(), 'e2e_downloads');
fs.mkdirSync(downloadDir, { recursive: true });

const child = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--disable-extensions',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return r.json();
}

let ws, msgId = 0;
const pending = new Map();
const events = [];

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

async function main() {
  // wait for CDP
  let version;
  for (let i = 0; i < 60; i++) {
    try { version = await getJSON('/json/version'); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error('CDP not reachable');
  console.log('browser :', version.Browser);

  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) events.push(m);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: downloadDir,
  }).catch(() => {});
  // setDownloadBehavior also exists on Page domain in some versions
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {});

  console.log('navigate:', URL);
  await send('Page.navigate', { url: URL });
  await sleep(3000);

  // collect console / network failures
  const netFail = events.filter(e => e.method === 'Network.loadingFailed');
  const resp = events.filter(e => e.method === 'Network.responseReceived')
    .map(e => `${e.params.response.status} ${e.params.response.url.replace('http://127.0.0.1:8899', '')}`);
  console.log('responses:', resp.join(' | ') || '(none)');
  if (netFail.length) console.log('netfail  :', netFail.map(e => e.params.errorText).join(','));

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  // page sanity
  console.log('title    :', await evalJs('document.title'));
  console.log('Vue loaded:', await evalJs('typeof Vue'));
  console.log('JSZip    :', await evalJs('typeof JSZip'));
  console.log('saveAs   :', await evalJs('typeof saveAs'));
  console.log('button   :', await evalJs('!!document.getElementById("gen")'));
  console.log('module fn:', await evalJs(`(async()=>{const m=await import('./site/mobaXtermGenerater.js');return typeof m.generateLicense})()`));

  // fill form: Educational / School / 24.1 / 50
  await evalJs(`(() => {
    document.getElementById('licenseType').value = '3';
    document.getElementById('licenseType').dispatchEvent(new Event('change'));
    document.getElementById('userName').value = 'School';
    document.getElementById('versionName').value = '24.1';
    document.getElementById('userNum').value = '50';
    document.getElementById('gen').click();
    return true;
  })()`);
  await sleep(2500);

  const lic = await evalJs('document.getElementById("out").value');
  console.log('in-page license:', lic);
  const expected = '0s2GrAyJnQCN6xXer1HerpHf7lnf5tGerh3a4tG'; // from compare.js (type=3 School 50 v24.1)
  console.log('matches expected:', lic === expected);

  // check downloaded file
  await sleep(1500);
  const files = fs.readdirSync(downloadDir);
  console.log('downloads:', files);
  const dl = files.find(f => f.endsWith('.mxtpro'));
  if (dl) {
    const buf = fs.readFileSync(path.join(downloadDir, dl));
    const z = await new JSZip().loadAsync(buf);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    const proKey = await z.file('Pro.key').async('string');
    console.log('downloaded  :', dl, buf.length, 'bytes');
    console.log('zip entries :', names);
    console.log('Pro.key     :', proKey);
    console.log('Pro.key == page license:', proKey === lic);
  } else {
    console.log('NO DOWNLOAD CAPTURED');
  }

  // click again with default (Professional/defaultUser/21.0/1) to check repeatability
  await evalJs(`(() => {
    document.getElementById('licenseType').value='1';
    document.getElementById('userName').value='defaultUser';
    document.getElementById('versionName').value='21.0';
    document.getElementById('userNum').value='1';
    document.getElementById('gen').click(); return true; })()`);
  await sleep(1200);
  const lic2 = await evalJs('document.getElementById("out").value');
  console.log('2nd license :', lic2, '| matches 21.0 case:', lic2 === '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a');

  const jsErrors = events.filter(e => e.method === 'Runtime.exceptionThrown');
  console.log('runtime exceptions:', jsErrors.length);
}

try {
  await main();
} catch (e) {
  console.error('E2E FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  child.kill();
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
