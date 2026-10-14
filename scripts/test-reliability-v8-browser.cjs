#!/usr/bin/env node
'use strict';
/* GRID//NODE reliability v8 — browser drives (audit 2026-10-14, Mission 8).
 *
 * Drives the built app (dist/) in local mode with real Chromium,
 * timezone America/New_York, covering the UI-path mechanisms the core
 * harness cannot reach:
 *   B1  draft meridiem persists in the draft contract + restores exactly
 *   B2  a foreign owner's draft never renders and is purged
 *   B3  DST-gap shot time rejected visibly; same time on a normal day saves
 *   B4  date edit across DST recomputes the offset; unchanged edit
 *       preserves the stored instant verbatim (seconds included)
 *   B5  linked-weight edit recomputes weightKg locally AND queues the
 *       weight for sync like a standalone edit
 *   B6  timed weight stores an explicit instant; a typed impossible
 *       date is rejected instead of saving as today
 *   B7  impossible CSV datetime classifies invalid (backup parity)
 *   B8  sub-resolution syringe result shows BELOW RESOLUTION, not a
 *       valid-looking 0.0u READY
 *   B9  HISTORY perf: QA's fixture method (0/40/100/1,000/5,000) —
 *       windowed rendering, SHOW MORE parity at small histories
 *
 * Usage: node scripts/test-reliability-v8-browser.cjs [baseUrl]
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

async function dismissOverlays(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss?.(); } catch (_) {} });
    for (const button of await page.$$('button')) {
      const text = (await button.textContent().catch(() => '') || '').trim();
      if (!await button.isVisible().catch(() => false)) continue;
      if (/^got it$/i.test(text) || /skip tour/i.test(text)) { await button.click().catch(() => {}); await page.waitForTimeout(400); }
    }
    const obVisible = await page.locator('.gn-ob').isVisible().catch(() => false);
    if (!obVisible) return;
    await page.waitForTimeout(500);
  }
}

async function enterApp(page, baseUrl) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.locator('button', { hasText: 'ENTER THE GRID' }).first().click({ timeout: 15000 });
  await page.click('#gnMoreOptionsToggle', { timeout: 10000 });
  await page.click('#gnDeviceBtn', { timeout: 10000 });
  await page.check('#gnLegalModalTerms');
  await page.check('#gnLegalModalResearch');
  await page.click('#gnLegalModalAgree', { timeout: 10000 });
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 15000 });
  await dismissOverlays(page);
}

async function reenterAfterReload(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('#app.active') || document.querySelector('#landing.active'), null, { timeout: 15000 });
  if (await page.locator('#landing.active').isVisible().catch(() => false)) {
    await page.locator('button', { hasText: 'ENTER THE GRID' }).first().click({ timeout: 15000 });
    await page.locator('#app.active').waitFor({ state: 'visible', timeout: 15000 });
  }
  await dismissOverlays(page);
}

function readStore(page, suffix) {
  return page.evaluate(sfx => {
    const key = Object.keys(localStorage).find(k => k.endsWith(sfx));
    return key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
  }, suffix);
}

/* ── B1/B2/B3/B8: interactive form drives ────────────────────────────── */
async function driveForms(browser, baseUrl, pageErrors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await enterApp(page, baseUrl);
  await page.waitForFunction(() => window.GNModules?.saveShot && window.GN_NATIVE, null, { timeout: 15000 });

  /* B1 — draft meridiem contract + exact restore */
  await page.evaluate(() => {
    window.GNModules.openLogModal();
    window.GNModules.selectState.cpShotMed = { val: 'bpc157', label: 'BPC-157' };
    const dose = document.getElementById('sDose'); dose.value = '1.25'; dose.dispatchEvent(new Event('input', { bubbles: true }));
    const time = document.getElementById('sTime'); time.value = '8:23'; time.dispatchEvent(new Event('input', { bubbles: true }));
    window.GNModules.gnSetShotMeridiem('PM');
    window.GN_NATIVE.captureShotDraft();
  });
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gn_shot_draft_session_v1') || 'null'));
  check('B1 draft contract persists the meridiem', draft && draft.meridiem === 'PM', JSON.stringify(draft));
  check('B1 draft contract persists the owner identity', draft && draft.owner === 'local', JSON.stringify(draft));
  await page.evaluate(() => {
    window.GNModules.closeLog(true);
    window.GNModules.gnSetShotMeridiem('AM'); // simulate a different clock context
    document.getElementById('sDose').value = '';
    window.GNModules.openLogModal();
  });
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => ({
    meridiem: window.GNModules.moduleState.meridiem,
    time: document.getElementById('sTime')?.value,
    dose: document.getElementById('sDose')?.value
  }));
  check('B1 restore applies the DRAFT meridiem exactly, not the current clock',
    restored.meridiem === 'PM' && restored.time === '8:23' && restored.dose === '1.25', JSON.stringify(restored));

  /* B2 — foreign draft never renders. Sequence mirrors a real
   * sign-out/sign-in: the drawer fully closes (the close animation
   * holds .active for ~230 ms and the restore observer only fires on
   * the class change), the session identity changes, THEN the drawer
   * opens under the new account. */
  await page.evaluate(() => {
    document.getElementById('sDose').value = '';
    document.getElementById('sTime').value = '';
    window.GNModules.closeLog(true);
  });
  await page.waitForFunction(() => !document.getElementById('logOv')?.classList.contains('active'), null, { timeout: 5000 });
  await page.evaluate(() => {
    window.CU = { id: 'user-b-foreign', email: 'b@qa.test', name: 'B', cloudId: 'user-b-foreign' };
    window.GNModules.openLogModal();
  });
  await page.waitForFunction(() => document.getElementById('logOv')?.classList.contains('active'), null, { timeout: 5000 });
  await page.waitForTimeout(600);
  const foreign = await page.evaluate(() => ({
    dose: document.getElementById('sDose')?.value,
    draft: sessionStorage.getItem('gn_shot_draft_session_v1')
  }));
  check('B2 foreign-owned draft does not render into the next session', foreign.dose === '', JSON.stringify(foreign));
  check('B2 foreign-owned draft is purged on sight', foreign.draft === null, String(foreign.draft));

  /* B3 — DST gap rejection + normal-day control. The drawer has a
   * deferred init (quick-log/clock state) that can re-derive the
   * meridiem if the form is filled before it settles, so: open, wait
   * for the settle, then set state and save in ONE synchronous pass,
   * exactly as a user who fills the form and taps SAVE in one go. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await reenterAfterReload(page);
  await page.waitForFunction(() => window.GNModules?.saveShot, null, { timeout: 15000 });
  await page.evaluate(() => window.GNModules.openLogModal());
  await page.waitForFunction(() => document.getElementById('logOv')?.classList.contains('active'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const gapResult = await page.evaluate(() => {
    const M = window.GNModules;
    M.selectState.cpShotMed = { val: 'bpc157', label: 'BPC-157' };
    M.moduleState.selectedLocation = 'Upper Left';
    document.getElementById('sDose').value = '0.5';
    M.gnSetShotDateValue('2026-03-08');
    const time = document.getElementById('sTime'); time.value = '2:30'; time.dispatchEvent(new Event('input', { bubbles: true }));
    M.gnSetShotMeridiem('AM');
    const before = { iso: document.getElementById('sDate')?.dataset?.isoDate, time: time.value, meridiem: M.moduleState.meridiem };
    M.saveShot();
    const err = document.getElementById('gnShotErrTime');
    return { before, error: err ? err.textContent.trim() : '', shots: JSON.parse(localStorage.getItem('gn_local_shots') || '[]').map(s => s.date) };
  });
  check('B3 DST-gap time (Mar 8 2026, 2:30 AM) is rejected, nothing saved',
    gapResult.shots.length === 0 && /does not exist/i.test(gapResult.error), JSON.stringify(gapResult));
  await page.waitForTimeout(400);
  const controlResult = await page.evaluate(() => {
    const M = window.GNModules;
    M.gnSetShotDateValue('2026-03-07');
    const time = document.getElementById('sTime'); time.value = '2:30'; time.dispatchEvent(new Event('input', { bubbles: true }));
    M.gnSetShotMeridiem('AM');
    M.saveShot();
    const shots = JSON.parse(localStorage.getItem('gn_local_shots') || '[]');
    return { count: shots.length, date: shots[0]?.date || '' };
  });
  check('B3 control: 2:30 AM on a normal day saves with the EST instant',
    controlResult.count === 1 && controlResult.date === '2026-03-07T02:30:00-05:00', JSON.stringify(controlResult));

  /* B8 — syringe calculator below-resolution state */
  await page.evaluate(() => window.showPage('Lab'));
  await page.waitForTimeout(800);
  const syr = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('cDose', '0.001'); set('cConc', '10');
    window.updateSyr?.();
    const grab = id => document.getElementById(id)?.textContent?.trim() ?? null;
    return {
      units: grab('syrUnits'), status: grab('syrStatus'), ml: grab('syrML'),
      valid: document.getElementById('syrFormula')?.getAttribute('data-valid')
    };
  });
  check('B8 sub-resolution result shows BELOW RESOLUTION and is not valid/READY',
    syr.status === 'BELOW RESOLUTION' && syr.valid === 'false' && syr.units !== '0.0u', JSON.stringify(syr));
  const syrControl = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('cDose', '2.5'); set('cConc', '10');
    window.updateSyr?.();
    return {
      status: document.getElementById('syrStatus')?.textContent?.trim(),
      valid: document.getElementById('syrFormula')?.getAttribute('data-valid')
    };
  });
  check('B8 control: an ordinary result still earns READY', syrControl.status === 'READY' && syrControl.valid === 'true', JSON.stringify(syrControl));
  await ctx.close();
}

