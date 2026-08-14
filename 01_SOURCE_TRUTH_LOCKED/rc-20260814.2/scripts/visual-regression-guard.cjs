#!/usr/bin/env node
'use strict';
/**
 * Forge Visual Regression Guard v1
 *
 * Deterministic before/after capture + pixel diff for GRID//NODE, using the
 * existing Playwright stack (no new framework). Luna vision sits on top:
 * Forge vision-analyzes the diff overlays for the semantic verdict.
 *
 * Usage:
 *   node scripts/visual-regression-guard.cjs capture <baselineDir> [url] [release] [--scope <selector>]
 *   node scripts/visual-regression-guard.cjs compare <baselineDir> <outDir> [url] [release] [--scope <selector>]
 *
 * capture  — snapshots every viewport × theme into <baselineDir> (+ manifest
 *            with sha256 + git HEAD, so the checkpoint is identifiable).
 * compare  — re-snapshots the same matrix, diffs against the baseline, and
 *            classifies changed pixels as IN-SCOPE (the requested visual
 *            delta, given via --scope <selector> measured in the AFTER page)
 *            or OUT-OF-SCOPE (regression). Writes diff overlays + report.
 *
 * Exit codes: 0 = no out-of-scope diffs (identical or in-scope-only)
 *             1 = out-of-scope diffs found (regressions)
 *             2 = infrastructure error (missing baseline, dim mismatch, ...)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 },
];
const THEMES = ['dark', 'light'];
const CHROME = '/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
// Per-channel RGB tolerance (0-255). 32 absorbs anti-aliasing/font noise
// without swallowing real color changes.
const DIFF_THRESHOLD = 32;

const cellLabel = (vp, theme) => `${vp.width}x${vp.height}_${theme}`;
const cellFile = (vp, theme) => `${cellLabel(vp, theme)}.png`;

function parseArgs(argv) {
  const mode = argv[2];
  const baselineDir = argv[3];
  const out = { mode, baselineDir, outDir: null, url: 'http://127.0.0.1:4173', release: null, scope: null };
  const rest = argv.slice(4);
  let i = 0;
  // compare's second positional is outDir
  if (mode === 'compare' && rest[0] && !rest[0].startsWith('--')) {
    out.outDir = rest[0];
    i = 1;
  }
  while (i < rest.length) {
    const a = rest[i];
    if (a === '--scope') { out.scope = rest[i + 1]; i += 2; }
    else if (a === '--release') { out.release = rest[i + 1]; i += 2; }
    else if (out.url === 'http://127.0.0.1:4173') { out.url = a; i++; }
    else { i++; }
  }
  if (mode === 'compare' && !out.outDir) out.outDir = path.join('/tmp', 'gridnode-vr-' + Date.now());
  return out;
}

async function capturePage(browser, url, vp, theme, release, scopeSelector) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width <= 430,
    hasTouch: vp.width <= 430,
    deviceScaleFactor: 1,
    serviceWorkers: 'block', // no SW staleness in deterministic captures
    reducedMotion: 'reduce', // freeze scanline/boot animation noise
  });
  const page = await context.newPage();
  await page.goto(url + '/?vr=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(([theme, release]) => {
    localStorage.setItem('gn_theme_v1', theme);
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    if (release) localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, [theme, release]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900); // let boot/scan settle before capture

  let scope = null;
  if (scopeSelector) {
    scope = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }, scopeSelector);
  }
  const buffer = await page.screenshot({ fullPage: false });
  const dims = { width: vp.width, height: vp.height };
  await context.close();
  return { buffer, dims, scope };
}

async function diffInPage(browser, bufA, bufB, scope) {
  const page = await browser.newPage();
  const b64a = bufA.toString('base64');
  const b64b = bufB.toString('base64');
  await page.setContent('<canvas id="c" style="position:fixed;left:-9999px"></canvas>');
  const result = await page.evaluate(async ({ a, b, threshold, scope }) => {
    const load = src => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
    const imgA = await load(a);
    const imgB = await load(b);
    const w = imgA.width, h = imgA.height;
    if (imgB.width !== w || imgB.height !== h) {
      return { error: `dimension mismatch ${w}x${h} vs ${imgB.width}x${imgB.height}` };
    }
    const canvas = document.getElementById('c');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgA, 0, 0);
    const dA = ctx.getImageData(0, 0, w, h).data;
    ctx.drawImage(imgB, 0, 0);
    const dB = ctx.getImageData(0, 0, w, h).data;

    const changed = new Uint8Array(w * h);
    let count = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const dr = Math.abs(dA[o] - dB[o]);
      const dg = Math.abs(dA[o + 1] - dB[o + 1]);
      const db = Math.abs(dA[o + 2] - dB[o + 2]);
      if (dr > threshold || dg > threshold || db > threshold) {
        changed[i] = 1;
        count++;
        const x = i % w, y = (i / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }

    // Classify: pixels inside the declared scope box = intended delta;
    // outside = regression.
    let inScope = 0, outOfScope = 0;
    if (scope) {
      const x0 = Math.max(0, scope.x), y0 = Math.max(0, scope.y);
      const x1 = Math.min(w, scope.x + scope.width), y1 = Math.min(h, scope.y + scope.height);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!changed[y * w + x]) continue;
          if (x >= x0 && x < x1 && y >= y0 && y < y1) inScope++;
          else outOfScope++;
        }
      }
    } else {
      outOfScope = count;
    }

    // Diff overlay: grayscale-dimmed AFTER image (design context, no color
    // ambiguity) + pure red on changed pixels (the diff signal).
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, w, h);
    octx.globalAlpha = 0.45;
    octx.filter = 'grayscale(1)';
    octx.drawImage(imgB, 0, 0);
    octx.globalAlpha = 1;
    octx.filter = 'none';
    octx.fillStyle = '#ff0000';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (changed[y * w + x]) octx.fillRect(x, y, 1, 1);
      }
    }

    return {
      w, h,
      changedPixels: count,
      ratio: count / (w * h),
      bbox: count ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      inScope,
      outOfScope,
      overlay: out.toDataURL('image/png'),
    };
  }, { a: 'data:image/png;base64,' + b64a, b: 'data:image/png;base64,' + b64b, threshold: DIFF_THRESHOLD, scope });
  await page.close();
  return result;
}

function gitHead() {
  try {
    return require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname + '/..' }).toString().trim();
  } catch { return 'unknown'; }
}

async function doCapture(args) {
  const dir = args.baselineDir;
  if (!dir) { console.error('capture needs <baselineDir>'); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const files = {};
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const { buffer } = await capturePage(browser, args.url, vp, theme, args.release, args.scope);
      const name = cellFile(vp, theme);
      fs.writeFileSync(path.join(dir, name), buffer);
      files[name] = { sha256: crypto.createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
      console.log(`captured ${name}`);
    }
  }
  const manifest = {
    tool: 'forge-visual-regression-guard',
    version: 1,
    mode: 'capture',
    url: args.url,
    release: args.release,
    scope: args.scope,
    capturedAt: new Date().toISOString(),
    gitHead: gitHead(),
    viewports: VIEWPORTS,
    themes: THEMES,
    files,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`BASELINE CAPTURED → ${dir} (git ${manifest.gitHead})`);
}

async function doCompare(args) {
  const baselineDir = args.baselineDir;
  const outDir = args.outDir;
  const manifestPath = path.join(baselineDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`No baseline manifest at ${manifestPath} — run capture first.`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const report = { tool: 'forge-visual-regression-guard', version: 1, mode: 'compare', baselineGitHead: manifest.gitHead, comparedAt: new Date().toISOString(), url: args.url, scope: args.scope, cells: [] };
  let regressions = 0;

  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const name = cellFile(vp, theme);
      const baselinePath = path.join(baselineDir, name);
      if (!fs.existsSync(baselinePath)) {
        console.error(`Missing baseline ${name}`);
        regressions = -1;
        continue;
      }
      const baseline = fs.readFileSync(baselinePath);
      const { buffer: after, scope } = await capturePage(browser, args.url, vp, theme, manifest.release || args.release, args.scope);
      const diff = await diffInPage(browser, baseline, after, scope);
      const cell = { viewport: `${vp.width}x${vp.height}`, theme, name };

      if (diff.error) {
        cell.error = diff.error;
        regressions = -1;
        console.error(`ERROR ${name}: ${diff.error}`);
        continue;
      }

      let overlayPath = null;
      if (diff.changedPixels > 0) {
        const b64 = diff.overlay.split(',')[1];
        overlayPath = path.join(outDir, name.replace('.png', '.diff.png'));
        fs.writeFileSync(overlayPath, Buffer.from(b64, 'base64'));
      }

      let verdict = 'identical';
      if (diff.changedPixels > 0) {
        verdict = diff.outOfScope > 0 ? 'regression' : 'in-scope-only';
        if (diff.outOfScope > 0) regressions++;
      }
      cell.verdict = verdict;
      cell.changedPixels = diff.changedPixels;
      cell.ratio = diff.ratio;
      cell.bbox = diff.bbox;
      cell.inScope = diff.inScope;
      cell.outOfScope = diff.outOfScope;
      cell.scope = scope;
      cell.overlay = overlayPath;
      report.cells.push(cell);
      console.log(`${verdict.toUpperCase()} ${name} (${diff.changedPixels}px, in-scope ${diff.inScope}, out-of-scope ${diff.outOfScope})`);
    }
  }

  report.regressions = regressions < 0 ? 'infra-error' : regressions;
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();

  if (regressions < 0) { console.log(`RESULT: INFRA ERROR → ${outDir}/report.json`); process.exit(2); }
  if (regressions > 0) { console.log(`RESULT: ${regressions} REGRESSION(S) — out-of-scope diffs → ${outDir}/report.json`); process.exit(1); }
  console.log(`RESULT: PASS — no out-of-scope diffs → ${outDir}/report.json`);
  process.exit(0);
}

const args = parseArgs(process.argv);
if (args.mode === 'capture') doCapture(args).catch(e => { console.error(e); process.exit(2); });
else if (args.mode === 'compare') doCompare(args).catch(e => { console.error(e); process.exit(2); });
else { console.error('usage: visual-regression-guard.cjs capture|compare <baselineDir> [<outDir>] [url] [release] [--scope sel]'); process.exit(2); }
