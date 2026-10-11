// Capture TODAY / HISTORY / VAULT x dark+light for the unified-components work.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.argv[2] || '/tmp/gn-vr/baseline';
const URL = process.env.GN_URL || 'http://127.0.0.1:4173';
fs.mkdirSync(OUT, { recursive: true });

const TABS = [
  ['today', '#navDash'],
  ['history', '#navLog'],
  ['vault', '#navVault'],
];
const THEMES = ['dark', 'light'];

const CHROME = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });

async function dismissOverlays(page) {
  for (const b of await page.$$('button')) {
    const t = (await b.textContent() || '').trim();
    if (!await b.isVisible()) continue;
    if (/^got it$/i.test(t)) { await b.click(); await page.waitForTimeout(500); }
    else if (/skip tour/i.test(t)) { await b.click(); await page.waitForTimeout(500); }
  }
}

for (const theme of THEMES) {
  for (const [name, nav] of TABS) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 1,
      serviceWorkers: 'block', reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    // landing -> local mode
    for (const b of await page.$$('button')) {
      const t = (await b.textContent() || '').trim();
      if (t === 'ENTER THE GRID' && await b.isVisible()) { await b.click(); break; }
    }
    await page.waitForTimeout(2000);
    try {
      await page.click('#gnMoreOptionsToggle', { timeout: 6000 });
      await page.waitForTimeout(600);
      await page.click('#gnDeviceBtn', { timeout: 6000 });
      await page.waitForTimeout(800);
      await page.check('#gnLegalModalTerms').catch(() => {});
      await page.check('#gnLegalModalResearch').catch(() => {});
      await page.click('#gnLegalModalAgree', { timeout: 6000 });
      await page.waitForTimeout(2000);
    } catch (e) { /* already signed in */ }
    await dismissOverlays(page);
    // theme + seeded data
    await page.evaluate((t) => {
      localStorage.setItem('gn_theme_v1', t);
      localStorage.setItem('gn.lang', 'en');
      localStorage.setItem('gn_onboarding_v1', 'complete');
      const now = Date.now(), D = 864e5, shots = [], weights = [];
      const doses = [5, 5, 7.5, 7.5, 10, 10, 10, 10];
      const sites = ['Lower Right', 'Lower Left', 'Right Thigh Upper', 'Left Thigh Upper', 'Middle Right', 'Middle Left', 'Upper Right', 'Upper Left'];
      for (let i = 0; i < 8; i++) shots.push({ id: 't' + i, date: new Date(now - (56 - i * 7) * D).toISOString(), dose: doses[i], med: 'tirzepatide', site: sites[i] });
      const wv = [220, 218, 216, 215, 213, 212, 210, 209, 208, 206];
      for (let i = 0; i < 10; i++) weights.push({ id: 'w' + i, date: new Date(now - (63 - i * 7) * D).toISOString(), weight: wv[i], unit: 'lb' });
      localStorage.setItem('gn_local_shots', JSON.stringify(shots));
      localStorage.setItem('gn_local_weights', JSON.stringify(weights));
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await dismissOverlays(page);
    await page.click(nav, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/${name}_${theme}.png` });
    console.log('captured', `${name}_${theme}.png`);
    await ctx.close();
  }
}
await browser.close();
console.log('done ->', OUT);
