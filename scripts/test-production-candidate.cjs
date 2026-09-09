#!/usr/bin/env node

async function reloadPage(page, timeoutMs = 15000) {
  // Tolerant reload: the app reloads itself once when the service worker takes
  // control (controllerchange). Playwright's page.reload races that and throws
  // net::ERR_FAILED, so trigger via location.reload and wait for the new
  // document to settle instead.
  await page.evaluate(() => location.reload());
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(700);
  // After a reload the app boots to the landing screen; re-enter the app.
  const landingBtn = page.locator('.landing-btn.primary').first();
  const onLanding = await landingBtn.isVisible().catch(() => false);
  if (onLanding) {
    await landingBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await landingBtn.click({ timeout: 8000 }).catch(() => {});
    await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }
}

'use strict';

const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const expectedRelease = process.argv[3] || '20260804.1';
const expectedVersion = process.argv[4] || '0.12.0';
const results = [];

function pass(label, detail = '') {
  results.push({ label, detail });
}

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
  pass(label, detail);
}

async function storedRecord(page, suffix) {
  return page.evaluate(recordSuffix => {
    const key = Object.keys(localStorage).find(item => item.endsWith(recordSuffix));
    if (!key) return null;
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value.at(-1) : value;
  }, suffix);
}

async function bootstrap(page, { lang = 'en', theme = 'light', clean = true } = {}) {
  await page.goto(`${baseURL}/?rc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  // Let the boot sequence + SW controllerchange settle before interacting.
  await page.waitForTimeout(2500);
  await page.evaluate(({ release, language, appearance, clear }) => {
    if (clear) localStorage.clear();
    localStorage.setItem('gn_theme_v1', appearance);
    localStorage.setItem('gn.lang', language);
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
    // Seed a local-only session so the app boots into the workspace (the
    // login screen only appears when no session exists).
    localStorage.setItem('gn_session_v2', JSON.stringify({
      user: { id: 'local', email: 'qa@gridnode.local', user_metadata: { full_name: 'NODE_USER' } },
      createdAt: new Date().toISOString()
    }));
  }, { release: expectedRelease, language: lang, appearance: theme, clear: clean });
  await reloadPage(page);
  const landingVisible = await page.locator('.landing-btn.primary').first().isVisible().catch(() => false);
  if (landingVisible) {
    await page.locator('.landing-btn.primary').first().click();
  }
  await page.locator('#app.active').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
}

async function newUserFlow(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'en-US',
    serviceWorkers: 'allow'
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__GN_LONG_TASKS = [];
    try {
      new PerformanceObserver(list => list.getEntries().forEach(entry => window.__GN_LONG_TASKS.push(entry.duration))).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await bootstrap(page);
  const sourceResponse = await page.request.get(baseURL);
  const sourceHead = (await sourceResponse.text()).split('</head>', 1)[0];
  assert(/<link\b[^>]*\bid=["']gnNativeCss["'][^>]*>/i.test(sourceHead), 'native layout CSS is declared in the document head');
  const startup = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const nativeCss = performance.getEntriesByType('resource').find(entry => entry.name.includes('/css/gridnode-native.css'));
    return {
      domContentLoadedMs: nav?.domContentLoadedEventEnd || 0,
      loadMs: nav?.loadEventEnd || nav?.domContentLoadedEventEnd || 0,
      nativeCssStartMs: nativeCss?.startTime ?? null,
      nativeCssBeforeDomReady: Boolean(nativeCss && nav && nativeCss.startTime < nav.domContentLoadedEventStart)
    };
  });
  assert(startup.domContentLoadedMs > 0 && startup.domContentLoadedMs < 3000, 'startup reaches an interactive shell within three seconds', JSON.stringify(startup));
  assert(startup.nativeCssBeforeDomReady, 'native layout CSS starts loading before DOM ready', JSON.stringify(startup));
  assert(await page.evaluate(({ release, version }) => window.GN_VERSION.release === release && window.GN_VERSION.semver === version, { release: expectedRelease, version: expectedVersion }), 'served version matches candidate');
  const medicationMatrix = await page.evaluate(() => ({
    zepbound: window.GN_MEDICATION_IDENTITY.normalize('Zepbound'),
    ozempic: window.GN_MEDICATION_IDENTITY.normalize('Ozempic'),
    semaglutideCompound: window.GN_MEDICATION_IDENTITY.normalize('Semaglutide Compound'),
    invalid: window.GN_MEDICATION_IDENTITY.normalize('unknown ambiguous medication')
  }));
  assert(medicationMatrix.zepbound === 'zepbound_tirzepatide', 'Zepbound resolves to its stable canonical ID', JSON.stringify(medicationMatrix));
  assert(medicationMatrix.ozempic === 'ozempic_semaglutide' && medicationMatrix.semaglutideCompound === 'semaglutide_compound' && medicationMatrix.ozempic !== medicationMatrix.semaglutideCompound, 'Ozempic and Semaglutide Compound resolve to distinct IDs', JSON.stringify(medicationMatrix));
  assert(medicationMatrix.invalid === '', 'invalid medication values fail closed');
  assert(await page.locator('.gn-empty-hero').isVisible(), 'empty-state hero dominates clean dashboard');
  assert(await page.locator('.gn-empty-cta').isVisible(), 'one red CTA in empty state');
  const firstDoseTip = await page.locator('#gnEmptyHero .gn-tip-card').innerText();
  assert(/medication/i.test(firstDoseTip) && /dose/i.test(firstDoseTip), 'first-dose guidance names every required SHOT field', firstDoseTip);

  await page.evaluate(() => {
    window.GN.S.set('inventory', [{ id: 'rc-zepbound-vial', name: 'RC Zepbound vial', type: 'VIAL', quantity: 20, units: 'mg', medication: 'zepbound_tirzepatide', autoDeduct: true, archived: false, history: [] }]);
    window.showPage('Log');
    window.openLogModal();
  });
  await page.locator('#logOv.active').waitFor({ state: 'visible' });
  await page.waitForTimeout(50);
  assert(await page.evaluate(() => document.getElementById('logOv').contains(document.activeElement)), 'SHOT sheet moves keyboard focus inside the dialog');
  assert(await page.locator('#logOv [role="dialog"]').count() === 1 && await page.locator('#logOv').getAttribute('role') !== 'dialog', 'SHOT sheet exposes exactly one modal dialog surface');
  assert(await page.locator('#gnShotAdvanced.gn-hidden').count() === 1, 'collapsed SHOT details begin outside the keyboard sequence');
  const visibleDate = await page.locator('#sDate').inputValue();
  assert(!/^\d{4}-\d{2}-\d{2}$/.test(visibleDate), 'SHOT date is human-facing', visibleDate);
  assert(await page.locator('#sDate').getAttribute('data-iso-date') !== null, 'SHOT date retains canonical ISO value');

  await page.locator('#cpShotMed .cp-select-trigger').click();
  await page.locator('#cpShotMedDrop [data-gn-med-group="TIRZEPATIDE"]').click();
  const zepbound = page.locator('#cpShotMedDrop .cp-option').filter({ hasText: 'Zepbound' }).first();
  await zepbound.waitFor({ state: 'visible' });
  await zepbound.click();
  await page.locator('#sDose').fill('5');
  await page.evaluate(() => { window.gnSetShotDateValue('2026-08-03'); window.gnSetShotMeridiem('AM'); });
  await page.locator('#sTime').fill('8:30');
  await page.locator('.gn-shot-advanced-trigger').click();
  await page.locator('#gnShotAdvanced').waitFor({ state: 'visible' });
  await page.locator('#sNotes').fill('production candidate first SHOT');
  await page.locator('#logOv input[type="checkbox"][value="nausea"]').check();
  await page.locator('#logOv input[type="checkbox"][value="dizziness"]').check();

  await page.evaluate(() => window.goToScannerForLocationFromLog());
  assert(await page.locator('#logOv.active').count() === 0, 'scanner detour closes SHOT sheet');
  await page.evaluate(() => window.GNModules.selectScannerLocation('Right Abdomen — Upper'));
  await page.evaluate(() => window.openLogModal({ preserve: true }));
  assert(await page.locator('#sDose').inputValue() === '5', 'dose survives location selection');
  assert((await page.locator('#cpShotMedVal').textContent()).includes('Zepbound'), 'medication survives location selection');
  assert(await page.locator('#logOv input[type="checkbox"][value="nausea"]').isChecked(), 'side effect survives location selection');
  assert(await page.locator('#logOv input[type="checkbox"][value="dizziness"]').isChecked(), 'extended side-effect identity survives location selection');
  assert(await page.locator('#sTime').inputValue() === '8:30', 'time survives location selection');
  assert((await page.locator('#modalSelectedLocation').textContent()).includes('Abdomen'), 'location returns to SHOT draft');

  await page.locator('#sWt').fill('-25');
  await page.evaluate(() => window.saveShot());
  assert(await page.evaluate(() => window.GN.S.get('shots', []).length === 0), 'negative optional SHOT weight fails closed');
  assert(await page.locator('#sWt').getAttribute('aria-invalid') === 'true', 'invalid optional weight identifies the field');
  await page.locator('#sWt').fill('200');
  await page.evaluate(() => window.saveShot());
  await page.waitForTimeout(250);
  const shot = await storedRecord(page, '_shots');
  assert(shot?.med === 'zepbound_tirzepatide', 'canonical Zepbound ID persists', JSON.stringify(shot));
  assert(!['ozempic_semaglutide', 'semaglutide_compound'].includes(shot?.med), 'Zepbound cannot resolve to semaglutide identities');
  assert(shot?.site === 'Right Abdomen — Upper', 'canonical location persists');
  assert(shot?.se?.includes('nausea') && shot?.se?.includes('dizziness') && !shot?.se?.includes('Dizziness'), 'side effects persist as canonical IDs in saved SHOT');
  assert(String(shot?.date).startsWith('2026-08-03T08:30'), 'canonical date and time persist', shot?.date);
  const inventoryAfterSave = await storedRecord(page, '_inventory');
  assert(Number(inventoryAfterSave?.quantity) === 15 && inventoryAfterSave?.history?.length === 1, 'SHOT deducts inventory once', JSON.stringify(inventoryAfterSave));

  await page.evaluate(() => window.showPage('Dash'));
  assert(await page.locator('#gnFirstShotMission').isHidden(), 'dashboard activates after first SHOT');
  await page.evaluate(() => window.showPage('Results'));
  assert((await page.locator('#pageResults').innerText()).includes('Zepbound'), 'RESULTS agrees on medication identity');
  assert((await page.locator('#pageResults').innerText()).includes('Nausea'), 'RESULTS retains side-effect signal');

  await page.evaluate(() => window.showPage('Log'));
  assert((await page.locator('#logList').innerText()).includes('Zepbound'), 'history shows exact medication');
  await page.locator('[data-shot-action="edit"]').first().click();
  assert((await page.locator('#cpShotMedVal').textContent()).includes('Zepbound'), 'Edit agrees on medication identity');
  assert(await page.locator('#logOv input[type="checkbox"][value="nausea"]').isChecked(), 'Edit restores side effects');
  assert(await page.locator('#logOv input[type="checkbox"][value="dizziness"]').isChecked(), 'Edit restores extended side effects');
  assert(!/^\d{4}-\d{2}-\d{2}$/.test(await page.locator('#sDate').inputValue()), 'Edit keeps human-facing date');
  await page.evaluate(id => {
    const weights = window.GN.S.get('weights', []);
    const linked = weights.find(record => record.shotId === id);
    if (linked) linked.cloudId = 'cloud-weight-rc';
    window.GN.S.multiWrite([{ key: 'weights', value: weights }, { key: 'cloudDeletes', value: [] }]);
  }, shot.id);
  await page.locator('#sWt').fill('');
  const tombstoneFailure = await page.evaluate(id => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function rejectCloudDelete(key, value) {
      if (String(key).endsWith('_cloudDeletes')) throw new DOMException('Injected cloud tombstone rejection', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    try { window.saveShot(); }
    finally { Storage.prototype.setItem = original; }
    return {
      shot: window.GN.S.get('shots', []).find(record => record.id === id),
      linkedWeights: window.GN.S.get('weights', []).filter(record => record.shotId === id),
      cloudDeletes: window.GN.S.get('cloudDeletes', []),
      dialogActive: document.getElementById('logOv')?.classList.contains('active')
    };
  }, shot.id);
  assert(tombstoneFailure.shot?.wt === 200 && tombstoneFailure.linkedWeights.length === 1 && tombstoneFailure.cloudDeletes.length === 0 && tombstoneFailure.dialogActive, 'failed cloud tombstone keeps SHOT and linked RESULTS state intact', JSON.stringify(tombstoneFailure));
  await page.evaluate(() => window.saveShot());
  const editIntegrity = await page.evaluate(id => {
    const inventory = window.GN.S.get('inventory', [])[0];
    return {
      shot: window.GN.S.get('shots', []).find(record => record.id === id),
      linkedWeights: window.GN.S.get('weights', []).filter(record => record.shotId === id),
      cloudDeletes: window.GN.S.get('cloudDeletes', []),
      inventoryQuantity: inventory?.quantity,
      deductEvents: inventory?.history?.filter(event => /AUTO-DEDUCTED/.test(event.action)).length
    };
  }, shot.id);
  assert(editIntegrity.shot?.wt === null && editIntegrity.linkedWeights.length === 0, 'clearing an edited SHOT weight removes the linked weight record', JSON.stringify(editIntegrity));
  assert(editIntegrity.cloudDeletes.some(record => record.table === 'weights' && record.id === 'cloud-weight-rc'), 'linked RESULTS deletion commits its cloud retry tombstone atomically', JSON.stringify(editIntegrity.cloudDeletes));
  assert(editIntegrity.inventoryQuantity === 15 && editIntegrity.deductEvents === 1, 'same-dose edit does not double-deduct inventory or duplicate history', JSON.stringify(editIntegrity));
  await page.locator('[data-shot-action="archive"]').first().click();
  await page.evaluate(() => window.confirmArchiveShot());
  const archived = await storedRecord(page, '_shots');
  assert(archived?.archived === true && archived?.med === 'zepbound_tirzepatide', 'Archive preserves medication identity');
  await page.evaluate(() => window.setShotHistoryView('archived'));
  await page.locator('[data-shot-action="restore-edit"]').first().click();
  const restoredShot = await storedRecord(page, '_shots');
  assert(restoredShot?.archived === false && restoredShot?.med === 'zepbound_tirzepatide', 'archived SHOT restores with medication identity intact');
  assert(await page.locator('#logOv.active').count() === 1, 'RESTORE TO EDIT opens the restored SHOT for review');
  await page.evaluate(() => window.closeLog(true));

  const inventoryIdentity = await page.evaluate(() => {
    const beforeShots = window.GN.S.get('shots', []);
    const beforeInventory = window.GN.S.get('inventory', []);
    window.GN.S.set('inventory', [{ id: 'compound-semaglutide-vial', name: 'Semaglutide Compound', medication: 'semaglutide_compound', quantity: 20, units: 'mg', autoDeduct: true, archived: false, history: [] }]);
    window.openLogModal();
    window.GNModules.selectState.cpShotMed.val = 'ozempic_semaglutide';
    window.GNModules.moduleState.selectedLocation = 'Right Abdomen — Upper';
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    window.gnSetShotDateValue(yesterday);
    document.getElementById('sTime').value = '8:00';
    window.gnSetShotMeridiem('AM');
    document.getElementById('sDose').value = '1';
    document.getElementById('sWt').value = '';
    window.saveShot();
    const ozempicShot = window.GN.S.get('shots', []).find(record => record.med === 'ozempic_semaglutide');
    const compoundInventory = window.GN.S.get('inventory', [])[0];
    window.GN.S.multiWrite([{ key: 'shots', value: beforeShots }, { key: 'inventory', value: beforeInventory }]);
    return { ozempicShot, compoundInventory };
  });
  assert(inventoryIdentity.ozempicShot && !inventoryIdentity.ozempicShot.inventoryDeduction && Number(inventoryIdentity.compoundInventory?.quantity) === 20, 'Ozempic never deducts a compounded semaglutide inventory item', JSON.stringify(inventoryIdentity));

  const undoBaseline = await page.evaluate(() => ({
    shots: window.GN.S.get('shots', []),
    weights: window.GN.S.get('weights', []),
    inventory: window.GN.S.get('inventory', []),
    cloudDeletes: window.GN.S.get('cloudDeletes', [])
  }));
  await page.evaluate(() => {
    window.GN.S.set('inventory', [{ id: 'undo-zepbound-vial', name: 'Zepbound', medication: 'zepbound_tirzepatide', quantity: 20, units: 'mg', autoDeduct: true, archived: false, history: [] }]);
    window.openLogModal();
    window.GNModules.selectState.cpShotMed.val = 'zepbound_tirzepatide';
    window.GNModules.moduleState.selectedLocation = 'Left Abdomen — Lower';
    window.gnSetShotDateValue(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    document.getElementById('sTime').value = '7:30';
    window.gnSetShotMeridiem('AM');
    document.getElementById('sDose').value = '5';
    document.getElementById('sWt').value = '198';
    window.saveShot();
  });
  await page.locator('.gn-toast-undo').click();
  const undoneShot = await page.evaluate(() => {
    const record = window.GN.S.get('shots', []).find(item => item.archived && item.undoSnapshot);
    const inventory = window.GN.S.get('inventory', [])[0];
    return { record, inventory, linkedWeights: window.GN.S.get('weights', []).filter(item => item.shotId === record?.id) };
  });
  assert(undoneShot.record?.inventoryDeductionReversed?.amount === 5 && Number(undoneShot.inventory?.quantity) === 20 && undoneShot.linkedWeights.length === 0, 'UNDO reverses inventory and archives the linked RESULTS snapshot atomically', JSON.stringify(undoneShot));
  await page.evaluate(() => window.setShotHistoryView('archived'));
  await page.locator('[data-shot-action="restore-edit"]').first().click();
  const undoRestored = await page.evaluate(id => {
    const record = window.GN.S.get('shots', []).find(item => item.id === id);
    const inventory = window.GN.S.get('inventory', [])[0];
    return { record, inventory, linkedWeights: window.GN.S.get('weights', []).filter(item => item.shotId === id) };
  }, undoneShot.record.id);
  assert(undoRestored.record?.archived === false && undoRestored.record?.inventoryDeduction?.amount === 5 && Number(undoRestored.inventory?.quantity) === 15 && undoRestored.linkedWeights.length === 1, 'restoring an undone SHOT reapplies inventory and linked RESULTS atomically', JSON.stringify(undoRestored));
  await page.evaluate(baseline => {
    window.closeLog(true);
    window.GN.S.multiWrite([
      { key: 'shots', value: baseline.shots },
      { key: 'weights', value: baseline.weights },
      { key: 'inventory', value: baseline.inventory },
      { key: 'cloudDeletes', value: baseline.cloudDeletes }
    ]);
  }, undoBaseline);

  await page.evaluate(() => window.showPage('Profile'));
  await page.locator('#profHtFt').fill('5');
  await page.locator('#profHtIn').fill('9');
  await page.evaluate(() => window.saveProfileMetrics());
  await page.evaluate(() => window.showPage('Profile'));
  assert((await page.locator('#gnProfileBody').textContent()).includes("5'9\""), 'height summary updates');

  await page.evaluate(async () => { await window.GN_I18N.setLang('es'); window.GN_THEME.set('dark'); });
  await reloadPage(page);
  await page.locator('#app.active').waitFor({ state: 'visible' });
  const persistedPresentation = await page.evaluate(() => ({ lang: document.documentElement.lang, theme: window.GN_THEME.get(), storedLang: localStorage.getItem('gn.lang'), storedTheme: localStorage.getItem('gn_theme_v1') }));
  assert(persistedPresentation.lang === 'es' && persistedPresentation.theme === 'dark', 'language and theme persist after reload', JSON.stringify(persistedPresentation));
  const reloadedShot = await storedRecord(page, '_shots');
  assert(reloadedShot?.med === 'zepbound_tirzepatide' && reloadedShot?.se?.includes('nausea'), 'saved records survive reload without reinterpretation');
  await page.evaluate(() => window.showPage('Profile'));
  assert((await page.locator('#gnProfileBody').textContent()).includes("5'9\""), 'profile metrics survive reload');

  const evidenceBaseline = await page.evaluate(() => {
    const shots = window.GN.S.get('shots', []);
    const profile = window.GN.S.get('profile', {});
    const loggedAt = new Date(Date.now() - 3600000);
    if (!window.GN.S.multiWrite([
      { key: 'shots', value: [{ id: 'evidence-bpc', date: loggedAt.toISOString(), med: 'bpc157', dose: 1, site: 'Right Abdomen — Upper', archived: false }] },
      { key: 'profile', value: { ...profile, shotDay: (loggedAt.getDay() + 1) % 7 } }
    ])) throw new Error('could not seed evidence journey');
    window.GNModules.refreshAll();
    window.showPage('Dash');
    return { shots, profile };
  });
  await page.locator('#medExpandBtn').click();
  await page.locator('#gnPeptideOverlay.active').waitFor({ state: 'visible' });
  const evidenceA11y = await page.evaluate(() => {
    const sources = Array.from(document.querySelectorAll('#gnPeptideDossier .gn-peptide-dossier-src'));
    const ring = document.getElementById('gnPeptideRing');
    return {
      animal: document.getElementById('gnPeptideAnimal')?.innerText,
      sourceCount: sources.length,
      minSourceHeight: Math.min(...sources.map(link => link.getBoundingClientRect().height)),
      ringRole: ring?.getAttribute('role'),
      ringHidden: ring?.getAttribute('aria-hidden'),
      next: document.getElementById('gnPeptideNext')?.innerText,
      footer: document.querySelector('.gn-peptide-overlay-foot')?.innerText
    };
  });
  assert(/MODELO ANIMAL · RATA \/ PERRO IV\/IM — NO ES EXPOSICIÓN HUMANA/i.test(evidenceA11y.animal), 'animal evidence labels are fully localized and separated from human exposure', JSON.stringify(evidenceA11y));
  assert(evidenceA11y.sourceCount > 0 && evidenceA11y.minSourceHeight >= 44, 'evidence source links meet the touch target', JSON.stringify(evidenceA11y));
  assert(evidenceA11y.ringRole === 'img' && evidenceA11y.ringHidden === null, 'cycle ring has an accessible image description', JSON.stringify(evidenceA11y));
  assert(/TU AGENDA|YOUR SCHEDULE/i.test(evidenceA11y.next), 'Evidence View reads the user-defined shot schedule', evidenceA11y.next);
  assert(/modelos animales/i.test(evidenceA11y.footer) && /guía de dosificación/i.test(evidenceA11y.footer), 'Evidence View footer describes its actual research scope and dosing boundary', evidenceA11y.footer);
  await page.locator('#gnPeptideBigChart').focus();
  await page.keyboard.press('ArrowRight');
  const chartFeedback = await page.locator('#gnPeptideTip').evaluate(tip => ({ hidden: tip.hidden, role: tip.getAttribute('role'), live: tip.getAttribute('aria-live'), text: tip.innerText }));
  assert(!chartFeedback.hidden && chartFeedback.role === 'status' && chartFeedback.live === 'polite' && chartFeedback.text.length > 0, 'keyboard chart inspection exposes live textual feedback', JSON.stringify(chartFeedback));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert(await page.locator('#gnPeptideOverlay.active').count() === 0, 'Escape closes Evidence View');
  await page.evaluate(baseline => {
    window.GN.S.multiWrite([{ key: 'shots', value: baseline.shots }, { key: 'profile', value: baseline.profile }]);
    window.GNModules.refreshAll();
  }, evidenceBaseline);

  assert(runtimeErrors.length === 0, 'new-user flow has no runtime errors', runtimeErrors.join(' | '));
  const maxLongTaskMs = await page.evaluate(() => Math.max(0, ...(window.__GN_LONG_TASKS || [])));
  assert(maxLongTaskMs < 500, 'new-user flow has no long main-thread freeze', `${maxLongTaskMs.toFixed(1)}ms`);
  await context.close();
}

async function onboardingFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US', serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(`${baseURL}/?onboarding=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(release => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', 'light');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, expectedRelease);
  await reloadPage(page);
  const landingVisible = await page.locator('.landing-btn.primary').first().isVisible().catch(() => false);
  if (landingVisible) await page.locator('.landing-btn.primary').first().click();
  // Fresh user hits the login screen; enter local-only mode via the same code
  // path as the CONTINUE LOCALLY button (auto-starts onboarding).
  await page.evaluate(() => {
    if (window.GN?.localMode) window.GN.localMode();
    else if (typeof window.startGridNode === 'function') window.startGridNode();
  });
  await page.locator('.gn-onb-overlay').waitFor({ state: 'visible', timeout: 10000 });
  // Spotlight tour (v0.15.2+): five stages — first-dose CTA, weight, theme,
  // language, finish. Action stages hide NEXT and require the real control.
  await page.waitForFunction(() => document.querySelector('[data-onb-step]')?.textContent.includes('01 / 05'));
  assert((await page.locator('[data-onb-step]').innerText()).includes('01 / 05') && (await page.locator('[data-onb-kicker]').innerText()).includes('QUICK START'), 'onboarding exposes exactly five stages');
  assert(await page.locator('[data-onb-next]').isHidden(), 'first action stage has no Next button');
  assert(await page.locator('[data-onboard="empty-cta"].gn-onb-target').isVisible(), 'first-dose CTA is the spotlighted target');
  await page.locator('[data-onboard="empty-cta"].gn-onb-target').click();
  await page.waitForFunction(() => document.querySelector('[data-onb-step]')?.textContent.includes('02 / 05'));
  assert(await page.locator('[data-onb-next]').isHidden(), 'weight action stage has no Next button');
  assert(await page.locator('[data-onboard="log-weight"].gn-onb-target').isVisible(), 'weight control is the spotlighted target');
  await page.locator('[data-onboard="log-weight"]').click();
  await page.waitForFunction(() => document.querySelector('[data-onb-step]')?.textContent.includes('03 / 05'));
  assert(await page.locator('[data-onb-next]').isVisible(), 'explanation stage has one Continue control');
  await page.locator('[data-onb-next]').click();
  await page.waitForFunction(() => document.querySelector('[data-onb-step]')?.textContent.includes('04 / 05'));
  await page.locator('[data-onb-next]').click();
  await page.waitForFunction(() => document.querySelector('[data-onb-step]')?.textContent.includes('05 / 05'));
  assert((await page.locator('[data-onb-next]').innerText()).includes('FINISH'), 'final stage offers FINISH');
  await page.locator('[data-onb-next]').click();
  await page.waitForTimeout(700);
  assert(await page.locator('.gn-onb-overlay').count() === 0 && await page.evaluate(() => localStorage.getItem('gn_onboarding_v1') === 'complete'), 'onboarding completion persists');
  const futureState = await page.evaluate(() => {
    window.GN.S.set('shots', [{ id: 'future-shot', date: new Date(Date.now() + 86400000).toISOString(), med: 'zepbound_tirzepatide', dose: 5, site: 'Right Abdomen — Upper', archived: false }]);
    window.GNModules.refreshAll();
    window.showPage('Dash');
    return { phase: document.getElementById('phaseNameTxt')?.textContent, count: document.getElementById('shotsCount')?.textContent };
  });
  assert(futureState.phase === 'NO SHOTS RECORDED', 'future scheduled SHOT does not become current Phase Engine state', JSON.stringify(futureState));
  await page.waitForTimeout(1100);
  const futureSphere = await page.locator('#phaseSpherePhase').innerText();
  assert(/AWAITING FIRST SHOT/i.test(futureSphere), 'future scheduled SHOT stays out of the Phase Sphere', futureSphere);
  await context.close();
}

async function returningUserAndPlatformFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'es-419', serviceWorkers: 'allow' });
  const page = await context.newPage();
  await bootstrap(page, { lang: 'es', theme: 'light' });
  await page.evaluate(() => {
    const shotKey = Object.keys(localStorage).find(key => key.endsWith('_shots')) || 'gn_local_shots';
    localStorage.setItem(shotKey, JSON.stringify([{ id: 'returning-shot', date: '2026-08-02T09:15', med: 'Zepbound', dose: 5, site: 'Left Abdomen — Lower', se: ['Nausea'], notes: 'returning user', archived: false }]));
    localStorage.setItem('gn_onboarding_v1', 'complete');
  });
  await reloadPage(page);
  await page.locator('#app.active').waitFor({ state: 'visible' });
  assert(await page.locator('.gn-onb-overlay.active').count() === 0, 'onboarding does not replay for returning user');
  await page.evaluate(() => window.showPage('Dash'));
  const stalePhase = await page.locator('#phaseNameTxt').innerText();
  assert(stalePhase !== 'ONSET', 'SHOT older than seven days does not wrap back to ONSET', stalePhase);
  await page.waitForTimeout(1100);
  const staleSphere = await page.locator('#phaseSpherePhase').innerText();
  assert(!/ACTIVATION|ACTIVACIÓN/i.test(staleSphere), 'stale SHOT does not wrap the Phase Sphere back to activation', staleSphere);
  await page.evaluate(() => window.showPage('Log'));
  const spanishHistory = await page.locator('#logList').innerText();
  assert(spanishHistory.includes('Náuseas') && !spanishHistory.includes('Nausea'), 'legacy side-effect labels localize without rewriting stored data', spanishHistory);
  assert(!spanishHistory.includes('Left Abdomen — Lower'), 'stored body zones render in Spanish', spanishHistory);
  await page.evaluate(() => window.openLogModal());
  await page.locator('.gn-shot-advanced-trigger').click();
  const spanishSideEffects = await page.locator('#logOv .se-grid').innerText();
  assert(spanishSideEffects.includes('Vómitos') && spanishSideEffects.includes('Mareo') && !spanishSideEffects.includes('Vomiting') && !spanishSideEffects.includes('Dizziness'), 'all built-in side effects render in Spanish from canonical IDs', spanishSideEffects);
  await page.evaluate(() => { window.closeLog(true); if (window.cancelShotDiscard) window.cancelShotDiscard(); });
  await page.waitForTimeout(180);

  await page.evaluate(() => window.openWeightModal());
  assert(await page.locator('#wtOv').getAttribute('aria-hidden') === 'false', 'open weight sheet is exposed to assistive technology');
  const weightDate = await page.locator('#wtDate').inputValue();
  assert(/^\d{2}\/\d{2}\/\d{4}$/.test(weightDate) && !/^\d{4}-/.test(weightDate), 'weight date is localized for Spanish', weightDate);
  await page.locator('#wtVal').fill('200');
  await page.evaluate(() => window.saveWt());
  await page.waitForTimeout(180);
  assert(await page.locator('#wtOv').getAttribute('aria-hidden') === 'true', 'closed weight sheet is hidden from assistive technology');
  const weight = await storedRecord(page, '_weights');
  assert(Number(weight?.weight) === 200, 'weight record saves in returning flow');

  await page.evaluate(() => window.openArsenalMod());
  const spanishContextForm = await page.locator('#arsOv.active').innerText();
  assert(spanishContextForm.includes('NOMBRE DEL CONTEXTO') && spanishContextForm.includes('VOLUMEN') && spanishContextForm.includes('CANTIDAD') && spanishContextForm.includes('FECHA DE REVISIÓN') && spanishContextForm.includes('GUARDAR CONTEXTO'), 'VAULT context form is fully localized in Spanish', spanishContextForm);
  await page.evaluate(() => window.closeArs());

  await page.evaluate(() => window.showPage('Lab'));
  await page.locator('[data-lab-focus="research"]').click();
  await page.locator('#gnResearchState').locator('xpath=..').locator('.gn-custom-picker-trigger').click();
  const menuAudit = await page.evaluate(() => {
    const menu = document.querySelector('.gn-custom-picker.open .gn-custom-picker-menu');
    const option = menu?.querySelector('.gn-custom-picker-option');
    if (!menu || !option) return null;
    const menuStyle = getComputedStyle(menu);
    const optionStyle = getComputedStyle(option);
    return { background: menuStyle.backgroundColor, color: optionStyle.color, height: option.getBoundingClientRect().height, text: option.textContent.trim() };
  });
  assert(menuAudit && menuAudit.height >= 44 && /SEGUIMIENTO|COMPLETADO|ARCHIVADO/.test(menuAudit.text), 'Spanish dropdown options are localized and touch-sized', JSON.stringify(menuAudit));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);
  assert(await page.locator('#gnLabToolOverlay.active').count() === 1, 'closing a nested dropdown keeps its focused LAB tool open', JSON.stringify(await page.evaluate(() => ({ state: history.state, active: document.querySelector('.page.active')?.id }))));
  await page.goBack();
  assert(await page.locator('#gnLabToolOverlay.active').count() === 0, 'browser Back exits focused LAB tool');
  assert(await page.locator('#pageLab.active').count() === 1, 'browser Back returns focused LAB tool to LAB', JSON.stringify(await page.evaluate(() => ({ active: document.querySelector('.page.active')?.id, state: history.state, body: document.body.className }))));

  await page.locator('[data-lab-focus="ledger"]').click();
  const spanishLedger = await page.locator('#gnLedgerList').innerText();
  assert(spanishLedger.includes('RESULTADOS ACTUALIZADOS') && spanishLedger.includes('Entrada manual') && spanishLedger.includes('Confirmado por el usuario'), 'stored event tokens render fully in Spanish', spanishLedger);
  await page.goBack();

  await page.evaluate(() => window.showPage('Profile'));
  assert(await page.locator('.fab').evaluate(node => getComputedStyle(node).visibility === 'hidden'), 'FAB never covers profile controls');
  const signOutButton = page.locator('[onclick="openSignOutModal()"]').first();
  await signOutButton.focus();
  await signOutButton.click();
  await page.waitForTimeout(120);
  const signOutOpen = await page.evaluate(() => {
    const overlay = document.getElementById('signOutOverlay');
    return {
      active: overlay?.classList.contains('active'),
      ariaHidden: overlay?.getAttribute('aria-hidden'),
      focusInside: overlay?.contains(document.activeElement),
      dialogCount: Number(overlay?.matches('[role="dialog"]')) + (overlay?.querySelectorAll('[role="dialog"]').length || 0),
      historyLayer: history.state?.gnLayer
    };
  });
  assert(signOutOpen.active && signOutOpen.ariaHidden === 'false' && signOutOpen.focusInside && signOutOpen.dialogCount === 1 && signOutOpen.historyLayer === 'signOutOverlay', 'sign-out dialog participates in focus, semantics, and browser history', JSON.stringify(signOutOpen));
  await page.goBack();
  await page.waitForTimeout(120);
  assert(await page.locator('#signOutOverlay.active').count() === 0 && await page.locator('#signOutOverlay').getAttribute('aria-hidden') === 'true', 'browser Back dismisses sign-out without signing out');
  await signOutButton.click();
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert(await page.locator('#signOutOverlay.active').count() === 0 && await page.locator('#signOutOverlay').getAttribute('aria-hidden') === 'true', 'Escape dismisses sign-out without signing out');

  const widths = [320, 360, 390, 412, 430, 768, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : Math.round(width * 2.15) });
    await page.evaluate(() => window.showPage('Dash'));
    const layout = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      appOverflow: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth,
      viewport: getComputedStyle(document.documentElement).getPropertyValue('--gn-viewport-height')
    }));
    assert(layout.documentOverflow <= 1 && layout.appOverflow <= 1, `no horizontal overflow at ${width}px`, JSON.stringify(layout));
  }

  const touchFailures = await page.evaluate(() => Array.from(document.querySelectorAll('#app button:not([hidden]),#app [role="button"]:not([hidden])')).filter(element => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || element.closest('[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).slice(0, 20).map(element => ({ id: element.id, className: element.className, text: element.textContent.trim().slice(0, 40), size: [element.offsetWidth, element.offsetHeight] })));
  assert(touchFailures.length === 0, 'visible app controls meet the 44px touch target', JSON.stringify(touchFailures));

  const unlabeledControls = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea')).filter(element => {
    if (getComputedStyle(element).display === 'none' && element.type === 'file') return false;
    return !element.labels?.length && !element.closest('label') && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.getAttribute('data-i18n-aria-label');
  }).map(element => element.id || element.name || element.type));
  assert(unlabeledControls.length === 0, 'form controls have programmatic labels', JSON.stringify(unlabeledControls));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.showPage('Dash'));
  await page.locator('#navLog').focus();
  await page.keyboard.press('Enter');
  assert(await page.locator('#pageLog.active').count() === 1, 'Enter activates bottom navigation');
  await page.locator('#navRes').focus();
  await page.keyboard.press('Space');
  assert(await page.locator('#pageResults.active').count() === 1, 'Space activates bottom navigation');
  const focusStyle = await page.locator('#navRes').evaluate(element => { const style = getComputedStyle(element); return { outline: style.outlineStyle, shadow: style.boxShadow }; });
  assert(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none', 'keyboard focus remains visibly indicated', JSON.stringify(focusStyle));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await page.locator('.page.active').evaluate(element => ({ transition: getComputedStyle(element).transitionDuration, animation: getComputedStyle(element).animationDuration }));
  assert(reducedMotion.transition === '0s' && reducedMotion.animation === '0s', 'reduced motion removes screen transition animation', JSON.stringify(reducedMotion));

  const manifest = await page.evaluate(async () => fetch('/manifest.json').then(response => response.json()));
  assert(manifest.display === 'standalone' && Array.isArray(manifest.icons) && manifest.icons.length > 0, 'PWA manifest exposes a standalone install shell');

  await page.evaluate(() => localStorage.removeItem('gn_whatsnew_acknowledged_release_v2'));
  await reloadPage(page);
  await page.locator('#gnWhatsNewOverlay.active').waitFor({ state: 'visible' });
  assert((await page.locator('.gn-wn-release.current').innerText()).includes(expectedVersion), 'localized What’s New matches candidate version');
  await page.locator('.gn-whatsnew-close').click();
  await reloadPage(page);
  await page.waitForTimeout(900);
  assert(await page.locator('#gnWhatsNewOverlay.active').count() === 0, 'What’s New acknowledgment prevents replay');

  const serviceWorkerReady = await page.evaluate(async () => { await navigator.serviceWorker.ready; return Boolean(navigator.serviceWorker.controller || await navigator.serviceWorker.getRegistration()); });
  assert(serviceWorkerReady, 'service worker controls or registers the app shell');
  await context.setOffline(true);
  await reloadPage(page);
  assert(await page.evaluate(() => Boolean(window.GN_VERSION)), 'offline shell loads the candidate version');
  await context.setOffline(false);
  await context.close();
}

