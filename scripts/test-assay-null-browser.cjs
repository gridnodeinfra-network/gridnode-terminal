#!/usr/bin/env node
'use strict';
/* GRID//NODE ASSAY null lifecycle — browser drive (audit 2026-10-14, S12).
 *
 * Drives the built app (dist/) in local mode with real Chromium:
 *   create assay with blank purity/claim/measured -> storage holds NULLs
 *   reload -> edit form shows blanks (not 0)
 *   explicit 0 -> storage holds 0 -> edit form shows 0
 *   out-of-range purity (150) and negative amount -> save rejected
 *   backup export carries the NULLs
 *   backup restore of a NULL record keeps NULLs (and explicit 0)
 *   malformed backup (labTests as object) fails loudly, restores nothing
 *
 * Usage: node scripts/test-assay-null-browser.cjs [baseUrl]
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
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
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
  /* The v3 FIRST RUN overlay can auto-start after a delay; dismiss it
   * deterministically via its own Skip call and repeat until it is gone
   * (QA harness lesson: a queued auto-start can resurrect the overlay). */
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
  /* Proven local entry flow (gridnode-screenshots/capture-all.mjs):
   * landing -> ENTER THE GRID -> more options -> this device -> both
   * legal checkboxes -> agree. */
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
  await page.evaluate(() => window.showPage('Lab')); // labtests chunk loads on Lab navigation
  await page.waitForFunction(() => window.GN_ASSAY && window.GNModules && window.GNModules.getAllLabTests, null, { timeout: 15000 });
}

async function reenterAfterReload(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('#app.active') || document.querySelector('#landing.active'), null, { timeout: 15000 });
  if (await page.locator('#landing.active').isVisible().catch(() => false)) {
    await page.locator('button', { hasText: 'ENTER THE GRID' }).first().click({ timeout: 15000 });
    await page.locator('#app.active').waitFor({ state: 'visible', timeout: 15000 });
  }
  await dismissOverlays(page);
  await page.evaluate(() => window.showPage('Lab')); // labtests chunk loads on Lab navigation
  await page.waitForFunction(() => window.GN_ASSAY && window.GNModules && window.GNModules.getAllLabTests, null, { timeout: 15000 });
}

function readLabTests(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.endsWith('_labTests'));
    return { key, records: key ? JSON.parse(localStorage.getItem(key) || '[]') : [] };
  });
}

async function fillRequired(page) {
  const peptide = await page.evaluate(() => {
    const sel = document.getElementById('gnAssayPeptide');
    const opt = [...sel.options].find(o => o.value);
    return opt ? opt.value : '';
  });
  await page.locator('#gnAssayPeptide').selectOption(peptide);
  await page.locator('#gnAssayVendor').fill('QA LAB');
  return peptide;
}

