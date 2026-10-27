// Verify the local port against the site's own JS module (node compare.js)
// Run: node compare.js
import { generateLicense } from './site/mobaXtermGenerater.js';
import { execFileSync } from 'node:child_process';

const cases = [
  [1, 'defaultUser', 1, 21, 0],
  [1, 'alice', 5, 25, 2],
  [3, 'School', 50, 24, 1],
  [4, 'bob', 3, 23, 0],
];
let ok = true;
for (const [t, u, n, M, m] of cases) {
  const js = generateLicense(t, u, n, M, m);
  const py = execFileSync('python', ['keygen.py', '--print', '-t', String(t), '-u', u,
    '-n', String(n), '-M', String(M), '-m', String(m)], { encoding: 'utf8' })
    .split('\n')[0].replace('LicenseString: ', '').trim();
  const same = js === py;
  ok = ok && same;
  console.log(`${same ? 'MATCH' : 'DIFF '}  type=${t} user=${u} n=${n} v=${M}.${m}\n  js=${js}\n  py=${py}`);
}
process.exit(ok ? 0 : 1);
