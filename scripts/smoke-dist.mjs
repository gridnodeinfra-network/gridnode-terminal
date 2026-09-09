#!/usr/bin/env node
/* GRID//NODE Phase 1 dist/ smoke test.
 * Serves dist/ and loads it in headless Chromium, then reports:
 *   - failed network requests (404s, etc.)
 *   - page console errors
 *   - presence of key app DOM nodes
 * Usage: node scripts/smoke-dist.mjs  (after: npm run build)
 * Requires: npx playwright install chromium
 */
import { execSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4317;

// 1. serve dist/ on IPv4 127.0.0.1 (vite preview binds ::1 by default here,
//    which 127.0.0.1 clients cannot reach). Spawn the vite bin directly so
//    server.kill() terminates the real process (no npx middleman to orphan).
const server = spawn('node',
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  PASS  ${m}`);

try {
  // wait for the preview server to print its Local: URL (only printed on a
  // successful bind; error text like "Port N is already in use" won't match)
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview server did not start')), 20000);
    const onData = (d) => { if (/Local:\s+http/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('exit', (c) => { clearTimeout(t); rej(new Error(`preview server exited (${c})`)); });
  });

  const { chromium } = await import('playwright');
  // Use a direct Chrome binary when the Playwright browser cache is empty
  // (e.g. GRIDNODE_CHROME=/path/to/chrome). Falls back to Playwright's cache.
  const executablePath = process.env.GRIDNODE_CHROME;
  if (executablePath) console.log(`  INFO  using Chrome at ${executablePath}`);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // mobile-first
  const badRequests = [];
  const externalWarnings = [];
  const consoleErrors = [];
  const isLocal = (url) => /^https?:\/\/(127\.0\.0\.1|localhost)/.test(url);
  // External CDN failures (fonts, supabase) are environment limits of the
  // sandbox, not dist/ defects: warn, don't fail.
  page.on('requestfailed', (r) => (isLocal(r.url()) ? badRequests : externalWarnings)
    .push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) (isLocal(r.url()) ? badRequests : externalWarnings).push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // "Failed to load resource" for an external CDN is the sandbox, not dist/
    const url = m.location()?.url || '';
    if (/failed to load resource/i.test(m.text()) && url && !isLocal(url)) {
      externalWarnings.push(`console: ${url}`);
      return;
    }
    consoleErrors.push('console: ' + m.text().slice(0, 160));
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  badRequests.length === 0 ? ok('no failed local requests') : fail(`${badRequests.length} failed requests:\n    ` + badRequests.slice(0, 10).join('\n    '));
  if (externalWarnings.length > 0) console.log(`  INFO  ${externalWarnings.length} external request(s) unreachable from sandbox (not dist/ defects):\n    ` + externalWarnings.slice(0, 5).join('\n    '));
  consoleErrors.length === 0 ? ok('no page errors') : fail(`${consoleErrors.length} page errors:\n    ` + consoleErrors.slice(0, 10).join('\n    '));

  // key app nodes (mobile shell must boot)
  for (const sel of ['#app', 'script[src*="gridnode-bundle.js"]']) {
    (await page.locator(sel).count()) > 0 ? ok(`selector present: ${sel}`) : fail(`selector missing: ${sel}`);
  }
  const title = await page.title();
  console.log(`  INFO  page title: ${title}`);
  await page.screenshot({ path: join(ROOT, 'dist', '..', 'smoke-dist.png') });
  console.log('  INFO  screenshot: smoke-dist.png');
  await browser.close();
} finally {
  server.kill('SIGKILL');
}
console.log(failures === 0 ? 'SMOKE OK — dist/ serves and boots clean' : `SMOKE FAILED — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
