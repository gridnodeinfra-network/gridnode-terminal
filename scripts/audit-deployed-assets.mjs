#!/usr/bin/env node
/**
 * GRID//NODE deployed-asset audit — the "never again" gate.
 *
 * After a Cloudflare Pages deploy, fetch the LIVE deployment URL and verify
 * EVERY local asset the served index.html references:
 *   - HTTP 200 (no silent SPA fallback)
 *   - Content-Type matches the file extension (css must be text/css, …)
 *   - body is non-empty and NOT the index.html fallback bytes
 *     (Cloudflare serves index.html with HTTP 200 for missing assets —
 *     this is exactly how the 2026-09-18 preview shipped five stylesheets
 *     as HTML and broke every icon and panel)
 *   - served bytes are byte-identical to the staged file (catches partial
 *     uploads and slow fleet replication)
 * Also scans url(...) references inside served stylesheets (fonts, images).
 *
 * Usage:
 *   node scripts/audit-deployed-assets.mjs <deployment-url>
 *     [--expect-stamp-from <local-index.html>]  assert served HTML contains
 *                                               the staged build stamp
 *     [--dist <dir>]                            local tree to byte-compare
 *                                               against (default: dist/)
 *
 * Exit 0 = AUDIT PASS, 1 = AUDIT FAIL (loud, lists every bad asset).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIME = new Map([
  ['css', 'text/css'],
  ['js', 'text/javascript'],
  ['mjs', 'text/javascript'],
  ['json', 'application/json'],
  ['webmanifest', 'application/manifest+json'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['mp3', 'audio/mpeg'],
  ['mp4', 'video/mp4'],
  ['txt', 'text/plain'],
  ['xml', 'application/xml'],
]);

const args = process.argv.slice(2);
const DEPLOY_URL = (args[0] || '').replace(/\/$/, '');
let expectStampFrom = null;
let distDir = 'dist';
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--expect-stamp-from') expectStampFrom = args[++i];
  else if (args[i] === '--dist') distDir = args[++i];
}
if (!DEPLOY_URL.startsWith('http')) {
  console.error('Usage: audit-deployed-assets.mjs <deployment-url> [--expect-stamp-from <file>] [--dist <dir>]');
  process.exit(1);
}

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

async function get(path) {
  const url = DEPLOY_URL + path;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { url, status: res.status, ct, buf };
}

function extOf(path) {
  const clean = path.split(/[?#]/)[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function refsInHtml(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) out.add(m[1].split(/[?#]/)[0]);
  // Root-relative refs (favicons, apple-touch-icons, splash screens in <head>)
  // are local assets too — the 2026-09-18 audit missed all 21 of them.
  for (const m of html.matchAll(/(?:src|href)="\/([^"/][^"]*)"/g)) out.add(m[1].split(/[?#]/)[0]);
  return [...out];
}

function urlRefsInCss(cssText, cssPath) {
  const out = new Set();
  const base = cssPath.split('/').slice(0, -1).join('/');
  for (const m of cssText.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) {
    let u = m[1];
    if (/^(data:|https?:|#)/.test(u)) continue;
    u = u.split(/[?#]/)[0];
    if (u.startsWith('./')) out.add((base ? base + '/' : '') + u.slice(2));
    else if (u.startsWith('/')) out.add(u.slice(1));
  }
  return [...out];
}

// ── 1. fetch served index.html ────────────────────────────────────────
console.log(`ASSET AUDIT — ${DEPLOY_URL}`);
const home = await get('/');
if (home.status !== 200) { fail(`/ → HTTP ${home.status}`); }
else ok(`/ → 200 ${home.ct}, ${home.buf.length}B`);
const servedHtml = home.buf.toString('utf8');

if (expectStampFrom) {
  const localHtml = readFileSync(expectStampFrom, 'utf8');
  const stamp = (localHtml.match(/\?v=([0-9]{8}\.[0-9a-z-]+)/) || [])[1];
  if (!stamp) fail(`no ?v= stamp found in ${expectStampFrom}`);
  else if (!servedHtml.includes(stamp)) fail(`served HTML missing staged stamp ${stamp}`);
  else ok(`served HTML carries staged stamp ${stamp}`);
}

// ── 2. check every referenced asset ──────────────────────────────────
const refs = refsInHtml(servedHtml);
console.log(`  info  ${refs.length} asset reference(s) in served index.html`);
const cssBodies = [];
for (const ref of refs) {
  const path = '/' + ref;
  let r;
  try { r = await get(path); }
  catch (e) { fail(`${path} → fetch error: ${e.message}`); continue; }
  const ext = extOf(ref);
  const wantCt = MIME.get(ext);
  const tag = `${path} → ${r.status} ${r.ct || '(no content-type)'} ${r.buf.length}B`;
  if (r.status !== 200) { fail(`${tag} — not 200`); continue; }
  if (wantCt && r.ct !== wantCt && !(ext === 'js' && r.ct === 'application/javascript')) {
    fail(`${tag} — want ${wantCt}`);
    continue;
  }
  if (r.ct === 'text/html' && ext !== 'html') { fail(`${tag} — SPA fallback (HTML served as ${ext})`); continue; }
  if (r.buf.length === 0) { fail(`${tag} — empty body`); continue; }
  if (r.buf.equals(home.buf)) { fail(`${tag} — body identical to index.html (fallback)`); continue; }
  const localPath = join(distDir, ref);
  if (existsSync(localPath)) {
    const local = readFileSync(localPath);
    if (!r.buf.equals(local)) { fail(`${tag} — differs from staged file (partial upload?)`); continue; }
    ok(`${ref} — byte-identical to staged`);
  } else {
    ok(`${ref} — served correctly (no local copy to compare)`);
  }
  if (ext === 'css') cssBodies.push({ ref, text: r.buf.toString('utf8') });
}

// ── 3. url(...) references inside served stylesheets ─────────────────
let subRefs = 0;
for (const { ref, text } of cssBodies) {
  for (const sub of urlRefsInCss(text, ref)) {
    subRefs++;
    const path = '/' + sub;
    let r;
    try { r = await get(path); }
    catch (e) { fail(`${path} (via ${ref}) → fetch error: ${e.message}`); continue; }
    if (r.status !== 200) fail(`${path} (via ${ref}) → HTTP ${r.status}`);
    else if (r.ct === 'text/html' || r.buf.equals(home.buf)) fail(`${path} (via ${ref}) → SPA fallback`);
    else ok(`${sub} (via ${ref})`);
  }
}
if (subRefs === 0) console.log('  info  no url(...) sub-references in served CSS');

console.log(failures === 0
  ? `\nAUDIT PASS — ${refs.length} assets + ${subRefs} sub-refs verified live`
  : `\nAUDIT FAIL — ${failures} problem(s). Do not ship this deployment.`);
process.exit(failures === 0 ? 0 : 1);
