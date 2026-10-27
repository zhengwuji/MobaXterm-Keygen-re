// Merge test: use zarfadev's mergeZipFiles.js logic against our generated Custom.mxtpro
// Run: node merge_test.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('./site/jszip.min.js');

// --- exact logic from gh/js/mergeZipFiles.js, but on Node Buffers instead of Blobs ---
async function mergeZipFiles(licenseFile, customSettingsFile) {
  const licenseZip = new JSZip();
  const settingsZip = new JSZip();
  const mergedZip = new JSZip();
  const licenseContents = await licenseZip.loadAsync(licenseFile);
  const settingsContents = await settingsZip.loadAsync(customSettingsFile);
  const proKeyContent = await licenseContents.file('Pro.key').async('string');
  mergedZip.file('Pro.key', proKeyContent);
  const tasks = [];
  settingsContents.forEach((relativePath, file) => {
    if (!file.dir) tasks.push(file.async('nodebuffer').then(c => mergedZip.file(relativePath, c)));
  });
  await Promise.all(tasks);
  return mergedZip.generateAsync({ type: 'nodebuffer' });
}

let licenseBuf;
if (fs.existsSync('Custom.mxtpro')) {
  licenseBuf = fs.readFileSync('Custom.mxtpro');
} else {
  const lz = new JSZip();
  lz.file('Pro.key', '2sGLt4SK9QCPdsTL6Qje5h3a5tme5tHe+h3a4tGerh3a');
  licenseBuf = await lz.generateAsync({ type: 'nodebuffer' });
}
const merged = await mergeZipFiles(licenseBuf, fs.readFileSync('test.custom'));

const z = await new JSZip().loadAsync(merged);
const names = Object.keys(z.files).sort();
console.log('merged entries:', names);
console.log('Pro.key =', await z.file('Pro.key').async('string'));
console.log('ini     =', (await z.file('MobaXterm customization.ini').async('string')).trim());
const png = await z.file('Logos/custom_logo.png').async('nodebuffer');
console.log('png magic ok =', png.slice(0, 4).toString('hex') === '89504e47', 'size =', png.length);
console.log('size merged =', merged.length);
