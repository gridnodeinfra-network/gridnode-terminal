#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const artifactDir = process.env.GRIDNODE_SCANNER_FEEDBACK_ARTIFACT_DIR || '';
const artifactPrefix = process.env.GRIDNODE_SCANNER_FEEDBACK_PREFIX || 'current';
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL ${message}`); };

async function boot(page, reducedMotion = false) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference', colorScheme: 'dark' });
  await page.goto(`${baseURL}/?scanner-feedback=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const servedRelease = await page.evaluate(() => window.GN_VERSION?.release || '20260812.9');
  await page.evaluate(release => {
    localStorage.clear();
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_theme_v1', 'dark');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
    localStorage.setItem('gn_session_v2', JSON.stringify({ user: { id: 'visual', email: 'visual@gridnode.local' } }));
    window.showPage('Log');
  }, servedRelease);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const whatsNew = page.locator('#gnWhatsNewOverlay.active');
  if (await whatsNew.count()) {
    await whatsNew.locator('.gn-whatsnew-close').click({ timeout: 5000 }).catch(() => {});
    await whatsNew.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(() => window.showPage('Log'));
  await page.locator('#pageLog.active').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.scanner-mode-btn[data-mode="core"]').click();
}

async function zonePoint(page) {
  return page.locator('.biotech-stage[data-view="core"] .zone-hit').first().evaluate(node => {
    const svg = node.ownerSVGElement.getBoundingClientRect();
    const [x1, y1, x2, y2] = node.dataset.zoneBounds.split(',').map(Number);
    return { x: svg.left + ((x1 + x2) / 2000) * svg.width, y: svg.top + ((y1 + y2) / 2000) * svg.height };
  });
}

async function dispatchPointer(page, type, point, pointerId = 73) {
  await page.evaluate(({ eventType, x, y, id }) => {
    const svg = document.querySelector('.biotech-stage[data-view="core"] .biotech-zones');
    svg.dispatchEvent(new PointerEvent(eventType, {
      bubbles: true,
      pointerId: id,
      clientX: x,
      clientY: y,
      pointerType: 'touch',
      isPrimary: true,
      buttons: eventType === 'pointerup' ? 0 : 1
    }));
  }, { eventType: type, x: point.x, y: point.y, id: pointerId });
}

async function lifecycle(page) {
  const point = await zonePoint(page);
  const zone = page.locator('.biotech-stage[data-view="core"] .zone-hit').first();
  await dispatchPointer(page, 'pointerdown', point);
  assert(await zone.evaluate(node => node.classList.contains('pressed')), 'pointer-down exposes pressed before release');
  await dispatchPointer(page, 'pointerup', point);
  assert(!(await zone.evaluate(node => node.classList.contains('pressed'))), 'release clears pressed');
  assert(await zone.evaluate(node => node.classList.contains('zone-acquiring')), 'release starts acquisition');
  assert(await zone.evaluate(node => node.classList.contains('selected')), 'release marks selected');
  assert(await page.locator('.scanner-selected-panel.gn-zone-confirmed').count() === 1, 'release shows confirmation panel');
  await page.waitForTimeout(950);
  assert(!(await zone.evaluate(node => node.classList.contains('zone-acquiring'))), 'acquisition clears after transient window');
  assert(await zone.evaluate(node => node.classList.contains('selected')), 'selected persists after transient window');
  assert(await page.locator('.scanner-selected-panel.gn-zone-confirmed').count() === 0, 'confirmation clears after transient window');
  assert(await page.locator('.gn-location-lock.is-on').count() === 1, 'location lock persists');
}

async function captureComparison(page) {
  if (!artifactDir) return;
  mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, `${artifactPrefix}-dark-selected-390x844.png`) });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(artifactDir, `${artifactPrefix}-light-selected-390x844.png`) });
}

async function inspectReducedMotionDuringCommit(page) {
  const point = await zonePoint(page);
  const zone = page.locator('.biotech-stage[data-view="core"] .zone-hit').first();
  await dispatchPointer(page, 'pointerdown', point, 74);
  await dispatchPointer(page, 'pointerup', point, 74);
  const animations = await page.evaluate(() => ({
    acquisition: getComputedStyle(document.querySelector('.zone-hit.zone-acquiring + .zone-visible')).animationName,
    confirmation: getComputedStyle(document.querySelector('.scanner-selected-panel.gn-zone-confirmed')).animationName
  }));
  assert(animations.acquisition === 'none' && animations.confirmation === 'none', 'reduced motion disables acquisition and confirmation animation');
  await page.waitForTimeout(950);
  assert(await zone.evaluate(node => node.classList.contains('selected')), 'reduced motion preserves selected state');
  assert(await page.locator('.gn-location-lock.is-on').count() === 1, 'reduced motion preserves rail visibility');
}

async function reducedMotion(page) {
  await boot(page, true);
  await inspectReducedMotionDuringCommit(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await boot(page);
    await lifecycle(page);
    await captureComparison(page);
    await context.close();
    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await reducedMotion(await reduced.newPage());
    await reduced.close();
  } finally { await browser.close(); }
  console.log(JSON.stringify({ result: 'PASS', viewport: '390x844', checks: ['lifecycle', 'reduced-motion'] }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
