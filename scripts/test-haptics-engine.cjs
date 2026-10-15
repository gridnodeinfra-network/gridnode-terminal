#!/usr/bin/env node
'use strict';
/* GRID//NODE v1.1.4 — tactile engine browser drives.
 *
 * Proves, against the built dist/ with a stubbed navigator.vibrate:
 *   H1  the engine is present with the new API; every legacy surface
 *       (window.gnHaptics, the adapter's tick/success methods) is gone
 *   H2  platform detection: 'vibrate' under Chromium, supported()
 *   H3  the pattern table is exactly the designed seven signatures
 *   H4  a REAL shot save (full local UI flow) fires 'confirm' [10,60,20],
 *       and the vibrate call lands BEFORE a setTimeout(0) marker queued
 *       in the same task — i.e. synchronously inside the gesture chain,
 *       not via a timer, promise, or delegated listener
 *   H5  a REAL time-tab tap on RESULTS fires 'tick' [8]
 *   H6  a REAL scanner zone tap fires 'lock' [10,50,16]
 *   H7  the tactile setting gates the engine instantly, persists across
 *       reload under gn_haptics_v1, and the VAULT row renders + toggles it
 *   H8  the error mapping: actionFeedback(..., true) fires 'error'
 *   H9  iOS path: iPhone UA + no Vibration API -> platform 'ios-taptic',
 *       fire() creates the hidden switch input and toggles it the
 *       pattern's pulse count, zero console errors
 *   H10 prefers-reduced-motion suppresses 'tick' but 'error' still lands
 *   H11 zero pageerrors across the main drive
 *
 * Feel on a physical device is NOT asserted here (no motor in CI); the
 * stub records the exact pattern arrays the engine hands the platform.
 *
 * Usage: node scripts/test-haptics-engine.cjs [baseUrl]
 * Serves ../dist itself when no baseUrl is given.
 */

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

function serveDist() {
  const root = path.resolve(__dirname, '../dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

async function browserPath() {
  const fallback = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('chromium'))
    .map(entry => path.join(os.homedir(), '.cache/ms-playwright', entry.name))
    .sort().reverse();
  for (const dir of fallback) {
    for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome']) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return chromium.executablePath();
}

/* Vibrate stub installed before any app script: records the exact
 * pattern arrays plus a monotonically increasing sequence number shared
 * with window.__hapMark(), so a drive can prove call ordering against
 * timers queued in the same task. */
const STUB = () => {
  window.__hap = [];
  window.__hapSeq = 0;
  const rec = (entry) => { entry.seq = ++window.__hapSeq; window.__hap.push(entry); };
  window.__hapMark = (label) => rec({ mark: label });
  try {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern) => { rec({ pattern: Array.isArray(pattern) ? pattern.slice() : pattern }); return true; }
    });
  } catch (_) {}
};

async function enterLocalUI(page, baseUrl) {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tapText = async (txt) => { for (const b of await page.$$('button')) { const t = (await b.textContent() || '').trim(); if (t === txt && await b.isVisible()) { const bx = await b.boundingBox(); await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); return true; } } return false; };
  await tapText('ENTER THE GRID'); await page.waitForTimeout(1000);
  await tapText('More sign-in options'); await page.waitForTimeout(1000);
  const dev = await page.$('#gnDeviceBtn'); const db = await dev.boundingBox(); await page.touchscreen.tap(db.x + db.width / 2, db.y + db.height / 2); await page.waitForTimeout(1000);
  for (const id of ['#gnLegalModalTerms', '#gnLegalModalResearch']) { const cb = await page.$(id); const bx = await cb.boundingBox(); await page.touchscreen.tap(bx.x + 7, bx.y + 7); await page.waitForTimeout(250); }
  await page.waitForFunction(() => { const b = document.getElementById('gnLegalModalAgree'); return b && !b.disabled; }, null, { timeout: 8000 });
  const ag = await page.$('#gnLegalModalAgree'); const ab = await ag.boundingBox(); await page.touchscreen.tap(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  await page.waitForTimeout(600);
}

