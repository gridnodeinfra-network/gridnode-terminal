#!/usr/bin/env node
/* GRID//NODE Phase 1 build pipeline.
 *
 * Assembles dist/ from the working tree WITHOUT reorganizing it:
 *   1. Computes a single BUILD_ID (date + git short SHA).
 *   2. Stamps every ?v= query in index.html with the BUILD_ID.
 *   3. Stamps sw.js (RELEASE + CACHE_NAME derived from BUILD_ID).
 *   4. Copies index.html, sw.js, _headers, manifest.json, js/, css/,
 *      assets/, i18n/ into dist/ preserving paths.
 *
 * Why not `vite build` here? Vite's default pipeline bundles CSS into a
 * hashed asset, rewrites asset URLs, and drops the classic <script> files
 * from dist/ — a broken page and a changed asset graph. The legacy page's
 * hand-managed asset graph (?v= stamps + SW precache list) is preserved
 * byte-for-byte in Phase 1. Vite's job in this phase is `npm run dev`
 * (hot-reload dev server) and `npm run preview` (serve dist/ for QA).
 * The bundling decision belongs to a later phase, verified by the
 * visual regression guard (npm run visual:compare).
 *
 * Usage: npm run build
 * Output: dist/
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

function buildId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) sha += '-dirty';
  } catch { /* not a git checkout; date-only id */ }
  return `${date}.${sha}`;
}

const BUILD_ID = buildId();
const CACHE_NAME = 'gridnode-shell-' + BUILD_ID.replace(/\./g, '-');
console.log(`BUILD_ID=${BUILD_ID}`);

// 1. index.html — stamp every ?v= query (scripts + stylesheets)
const htmlPath = join(ROOT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const stampRe = /\?v=\d{8}\.[\da-z-]+/g;
const stamped = (html.match(stampRe) || []).length;
if (stamped === 0) throw new Error('No ?v= stamps found in index.html — pattern drift?');
html = html.replace(stampRe, `?v=${BUILD_ID}`);
console.log(`index.html: ${stamped} version stamps -> ?v=${BUILD_ID}`);

// 2. sw.js — stamp RELEASE + derive CACHE_NAME from BUILD_ID
const swPath = join(ROOT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
if (!/const RELEASE = '[^']*'/.test(sw)) throw new Error('sw.js RELEASE pattern not found');
if (!/const CACHE_NAME = '[^']*'/.test(sw)) throw new Error('sw.js CACHE_NAME pattern not found');
sw = sw.replace(/const RELEASE = '[^']*'/, `const RELEASE = '${BUILD_ID}'`);
sw = sw.replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = '${CACHE_NAME}'`);
console.log(`sw.js: RELEASE=${BUILD_ID} CACHE_NAME=${CACHE_NAME}`);

// 3. Assemble dist/
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'sw.js'), sw);

const copies = ['_headers', 'manifest.json'];
const dirs = ['js', 'css', 'assets', 'i18n'];
for (const f of copies) {
  const src = join(ROOT, f);
  if (!existsSync(src)) throw new Error(`missing required file: ${f}`);
  cpSync(src, join(DIST, f));
}
for (const d of dirs) {
  const src = join(ROOT, d);
  if (!existsSync(src)) throw new Error(`missing required dir: ${d}/`);
  cpSync(src, join(DIST, d), { recursive: true });
}
console.log(`dist/: index.html, sw.js, ${copies.join(', ')}, ${dirs.map(d => d + '/').join(', ')}`);
console.log('BUILD OK');