(async () => {
  const { server, url } = process.argv[2] ? { server: null, url: process.argv[2] } : await serveDist();
  const executablePath = await browserPath();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  try {
    await enterApp(page, url);

    await dismissOverlays(page);
    /* 1 — create with blanks -> NULLs in storage */
    await page.evaluate(() => window.GN_ASSAY.openAssayModal(null));
    await page.locator('#gnAssayModalOv.active').waitFor({ state: 'visible', timeout: 10000 });
    await fillRequired(page);
    await page.locator('#gnAssaySave').click();
    await page.waitForFunction(() => {
      const key = Object.keys(localStorage).find(k => k.endsWith('_labTests'));
      return key && JSON.parse(localStorage.getItem(key) || '[]').length >= 1;
    }, null, { timeout: 10000 });
    let { records } = await readLabTests(page);
    const blank = records[records.length - 1];
    check('S12 blank create stores purityPct null', blank.purityPct === null, JSON.stringify(blank));
    check('S12 blank create stores labelClaimMg null', blank.labelClaimMg === null, JSON.stringify(blank));
    check('S12 blank create stores measuredMg null', blank.measuredMg === null, JSON.stringify(blank));

    /* 2 — reload -> edit shows blanks, not 0 */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reenterAfterReload(page);
    await page.evaluate(id => window.GN_ASSAY.openAssayModal(id), blank.id);
    await page.locator('#gnAssayModalOv.active').waitFor({ state: 'visible', timeout: 10000 });
    const blankForm = await page.evaluate(() => ({
      purity: document.getElementById('gnAssayPurity').value,
      claim: document.getElementById('gnAssayClaim').value,
      measured: document.getElementById('gnAssayMeasured').value
    }));
    check('S12 edit form shows blanks after reload', blankForm.purity === '' && blankForm.claim === '' && blankForm.measured === '', JSON.stringify(blankForm));
    await page.evaluate(() => window.GN_ASSAY.closeAssayModal());

    await dismissOverlays(page);
    /* 3 — explicit 0 stays 0 end to end */
    await page.evaluate(() => window.GN_ASSAY.openAssayModal(null));
    await page.locator('#gnAssayModalOv.active').waitFor({ state: 'visible', timeout: 10000 });
    await fillRequired(page);
    await page.locator('#gnAssayPurity').fill('0');
    await page.locator('#gnAssayClaim').fill('0');
    await page.locator('#gnAssayMeasured').fill('0');
    await page.locator('#gnAssaySave').click();
    await page.waitForFunction(() => {
      const key = Object.keys(localStorage).find(k => k.endsWith('_labTests'));
      return key && JSON.parse(localStorage.getItem(key) || '[]').length >= 2;
    }, null, { timeout: 10000 });
    ({ records } = await readLabTests(page));
    const zero = records[records.length - 1];
    check('S12 explicit 0 stored as 0', zero.purityPct === 0 && zero.labelClaimMg === 0 && zero.measuredMg === 0, JSON.stringify(zero));
    await page.evaluate(id => window.GN_ASSAY.openAssayModal(id), zero.id);
    const zeroForm = await page.evaluate(() => ({
      purity: document.getElementById('gnAssayPurity').value,
      claim: document.getElementById('gnAssayClaim').value,
      measured: document.getElementById('gnAssayMeasured').value
    }));
    check('S12 edit form shows 0 for measured zeros', zeroForm.purity === '0' && zeroForm.claim === '0' && zeroForm.measured === '0', JSON.stringify(zeroForm));
    await page.evaluate(() => window.GN_ASSAY.closeAssayModal());

    await dismissOverlays(page);
    /* 4 — range validation at save */
    const countBefore = records.length;
    await page.evaluate(() => window.GN_ASSAY.openAssayModal(null));
    await page.locator('#gnAssayModalOv.active').waitFor({ state: 'visible', timeout: 10000 });
    await fillRequired(page);
    await page.locator('#gnAssayPurity').fill('150');
    await page.locator('#gnAssaySave').click();
    await page.waitForFunction(() => {
      const err = document.getElementById('gnAssayErr');
      return err && err.style.display !== 'none' && err.textContent.length > 0;
    }, null, { timeout: 5000 });
    const rangeErr = await page.locator('#gnAssayErr').textContent();
    check('S12 purity 150 rejected with range message', /100/.test(rangeErr || ''), rangeErr || '');
    await page.locator('#gnAssayPurity').fill('');
    await page.locator('#gnAssayMeasured').fill('-5');
    await page.locator('#gnAssaySave').click();
    await page.waitForFunction(() => {
      const err = document.getElementById('gnAssayErr');
      return err && err.style.display !== 'none' && err.textContent.length > 0;
    }, null, { timeout: 5000 });
    ({ records } = await readLabTests(page));
    check('S12 negative amount rejected, nothing saved', records.length === countBefore, `${records.length} vs ${countBefore}`);
    await page.evaluate(() => window.GN_ASSAY.closeAssayModal());

    /* 5 — export carries the NULLs */
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.exportBackup());
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    const exportedBlank = (exported.labTests || []).find(r => r.id === blank.id);
    check('S12 export preserves nulls', Boolean(exportedBlank) && exportedBlank.purityPct === null && exportedBlank.labelClaimMg === null && exportedBlank.measuredMg === null, JSON.stringify(exportedBlank));

    /* 6 — restore keeps NULLs (and explicit 0) */
    const restoreFile = path.join(os.tmpdir(), `gn-restore-${process.pid}.json`);
    fs.writeFileSync(restoreFile, JSON.stringify({
      app: 'GRID//NODE', version: '0.15.43', exportedAt: new Date().toISOString(),
      shots: [], weights: [],
      labTests: [{ id: 'restore-null-1', peptide: blank.peptide, vendor: 'RESTORE LAB', batch: '', testDate: '2026-09-01', lab: '', method: 'hplc', purityPct: null, labelClaimMg: null, measuredMg: 0, endotoxin: 'untested', notes: '', createdAt: '2026-09-01T00:00:00Z', modifiedAt: '2026-09-01T00:00:00Z', archived: false, archivedAt: null }]
    }));
    await page.evaluate(() => window.openImportDialog());
    await page.locator('#gnBackupInput').waitFor({ state: 'attached', timeout: 10000 });
    await page.locator('#gnBackupInput').setInputFiles(restoreFile);
    await page.locator('#csvImportOverlay.active').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#csvImportConfirmBtn').click();
    await page.waitForFunction(() => {
      const key = Object.keys(localStorage).find(k => k.endsWith('_labTests'));
      return key && JSON.parse(localStorage.getItem(key) || '[]').some(r => r.id === 'restore-null-1');
    }, null, { timeout: 10000 });
    ({ records } = await readLabTests(page));
    const restored = records.find(r => r.id === 'restore-null-1');
    check('S12 restore preserves nulls and explicit 0', Boolean(restored) && restored.purityPct === null && restored.labelClaimMg === null && restored.measuredMg === 0, JSON.stringify(restored));

    /* 7 — malformed backup (labTests as object) fails loudly, restores nothing */
    const badFile = path.join(os.tmpdir(), `gn-bad-${process.pid}.json`);
    fs.writeFileSync(badFile, JSON.stringify({ app: 'GRID//NODE', version: '0.15.43', shots: [], weights: [], labTests: { broken: true } }));
    const countBeforeBad = records.length;
    await page.evaluate(() => window.openImportDialog());
    await page.locator('#gnBackupInput').waitFor({ state: 'attached', timeout: 10000 });
    await page.locator('#gnBackupInput').setInputFiles(badFile);
    await page.waitForFunction(() => {
      const toast = document.getElementById('toastEl');
      return toast && toast.classList.contains('err') && /LABTESTS/.test(toast.textContent || '');
    }, null, { timeout: 10000 });
    check('S12 malformed collection names the damaged section', true);
    const overlayActive = await page.locator('#csvImportOverlay.active').count();
    ({ records } = await readLabTests(page));
    check('S12 malformed backup opens no preview and restores nothing', overlayActive === 0 && records.length === countBeforeBad, `overlay=${overlayActive} records=${records.length}`);
    fs.rmSync(restoreFile, { force: true });
    fs.rmSync(badFile, { force: true });

    check('S12 zero pageerrors across the drive', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    if (server) server.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nassay-null-browser: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
