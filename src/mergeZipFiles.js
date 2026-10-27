/**
 * mergeZipFiles.js — 从 github.com/zarfadev/MobaXterm-Keygen 移植
 * ---------------------------------------------------------------
 * 语义与原版一致：把 license 包 (Custom.mxtpro，内含 Pro.key) 与
 * MobaXterm Customizer 导出的 .custom 包合并成一个新的 Custom.mxtpro。
 *
 * 相对原版的改进（不改变合并结果）：
 *   1. 原版只把 .custom 里的文件平铺写入；这里保持同样路径，额外补齐显式
 *      目录条目，兼容某些解压器。
 *   2. 原版没有 Pro.key 时会抛 TypeError（Cannot read 'async' of undefined），
 *      这里改成明确的中文错误。
 *   3. 原版对非法 zip 的报错不友好，这里统一转成可读信息。
 *   4. 新增 filter / rename 选项：合并前可过滤或改名（默认不启用）。
 *
 * 返回 Promise<Blob>，与 FileSaver.js 的 saveAs 直接对接。
 */

function describeErr(e) {
  return e && e.message ? e.message : String(e);
}

async function readProKey(licenseFile) {
  const licenseZip = new JSZip();
  let contents;
  try {
    contents = await licenseZip.loadAsync(licenseFile);
  } catch (e) {
    throw new Error('license 文件不是有效的 zip / .mxtpro：' + describeErr(e));
  }
  const entry = contents.file('Pro.key');
  if (!entry) {
    throw new Error('license 包里没有 Pro.key（请确认它是 Keygen 生成的 Custom.mxtpro）');
  }
  return entry.async('string');
}

/**
 * @param {Blob|ArrayBuffer|Uint8Array} licenseFile - Custom.mxtpro
 * @param {Blob|ArrayBuffer|Uint8Array} customSettingsFile - xxx.custom
 * @param {Object} [options]
 * @param {(path:string, file:Object)=>boolean} [options.filter] - 返回 false 则跳过该文件
 * @param {(path:string)=>string} [options.rename] - 重命名相对路径
 * @param {boolean} [options.verbose] - 打印被合并的文件列表
 * @returns {Promise<Blob>}
 */
function mergeZipFiles(licenseFile, customSettingsFile, options = {}) {
  const { filter, rename, verbose = false } = options;

  return (async () => {
    const proKey = await readProKey(licenseFile);

    const settingsZip = new JSZip();
    let settings;
    try {
      settings = await settingsZip.loadAsync(customSettingsFile);
    } catch (e) {
      throw new Error('.custom 文件不是有效的 zip（应来自 MobaXterm.exe -customizer 导出）：' + describeErr(e));
    }

    const merged = new JSZip();
    merged.file('Pro.key', proKey);

    const dirs = new Set();
    const tasks = [];
    const mergedPaths = [];

    settings.forEach((relativePath, file) => {
      if (file.dir) {
        dirs.add(relativePath.replace(/\/+$/, ''));
        return;
      }
      if (filter && !filter(relativePath, file)) return;

      const outPath = rename ? rename(relativePath) : relativePath;
      if (!outPath || outPath === 'Pro.key') return; // 不覆盖 license

      const parts = outPath.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }

      tasks.push(
        file.async('uint8array').then(buf => {
          merged.file(outPath, buf);
          mergedPaths.push(outPath);
        })
      );
    });

    await Promise.all(tasks);

    // 原版只写了文件；这里补上显式目录条目（zip 语义等价，兼容部分解压器）
    dirs.forEach(d => {
      if (d) merged.folder(d);
    });

    const blob = await merged.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    if (verbose) {
      console.log('[mergeZipFiles] Pro.key + ' + mergedPaths.length + ' files:', mergedPaths);
    }
    return blob;
  })();
}

const VARIANT_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const VARIANT_DICT = {};
for (let i = 0; i < VARIANT_TABLE.length; i++) VARIANT_DICT[VARIANT_TABLE[i]] = i;

function variantBase64Decode(str) {
  const codes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (VARIANT_DICT[c] !== undefined) codes.push(VARIANT_DICT[c]);
  }
  const out = [];
  let i = 0;
  while (i < codes.length) {
    const chunk = codes.slice(i, i + 4);
    if (chunk.length < 2) break;
    let coding = chunk[0] | (chunk[1] << 6);
    if (chunk.length >= 3) coding |= chunk[2] << 12;
    if (chunk.length >= 4) coding |= chunk[3] << 18;
    const count = chunk.length - 1;
    out.push(coding & 0xFF);
    if (count >= 2) out.push((coding >> 8) & 0xFF);
    if (count >= 3) out.push((coding >> 16) & 0xFF);
    i += 4;
    if (chunk.length < 4) break;
  }
  return out;
}

function decryptBytes(key, bs) {
  const res = [];
  for (let i = 0; i < bs.length; i++) {
    const val = bs[i];
    res.push(val ^ ((key >> 8) & 0xFF));
    key = (val & key) | 0x482D;
  }
  return res;
}

/** 反向解析 Pro.key 许可证字符串，提取明文信息 */
function decodeLicense(licStr) {
  if (!licStr || typeof licStr !== 'string') return null;
  try {
    const bytes = variantBase64Decode(licStr.trim());
    const decrypted = decryptBytes(0x787, bytes);
    let plain = '';
    for (let i = 0; i < decrypted.length; i++) {
      plain += String.fromCharCode(decrypted[i]);
    }
    const parts = plain.split('#');
    if (parts.length < 4) return null;
    const typeNum = parseInt(parts[0], 10);
    const typeMap = { 1: 'Professional', 3: 'Educational', 4: 'Personal' };
    const userAndVer = parts[1] || '';
    const userVerParts = userAndVer.split('|');
    const user = userVerParts[0];
    const verRaw = userVerParts[1] || '';
    let verFmt = verRaw;
    if (verRaw.length >= 2) {
      verFmt = verRaw.slice(0, verRaw.length - 1) + '.' + verRaw.slice(verRaw.length - 1);
    }
    const count = parseInt(parts[2], 10) || 1;
    return {
      plain,
      type: typeNum,
      typeName: typeMap[typeNum] || ('Type ' + typeNum),
      userName: user,
      version: verFmt,
      versionRaw: verRaw,
      userCount: count,
    };
  } catch {
    return null;
  }
}

/** 只读检查：返回两个包的清单，供 UI 预览 */
async function inspectZipSources(licenseFile, customSettingsFile) {
  const out = { license: [], custom: [], proKey: null, parsedKey: null, warnings: [] };

  if (licenseFile) {
    try {
      const z = await new JSZip().loadAsync(licenseFile);
      Object.keys(z.files).forEach(p => { if (!z.files[p].dir) out.license.push(p); });
      const pk = z.file('Pro.key');
      out.proKey = pk ? await pk.async('string') : null;
      if (out.proKey) {
        out.parsedKey = decodeLicense(out.proKey);
      } else {
        out.warnings.push('license 包内没有 Pro.key');
      }
    } catch (e) {
      out.warnings.push('license 包无法解析：' + describeErr(e));
    }
  }

  if (customSettingsFile) {
    try {
      const z = await new JSZip().loadAsync(customSettingsFile);
      Object.keys(z.files).forEach(p => { if (!z.files[p].dir) out.custom.push(p); });
    } catch (e) {
      out.warnings.push('.custom 包无法解析：' + describeErr(e));
    }
  }

  return out;
}

export { mergeZipFiles, inspectZipSources, decodeLicense };
