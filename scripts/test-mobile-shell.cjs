#!/usr/bin/env node
'use strict';
const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const expectedRelease = process.argv[3] || '20260805.6';
const expectedVersion = process.argv[4] || '0.15.4';

// Mobile QA matrix per AGENTS.md: 360x800, 390x844, 412x915, 430x932,
// swept across both themes (dark = NIGHT GRID, light = DAY OPS).
const MATRIX = [];
for (const vp of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
]) {
  MATRIX.push({ ...vp, theme: 'dark' }, { ...vp, theme: 'light' });
}

const cells = [];

async function runCell(browser, cell, release, version) {
  const { width, height, theme } = cell;
  const checks = [];
  function ok(condition, label, detail = '') {
    if (!condition) throw new Error(`FAIL ${label}${detail ? ': ' + detail : ''}`);
    checks.push(label);
  }

  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  let offlineWindow = false;
  const benignUrl = u => u.includes('email-decode.min.js'); // Cloudflare edge-injected; 404/504 on local servers
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    // "Failed to load resource" is a network-error duplicate; real
    // resource failures are tracked via page.on('response') below.
    if (msg.text().includes('Failed to load resource')) return;
    errors.push(`console.error: ${msg.text()}`);
  });
  page.on('response', r => {
    if (offlineWindow) return; // intentional offline reload
    if (r.status() >= 400 && !benignUrl(r.url())) errors.push(`http ${r.status()}: ${r.url().replace(baseURL, '')}`);
  });

  await page.goto(baseURL + '/?mobile-shell=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(([theme, release]) => {
    localStorage.setItem('gn_theme_v1', theme);
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, [theme, release]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.landing-local-link').click();
  await page.locator('#app.active').waitFor({ state: 'visible' });
  ok(await page.evaluate(v => window.GN_VERSION.release === v.release && window.GN_VERSION.semver === v.version, { release, version }), 'canonical served version');
  // dark = NIGHT GRID = the default (no data-theme attribute); light = DAY OPS.
  const themeOk = await page.evaluate(t => {
    const attr = document.documentElement.getAttribute('data-theme');
    return t === 'dark' ? (attr === null || attr === 'dark') : attr === t;
  }, theme);
  ok(themeOk && await page.evaluate(() => document.documentElement.lang === 'en'), 'theme and language persist');
  ok(await page.evaluate(() => Math.abs(document.getElementById('app').getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gn-viewport-height'))) < 2), 'dynamic viewport shell');

  await page.evaluate(() => { window.showPage('Log'); window.openLogModal(); });
  await page.locator('#logOv.active').waitFor({ state: 'visible' });
  const navigationInfo = await page.evaluate(() => ({ stored: sessionStorage.getItem('gn_active_page_session_v1'), active: document.querySelector('.page.active')?.id, wrapped: /const before = currentPageName/.test(String(window.showPage)), native: Boolean(window.GN_NATIVE), state: history.state }));
  ok(navigationInfo.stored === 'Log', 'active destination persisted before modal', JSON.stringify(navigationInfo));
  await page.locator('#sDose').fill('5');
  await page.locator('#sNotes').fill('draft survives mobile lifecycle');
  const select = page.locator('#cpShotMed');
  if (await select.count() && await select.evaluate(node => node.tagName === 'SELECT')) await select.selectOption('Zepbound');
  await page.locator('#logOv').dispatchEvent('input');

  const medTrigger = page.locator('#cpShotMed .cp-select-trigger');
  await medTrigger.click();
  ok(await page.locator('#cpShotMedDrop.open').count() === 1, 'popover opens in place');
  await page.goBack();
  ok(await page.locator('#logOv.active').count() === 1 && await page.locator('#cpShotMedDrop.open').count() === 0, 'Back dismisses popover first');

  await page.goBack();
  ok(await page.locator('#logOv.active').count() === 0 && await page.locator('#app.active').count() === 1, 'Back closes sheet before leaving app');
  await page.evaluate(() => window.openLogModal());
  await page.waitForTimeout(80);
  ok(await page.locator('#sDose').inputValue() === '5' && await page.locator('#sNotes').inputValue() === 'draft survives mobile lifecycle', 'SHOT draft survives Back');

  const background = await context.newPage();
  await background.goto('about:blank');
  await page.waitForTimeout(100);
  await background.close();
  await page.bringToFront();
  ok(await page.locator('#sDose').inputValue() === '5', 'SHOT draft survives background and resume');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#app.active').waitFor({ state: 'visible' });
  await page.waitForTimeout(450);
  const restoredDestination = await page.evaluate(() => ({ active: document.querySelector('.page.active')?.id, stored: sessionStorage.getItem('gn_active_page_session_v1'), state: history.state }));
  ok(restoredDestination.active === 'pageLog', 'active destination survives reload', JSON.stringify(restoredDestination));
  ok(await page.evaluate(t => {
    const attr = document.documentElement.getAttribute('data-theme');
    return t === 'dark' ? (attr === null || attr === 'dark') : attr === t;
  }, theme), 'theme survives reload');
  await page.evaluate(() => window.openLogModal());
  await page.waitForTimeout(80);
  ok(await page.locator('#sDose').inputValue() === '5' && await page.locator('#sNotes').inputValue() === 'draft survives mobile lifecycle', 'SHOT draft survives reload');
  await page.evaluate(() => document.getElementById('logOv').classList.remove('active'));
  await page.waitForTimeout(100);

  await page.evaluate(() => window.showPage('Results'));
  ok(await page.locator('#pageResults.active').count() === 1, 'internal destination navigation');
  await page.goBack();
  const backDestination = await page.evaluate(() => ({ active: document.querySelector('.page.active')?.id, state: history.state, length: history.length }));
  ok(await page.locator('#pageLog.active').count() === 1, 'Back returns to previous app destination', JSON.stringify(backDestination));

  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  ok(swReady, 'offline shell service worker ready');
  await page.reload({ waitUntil: 'domcontentloaded' });
  offlineWindow = true;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  ok(await page.locator('body').count() === 1 && await page.evaluate(() => Boolean(window.GN_VERSION)), 'offline shell reload');
  await context.setOffline(false);
  offlineWindow = false;

  await page.evaluate(() => localStorage.removeItem('gn_whatsnew_acknowledged_release_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#gnWhatsNewOverlay.active').waitFor({ state: 'visible', timeout: 5000 });
  ok(await page.locator('.gn-wn-release.current').count() === 1, 'new release opens exactly once');
  await page.locator('.gn-whatsnew-close').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(await page.locator('#gnWhatsNewOverlay').count() === 0, 'acknowledged release does not reopen');
  ok(await page.evaluate(release => localStorage.getItem('gn_whatsnew_acknowledged_release_v2') === release, release), 'update acknowledgment persists');
  await page.evaluate(() => window.GN_WHATS_NEW.history());
  ok(await page.locator('.gn-wn-release').count() >= 3, 'full update history remains accessible');
  ok((await page.locator('.gn-wn-release.current .gn-whatsnew-version').textContent()).includes('GRID//NODE v' + version), 'history latest version matches app');

  ok(errors.length === 0, 'no page runtime errors', errors.join(' | '));
  await context.close();
  return { checks, errors };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
  let failed = 0;
  for (const cell of MATRIX) {
    const label = `${cell.width}x${cell.height} ${cell.theme}`;
    try {
      const { checks } = await runCell(browser, cell, expectedRelease, expectedVersion);
      cells.push({ viewport: `${cell.width}x${cell.height}`, theme: cell.theme, result: 'PASS', checks: checks.length });
      console.log(`PASS ${label} (${checks.length} checks)`);
    } catch (error) {
      failed++;
      cells.push({ viewport: `${cell.width}x${cell.height}`, theme: cell.theme, result: 'FAIL', error: String(error.message || error).slice(0, 300) });
      console.error(`FAIL ${label}: ${error.message || error}`);
    }
  }
  await browser.close();
  console.log(JSON.stringify({ result: failed === 0 ? 'PASS' : 'FAIL', cells, release: expectedRelease, version: expectedVersion }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