async function authRecoveryFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.goto(`${baseURL}/?auth-recovery=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(release => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', 'dark');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
    location.reload();
  }, expectedRelease);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  await page.locator('.landing-btn.primary').first().click();
  await page.locator('#login.active').waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.locator('#gnAuthEmail').getAttribute('aria-label') === 'Email address', 'account recovery exposes a labeled email field');
  await page.locator('#gnAuthReset').click();
  const resetMessage = await page.locator('#loginMsg').innerText();
  assert(/ENTER YOUR ACCOUNT EMAIL FIRST/i.test(resetMessage) && await page.locator('#loginMsg').getAttribute('data-tone') === 'error', 'password reset fails closed without an account email', resetMessage);
  await page.locator('#gnAuthModeToggle').click();
  assert(/CREATE CLOUD ACCOUNT/i.test(await page.locator('#gnAuthSubmit').innerText()), 'account creation mode is reachable from recovery entry');
  await page.locator('#gnAuthModeToggle').click();
  assert(/SIGN IN TO CLOUD/i.test(await page.locator('#gnAuthSubmit').innerText()), 'account flow returns to sign in without losing context');
  await page.locator('#gnLocalBtn').click();
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
  assert(await page.locator('#pageDash.active').isVisible(), 'cloud recovery path preserves local-device fallback');
  await context.close();
}

async function main() {
  const started = Date.now();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(), args: ['--no-sandbox'] });
  try {
    await newUserFlow(browser);
    await onboardingFlow(browser);
    await returningUserAndPlatformFlow(browser);
    await authRecoveryFlow(browser);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ result: 'PASS', baseURL, release: expectedRelease, version: expectedVersion, elapsedMs: Date.now() - started, checks: results }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
