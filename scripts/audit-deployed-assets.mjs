#!/usr/bin/env node
/**
 * GRID//NODE deployed-asset audit — the "never again" gate.
 *
 * After a Cloudflare Pages deploy, fetch the LIVE deployment URL and verify
 * EVERY local asset the app needs:
 *   1. assets the served index.html references (src/href, ./… and /…),
 *   2. url(...) sub-references inside served stylesheets (fonts, images),
 *   3. assets JS fetches or assigns dynamically at runtime — discovered by
 *      scanning served bundle text for local asset paths, e.g. the i18n
 *      catalogs fetched as `./i18n/${file}` and the avatar fallback
 *      `/assets/brand/icons/pwa-192.png`. Template-literal directory
 *      prefixes (`./i18n/`) are expanded against the staged tree, so new
 *      catalogs are covered with no manifest to maintain.
 * Each asset is checked for:
 *   - HTTP 200 (no silent SPA fallback)
 *   - Content-Type matches the file extension (css must be text/css, …)
 *   - body is non-empty and NOT the index.html fallback bytes
 *     (Cloudflare serves index.html with HTTP 200 for missing assets —
 *     this is exactly how the 2026-09-18 preview shipped five stylesheets
 *     as HTML and broke every icon and panel)
 *   - served bytes are byte-identical to the staged file (catches partial
 *     uploads and slow fleet replication)
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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
const warn = (m) => console.log(`  warn  ${m}`);

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

// dist-relative path, or null when the literal is not a local asset path.
function asLocalRef(literal) {
  let p = literal;
  if (p.startsWith('./')) p = p.slice(2);
  else if (p.startsWith('/')) p = p.slice(1);
  else return null;
  p = p.split(/[?#]/)[0];
  if (!p || p.includes('..')) return null;
  return MIME.has(extOf(p)) ? p : null;
}

function refsInHtml(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
    const r = asLocalRef('./' + m[1]); if (r) out.add(r);
  }
  // Root-relative refs (favicons, apple-touch-icons, splash screens in <head>)
  // are local assets too — the 2026-09-18 audit missed all 21 of them.
  for (const m of html.matchAll(/(?:src|href)="\/([^"/][^"]*)"/g)) {
    const r = asLocalRef('/' + m[1]); if (r) out.add(r);
  }
  return [...out];
}

function resolveCssUrl(u, cssPath) {
  if (/^(data:|https?:|#)/.test(u)) return null;
  u = u.split(/[?#]/)[0];
  let p;
  if (u.startsWith('/')) p = u.slice(1);
  else p = cssPath.split('/').slice(0, -1).concat(u.split('/')).join('/');
  // Lexical normalize; reject anything escaping the dist root.
  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(seg);
  }
  p = parts.join('/');
  return p && MIME.has(extOf(p)) ? p : null;
}

function urlRefsInCss(cssText, cssPath) {
  const out = new Set();
  for (const m of cssText.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) {
    const r = resolveCssUrl(m[1], cssPath);
    if (r) out.add(r);
  }
  return [...out];
}

// Local asset paths referenced inside JS bundle text:
//   - static string literals: fetch("./x.json"), img.src = "/assets/a.png"
//   - template literals: fetch(`./i18n/${file}`) → directory prefix "./i18n/"
function refsInJs(jsText) {
  const files = new Set(), dirs = new Set();
  for (const m of jsText.matchAll(/(['"])(\.\/[^'"`]+?|\/[^'"`]+?)\1/g)) {
    const r = asLocalRef(m[2]); if (r) files.add(r);
  }
  for (const m of jsText.matchAll(/`((?:\.\/|\/)[^`$]*)\$\{/g)) {
    let p = m[1];
    if (p.endsWith('/')) { p = p.replace(/^\.\//, '').replace(/^\//, ''); if (p) dirs.add(p); }
    else { const r = asLocalRef(p); if (r) files.add(r); }
  }
  return { files: [...files], dirs: [...dirs] };
}

function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(join(distDir, d), { withFileTypes: true })) {
      const rel = d + e.name;
      if (e.isDirectory()) walk(rel + '/');
      else if (MIME.has(extOf(e.name))) out.push(rel);
    }
  };
  walk(dir);
  return out;
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

// One asset, every check. Returns { ref, ext, text } when fully clean,
// null otherwise. `via` labels the discovery path in log lines.
async function checkAsset(ref, via) {
  const path = '/' + ref;
  let r;
  try { r = await get(path); }
  catch (e) { fail(`${path}${via} → fetch error: ${e.message}`); return null; }
  const ext = extOf(ref);
  const wantCt = MIME.get(ext);
  const tag = `${path}${via} → ${r.status} ${r.ct || '(no content-type)'} ${r.buf.length}B`;
  if (r.status !== 200) { fail(`${tag} — not 200`); return null; }
  if (wantCt && r.ct !== wantCt && !(ext === 'js' && r.ct === 'application/javascript')) {
    fail(`${tag} — want ${wantCt}`); return null;
  }
  if (r.ct === 'text/html' && ext !== 'html') { fail(`${tag} — SPA fallback (HTML served as ${ext})`); return null; }
  if (r.buf.length === 0) { fail(`${tag} — empty body`); return null; }
  if (r.buf.equals(home.buf)) { fail(`${tag} — body identical to index.html (fallback)`); return null; }
  const localPath = join(distDir, ref);
  if (existsSync(localPath)) {
    const local = readFileSync(localPath);
    if (!r.buf.equals(local)) { fail(`${tag} — differs from staged file (partial upload?)`); return null; }
    ok(`${ref}${via} — byte-identical to staged`);
  } else {
    ok(`${ref}${via} — served correctly (no local copy to compare)`);
  }
  return { ref, ext, text: r.buf.toString('utf8') };
}

// ── 2. every asset the served HTML references ─────────────────────────
const refs = refsInHtml(servedHtml);
console.log(`  info  ${refs.length} asset reference(s) in served index.html`);
const seen = new Set(refs);
const cssBodies = [];
const jsBodies = [];
for (const ref of refs) {
  const checked = await checkAsset(ref, '');
  if (!checked) continue;
  if (checked.ext === 'css') cssBodies.push(checked);
  if (checked.ext === 'js' || checked.ext === 'mjs') jsBodies.push(checked);
}

// ── 3. url(...) references inside served stylesheets ─────────────────
let subRefs = 0;
for (const { ref, text } of cssBodies) {
  for (const sub of urlRefsInCss(text, ref)) {
    if (seen.has(sub)) continue;
    seen.add(sub);
    subRefs++;
    await checkAsset(sub, ` (via ${ref})`);
  }
}
if (subRefs === 0) console.log('  info  no url(...) sub-references in served CSS');

// ── 4. assets JS fetches/assigns dynamically at runtime ──────────────
let jsRefs = 0;
for (const { ref: jsRef, text } of jsBodies) {
  const { files, dirs } = refsInJs(text);
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    jsRefs++;
    await checkAsset(f, ` (via ${jsRef})`);
  }
  for (const d of dirs) {
    if (!existsSync(join(distDir, d))) { warn(`./${d} referenced by ${jsRef} but missing from ${distDir} — skipping`); continue; }
    const expanded = filesUnder(d).filter((f) => !seen.has(f));
    if (expanded.length === 0) warn(`./${d} referenced by ${jsRef} but no staged files under it`);
    for (const f of expanded) {
      seen.add(f);
      jsRefs++;
      await checkAsset(f, ` (via ${jsRef} → ./${d})`);
    }
  }
}
if (jsRefs === 0) console.log('  info  no dynamic asset references found in served JS');

console.log(failures === 0
  ? `\nAUDIT PASS — ${refs.length} assets + ${subRefs} CSS sub-refs + ${jsRefs} JS-discovered verified live`
  : `\nAUDIT FAIL — ${failures} problem(s). Do not ship this deployment.`);
process.exit(failures === 0 ? 0 : 1);
