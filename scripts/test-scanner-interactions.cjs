#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 }
];
const modes = ['core', 'lower', 'upper'];
const expectedZones = {
  core: 4,
  lower: 4,
  upper: 4
};
const results = [];

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
  results.push({ label, detail });
}

async function reloadPage(page) {
  await page.evaluate(() => location.reload());
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  const landing = page.locator('.landing-btn.primary').first();
  if (await landing.isVisible().catch(() => false)) await landing.click().catch(() => {});
}

async function bootstrap(page) {
  await page.goto(`${baseURL}/?scanner-tests=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const servedRelease = await page.evaluate(() => window.GN_VERSION?.release || '20260812.9');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', 'light');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_session_v2', JSON.stringify({
      user: { id: 'local', email: 'scanner-tests@gridnode.local', user_metadata: { full_name: 'SCANNER_TEST' } },
      createdAt: new Date().toISOString()
    }));
  });
  await page.evaluate(release => localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release), servedRelease);
  await reloadPage(page);
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
  const whatsNew = page.locator('#gnWhatsNewOverlay.active');
  if (await whatsNew.count()) {
    await whatsNew.locator('.gn-whatsnew-close').click({ timeout: 5000 });
    await whatsNew.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  await page.evaluate(() => window.showPage('Log'));
  await page.locator('#pageLog.active').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(250);
  assert(await page.locator('.gn-onb-overlay.active').count() === 0, 'scanner bootstrap skips onboarding');
  assert(await page.locator('#gnWhatsNewOverlay.active').count() === 0, 'scanner bootstrap skips What\'s New');
}

async function installCommitCounter(page) {
  await page.evaluate(() => {
    window.__scannerCommitWrites = 0;
    const originalSetItem = Storage.prototype.setItem;
    if (Storage.prototype.__scannerCounterInstalled) return;
    Storage.prototype.setItem = function scannerCommitCounter(key, value) {
      if (String(key).endsWith('_selectedLocation') || key === 'selectedLocation') window.__scannerCommitWrites += 1;
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.__scannerCounterInstalled = true;
  });
}

async function commitCount(page) {
  return page.evaluate(() => window.__scannerCommitWrites || 0);
}

async function activeStage(page) {
  return page.locator('#shotsRegionScanner .biotech-stage:not([hidden])');
}

async function svgPoint(page, mode, bounds) {
  return page.evaluate(({ view, raw }) => {
    const stage = document.querySelector(`#shotsRegionScanner .biotech-stage[data-view="${view}"]`);
    const svg = stage?.querySelector('.biotech-zones');
    const rect = svg?.getBoundingClientRect();
    const [x1, y1, x2, y2] = raw.split(',').map(Number);
    if (!rect) return null;
    return { x: rect.left + ((x1 + x2) / 2 / 1000) * rect.width, y: rect.top + ((y1 + y2) / 2 / 1000) * rect.height };
  }, { view: mode, raw: bounds });
}

