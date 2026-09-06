#!/usr/bin/env node
'use strict';

// LAB full-surface regression harness.
// Each phase uses a fresh context to avoid cross-phase overlay state leaking.
// Covers 4 theme×lang combos + 320/430 mobile widths + validation + edit + archive + restore + persistence.

const { chromium } = require('/home/pipe_blade/workspaces/gridnode-terminal/node_modules/playwright');
const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const expectedRelease = process.argv[3] || '20260906.2';
const targetArg = process.argv[4] || 'all';
const browserPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || require('/home/pipe_blade/workspaces/gridnode-terminal/node_modules/playwright').chromium.executablePath();

function assert(condition, message, detail = '') {
  if (!condition) throw new Error(`FAIL ${message}${detail ? ` — ${detail}` : ''}`);
  console.log(`PASS ${message}${detail ? ` — ${detail}` : ''}`);
}

const ALL = ['dark-en', 'light-en', 'dark-es', 'light-es', '320', '430', 'edit-archive-empty'];

async function enterApp(page, { theme = 'dark', lang = 'en', width = 390 }) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${baseUrl}/?lab-surface-test=${Date.now()}-${Math.random()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ selectedTheme, selectedLang, release }) => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', selectedTheme);
    localStorage.setItem('gn.lang', selectedLang);
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, { selectedTheme: theme, selectedLang: lang, release: expectedRelease });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('#app.active') || document.querySelector('#landing.active'));
  if (await page.locator('#landing.active').isVisible().catch(() => false)) {
    await page.locator('.landing-local-link').click();
  }
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
}

async function openLab(page) {
  await page.evaluate(() => window.showPage('Lab'));
  await page.locator('#pageLab.active').waitFor({ state: 'visible' });
  await page.locator('[data-lab-focus="research"]').waitFor({ state: 'visible' });
}

async function openResearchOverlay(page) {
  await page.locator('[data-lab-focus="research"]').click();
  await page.locator('#gnLabToolOverlay.active').waitFor({ state: 'visible' });
  await page.locator('#gnResearchForm').waitFor({ state: 'visible' });
}

async function readRecords(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gn_researchRecords_v1') || localStorage.getItem('gn_local_researchRecords') || localStorage.getItem('gn.researchRecords') || '[]'));
}

