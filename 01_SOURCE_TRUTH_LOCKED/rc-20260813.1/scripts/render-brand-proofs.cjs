#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PROOF = path.join(ROOT, 'assets', 'brand', 'proof');
const CHROME = '/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

async function capture(page, source, output, width, height, background = null) {
  const svg = fs.readFileSync(path.join(PROOF, source), 'utf8');
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${background || 'transparent'}}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`, { waitUntil: 'load' });
  await page.screenshot({
    path: output,
    clip: { x: 0, y: 0, width, height },
    omitBackground: background === null,
    animations: 'disabled',
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await capture(page, 'core-proof-source.svg', path.join(PROOF, 'core-render.png'), 360, 300);
    await capture(page, 'wordmark-proof-source.svg', path.join(PROOF, 'wordmark-render.png'), 400, 70);

    const standard = [
      ['../icons/favicon-16.png', 16],
      ['../icons/favicon-32.png', 32],
      ['../icons/apple-touch-icon.png', 180],
      ['../icons/pwa-192.png', 192],
      ['../icons/pwa-512.png', 512],
    ];
    for (const [relative, size] of standard) {
      await capture(page, 'icon-standard-source.svg', path.join(PROOF, relative), size, size);
    }
    await capture(page, 'icon-maskable-source.svg', path.join(ROOT, 'assets', 'brand', 'icons', 'pwa-maskable-512.png'), 512, 512, '#050708');
    for (const size of [16, 24, 32, 48, 64, 192, 512]) {
      await capture(page, 'icon-standard-source.svg', path.join(PROOF, `icon-${size}.png`), size, size);
    }
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
