// src/app.js — 本地增强版前端逻辑
// 核心算法仍然来自 site/mobaXtermGenerater.js（官网原件，未改一行）
// 合并器来自 ./mergeZipFiles.js（移植自 zarfadev/MobaXterm-Keygen）

import { LicenseType, generateLicense } from '../site/mobaXtermGenerater.js';
import { mergeZipFiles, inspectZipSources, decodeLicense } from './mergeZipFiles.js';

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */
let toastTimer;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  const ok = document.getElementById('toast-icon-success');
  const bad = document.getElementById('toast-icon-error');
  if (!toast) return;

  text.textContent = message;
  toast.classList.remove('hidden', 'translate-y-24', 'opacity-0');
  toast.classList.remove(
    'bg-green-50', 'dark:bg-green-900/90', 'text-green-700', 'dark:text-green-100',
    'bg-red-50', 'dark:bg-red-900/90', 'text-red-700', 'dark:text-red-100'
  );
  if (type === 'success') {
    toast.classList.add('bg-green-50', 'dark:bg-green-900/90', 'text-green-700', 'dark:text-green-100');
    ok.classList.remove('hidden'); bad.classList.add('hidden');
  } else {
    toast.classList.add('bg-red-50', 'dark:bg-red-900/90', 'text-red-700', 'dark:text-red-100');
    bad.classList.remove('hidden'); ok.classList.add('hidden');
  }
  requestAnimationFrame(() => toast.classList.remove('translate-y-24', 'opacity-0'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 4000);
}

/* ------------------------------------------------------------------ */
/* 版本校验：默认宽松（保留本地版"任意版本可用"），可一键切严格白名单    */
/* ------------------------------------------------------------------ */
const SUPPORTED_MAJORS = [20, 21, 22, 23, 24, 25, 26, 27];

function validateVersionString(v, strict) {
  if (!v) return { ok: false, msg: '版本号必填' };
  if (!/^[1-9][0-9]*\.?\d{0,1}$/.test(v)) {
    return { ok: false, msg: '格式形如 26.5（小数位最多 1 位，不支持 26.10）' };
  }
  const major = parseInt(v.split('.')[0], 10);
  if (!SUPPORTED_MAJORS.includes(major)) {
    if (strict) return { ok: false, msg: '严格模式只放行 ' + SUPPORTED_MAJORS.join('/') + ' 主版本' };
    return { ok: true, warn: '主版本 ' + major + ' 不在官方测试列表，可能仍可用' };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 主题                                                               */
/* ------------------------------------------------------------------ */
function syncThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const d = document.getElementById('theme-icon-dark');
  const l = document.getElementById('theme-icon-light');
  if (d) d.classList.toggle('hidden', isDark);
  if (l) l.classList.toggle('hidden', !isDark);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.title = isDark ? '切换到浅色' : '切换到深色';
}
function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  syncThemeIcon();
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}
  const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved ? saved === 'dark' : preferDark;
  document.documentElement.classList.toggle('dark', dark);
  syncThemeIcon();
}

/* ------------------------------------------------------------------ */
/* Vue 应用                                                           */
/* ------------------------------------------------------------------ */
initTheme();
document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