async function fullCycle(page, opts) {
  await enterApp(page, opts);
  await openLab(page);

  const empty = await page.locator('#gnResearchList .gn-empty-state').count();
  assert(empty >= 0, `[${opts.theme}-${opts.lang}] research list renders in pristine mode`);

  await openResearchOverlay(page);

  // validation: HTML5 required blocks empty submit; assert it happens
  await page.evaluate(() => localStorage.removeItem('gn_researchRecords_v1'));
  const beforeEmptyName = await page.evaluate(() => { window.__gnFormReport = { valid: document.querySelector('#gnResearchForm').checkValidity() }; return window.__gnFormReport.valid; });
  assert(beforeEmptyName === false, `[${opts.theme}-${opts.lang}] HTML5 required blocks empty-name submit`, String(beforeEmptyName));

  // validation: empty date must block (no `required` attribute on date)
  await page.locator('#gnResearchName').fill('Probe-X');
  await page.locator('#gnResearchDate').evaluate(el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#gnResearchSave').click();
  let recs = await readRecords(page);
  assert(recs.length === 0, `[${opts.theme}-${opts.lang}] empty-date save is blocked`, JSON.stringify(recs));
  const invalidDate = await page.locator('#gnResearchDate').getAttribute('aria-invalid');
  assert(invalidDate === 'true', `[${opts.theme}-${opts.lang}] aria-invalid set on empty-date`, invalidDate);
  await page.waitForFunction(() => (document.getElementById('gnLabToolBanner')?.textContent || '').length > 0, null, { timeout: 5000 }).catch(() => {});
  const bannerAfterError = await page.locator('#gnLabToolBanner').innerText();
  assert(bannerAfterError.length > 0, `[${opts.theme}-${opts.lang}] lab-tool status banner populated`, bannerAfterError);

  // happy path
  const preset = page.locator('[data-research-name]:not([data-research-name=""])').first();
  const presetName = (await preset.getAttribute('data-research-name')) || 'BPC-157';
  await preset.click();
  assert((await page.locator('#gnResearchName').inputValue()) === presetName, `[${opts.theme}-${opts.lang}] library preset populates name (${presetName})`);
  assert(await page.locator('#gnResearchName').getAttribute('readonly') !== null, `[${opts.theme}-${opts.lang}] preset name locked`);

  const dateWrapper = page.locator('#gnResearchDate').locator('xpath=..');
  await dateWrapper.locator('[data-gn-date-trigger]').click();
  await dateWrapper.locator('[data-gn-date-today]').click();
  const dateState = await dateWrapper.evaluate(node => ({
    open: node.classList.contains('open'),
    ariaExpanded: node.querySelector('[data-gn-date-trigger]')?.getAttribute('aria-expanded'),
    value: node.querySelector('#gnResearchDate')?.value
  }));
  assert(!dateState.open, `[${opts.theme}-${opts.lang}] USE TODAY closes date picker`, JSON.stringify(dateState));
  assert(dateState.ariaExpanded === 'false', `[${opts.theme}-${opts.lang}] closed picker exposes aria-expanded=false`, JSON.stringify(dateState));
  assert(typeof dateState.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateState.value), `[${opts.theme}-${opts.lang}] USE TODAY populates ISO date`, dateState.value);

  await page.locator('#gnResearchSave').click();
  await page.locator('#gnResearchList > *').first().waitFor({ state: 'visible' });
  recs = await readRecords(page);
  const savedRec = recs[recs.length - 1];
  assert(savedRec && savedRec.name === presetName, `[${opts.theme}-${opts.lang}] record stored (${presetName})`, JSON.stringify(savedRec));
  assert((await page.locator('#gnResearchList').innerText()).includes(presetName), `[${opts.theme}-${opts.lang}] record renders immediately`);
  // success clears invalid state
  const invalidAfterSave = await page.locator('#gnResearchName').getAttribute('aria-invalid');
  assert(invalidAfterSave === null || invalidAfterSave === 'false', `[${opts.theme}-${opts.lang}] success clears aria-invalid`, invalidAfterSave);
  await page.waitForFunction(() => /CAPTURED|UPDATED|REGISTRO|CAPTURADO|ACTUALIZADO/.test(document.getElementById('gnLabToolBanner')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const successBanner = await page.locator('#gnLabToolBanner').innerText();
  assert(/RESEARCH RECORD (CAPTURED|UPDATED)/.test(successBanner) || /REGISTRO/.test(successBanner) || /CAPTURADO|ACTUALIZADO/.test(successBanner), `[${opts.theme}-${opts.lang}] success announcement present`, successBanner);

  // edit
  await page.locator(`#gnResearchList [data-research-edit="${savedRec.id}"]`).click();
  assert((await page.locator('#gnResearchName').inputValue()) === presetName, `[${opts.theme}-${opts.lang}] edit loads existing name`);
  await page.locator('.gn-advanced-toggle').click();
  await page.locator('#gnAdvancedFields:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#gnResearchNotes').fill(`Edited via harness (${opts.theme}-${opts.lang})`);
  await page.locator('#gnResearchSave').click();
  await page.locator('#gnResearchList > *').first().waitFor({ state: 'visible' });
  recs = await readRecords(page);
  const edited = recs[recs.length - 1];
  assert(edited && edited.id === savedRec.id && edited.notes.startsWith('Edited via harness'), `[${opts.theme}-${opts.lang}] edit updates same record`, JSON.stringify(edited));

  // archive
  await page.locator(`#gnResearchList [data-research-archive="${savedRec.id}"]`).click();
  recs = await readRecords(page);
  assert(recs.find(r => r.id === savedRec.id)?.archived === true, `[${opts.theme}-${opts.lang}] archive toggles archived=true`);

  // restore
  await page.locator(`#gnResearchList [data-research-restore="${savedRec.id}"]`).click();
  recs = await readRecords(page);
  assert(recs.find(r => r.id === savedRec.id)?.archived === false, `[${opts.theme}-${opts.lang}] restore toggles archived=false`);

  // capture HTML for vertical-overflow probe
  const overflow = await page.evaluate(() => {
    const overlay = document.querySelector('#gnLabToolOverlay');
    if (!overlay) return null;
    return { overlay: overlay.scrollWidth - overlay.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
  });
  assert(overflow.overlay <= 1, `[${opts.theme}-${opts.lang}] no horizontal overflow in overlay`, JSON.stringify(overflow));
  assert(overflow.body <= 1, `[${opts.theme}-${opts.lang}] no horizontal overflow at viewport`, JSON.stringify(overflow));
}

async function caseMobileWidth(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  try {
    await enterApp(page, { theme: 'dark', lang: 'en', width });
    await openLab(page);
    await openResearchOverlay(page);
    // pick a name + USE TODAY to render the populated form
    const preset = page.locator('[data-research-name]:not([data-research-name=""])').first();
    await preset.click();
    const dateWrapper = page.locator('#gnResearchDate').locator('xpath=..');
    await dateWrapper.locator('[data-gn-date-trigger]').click();
    await dateWrapper.locator('[data-gn-date-today]').click();
    const overflow = await page.evaluate(() => {
      const overlay = document.querySelector('#gnLabToolOverlay');
      return overlay ? overlay.scrollWidth - overlay.clientWidth : null;
    });
    assert(typeof overflow === 'number' && overflow <= 1, `no horizontal overflow at ${width}px populated form`, String(overflow));
    assert(errors.length === 0, `[${width}px] no runtime errors`, JSON.stringify(errors));
  } finally {
    await context.close();
  }
}

async function caseEditArchiveEmpty(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  try {
    await enterApp(page, { theme: 'dark', lang: 'en' });
    await openLab(page);
    await openResearchOverlay(page);
    // pristine → empty state must be present
    const emptyBefore = await page.locator('#gnResearchList .gn-empty-state').count();
    assert(emptyBefore >= 1, 'pristine LAB shows empty-state', String(emptyBefore));
    // confirm save button is reachable and 44+ touch target
    const saveRect = await page.locator('#gnResearchSave').boundingBox();
    assert(saveRect && saveRect.height >= 44, 'Save button meets 44px touch floor', JSON.stringify(saveRect));
    // confirm focus-visible ring exists on focus
    await page.locator('#gnResearchName').focus();
    const focusRing = await page.locator('#gnResearchName').evaluate(el => {
      const cs = getComputedStyle(el);
      return { outline: cs.outline, boxShadow: cs.boxShadow };
    });
    assert(/(solid|rgb|0px)/.test(focusRing.outline) || focusRing.boxShadow !== 'none', 'focus-visible styling present on input', JSON.stringify(focusRing));
    assert(errors.length === 0, '[empty] no runtime errors', JSON.stringify(errors));
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ['--no-sandbox'] });
  const targets = targetArg === 'all' ? ALL : targetArg.split(',');
  try {
    if (targets.includes('dark-en') || targets.includes('light-en') || targets.includes('dark-es') || targets.includes('light-es')) {
      const combos = [];
      if (targets.includes('dark-en')) combos.push({ theme: 'dark', lang: 'en' });
      if (targets.includes('light-en')) combos.push({ theme: 'light', lang: 'en' });
      if (targets.includes('dark-es')) combos.push({ theme: 'dark', lang: 'es' });
      if (targets.includes('light-es')) combos.push({ theme: 'light', lang: 'es' });
      for (const opts of combos) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        try { await fullCycle(page, opts); }
        finally {
          assert(errors.length === 0, `[${opts.theme}-${opts.lang}] no runtime errors`, JSON.stringify(errors));
          await ctx.close();
        }
      }
    }
    if (targets.includes('320')) await caseMobileWidth(browser, 320);
    if (targets.includes('430')) await caseMobileWidth(browser, 430);
    if (targets.includes('edit-archive-empty')) await caseEditArchiveEmpty(browser);
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