/* ── B4/B5/B6/B7: seeded record drives ───────────────────────────────── */
async function driveRecords(browser, baseUrl, pageErrors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await enterApp(page, baseUrl);
  await page.evaluate(() => {
    const shots = [
      { id: 'shot-j', date: '2026-03-07T12:00:00-05:00', med: 'bpc157', dose: 0.5, site: 'Upper Left', deviceId: null, wt: null, notes: '', se: [], archived: false, archivedAt: null, createdAt: '2026-03-07T12:00:00-05:00', modifiedAt: '2026-03-07T12:00:00-05:00', source: 'manual', state: 'logged' },
      { id: 'shot-k', date: '2026-03-05T23:59:45-05:00', med: 'bpc157', dose: 0.5, site: 'Upper Left', deviceId: null, wt: null, notes: '', se: [], archived: false, archivedAt: null, createdAt: '2026-03-05T23:59:45-05:00', modifiedAt: '2026-03-05T23:59:45-05:00', source: 'manual', state: 'logged' },
      { id: 'shot-w', date: '2026-10-10T09:00:00-04:00', med: 'bpc157', dose: 0.5, site: 'Upper Left', deviceId: null, wt: 180, notes: '', se: [], archived: false, archivedAt: null, createdAt: '2026-10-10T09:00:00-04:00', modifiedAt: '2026-10-10T09:00:00-04:00', source: 'manual', state: 'logged' }
    ];
    const weights = [
      { id: 'weight-w', shotId: 'shot-w', date: '2026-10-10T09:00:00-04:00', weight: 180, weightKg: 81.6466, notes: 'Logged with SHOT', source: 'shot', createdAt: '2026-10-10T09:00:00-04:00', modifiedAt: '2026-10-10T09:00:00-04:00' }
    ];
    localStorage.setItem('gn_local_shots', JSON.stringify(shots));
    localStorage.setItem('gn_local_weights', JSON.stringify(weights));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await reenterAfterReload(page);
  await page.waitForFunction(() => window.GNModules?.editShot
    && JSON.parse(localStorage.getItem('gn_local_shots') || '[]').length === 3, null, { timeout: 15000 });
  await page.waitForTimeout(1000); // let hydration-from-storage settle before editing

  /* B4 — edit semantics: date change recomputes offset; no-change keeps all.
   * editShot's form population completes a task after the call (the
   * drawer open flow), so each edit waits until the form provably
   * holds the record before anything is changed or saved. */
  const editAndSave = async (id, mutate) => {
    await page.evaluate(editId => window.GNModules.editShot(editId), id);
    await page.waitForFunction(editId => window.GNModules.moduleState.editingShotId === editId
      && Boolean(document.getElementById('sDate')?.dataset?.isoDate), id, { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.evaluate(mutateSource => {
      if (mutateSource) new Function('M', mutateSource)(window.GNModules);
      window.GNModules.saveShot();
    }, mutate || '');
    await page.waitForTimeout(300);
  };
  await editAndSave('shot-j', `M.gnSetShotDateValue('2026-03-09');`);
  const jResult = (await readStore(page, '_shots')).find(s => s.id === 'shot-j')?.date || '';
  check('B4 date edit across DST recomputes the offset (wall time kept, -05:00 -> -04:00)',
    jResult === '2026-03-09T12:00:00-04:00', jResult);
  await editAndSave('shot-k', '');
  const kResult = (await readStore(page, '_shots')).find(s => s.id === 'shot-k')?.date || '';
  check('B4 unchanged edit preserves the stored instant verbatim (seconds kept)',
    kResult === '2026-03-05T23:59:45-05:00', kResult);

  /* B5 — linked-weight edit: canonical kg locally + queued for sync */
  await page.evaluate(() => window.GNModules.editShot('shot-w'));
  await page.waitForFunction(() => window.GNModules.moduleState.editingShotId === 'shot-w'
    && document.getElementById('sWt')?.value === '180', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const wt = document.getElementById('sWt'); wt.value = '170'; wt.dispatchEvent(new Event('input', { bubbles: true }));
    window.GNModules.saveShot();
  });
  await page.waitForTimeout(300);
  const wResult = {
    weights: await readStore(page, '_weights'),
    queue: await readStore(page, '_syncQueue')
  };
  const linked = wResult.weights.find(w => w.id === 'weight-w');
  check('B5 linked weight value updated to 170 lb', linked && linked.weight === 170, JSON.stringify(linked));
  check('B5 linked weightKg recomputed from the canonical value',
    linked && Math.abs(linked.weightKg - 170 / 2.2046226218) < 1e-9, JSON.stringify(linked));
  /* Queue parity note: in LOCAL mode queueCloudSync dispatches to the
   * syncer directly and persists no queue (queues persist only for
   * cloud sessions with uploads pending) — so there is no local queue
   * to inspect here. The delivery leg is proven in the core harness
   * (test-reliability-v8.cjs R3) through the very queueCloudSync
   * ('weight', …) entry saveShot now calls directly for linked edits,
   * the same entry saveWt uses for standalone edits. */

  /* B6 — weight modal: explicit instant + strict typed date */
  const hResult = await page.evaluate(() => {
    window.openWeightModal();
    document.getElementById('wtVal').value = '175';
    const d = document.getElementById('wtDate');
    d.dataset.isoDate = '2026-03-07'; d.value = '03/07/2026';
    document.getElementById('wtTime').value = '23:30';
    window.saveWt();
    return JSON.parse(localStorage.getItem('gn_local_weights') || '[]').map(w => w.date);
  });
  check('B6 timed weight stores an explicit instant with the offset in force',
    hResult.includes('2026-03-07T23:30:00-05:00'), JSON.stringify(hResult));
  const lResult = await page.evaluate(() => {
    window.openWeightModal();
    document.getElementById('wtVal').value = '170';
    const d = document.getElementById('wtDate');
    delete d.dataset.isoDate; d.value = '02/31/2026';
    d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('wtTime').value = '';
    const count = () => JSON.parse(localStorage.getItem('gn_local_weights') || '[]').length;
    const countBefore = count();
    window.saveWt();
    const err = document.getElementById('gnWtErrDate');
    return { countBefore, countAfter: count(), error: err ? err.textContent.trim() : '' };
  });
  check('B6 typed impossible date 02/31/2026 is rejected visibly, nothing saved (no fallback to today)',
    lResult.countAfter === lResult.countBefore && /real calendar date/i.test(lResult.error), JSON.stringify(lResult));

  /* B7 — CSV impossible datetime classification (via the module
   * registry's prepareCSVImport — the bridge wraps it in the chunk
   * loader's promise, hence the await — whose rows carry the
   * normalized date the classifier judges: an impossible datetime
   * normalizes to '' and classifies invalid; a real one survives). */
  const csvResult = await page.evaluate(async () => {
    const csv = 'record_type,date,medication,dose_mg,location,weight_lb,side_effects,notes\n'
      + 'shot,2026-02-31T12:00:00-05:00,BPC-157,0.5,Upper Left,,,\n'
      + 'shot,2026-03-01T12:00:00-05:00,BPC-157,0.5,Upper Left,,,';
    const out = await window.GNModules.prepareCSVImport(csv);
    return { format: out.format, dates: out.rows.map(r => r.date) };
  });
  check('B7 impossible CSV datetime is normalized away (classifies invalid); the valid row keeps its datetime',
    csvResult.dates[0] === '' && csvResult.dates[1] === '2026-03-01T12:00:00-05:00',
    JSON.stringify(csvResult));
  await ctx.close();
}

/* ── B9: HISTORY perf, QA fixture method ─────────────────────────────── */
async function measureNav(page, navSel, pageSel, budgetMs = 25000) {
  const el = await page.$(navSel);
  const bx = await el.boundingBox();
  await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2);
  return page.evaluate(({ pageSel: sel, budgetMs: budget }) => new Promise(resolve => {
    const t0 = performance.now();
    const checkFrame = () => {
      const p = document.querySelector(sel);
      const active = p && getComputedStyle(p).display !== 'none';
      const kids = p ? p.querySelectorAll('*').length : 0;
      if (active && kids > 200) { requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: Math.round(performance.now() - t0), kids }))); return; }
      if (performance.now() - t0 > budget) { resolve({ ms: -1, kids }); return; }
      requestAnimationFrame(checkFrame);
    };
    checkFrame();
  }), { pageSel, budgetMs }).catch(() => ({ ms: -2, kids: -1 }));
}