async function tapZone(page, mode, zone) {
  const point = await svgPoint(page, mode, await zone.getAttribute('data-zone-bounds'));
  assert(point, `calibrated center exists for ${mode}/${await zone.getAttribute('data-site')}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(80);
}

async function testModeCenters(page, mode) {
  await page.locator(`.scanner-mode-btn[data-mode="${mode}"]`).click();
  const stage = await activeStage(page);
  await stage.waitFor({ state: 'visible' });
  const zones = stage.locator('.zone-hit');
  assert(await zones.count() === expectedZones[mode], `${mode} exposes four calibrated hit zones`);
  for (let index = 0; index < await zones.count(); index += 1) {
    await stage.waitFor({ state: 'visible' });
    const zone = zones.nth(index);
    const site = await zone.getAttribute('data-site');
    const before = await commitCount(page);
    await tapZone(page, mode, zone);
    const after = await commitCount(page);
    assert(after - before === 1, `${mode}/${site} commits exactly once`, `delta=${after - before}`);
    assert(await page.evaluate(expected => Object.keys(localStorage).some(key => {
      if (!key.endsWith('_selectedLocation')) return false;
      try { return JSON.parse(localStorage.getItem(key) || 'null') === expected; } catch (_) { return false; }
    }), site), `${mode}/${site} updates selected module state`);
  }
}

async function testInvalidAreas(page) {
  await page.locator('.scanner-mode-btn[data-mode="core"]').click();
  const before = await commitCount(page);
  const selected = await page.locator('#scannerSelectedDisplay').innerText();
  for (const point of [
    { x: 0.50, y: 0.58, label: 'navel' },
    { x: 0.01, y: 0.01, label: 'corner' },
    { x: 0.50, y: 0.61, label: 'empty gap' }
  ]) {
    const svg = await page.locator('.biotech-stage[data-view="core"] .biotech-zones').boundingBox();
    assert(svg, 'core SVG is measurable for invalid-area probes');
    await page.mouse.click(svg.x + svg.width * point.x, svg.y + svg.height * point.y);
    await page.waitForTimeout(60);
    assert(await commitCount(page) === before, `${point.label} does not commit`);
  }
  assert(await page.locator('#scannerSelectedDisplay').innerText() === selected, 'invalid areas preserve the prior selection');
}

async function dispatchPointer(page, mode, type, x, y, pointerId = 91) {
  await page.evaluate(({ view, eventType, clientX, clientY, id }) => {
    const svg = document.querySelector(`#shotsRegionScanner .biotech-stage[data-view="${view}"] .biotech-zones`);
    svg.dispatchEvent(new PointerEvent(eventType, { bubbles: true, pointerId: id, clientX, clientY, pointerType: 'touch', isPrimary: true, buttons: eventType === 'pointerup' ? 0 : 1 }));
  }, { view: mode, eventType: type, x, y, id: pointerId, clientX: x, clientY: y });
}

async function testDragAndKeyboard(page) {
  await page.locator('.scanner-mode-btn[data-mode="core"]').click();
  const zone = page.locator('.biotech-stage[data-view="core"] .zone-hit').first();
  const point = await svgPoint(page, 'core', await zone.getAttribute('data-zone-bounds'));
  const svg = await page.locator('.biotech-stage[data-view="core"] .biotech-zones').boundingBox();
  const endpointBefore = await commitCount(page);
  await dispatchPointer(page, 'core', 'pointerdown', point.x, point.y, 90);
  await dispatchPointer(page, 'core', 'pointerup', svg.x + 3, svg.y + 3, 90);
  assert(await commitCount(page) === endpointBefore, 'pointer-up outside the original zone does not commit');
  const before = await commitCount(page);
  await dispatchPointer(page, 'core', 'pointerdown', point.x, point.y);
  await dispatchPointer(page, 'core', 'pointermove', point.x, point.y + 48);
  await dispatchPointer(page, 'core', 'pointerup', point.x, point.y + 48);
  assert(await commitCount(page) === before, '48px vertical drag cancels without committing');
  assert(await zone.evaluate(node => !node.classList.contains('pressed')), 'vertical drag clears pressed state');

  await zone.focus();
  const keyboardBefore = await commitCount(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  assert(await commitCount(page) === keyboardBefore + 1, 'Enter commits exactly once');
  await zone.focus();
  const spaceBefore = await commitCount(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  assert(await commitCount(page) === spaceBefore + 1, 'Space commits exactly once');
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US', serviceWorkers: 'allow' });
      const page = await context.newPage();
      await bootstrap(page);
      await installCommitCounter(page);
      for (const mode of modes) await testModeCenters(page, mode);
      await testInvalidAreas(page);
      await testDragAndKeyboard(page);
      results.push({ label: `viewport ${viewport.width}x${viewport.height}`, detail: 'scanner interaction matrix complete' });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ result: 'PASS', baseURL, viewports, checks: results }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
