// build_single_file.mjs — 把 index.html + src/* + site/* 内联成一个可双击打开的单文件 HTML
// 输出：MobaXtermKeygen.html（完全离线，file:// 下直接可用）
//
// Run: node build_single_file.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'MobaXtermKeygen.html');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ------------------------------------------------------------------ */
/* 1. 拆开三个 ES module，按依赖顺序内联成普通 <script>                  */
/* ------------------------------------------------------------------ */

/** 去掉 export 语句，收集导出名，返回 { code, exports } */
function stripExports(code) {
  const exportsMap = []; // [localName, exportedName]
  let out = code;

  // export { A, B as C }
  out = out.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (_, list) => {
    list.split(',').forEach(item => {
      const t = item.trim();
      if (!t) return;
      const m = t.match(/^(\S+)\s+as\s+(\S+)$/);
      if (m) exportsMap.push([m[1], m[2]]);
      else exportsMap.push([t, t]);
    });
    return '';
  });

  // export function foo / export const foo = ... / export class Foo
  out = out.replace(/^[ \t]*export\s+(async\s+function|function|const|let|var|class)\s+/gm, (_, kw) => kw + ' ');
  // export default xxx
  out = out.replace(/^[ \t]*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?[ \t]*$/gm, '');
  return { code: out, exports: exportsMap };
}

const algSrc = read('site/mobaXtermGenerater.js');
const mergeSrc = read('src/mergeZipFiles.js');
const appSrc = read('src/app.js');

const alg = stripExports(algSrc);
const merge = stripExports(mergeSrc);

// app.js 只有 import，没有 export 声明（除了 export default app，直接去掉）
const appCode = appSrc
  .replace(/^import\s+.*from\s+['"].*['"];?\s*$/gm, '')
  .replace(/^[ \t]*export\s+default\s+\w+\s*;?[ \t]*$/gm, '');

// 每个模块包进 IIFE，显式暴露导出（等价于原来的 import 绑定）
const moduleBundle = `
/* ================= site/mobaXtermGenerater.js （官网原件） ================= */
var __alg = (function () {
${alg.code}
return { ${alg.exports.map(([l, e]) => `${e}: ${l}`).join(', ')} };
})();
var LicenseType = __alg.LicenseType;
var generateLicense = __alg.generateLicense;

/* ================= src/mergeZipFiles.js ================= */
var __merge = (function () {
${merge.code}
return { ${merge.exports.map(([l, e]) => `${e}: ${l}`).join(', ')} };
})();
var mergeZipFiles = __merge.mergeZipFiles;
var inspectZipSources = __merge.inspectZipSources;
var decodeLicense = __merge.decodeLicense;

/* ================= src/app.js ================= */
(function () {
'use strict';
var LicenseType = __alg.LicenseType;
var generateLicense = __alg.generateLicense;
var mergeZipFiles = __merge.mergeZipFiles;
var inspectZipSources = __merge.inspectZipSources;
var decodeLicense = __merge.decodeLicense;
${appCode}
})();
`;

/* ------------------------------------------------------------------ */
/* 2. 内联 HTML                                                       */
/* ------------------------------------------------------------------ */

let html = read('index.html');

// 2a. 注入模块包（放在 Vue/JSZip/FileSaver 之后，替换掉 type=module 标签）
const moduleTag = /[ \t]*<script\s+type="module"\s+src="\.\/src\/app\.js"\s*><\/script>/;
if (!moduleTag.test(html)) throw new Error('未找到 app.js 的 type=module 标签');
html = html.replace(moduleTag, `<script>\n${moduleBundle}\n</script>`);

// 2b. 内联 CSS
html = html.replace(/<link\s+href="\.\/site\/pure-min\.css"\s+rel="stylesheet"\s*\/?>/g,
  () => `<style>\n${read('site/pure-min.css')}\n</style>`);
html = html.replace(/<link\s+href="\.\/src\/app\.css"\s+rel="stylesheet"\s*\/?>/g,
  () => `<style>\n${read('src/app.css')}\n</style>`);

// 2c. 内联 JS：依次替换 src= 标签
const inlineJs = (srcPath) => {
  const code = read(srcPath).replace(/<\/script>/gi, '<\\/script>');
  return `<script>\n${code}\n</script>`;
};
for (const p of ['site/tailwind.js', 'site/vue.min-2.6.12.js', 'site/FileSaver.min.js', 'site/jszip.min.js']) {
  const re = new RegExp(`<script\\s+src="\\./${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*><\\/script>`);
  if (!re.test(html)) throw new Error('未找到 script 标签: ' + p);
  html = html.replace(re, () => inlineJs(p));
}

// 2d. 标记为单文件版
html = html.replace('<title>', '<title>');
html = html.replace(/(<body[^>]*>)/, '$1\n<!-- 单文件离线构建：所有 JS/CSS 已内联，无任何外部请求 -->');

/* ------------------------------------------------------------------ */
/* 3. 自检：不得残留任何外部引用                                        */
/* ------------------------------------------------------------------ */
const leftover = [...html.matchAll(/(?:src|href)="(\.\/[^"]+|https?:\/\/[^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith('data:'));
if (leftover.length) throw new Error('仍有外部引用: ' + leftover.join(', '));

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`已生成 ${path.basename(OUT)}  (${kb} KB)`);
console.log('残留外部引用: 0');
