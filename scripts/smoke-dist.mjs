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

// 1. serve dist/
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 15000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
  server.stderr.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
});

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  PASS  ${m}`);

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // mobile-first
  const badRequests = [];
  const consoleErrors = [];
  page.on('requestfailed', (r) => badRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  badRequests.length === 0 ? ok('no failed requests') : fail(`${badRequests.length} failed requests:\n    ` + badRequests.slice(0, 10).join('\n    '));
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
  server.kill();
}
console.log(failures === 0 ? 'SMOKE OK — dist/ serves and boots clean' : `SMOKE FAILED — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