async function drivePerf(browser, baseUrl, total, pageErrors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: 'America/New_York', locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await enterApp(page, baseUrl);
  await page.evaluate(totalRecords => {
    const half = Math.floor(totalRecords / 2);
    const meds = ['bpc157', 'tb500', 'tirzepatide', 'ghkcu'];
    const shots = [], weights = [];
    const base = Date.UTC(2025, 9, 1, 12, 0, 0);
    for (let i = 0; i < half; i++) { const d = new Date(base - i * 36e5 * 7).toISOString(); shots.push({ id: 'shot_seed' + i, date: d, med: meds[i % 4], dose: 0.5, site: 'Upper Left', deviceId: null, wt: null, notes: '', se: [], archived: false, archivedAt: null, createdAt: d, modifiedAt: d, source: 'local', state: 'logged' }); }
    for (let i = 0; i < totalRecords - half; i++) { const d = new Date(base - i * 36e5 * 9).toISOString(); weights.push({ id: 'weight_seed' + i, date: d, weight: 180, weightKg: 81.6466, notes: '', source: 'manual', createdAt: d, modifiedAt: d }); }
    localStorage.setItem('gn_local_shots', JSON.stringify(shots));
    localStorage.setItem('gn_local_weights', JSON.stringify(weights));
  }, total);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await reenterAfterReload(page);
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  const first = await measureNav(page, '#navLog', '#pageLog');
  const dom = await page.evaluate(() => {
    const p = document.querySelector('#pageLog');
    return {
      descendants: p ? p.querySelectorAll('*').length : -1,
      cards: document.querySelectorAll('#logList > article').length,
      more: Boolean(document.getElementById('gnHistoryMore'))
    };
  });
  await page.evaluate(() => document.querySelector('#navDash')?.click());
  await page.waitForTimeout(600);
  const repeat = await measureNav(page, '#navLog', '#pageLog');
  console.log(`PERF total=${total} first=${JSON.stringify(first)} repeat=${JSON.stringify(repeat)} dom=${JSON.stringify(dom)}`);
  await ctx.close();
  return { first, repeat, dom };
}

