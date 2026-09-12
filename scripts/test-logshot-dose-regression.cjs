#!/usr/bin/env node
'use strict';
/**
 * v0.15.44 regression: FIRST DOSE tutorial dose sync + LOG SHOT full-width sheet.
 *
 * Guards the 2026-09-12 OnePlus QA findings:
 *  1. initModules() must not throw (a dangling initScannerAudioControl() call
 *     from the v0.15.43 simplicity cut aborted the delegated click listener,
 *     so dose-pill taps never reached selPill: the pill showed :hover styling
 *     but #sDose stayed empty, the coach never checked "Set your dose", and
 *     saveShot refused with "Could not save yet. Check: dose.").
 *  2. Tapping a dose pill sets #sDose.value, marks the pill .active, and the
 *     value survives a zone tap.
 *  3. #logOv renders as a full-width bottom sheet: overlay is column flex,
 *     the drawer handle sits on top, and .modal starts at x=0 spanning the
 *     full viewport width (no 44px dead strip on the left).
 *
 * Usage: node scripts/test-logshot-dose-regression.cjs [baseURL]
 * Exit 0 = pass. Exit 1 = failures.
 */
const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const results = [];
function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
  results.push(label);
  console.log('  PASS ' + label);
}

(async () => {
  const launchOpts = {};
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(`${baseURL}/?logshot-dose-regression=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const servedRelease = await page.evaluate(() => (window.GN_VERSION && window.GN_VERSION.release) || 'unknown');
  await page.evaluate(release => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', 'dark');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_session_v2', JSON.stringify({
      user: { id: 'local', email: 'logshot-regression@gridnode.local', user_metadata: { full_name: 'REGRESSION' } },
      createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, servedRelease);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  console.log('log-shot dose regression (served release ' + servedRelease + '):');

  // 1. Boot must be clean: no initScannerAudioControl ReferenceError.
  assert(!pageErrors.some(m => m.includes('initScannerAudioControl')),
    'boot has no initScannerAudioControl error', pageErrors.slice(0, 3).join(' | '));

  // 2. Open the log modal, pick a medication (renders the dose pills),
  //    then tap the 10 mg dose pill.
  const modalOpened = await page.evaluate(() => {
    if (typeof window.openLogModal === 'function') { window.openLogModal(); return true; }
    return false;
  });
  assert(modalOpened, 'openLogModal is callable');
  await page.waitForTimeout(600);
  assert(await page.evaluate(() => document.getElementById('logOv')?.classList.contains('active') === true),
    'log modal opens');

  await page.evaluate(() => {
    const trigger = document.querySelector('#cpShotMed .cp-select-trigger');
    if (trigger) trigger.click();
  });
  await page.waitForTimeout(400);
  const medPicked = await page.evaluate(() => {
    const opt = document.querySelector('#cpShotMedDrop [data-gn-med-options="COMMON"] .cp-option');
    if (opt) { opt.click(); return opt.textContent.trim(); }
    return null;
  });
  assert(!!medPicked, 'medication picked through the select UI', medPicked || '');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const pill = [...document.querySelectorAll('#dosePills .dose-pill')].find(el => el.dataset.dose === '10');
    if (pill) pill.click();
  });
  await page.waitForTimeout(400);
  const afterPill = await page.evaluate(() => ({
    sDose: document.getElementById('sDose') ? document.getElementById('sDose').value : null,
    active: document.querySelector('#dosePills .dose-pill.active')?.dataset.dose || null,
  }));
  assert(afterPill.sDose === '10', 'pill tap sets #sDose to 10', JSON.stringify(afterPill));
  assert(afterPill.active === '10', 'tapped pill carries .active', JSON.stringify(afterPill));

  // 3. Dose survives a zone tap (Felipe's exact flow: pill, then site, then save).
  await page.evaluate(() => {
    const zone = document.querySelector('[data-modal-zone]');
    if (zone) zone.click();
  });
  await page.waitForTimeout(400);
  const afterZone = await page.evaluate(() => ({
    sDose: document.getElementById('sDose') ? document.getElementById('sDose').value : null,
    active: document.querySelector('#dosePills .dose-pill.active')?.dataset.dose || null,
  }));
  assert(afterZone.sDose === '10', 'dose still registered after zone tap', JSON.stringify(afterZone));

  // 4. Full-width bottom sheet layout on mobile.
  const layout = await page.evaluate(() => {
    const ov = document.getElementById('logOv');
    const modal = ov.querySelector('.modal');
    const handle = ov.querySelector('.gn-drawer-handle');
    const rModal = modal.getBoundingClientRect();
    const rHandle = handle ? handle.getBoundingClientRect() : null;
    return {
      flexDirection: getComputedStyle(ov).flexDirection,
      modalX: Math.round(rModal.x),
      modalW: Math.round(rModal.width),
      viewportW: window.innerWidth,
      handleAboveModal: rHandle ? rHandle.bottom <= rModal.top + 1 : null,
      handleCentered: rHandle ? Math.abs((rHandle.x + rHandle.width / 2) - window.innerWidth / 2) < 3 : null,
    };
  });
  assert(layout.flexDirection === 'column', 'overlay is column flex', layout.flexDirection);
  assert(layout.modalX === 0, 'modal starts at x=0 (no dead strip)', 'x=' + layout.modalX);
  assert(Math.abs(layout.modalW - layout.viewportW) <= 1, 'modal spans full viewport width',
    `${layout.modalW}px vs ${layout.viewportW}px`);
  assert(layout.handleAboveModal === true, 'drawer handle sits above the sheet');
  assert(layout.handleCentered === true, 'drawer handle is horizontally centered');

  await browser.close();
  console.log(`\nAll ${results.length} log-shot dose regression checks passed.`);
})().catch(err => {
  console.error('\n' + err.message);
  process.exit(1);
});
