// server.mjs — 本地静态服务（零依赖）
// 由 start.bat / launch.ps1 调用：node server.mjs [port] [host]
//
// 行为：
//   - 只服务当前工作目录（项目根）下的文件，拒绝路径穿越
//   - 自动 Content-Type
//   - Cache-Control: no-store，改完源码刷新即生效
//   - 监听端口被占时自动 +1 重试，最多 20 次
//   - 端口就绪后把 "PID PORT URL" 写进 .run/runtime.json，供 stop 精确结束

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const RUNDIR = path.join(ROOT, '.run');

const START_PORT = Number(process.argv[2]) || 8899;
const HOST = process.argv[3] || '127.0.0.1';
const MAX_TRIES = 20;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

function serve(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // 路径穿越防护：归一化后必须仍在 ROOT 之内
  const target = path.resolve(ROOT, '.' + path.sep + urlPath.replace(/^\/+/, ''));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(target, (err, st) => {
    if (!err && st.isDirectory()) return serve({ ...req, url: urlPath + '/index.html' }, res);
    fs.readFile(target, (e, buf) => {
      if (e) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>404</title>
<body style="font:16px/1.6 system-ui;padding:2rem">
<h2>404 Not Found</h2><p><code>${urlPath.replace(/[<>&]/g, '')}</code> 不存在。</p>
<p>可用入口：<a href="/index.html">/index.html</a> · <a href="/MobaXtermKeygen.html">/MobaXtermKeygen.html</a></p></body>`);
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store, must-revalidate',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

function listen(port, triesLeft) {
  const server = http.createServer(serve);
  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      listen(port + 1, triesLeft - 1);
    } else {
      console.error(`[server] 启动失败: ${err.code || err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/index.html`;
    // 记录运行时信息，stop 脚本据此精确结束
    try {
      fs.mkdirSync(RUNDIR, { recursive: true });
      fs.writeFileSync(path.join(RUNDIR, 'runtime.json'),
        JSON.stringify({ pid: process.pid, port, host: HOST, url, startedAt: new Date().toISOString() }, null, 2));
      fs.writeFileSync(path.join(RUNDIR, 'server.pid'), String(process.pid));
      fs.writeFileSync(path.join(RUNDIR, 'server.url'), url);
    } catch (e) {
      console.error('[server] 写入 runtime 失败: ' + e.message);
    }
    console.log(`[server] 就绪  ${url}  (pid ${process.pid}, root ${ROOT})`);
  });
}

listen(START_PORT, MAX_TRIES);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
