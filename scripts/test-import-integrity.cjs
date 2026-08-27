#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4189';
const checks = [];
const failures = [];

function check(condition, label, detail = '') {
  const row = { label, detail };
  if (condition) checks.push(row);
  else failures.push(row);
}

async function bootstrap(page) {
  await page.goto(`${baseURL}/?import-integrity=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', 'dark');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', window.GN_VERSION.release);
    localStorage.setItem('gn_session_v2', JSON.stringify({
      user: { id: 'local', email: 'qa@gridnode.local', user_metadata: { full_name: 'NODE_USER' } },
      createdAt: new Date().toISOString()
    }));
    location.reload();
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2200);
  const landing = page.locator('.landing-btn.primary').first();
  if (await landing.isVisible().catch(() => false)) await landing.click();
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
}

async function openMappedCsv(page, csv, name = 'mapped-integrity.csv') {
  await page.evaluate(() => window.openImportDialog());
  const input = page.locator('#gnMappedCsvInput');
  await input.waitFor({ state: 'attached', timeout: 5000 });
  await input.setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.locator('#gnMappingOverlay.active').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-map-preview]').click();
  return page.locator('#gnMappingSummary').textContent();
}

async function openBackup(page, backup, name = 'gridnode-backup.json') {
  await page.evaluate(() => {
    document.getElementById('gnMappingOverlay')?.remove();
    window.cancelCSVImport?.();
    window.openImportDialog();
  });
  const input = page.locator('#gnBackupInput');
  await input.waitFor({ state: 'attached', timeout: 5000 });
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  try {
    await bootstrap(page);

    await page.evaluate(() => {
      window.GN.S.set('shots', [{
        id: 'future-shot',
        date: new Date(Date.now() + 86400000).toISOString(),
        med: 'zepbound_tirzepatide',
        dose: 5,
        archived: false
      }]);
      window.GN.S.set('weights', []);
      window.GNModules.refreshAll();
    });
    await page.waitForTimeout(1100);
    const futureStreak = await page.locator('#streakText').textContent();
    check(/NO SHOT CADENCE|LOG YOUR FIRST SHOT/i.test(futureStreak || ''), 'future SHOTS stay out of cadence readouts', futureStreak || '');

    await page.evaluate(() => {
      window.GN.S.multiWrite([{ key: 'shots', value: [] }, { key: 'weights', value: [] }]);
      window.GNModules.refreshAll();
    });

    const csv = [
      'record type,date,medication,dose,weight,site,notes',
      'shot,2026-07-01,Zepbound,5,200,Right Abdomen,valid shot',
      'shot,2026-07-01,Zepbound,5,200,Right Abdomen,duplicate shot',
      'weight,2026-07-02,,,199,,valid weight',
      'weight,2026-07-02,,,199,,duplicate weight',
      'shot,2026-07-03,Unknown Compound,5,,,unknown medication',
      'shot,2026-07-04,Zepbound,0,,,zero dose',
      'shot,2026-07-05,Zepbound,-1,,,negative dose',
      'shot,2026-02-30,Zepbound,5,,,impossible date',
      'shot,2099-01-01,Zepbound,5,,,future date',
      'weight,2026-07-06,,,0,,zero weight',
      'other,2026-07-07,,,,,unknown record type'
    ].join('\n');

    const summary = await openMappedCsv(page, csv);
    check(/4 recognized/i.test(summary || ''), 'CSV preview recognizes only valid rows', summary || '');
    check(/7 invalid/i.test(summary || ''), 'CSV preview rejects unknown, non-positive, malformed, and future rows', summary || '');
    check(/2 duplicates/i.test(summary || ''), 'CSV preview detects duplicates inside the same file', summary || '');
    check(/2 new/i.test(summary || ''), 'CSV preview exposes only fresh rows for commit', summary || '');

    await page.evaluate(() => document.querySelector('[data-map-preview]')?.onclick?.());
    await page.waitForTimeout(250);
    const imported = await page.evaluate(() => ({
      shots: window.GN.S.get('shots', []),
      weights: window.GN.S.get('weights', [])
    }));
    check(imported.shots.length === 1, 'CSV commit stores one deduplicated SHOT', JSON.stringify(imported.shots));
    check(imported.shots[0]?.med === 'zepbound_tirzepatide' && imported.shots[0]?.dose === 5, 'CSV commit keeps canonical medication and positive dose', JSON.stringify(imported.shots[0]));
    check(imported.shots[0]?.wt === 200, 'mapped SHOT retains its optional weight', JSON.stringify(imported.shots[0]));
    const linked = imported.weights.find(item => item.shotId === imported.shots[0]?.id);
    check(Boolean(linked) && linked.weight === 200, 'mapped SHOT weight creates one linked RESULTS record', JSON.stringify(imported.weights));
    check(imported.weights.length === 2, 'CSV commit stores linked and standalone weights without duplication', JSON.stringify(imported.weights));

    await page.evaluate(() => {
      window.GN.S.multiWrite([
        { key: 'shots', value: [{ id: 'sentinel-shot', date: '2026-06-01T12:00:00.000Z', med: 'zepbound_tirzepatide', dose: 2.5, archived: false }] },
        { key: 'weights', value: [{ id: 'sentinel-weight', date: '2026-06-01T12:00:00.000Z', weight: 205 }] }
      ]);
    });
    const rollbackCsv = [
      'record type,date,medication,dose,weight',
      'shot,2026-07-10,Zepbound,5,198',
      'weight,2026-07-11,,,197'
    ].join('\n');
    await openMappedCsv(page, rollbackCsv, 'mapped-rollback.csv');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      let rejected = false;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (!rejected && String(key).endsWith('_weights')) {
          rejected = true;
          throw new DOMException('Injected storage rejection', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
      try { document.querySelector('[data-map-preview]')?.onclick?.(); }
      finally { Storage.prototype.setItem = original; }
    });
    await page.waitForTimeout(100);
    const rolledBack = await page.evaluate(() => ({
      shots: window.GN.S.get('shots', []),
      weights: window.GN.S.get('weights', []),
      summary: document.querySelector('#gnMappingSummary')?.textContent || ''
    }));
    check(rolledBack.shots.length === 1 && rolledBack.shots[0]?.id === 'sentinel-shot', 'failed CSV transaction restores SHOTS', JSON.stringify(rolledBack));
    check(rolledBack.weights.length === 1 && rolledBack.weights[0]?.id === 'sentinel-weight', 'failed CSV transaction preserves weights', JSON.stringify(rolledBack));
    check(/ROLLED BACK/i.test(rolledBack.summary), 'failed CSV transaction reports rollback', rolledBack.summary);

    const persistentFailure = await page.evaluate(() => {
      const beforeShots = [{ id: 'persistent-sentinel-shot', date: '2026-06-02T12:00:00.000Z', med: 'zepbound_tirzepatide', dose: 2.5, archived: false }];
      const beforeWeights = [{ id: 'persistent-sentinel-weight', date: '2026-06-02T12:00:00.000Z', weight: 204 }];
      window.GN.S.multiWrite([{ key: 'shots', value: beforeShots }, { key: 'weights', value: beforeWeights }]);
      const original = Storage.prototype.setItem;
      let firstTargetWritten = false;
      Storage.prototype.setItem = function persistentlyFailingSetItem(key, value) {
        const storageKey = String(key);
        if (storageKey.includes('__storage_tx_v1')) return original.call(this, key, value);
        if (!firstTargetWritten && storageKey.endsWith('_shots')) {
          firstTargetWritten = true;
          return original.call(this, key, value);
        }
        if (firstTargetWritten) throw new DOMException('Injected persistent storage rejection', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      let committed;
      let visibleDuringFailure;
      try {
        committed = window.GN.S.multiWrite([
          { key: 'shots', value: [{ id: 'should-not-commit', date: '2026-07-12T12:00:00.000Z', med: 'zepbound_tirzepatide', dose: 5, archived: false }] },
          { key: 'weights', value: [{ id: 'should-not-commit-weight', date: '2026-07-12T12:00:00.000Z', weight: 190 }] }
        ]);
        visibleDuringFailure = { shots: window.GN.S.get('shots', []), weights: window.GN.S.get('weights', []) };
      } finally {
        Storage.prototype.setItem = original;
      }
      const recovered = { shots: window.GN.S.get('shots', []), weights: window.GN.S.get('weights', []) };
      const journalPresent = localStorage.getItem('gn_local___storage_tx_v1') !== null;
      return { committed, visibleDuringFailure, recovered, journalPresent };
    });
    check(persistentFailure.committed === false, 'persistent storage failure rejects the health-data transaction', JSON.stringify(persistentFailure));
    check(persistentFailure.visibleDuringFailure?.shots?.[0]?.id === 'persistent-sentinel-shot' && persistentFailure.visibleDuringFailure?.weights?.[0]?.id === 'persistent-sentinel-weight', 'write-ahead journal prevents split health state while storage remains unavailable', JSON.stringify(persistentFailure));
    check(persistentFailure.recovered?.shots?.[0]?.id === 'persistent-sentinel-shot' && persistentFailure.recovered?.weights?.[0]?.id === 'persistent-sentinel-weight' && persistentFailure.journalPresent === false, 'write-ahead journal recovers and clears when storage returns', JSON.stringify(persistentFailure));

    const invalidBackup = {
      app: 'GRID//NODE',
      version: '0.1.0',
      shots: [
        { id: 'bad-med', date: '2026-07-20T12:00:00.000Z', med: 'Unknown Compound', dose: 5, archived: false },
        { id: 'bad-dose', date: '2026-07-21T12:00:00.000Z', med: 'Zepbound', dose: 0, archived: false },
        { id: 'bad-date', date: '2026-02-30', med: 'Zepbound', dose: 5, archived: false }
      ],
      weights: [{ id: 'bad-weight', date: '2026-07-20T12:00:00.000Z', weight: -20 }]
    };
    await openBackup(page, invalidBackup, 'invalid-backup.json');
    await page.evaluate(() => window.confirmBackupImport());
    await page.waitForTimeout(100);
    const invalidRestore = await page.evaluate(() => ({
      shots: window.GN.S.get('shots', []),
      weights: window.GN.S.get('weights', []),
      pending: Boolean(window.GNModules.moduleState.pendingBackup)
    }));
    check(invalidRestore.shots.length === 1 && invalidRestore.shots[0]?.id === 'persistent-sentinel-shot', 'invalid backup cannot replace or append SHOTS', JSON.stringify(invalidRestore));
    check(invalidRestore.weights.length === 1 && invalidRestore.weights[0]?.id === 'persistent-sentinel-weight', 'invalid backup cannot replace or append weights', JSON.stringify(invalidRestore));
    check(invalidRestore.pending === false, 'invalid backup is rejected before commit', JSON.stringify(invalidRestore));

    await page.evaluate(() => window.GN.S.multiWrite([{ key: 'shots', value: [] }, { key: 'weights', value: [] }]));
    const validBackup = {
      app: 'GRID//NODE',
      version: '0.14.0',
      shots: [{ id: 'backup-shot', date: '2026-07-22T12:00:00.000Z', med: 'Zepbound', dose: 5, wt: 198, se: ['Nausea'], archived: false }],
      weights: [{ id: 'backup-weight', shotId: 'backup-shot', date: '2026-07-22T12:00:00.000Z', weight: 198 }],
      profile: { heightIn: 69 }
    };
    await openBackup(page, validBackup, 'valid-backup.json');
    await page.locator('#csvImportOverlay.active').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => window.confirmBackupImport());
    await page.waitForTimeout(120);
    const restored = await page.evaluate(() => ({ shots: window.GN.S.get('shots', []), weights: window.GN.S.get('weights', []), profile: window.GN.S.get('profile', {}) }));
    check(restored.shots.length === 1 && restored.shots[0]?.med === 'zepbound_tirzepatide' && restored.shots[0]?.dose === 5, 'valid backup restores canonical medication and positive dose', JSON.stringify(restored));
    check(restored.weights.length === 1 && restored.weights[0]?.shotId === 'backup-shot' && restored.weights[0]?.weight === 198, 'valid backup restores linked RESULTS weight', JSON.stringify(restored));
    check(restored.profile?.heightIn === 69, 'valid backup restores profile context', JSON.stringify(restored.profile));

    await page.evaluate(() => window.GN.S.multiWrite([
      { key: 'shots', value: [{ id: 'backup-sentinel-shot', date: '2026-06-10T12:00:00.000Z', med: 'zepbound_tirzepatide', dose: 2.5, archived: false }] },
      { key: 'weights', value: [{ id: 'backup-sentinel-weight', date: '2026-06-10T12:00:00.000Z', weight: 204 }] }
    ]));
    await openBackup(page, validBackup, 'rollback-backup.json');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      let rejected = false;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (!rejected && String(key).endsWith('_weights')) {
          rejected = true;
          throw new DOMException('Injected backup storage rejection', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
      try { window.confirmBackupImport(); }
      finally { Storage.prototype.setItem = original; }
    });
    await page.waitForTimeout(100);
    const backupRollback = await page.evaluate(() => ({ shots: window.GN.S.get('shots', []), weights: window.GN.S.get('weights', []) }));
    check(backupRollback.shots.length === 1 && backupRollback.shots[0]?.id === 'backup-sentinel-shot', 'failed backup transaction restores SHOTS', JSON.stringify(backupRollback));
    check(backupRollback.weights.length === 1 && backupRollback.weights[0]?.id === 'backup-sentinel-weight', 'failed backup transaction preserves weights', JSON.stringify(backupRollback));
    check(runtimeErrors.length === 0, 'CSV and backup journeys emit no runtime errors', JSON.stringify(runtimeErrors));
  } catch (error) {
    failures.push({ label: 'test harness completed', detail: error.stack || error.message });
  } finally {
    await context.close();
    await browser.close();
  }

  const result = { result: failures.length ? 'FAIL' : 'PASS', baseURL, checks, failures };
  console.log(JSON.stringify(result, null, 2));
  process.exit(failures.length ? 1 : 0);
})();
