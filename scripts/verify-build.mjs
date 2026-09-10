#!/usr/bin/env node
/* GRID//NODE Phase 1 verification gate.
 *
 * Proves dist/ is behavior-preserving:
 *   1. dist/index.html is byte-identical to index.html except ?v= stamps.
 *   2. dist/sw.js is byte-identical to sw.js except RELEASE/CACHE_NAME.
 *   3. Every copied asset (js/, css/, assets/, i18n/, _headers,
 *      manifest.json) is byte-identical to the source tree.
 *   4. Every service-worker SHELL entry resolves to a real file in dist/.
 *
 * Usage: npm run verify   (run after: npm run build)
 * Exit 0 = all gates pass. Exit 1 = anything differs or is missing.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isExcluded } from './dist-exclusions.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
let failures = 0;

const ok = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const normStamps = (s) => s.replace(/\?v=\d{8}\.[\da-z-]+/g, '?v=BUILD');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('gate 1: index.html identical except version stamps');
{
  const src = normStamps(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  const dst = normStamps(readFileSync(join(DIST, 'index.html'), 'utf8'));
  src === dst ? ok('dist/index.html matches source (stamps normalized)') : fail('dist/index.html DIFFERS from source');
}

console.log('gate 2: sw.js identical except RELEASE/CACHE_NAME');
{
  const norm = (s) => s
    .replace(/const RELEASE = '[^']*'/, "const RELEASE = 'BUILD'")
    .replace(/const CACHE_NAME = '[^']*'/, "const CACHE_NAME = 'BUILD'");
  const src = norm(readFileSync(join(ROOT, 'sw.js'), 'utf8'));
  const dst = norm(readFileSync(join(DIST, 'sw.js'), 'utf8'));
  src === dst ? ok('dist/sw.js matches source (release normalized)') : fail('dist/sw.js DIFFERS from source');
}

console.log('gate 3: copied assets byte-identical');
{
  // js/gridnode-version.js and js/gridnode-whatsnew.js are stamped by the
  // build (BUILD_ID + changelog placeholder key), so they are compared with
  // the build identity normalized out instead of byte-for-byte.
  const normBuildStamped = (s) => s
    .replace(/(APP_BUILD:\s*')[^']*(')/g, '$1BUILD$2')
    .replace(/((?:^|[\s{,])release:\s*')[^']*(')/g, '$1BUILD$2')
    .replace(/'__CURRENT_BUILD__'/g, "'BUILD'")
    .replace(/'\d{8}\.[\da-z-]+'(?=\s*:\s*\{)/g, "'BUILD'");
  let checked = 0, bad = 0;
  for (const d of ['js', 'css', 'assets', 'i18n']) {
    for (const p of walk(join(ROOT, d))) {
      const rel = relative(join(ROOT, d), p);
      if (isExcluded(`${d}/${rel}`)) continue; // deploy-waste prune: intentionally not shipped
      const dp = join(DIST, d, rel);
      checked++;
      if (!existsSync(dp)) { bad++; fail(`missing in dist: ${d}/${rel}`); }
      else if (d === 'js' && (rel === 'gridnode-version.js' || rel === 'gridnode-whatsnew.js')) {
        const srcN = normBuildStamped(readFileSync(p, 'utf8'));
        const dstN = normBuildStamped(readFileSync(dp, 'utf8'));
        if (srcN !== dstN) { bad++; fail(`changed in dist beyond build stamps: ${d}/${rel}`); }
      }
      else if (sha(p) !== sha(dp)) { bad++; fail(`changed in dist: ${d}/${rel}`); }
    }
  }
  for (const f of ['_headers', 'manifest.json']) {
    checked++;
    if (!existsSync(join(DIST, f))) { bad++; fail(`missing in dist: ${f}`); }
    else if (sha(join(ROOT, f)) !== sha(join(DIST, f))) { bad++; fail(`changed in dist: ${f}`); }
  }
  bad === 0 ? ok(`${checked} files byte-identical`) : fail(`${bad}/${checked} files differ`);
}

console.log('gate 4: every SW SHELL entry exists in dist/');
{
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const m = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) { fail('SHELL array not found in dist/sw.js'); }
  else {
    const entries = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    let missing = 0;
    for (const e of entries) {
      const path = e.split('?')[0]; // strip ?v=
      const disk = path === '/' ? join(DIST, 'index.html') : join(DIST, path);
      if (!existsSync(disk)) { missing++; fail(`SHELL entry missing: ${e}`); }
    }
    missing === 0 ? ok(`${entries.length} SHELL entries resolve in dist/`) : fail(`${missing} SHELL entries missing`);
  }
}

console.log('gate 5: every local asset reference in dist/index.html resolves');
{
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|data:|blob:|#|mailto:)/.test(u)) continue; // external or fragment
    refs.add(u.split('?')[0].split('#')[0]);
  }
  // url(...) inside the inline <style> blocks
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const u = m[1].trim();
    if (/^(https?:|data:|blob:|#)/.test(u)) continue;
    refs.add(u.split('?')[0]);
  }
  let missing = 0;
  for (const r of refs) {
    const disk = r.startsWith('/') ? join(DIST, r) : join(DIST, r.replace(/^\.\//, ''));
    if (!existsSync(disk)) { missing++; fail(`referenced asset missing: ${r}`); }
  }
  missing === 0 ? ok(`${refs.size} local references resolve in dist/`) : fail(`${missing} references missing`);
}

console.log(failures === 0 ? 'VERIFY OK — dist/ is behavior-preserving' : `VERIFY FAILED — ${failures} gate(s) failed`);
process.exit(failures === 0 ? 0 : 1);
