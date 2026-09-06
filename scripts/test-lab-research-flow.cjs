#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const expectedRelease = process.argv[3] || '20260906.2';
const browserPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();

function assert(condition, message, detail = '') {
  if (!condition) throw new Error(`FAIL ${message}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS ${message}${detail ? ` — ${detail}` : ''}`);
}

async function enterLocalApp(page, { theme = 'dark', lang = 'en' } = {}) {
  await page.goto(`${baseUrl}/?lab-research-test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ selectedTheme, selectedLang, release }) => {
    localStorage.clear();
    localStorage.setItem('gn_theme_v1', selectedTheme);
    localStorage.setItem('gn.lang', selectedLang);
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, { selectedTheme: theme, selectedLang: lang, release: expectedRelease });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.landing-local-link').click();
  await page.locator('#app.active').waitFor({ state: 'visible' });
}

async function openResearch(page) {
  await page.evaluate(() => window.showPage('Lab'));
  await page.locator('[data-lab-focus="research"]').click();
  await page.locator('#gnLabToolOverlay.active').waitFor({ state: 'visible' });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  try {
    await enterLocalApp(page);
    await openResearch(page);

    const preset = page.locator('[data-research-name]:not([data-research-name=""])').first();
    const presetName = (await preset.getAttribute('data-research-name')) || '';
    await preset.click();
    assert((await page.locator('#gnResearchName').inputValue()) === presetName, 'library selection populates the research record name');
    assert(await page.locator('#gnResearchName').getAttribute('readonly') !== null, 'library selection locks the preset name');

    const dateWrapper = page.locator('#gnResearchDate').locator('xpath=..');
    const dateTrigger = dateWrapper.locator('[data-gn-date-trigger]');
    await dateTrigger.click();
    await dateWrapper.locator('[data-gn-date-today]').click();
    const dateState = await dateWrapper.evaluate(node => ({
      open: node.classList.contains('open'),
      ariaExpanded: node.querySelector('[data-gn-date-trigger]')?.getAttribute('aria-expanded'),
      value: node.querySelector('#gnResearchDate')?.value
    }));
    assert(!dateState.open, 'USE TODAY closes the date picker before Save', JSON.stringify(dateState));
    assert(dateState.ariaExpanded === 'false', 'closed date picker exposes aria-expanded=false', JSON.stringify(dateState));

    await page.locator('#gnResearchSave').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gn_local_researchRecords') || '[]'));
    assert(saved.length === 1 && saved[0].name === presetName, 'Research Save writes one local record', JSON.stringify(saved));
    assert((await page.locator('#gnResearchList').innerText()).includes(presetName), 'saved research record renders immediately');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#app.active') || document.querySelector('#landing.active'));
    if (await page.locator('#landing.active').isVisible()) await page.locator('.landing-local-link').click();
    await page.locator('#app.active').waitFor({ state: 'visible' });
    await openResearch(page);
    assert((await page.locator('#gnResearchList').innerText()).includes(presetName), 'saved research record survives reload');
    assert(runtimeErrors.length === 0, 'Research flow emits no runtime errors', JSON.stringify(runtimeErrors));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
