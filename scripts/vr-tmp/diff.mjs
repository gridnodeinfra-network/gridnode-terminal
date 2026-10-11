#!/usr/bin/env node
// Pixel-diff two capture dirs; report per-file changed-pixel counts + bbox.
import { chromium } from 'playwright';
import fs from 'fs';

const [DIR_A, DIR_B, OUT] = process.argv.slice(2);
const THRESHOLD = 32;

const CHROME = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const files = fs.readdirSync(DIR_A).filter(f => f.endsWith('.png')).sort();
const report = [];
for (const f of files) {
  const a = fs.readFileSync(`${DIR_A}/${f}`).toString('base64');
  const b = fs.readFileSync(`${DIR_B}/${f}`).toString('base64');
  const r = await page.evaluate(async ({ a, b, THRESHOLD }) => {
    const load = src => new Promise((res, rej) => {
      const img = new Image(); img.onload = () => res(img); img.onerror = rej;
      img.src = 'data:image/png;base64,' + src;
    });
    const iA = await load(a), iB = await load(b);
    const w = iA.width, h = iA.height;
    if (iB.width !== w || iB.height !== h) return { error: 'dim mismatch' };
    const c = document.getElementById('c'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(iA, 0, 0); const dA = x.getImageData(0, 0, w, h).data;
    x.drawImage(iB, 0, 0); const dB = x.getImageData(0, 0, w, h).data;
    let n = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (Math.abs(dA[o]-dB[o]) > THRESHOLD || Math.abs(dA[o+1]-dB[o+1]) > THRESHOLD || Math.abs(dA[o+2]-dB[o+2]) > THRESHOLD) {
        n++; const px = i % w, py = (i / w) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    return { changed: n, total: w * h, pct: +(100 * n / (w*h)).toFixed(3), bbox: n ? [minX, minY, maxX, maxY] : null };
  }, { a, b, THRESHOLD });
  report.push({ file: f, ...r });
  console.log(f, JSON.stringify(r));
}
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