const app = new Vue({
  el: '#app',
  data() {
    return {
      LICENSE_TYPES: LicenseType,
      activeTab: 'keyGenerator',

      /* 生成器 */
      licenseType: 1,
      userName: 'defaultUser',
      versionName: '21.0',
      userNum: 1,
      strictVersion: false,
      versionPresets: ['26.5', '26.4', '25.2', '24.4', '24.0', '23.0', '21.0'],
      errors: { licenseType: '', userName: '', versionName: '', userNum: '' },
      lastLicense: '',
      versionWarn: '',

      /* 合并器 */
      licenseFile: null,
      licenseBlobName: '',
      customSettingsFile: null,
      mergeErrors: { licenseFile: '', customSettingsFile: '' },
      inspect: { license: [], custom: [], proKey: null, warnings: [] },
      lastMergedName: '',
      lastMergedSize: 0,

      /* 高级 */
      adv: {
        compression: 'DEFLATE',
        fileName: 'Custom.mxtpro',
      },
    };
  },

  computed: {
    canMerge() {
      return !!(this.licenseFile && this.customSettingsFile);
    },
    typeName() {
      const hit = Object.entries(LicenseType).find(([, v]) => v === this.licenseType);
      return hit ? hit[0] : String(this.licenseType);
    },
    licenseFileName() {
      if (this.licenseFile && this.licenseFile.name) return this.licenseFile.name;
      return this.licenseBlobName || '';
    },
    customFileName() {
      return (this.customSettingsFile && this.customSettingsFile.name) || '';
    },
    hasErrors() {
      const e = this.errors;
      return !!(e.licenseType || e.userName || e.versionName || e.userNum);
    },
    parsedLastLicense() {
      return decodeLicense(this.lastLicense);
    },
  },

  methods: {
    /* ---------- 校验 ---------- */
    validateAll() {
      const e = this.errors;
      e.licenseType = this.licenseType ? '' : '请选择版本';
      e.userName = !this.userName
        ? '用户名必填'
        : (/^[a-zA-Z]+$/.test(this.userName) ? '' : '只能使用字母（不支持空格/数字/符号）');
      e.userNum = !this.userNum
        ? '用户数必填'
        : (/^[1-9]+\d*$/.test(String(this.userNum)) ? '' : '必须是 ≥ 1 的整数');

      const vr = validateVersionString(String(this.versionName || ''), this.strictVersion);
      e.versionName = vr.ok ? '' : vr.msg;
      this.versionWarn = vr.warn || '';

      return !this.hasErrors;
    },

    /* ---------- 生成器 ---------- */
    generateLicenseFile(licenseStr) {
      const zip = new JSZip();
      zip.file('Pro.key', licenseStr);
      return zip.generateAsync({
        type: 'blob',
        compression: this.adv.compression === 'STORE' ? 'STORE' : 'DEFLATE',
      });
    },

    generate() {
      if (!this.validateAll()) {
        showToast('请先修正表单里的错误', 'error');
        return;
      }
      const parts = String(this.versionName).split('.');
      const major = parseInt(parts[0], 10);
      const minor = parts.length === 2 ? (parseInt(parts[1], 10) || 0) : 0;
      const count = parseInt(this.userNum, 10) || 1;

      let lic;
      try {
        lic = generateLicense(this.licenseType, this.userName, count, major, minor);
      } catch (err) {
        console.error(err);
        showToast('生成失败：' + (err && err.message ? err.message : err), 'error');
        return;
      }

      this.lastLicense = lic;
      const out = document.getElementById('licenseOut');
      if (out) out.value = lic;

      this.generateLicenseFile(lic)
        .then(async blob => {
          const name = this.adv.fileName || 'Custom.mxtpro';
          const ok = await this.saveBlobSmart(blob, name);
          if (ok) {
            showToast('已生成 ' + name + '（' + this.typeName + ' / ' + this.versionName + ' / ' + count + ' 用户）', 'success');
          }
        })
        .catch(err => {
          console.error(err);
          showToast('打包失败：' + (err && err.message ? err.message : err), 'error');
        });
    },

    /** 把刚生成的 license 直接送进合并器第一个槽 */
    pushLicenseToMerger() {
      if (!this.lastLicense) {
        showToast('先生成 license', 'error');
        return;
      }
      this.generateLicenseFile(this.lastLicense).then(blob => {
        this.licenseFile = blob;
        this.licenseBlobName = this.adv.fileName || 'Custom.mxtpro';
        this.mergeErrors.licenseFile = '';
        this.activeTab = 'customMerger';
        this.refreshInspect();
        showToast('已把当前 license 送入合并器', 'success');
      });
    },

    copyLicense() {
      if (!this.lastLicense) return;
      const done = () => showToast('license 字符串已复制', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.lastLicense).then(done).catch(() => this._fallbackCopy(done));
      } else {
        this._fallbackCopy(done);
      }
    },
    _fallbackCopy(done) {
      const out = document.getElementById('licenseOut');
      if (out) {
        out.removeAttribute('readonly');
        out.select();
        try { document.execCommand('copy'); } catch {}
        out.setAttribute('readonly', 'readonly');
      }
      done();
    },

    /* ---------- 合并器 ---------- */
    handleLicenseFileUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!/\.mxtpro$/i.test(file.name)) {
        this.licenseFile = null;
        this.mergeErrors.licenseFile = '请选择 .mxtpro 文件';
      } else {
        this.licenseFile = file;
        this.licenseBlobName = file.name;
        this.mergeErrors.licenseFile = '';
      }
      this.refreshInspect();
    },
    handleCustomSettingsFileUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!/\.custom$/i.test(file.name)) {
        this.customSettingsFile = null;
        this.mergeErrors.customSettingsFile = '请选择 .custom 文件（MobaXterm.exe -customizer 导出）';
      } else {
        this.customSettingsFile = file;
        this.mergeErrors.customSettingsFile = '';
      }
      this.refreshInspect();
    },
    clearFiles() {
      this.licenseFile = null;
      this.licenseBlobName = '';
      this.customSettingsFile = null;
      this.mergeErrors = { licenseFile: '', customSettingsFile: '' };
      this.inspect = { license: [], custom: [], proKey: null, warnings: [] };
      const a = document.getElementById('licenseFileInput');
      const b = document.getElementById('customSettingsFileInput');
      if (a) a.value = '';
      if (b) b.value = '';
    },

    async refreshInspect() {
      try {
        this.inspect = await inspectZipSources(this.licenseFile, this.customSettingsFile);
      } catch (e) {
        console.warn(e);
      }
    },

    mergeFiles() {
      if (!this.canMerge) {
        showToast('两个文件都必须选择', 'error');
        return;
      }
      mergeZipFiles(this.licenseFile, this.customSettingsFile, { verbose: true })
        .then(async blob => {
          const name = this.adv.fileName || 'Custom.mxtpro';
          const ok = await this.saveBlobSmart(blob, name);
          if (ok) {
            this.lastMergedName = name;
            this.lastMergedSize = blob.size;
            showToast('合并完成：' + name + '（' + this.fmtBytes(blob.size) + '）', 'success');
          }
        })
        .catch(err => {
          console.error(err);
          showToast('合并失败：' + (err && err.message ? err.message : err), 'error');
        });
    },

    setVersion(v) {
      this.versionName = v;
      this.validateAll();
    },

    copyDeployCmd() {
      const cmd = 'Copy-Item .\\Custom.mxtpro "$env:ProgramFiles (x86)\\Mobatek\\MobaXterm\\Custom.mxtpro" -Force';
      const done = () => showToast('已复制 PowerShell 部署命令', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(done).catch(() => this._fallbackCopyText(cmd, done));
      } else {
        this._fallbackCopyText(cmd, done);
      }
    },

    copyCleanCmd() {
      const cmd = '(Get-Content "$env:APPDATA\\MobaXterm\\MobaXterm.ini") -notmatch "^(\\[License\\]|ProKey=)" | Set-Content "$env:APPDATA\\MobaXterm\\MobaXterm.ini"';
      const done = () => showToast('已复制缓存清理命令', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(done).catch(() => this._fallbackCopyText(cmd, done));
      } else {
        this._fallbackCopyText(cmd, done);
      }
    },

    _fallbackCopyText(text, done) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      done && done();
    },

    async saveBlobSmart(blob, defaultName = 'Custom.mxtpro') {
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: 'MobaXterm License / Custom Package (*.mxtpro)',
              accept: { 'application/octet-stream': ['.mxtpro'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (err) {
          if (err && err.name === 'AbortError') return false;
        }
      }
      saveAs(blob, defaultName);
      return true;
    },

    /* ---------- 拖拽 ---------- */
    onDrop(e, which) {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      const fake = { target: { files: dt.files } };
      if (which === 'license') this.handleLicenseFileUpload(fake);
      else this.handleCustomSettingsFileUpload(fake);
    },

    /* ---------- 杂项 ---------- */
    toggleTheme,
    fmtBytes(n) {
      if (!n && n !== 0) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    },
    openGithub() {
      window.open('https://github.com/zhengwuji/MobaXterm-Keygen-re', '_blank', 'noopener');
    },
  },

  watch: {
    versionName() { this.validateAll(); },
    userName() { this.validateAll(); },
    userNum() { this.validateAll(); },
    licenseType() { this.validateAll(); },
    strictVersion() { this.validateAll(); },
  },
});

// 供 headless 测试/外部脚本调用
window.__app = app;
export default app;
