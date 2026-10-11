#!/usr/bin/env node
'use strict';
/* IMPLEMENTER C verification: seed test data, screenshot fixed charts.
 * Usage: node /tmp/verify-charts.mjs [after|before]
 * Screenshots land in /tmp/chart-verify/<tag>/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = process.argv[2] || 'after';
const OUT = `/tmp/chart-verify/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });

const weights = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(2026, 8, 1 + i * 3); // Sep 1 + 3d steps
  weights.push({
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    weight: +(205 - i * 1.05).toFixed(1)
  });
}
const shots = [
  { date: '2026-09-06', dose: 2.5, med: 'BPC-157' },
  { date: '2026-09-13', dose: 2.5, med: 'BPC-157' },
  { date: '2026-09-20', dose: 2.5, med: 'BPC-157' },
  { date: '2026-09-27', dose: 5.0, med: 'BPC-157' },  // dose change -> cyan marker
  { date: '2026-10-04', dose: 5.0, med: 'BPC-157' },
  { date: '2026-10-08', dose: 5.0, med: 'BPC-157' },  // 3d ago -> PEAK WINDOW on ring
].map((s, i) => ({ id: `shot_${i}`, archived: false, site: 'abdomen', ...s }));
const profile = { goalWt: 180, startWt: 205 };
const session = { type: 'local', user: { id: 'local', email: '', user_metadata: { full_name: 'NODE_USER' } }, createdAt: new Date().toISOString() };

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'
  });
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.addInitScript(({ weights, shots, profile, session }) => {
    localStorage.setItem('gn_session_v2', JSON.stringify(session));
    localStorage.setItem('gn_local_weights', JSON.stringify(weights));
    localStorage.setItem('gn_local_shots', JSON.stringify(shots));
    localStorage.setItem('gn_local_profile', JSON.stringify(profile));
  }, { weights, shots, profile, session });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // --- Weight chart (Results) ---
  await page.evaluate(() => { showPage('Results', document.getElementById('navRes')); });
  await page.waitForTimeout(1500);
  const wtCard = page.locator('#wtChart').locator('xpath=ancestor::section[1]');
  await wtCard.screenshot({ path: path.join(OUT, 'weight-chart.png') });
  const legendHtml = await page.locator('#wtChartLegend').innerHTML();
  fs.writeFileSync(path.join(OUT, 'legend.html'), legendHtml);
  // sample canvas pixels: goal line area + ribbon center area
  const px = await page.evaluate(() => {
    const c = document.getElementById('wtChart');
    const r = c.getBoundingClientRect();
    const t = document.createElement('canvas');
    t.width = r.width; t.height = r.height;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0, r.width, r.height);
    const d = x.getImageData(0, 0, r.width, r.height).data;
    // scan for violet-ish (goal) and amber-ish (ribbon estimate) pixels
    let violet = 0, amber = 0, cyanDose = 0;
    for (let i = 0; i < d.length; i += 16) {
      const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
      if (A < 40) continue;
      if (R > 120 && R < 200 && G > 100 && G < 170 && B > 200) violet++;
      if (R > 200 && G > 150 && G < 220 && B < 150) amber++;
      if (R < 100 && G > 150 && B > 200) cyanDose++;
    }
    return { violet, amber, cyanDose, w: r.width, h: r.height };
  });
  fs.writeFileSync(path.join(OUT, 'pixels.json'), JSON.stringify(px, null, 2));

  // --- Dose Orbit phase ring (Dashboard) ---
  await page.evaluate(() => { showPage('Dash', document.getElementById('navDash')); });
  await page.waitForTimeout(1500);
  const arcStroke = await page.evaluate(() => document.getElementById('phaseArc')?.style?.stroke || 'n/a');
  fs.writeFileSync(path.join(OUT, 'ring-stroke.txt'), arcStroke);
  const ringWrap = page.locator('.phase-ring-svg-wrap').first();
  if (await ringWrap.count()) await ringWrap.screenshot({ path: path.join(OUT, 'phase-ring.png') });

  console.log(JSON.stringify({ tag: TAG, pixels: px, arcStroke, pageErrors: errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
