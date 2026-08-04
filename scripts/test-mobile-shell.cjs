#!/usr/bin/env node
'use strict';
const { chromium } = require('/home/thinkpadwinbash/.npm/_npx/705bc6b22212b352/node_modules/playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const expectedRelease = '20260804.1';
const expectedVersion = '0.12.0';
const checks = [];
function ok(condition, label, detail = '') { if (!condition) throw new Error(`FAIL ${label}${detail ? ': ' + detail : ''}`); checks.push(label); }

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseURL + '/?mobile-shell=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(release => {
    localStorage.setItem('gn_theme_v1', 'light');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, expectedRelease);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.landing-local-link').click();
  await page.locator('#app.active').waitFor({ state: 'visible' });
  ok(await page.evaluate(v => window.GN_VERSION.release === v.release && window.GN_VERSION.semver === v.version, { release: expectedRelease, version: expectedVersion }), 'canonical served version');
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'light' && document.documentElement.lang === 'en'), 'theme and language persist');
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
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'light'), 'theme survives reload');
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
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  ok(await page.locator('body').count() === 1 && await page.evaluate(() => Boolean(window.GN_VERSION)), 'offline shell reload');
  await context.setOffline(false);

  await page.evaluate(() => localStorage.removeItem('gn_whatsnew_acknowledged_release_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#gnWhatsNewOverlay.active').waitFor({ state: 'visible', timeout: 5000 });
  ok(await page.locator('.gn-wn-release.current').count() === 1, 'new release opens exactly once');
  await page.locator('.gn-whatsnew-close').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(await page.locator('#gnWhatsNewOverlay').count() === 0, 'acknowledged release does not reopen');
  ok(await page.evaluate(release => localStorage.getItem('gn_whatsnew_acknowledged_release_v2') === release, expectedRelease), 'update acknowledgment persists');
  await page.evaluate(() => window.GN_WHATS_NEW.history());
  ok(await page.locator('.gn-wn-release').count() >= 3, 'full update history remains accessible');
  ok(await page.locator('.gn-wn-release.current .gn-whatsnew-version').textContent() === 'GRID//NODE v0.12.0', 'history latest version matches app');

  ok(errors.length === 0, 'no page runtime errors', errors.join(' | '));
  console.log(JSON.stringify({ result: 'PASS', checks, release: expectedRelease, version: expectedVersion }, null, 2));
  await browser.close();
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