async function main() {
  const argUrl = process.argv[2] || null;
  const served = argUrl ? null : await serveDist();
  const baseUrl = argUrl || served.url;
  const browser = await chromium.launch({ executablePath: await browserPath() });

  /* ── MAIN DRIVE (Android-shaped Chromium, vibrate stubbed) ──────── */
  console.log('\n── tactile engine: main drive ──');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await ctx.addInitScript(STUB);
  await enterLocalUI(page, baseUrl);

  const surface = await page.evaluate(() => ({
    engine: typeof window.GN_HAPTICS,
    fire: typeof window.GN_HAPTICS?.fire,
    legacyGlobal: typeof window.gnHaptics,
    adapterTick: typeof window.GN_HAPTICS?.tick,
    adapterSuccess: typeof window.GN_HAPTICS?.success,
    platform: window.GN_HAPTICS?.platform?.(),
    supported: window.GN_HAPTICS?.supported?.(),
    enabled: window.GN_HAPTICS?.enabled?.(),
    patterns: window.GN_HAPTICS?.patterns
  }));
  check('H1 engine present; legacy gnHaptics global + adapter methods gone',
    surface.engine === 'object' && surface.fire === 'function' && surface.legacyGlobal === 'undefined' && surface.adapterTick === 'undefined' && surface.adapterSuccess === 'undefined',
    JSON.stringify(surface));
  check('H2 platform detection under Chromium = vibrate, supported, enabled by default',
    surface.platform === 'vibrate' && surface.supported === true && surface.enabled === true,
    JSON.stringify({ platform: surface.platform, supported: surface.supported, enabled: surface.enabled }));
  check('H3 pattern table is exactly the designed seven signatures',
    JSON.stringify(surface.patterns) === JSON.stringify({ tick: [8], toggle: [12], confirm: [10, 60, 20], lock: [10, 50, 16], warn: [30, 60, 30], error: [40, 60, 40, 60, 40], milestone: [12, 50, 12, 50, 24] }),
    JSON.stringify(surface.patterns));

  /* H4 — real shot save through the full drawer flow (v8.1 choreography).
   * Just before the final SAVE tap, queue a setTimeout(0) marker inside
   * the page: if the engine's vibrate record precedes the marker in the
   * shared sequence, the call happened synchronously in the gesture
   * chain — a timer- or promise-deferred call would land after it. */
  await page.evaluate(() => {
    const open = document.querySelector('[onclick*="openLogModal"], #navLog, .fab');
    if (open) open.click();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const trig = document.querySelector('#cpShotMedVal')?.closest('.cp-select-trigger'); if (trig && !trig.classList.contains('open')) trig.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { [...document.querySelectorAll('#cpShotMedDrop .cp-option')].filter(e => e.textContent.trim() === 'BPC-157').sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]?.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const i = document.querySelector('#sDose'); i.focus(); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#logOv .gn-shot-fire')?.click());
  await page.waitForFunction(() => { const s = document.querySelector('#gnShotStep2'); return s && s.getBoundingClientRect().height > 0; }, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { const c = document.querySelector('#logOv #modalZonePicker button'); c?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__hap.length = 0; setTimeout(() => window.__hapMark('timer0'), 0); document.querySelector('#logOv .gn-shot-fire')?.click(); });
  await page.waitForTimeout(2500);
  const hapAfterSave = await page.evaluate(() => window.__hap);
  const confirmIdx = hapAfterSave.findIndex(e => JSON.stringify(e.pattern) === '[10,60,20]');
  const timerIdx = hapAfterSave.findIndex(e => e.mark === 'timer0');
  check('H4 real shot save fires confirm [10,60,20] synchronously (before the timer marker)',
    confirmIdx >= 0 && timerIdx >= 0 && hapAfterSave[confirmIdx].seq < hapAfterSave[timerIdx].seq,
    JSON.stringify(hapAfterSave));

  /* H5 — RESULTS time-tab tap fires tick [8]. */
  await page.evaluate(() => { window.__hap.length = 0; document.getElementById('navRes')?.click(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const t = [...document.querySelectorAll('#pageResults .time-tab')].find(b => !b.classList.contains('active')); t?.click(); });
  await page.waitForTimeout(600);
  const hapAfterTab = await page.evaluate(() => window.__hap);
  check('H5 RESULTS time-tab tap fires tick [8]',
    hapAfterTab.some(e => JSON.stringify(e.pattern) === '[8]'),
    JSON.stringify(hapAfterTab));

  /* H6 — scanner zone tap fires lock [10,50,16]. The scanner lives on
   * the LOG page; its chunk loads on page show. Zone selection runs a
   * pointerdown/pointerup state machine with coordinate hit-testing,
   * so the drive uses real taps and walks zones until one locks. */
  await page.evaluate(() => { window.__hap.length = 0; });
  await page.evaluate(() => { const n = document.querySelector('[onclick*="showPage(\'Log\')"], #navLog'); if (n) n.click(); });
  await page.waitForTimeout(2500);
  let zoneTapped = false;
  const zoneCount = await page.evaluate(() => document.querySelectorAll('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-hit').length);
  for (let i = 0; i < Math.min(zoneCount, 6) && !zoneTapped; i++) {
    /* Faithful gesture: the state machine consumes pointerdown/pointerup
     * with matching pointerId + client coords on the stage SVG, so the
     * drive dispatches exactly that pair at a point sampled ON the zone
     * path (getPointAtLength -> screen CTM). Headless touchscreen.tap
     * does not synthesize this pair reliably. */
    await page.evaluate((idx) => {
      const paths = document.querySelectorAll('#shotsRegionScanner .biotech-stage:not([hidden]) .zone-hit');
      const p = paths[idx];
      if (!p) return;
      const svg = p.closest('svg');
      const pt = new DOMPoint(p.getPointAtLength(p.getTotalLength() / 2).x, p.getPointAtLength(p.getTotalLength() / 2).y).matrixTransform(p.getScreenCTM());
      const opts = { bubbles: true, pointerId: 7, clientX: pt.x, clientY: pt.y, button: 0, isPrimary: true };
      svg.dispatchEvent(new PointerEvent('pointerdown', opts));
      svg.dispatchEvent(new PointerEvent('pointerup', opts));
    }, i);
    await page.waitForTimeout(700);
    const hapNow = await page.evaluate(() => window.__hap);
    zoneTapped = hapNow.some(e => JSON.stringify(e.pattern) === '[10,50,16]');
  }
  const hapAfterZone = await page.evaluate(() => window.__hap);
  check('H6 scanner zone tap fires lock [10,50,16]',
    zoneTapped && hapAfterZone.some(e => JSON.stringify(e.pattern) === '[10,50,16]'),
    'zoneCount=' + zoneCount + ' ' + JSON.stringify(hapAfterZone));

  /* H8 — error mapping through the app's own feedback entry point. */
  await page.evaluate(() => { window.__hap.length = 0; if (typeof actionFeedback === 'function') actionFeedback('DRIVE', 'ERROR MAPPING', true); });
  await page.waitForTimeout(400);
  const hapAfterError = await page.evaluate(() => window.__hap);
  check('H8 actionFeedback(error) fires error [40,60,40,60,40]',
    hapAfterError.some(e => JSON.stringify(e.pattern) === '[40,60,40,60,40]'),
    JSON.stringify(hapAfterError));

  /* H7 — setting gates instantly, persists, and the VAULT row works. */
  await page.evaluate(() => { window.GN_HAPTICS.setEnabled(false); });
  const storedOff = await page.evaluate(() => localStorage.getItem('gn_haptics_v1'));
  await page.evaluate(() => { window.__hap.length = 0; document.getElementById('navRes')?.click(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const t = [...document.querySelectorAll('#pageResults .time-tab')].find(b => !b.classList.contains('active')); t?.click(); });
  await page.waitForTimeout(500);
  const hapWhileOff = await page.evaluate(() => window.__hap);
  check('H7a setting off: stored as gn_haptics_v1=off and zero patterns fire',
    storedOff === 'off' && hapWhileOff.filter(e => e.pattern).length === 0,
    'stored=' + storedOff + ' ' + JSON.stringify(hapWhileOff));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const enabledAfterReload = await page.evaluate(() => window.GN_HAPTICS?.enabled?.());
  check('H7b setting persists across reload (still off)', enabledAfterReload === false, 'enabled=' + enabledAfterReload);
  await page.evaluate(() => { window.GN_HAPTICS.setEnabled(true); });
  /* VAULT row: open profile, the row must render ON and toggle to OFF. */
  await page.evaluate(() => { document.getElementById('navVault')?.click(); });
  await page.waitForFunction(() => !!document.getElementById('gnHapticsState'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  const rowState1 = await page.evaluate(() => document.getElementById('gnHapticsState')?.textContent?.trim());
  await page.evaluate(() => { const row = document.getElementById('gnHapticsState')?.closest('button'); row?.click(); });
  await page.waitForTimeout(600);
  const rowState2 = await page.evaluate(() => document.getElementById('gnHapticsState')?.textContent?.trim());
  const storedAfterRow = await page.evaluate(() => localStorage.getItem('gn_haptics_v1'));
  check('H7c VAULT haptics row renders ON, tap flips it to OFF and persists',
    rowState1 === 'ON' && rowState2 === 'OFF' && storedAfterRow === 'off',
    JSON.stringify({ rowState1, rowState2, storedAfterRow }));
  await page.evaluate(() => { window.GN_HAPTICS.setEnabled(true); });

  check('H11 zero pageerrors across the main drive', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await ctx.close();

  /* ── iOS DRIVE ───────────────────────────────────────────────────── */
  console.log('\n── tactile engine: iOS drive ──');
  const iosCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  });
  const iosPage = await iosCtx.newPage();
  const iosErrs = [];
  iosPage.on('pageerror', e => iosErrs.push(String(e && e.message || e)));
  await iosCtx.addInitScript(() => { try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined }); } catch (_) {} });
  await iosPage.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await iosPage.waitForTimeout(4000);
  const iosProbe = await iosPage.evaluate(() => {
    const before = document.querySelectorAll('input[type="checkbox"][switch]').length;
    const platform = window.GN_HAPTICS?.platform?.();
    const supported = window.GN_HAPTICS?.supported?.();
    const fired = window.GN_HAPTICS?.fire('confirm');
    return { before, platform, supported, fired };
  });
  await iosPage.waitForTimeout(50);
  const iosMid = await iosPage.evaluate(() => {
    const el = document.querySelector('input[type="checkbox"][switch]');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    return { exists: true, checked: el.checked, opacity: cs.opacity, left: cs.left };
  });
  await iosPage.waitForTimeout(300);
  const iosEnd = await iosPage.evaluate(() => document.querySelector('input[type="checkbox"][switch]')?.checked);
  check('H9 iOS: platform ios-taptic, fire() creates the hidden switch and toggles it twice for confirm (2 pulses)',
    iosProbe.platform === 'ios-taptic' && iosProbe.supported === true && iosProbe.fired === true && iosProbe.before === 0 &&
    iosMid.exists === true && iosMid.opacity === '0' && iosMid.checked === true && iosEnd === false && iosErrs.length === 0,
    JSON.stringify({ iosProbe, iosMid, iosEnd, iosErrs: iosErrs.slice(0, 2) }));
  await iosCtx.close();

  /* ── REDUCED-MOTION DRIVE ────────────────────────────────────────── */
  console.log('\n── tactile engine: reduced-motion drive ──');
  const rmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const rmPage = await rmCtx.newPage();
  await rmCtx.addInitScript(STUB);
  await rmPage.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await rmPage.waitForTimeout(4000);
  const rmResult = await rmPage.evaluate(() => {
    const tickFired = window.GN_HAPTICS.fire('tick');
    const confirmFired = window.GN_HAPTICS.fire('confirm');
    const errorFired = window.GN_HAPTICS.fire('error');
    return { tickFired, confirmFired, errorFired, log: window.__hap };
  });
  check('H10 reduced motion: tick + confirm suppressed, error still lands',
    rmResult.tickFired === false && rmResult.confirmFired === false && rmResult.errorFired === true &&
    rmResult.log.filter(e => e.pattern).length === 1 && JSON.stringify(rmResult.log.find(e => e.pattern)?.pattern) === '[40,60,40,60,40]',
    JSON.stringify(rmResult));
  await rmCtx.close();

  await browser.close();
  if (served) served.server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\nhaptics-engine: ${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