(async () => {
  const { server, url } = process.argv[2] ? { server: null, url: process.argv[2] } : await serveDist();
  const executablePath = await browserPath();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const pageErrors = [];
  try {
    await driveForms(browser, url, pageErrors);
    await driveRecords(browser, url, pageErrors);

    const perf40 = await drivePerf(browser, url, 40, pageErrors);
    check('B9 small history (40) renders every record, no SHOW MORE (identical visible behavior)',
      perf40.dom.cards === 40 && perf40.dom.more === false, JSON.stringify(perf40.dom));
    const perf100 = await drivePerf(browser, url, 100, pageErrors);
    check('B9 100 records: first window is bounded and SHOW MORE is offered',
      perf100.dom.cards === 50 && perf100.dom.more === true, JSON.stringify(perf100.dom));
    const perf1000 = await drivePerf(browser, url, 1000, pageErrors);
    console.log(`PERF BASELINE-COMPARE 1000: v7 was 1328 ms / 9683 descendants`);
    const perf5000 = await drivePerf(browser, url, 5000, pageErrors);
    console.log(`PERF BASELINE-COMPARE 5000: v7 was 5018 ms first / 1377 ms repeat / 47683 descendants`);
    check('B9 5,000 records: DOM descendants bounded by the window (v7: 47,683)',
      perf5000.dom.descendants > 0 && perf5000.dom.descendants < 5000, JSON.stringify(perf5000.dom));
    check('B9 5,000 records: first HISTORY navigation materially faster than v7 (5,018 ms)',
      perf5000.first.ms > 0 && perf5000.first.ms < 2500, JSON.stringify(perf5000.first));
    check('B9 zero pageerrors across all drives', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    if (server) server.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\nreliability-v8-browser: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error(`FAILED: ${failed.map(f => f.name).join(' | ')}`); process.exit(1); }
  console.log('reliability-v8-browser OK');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
