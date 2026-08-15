const { chromium } = require('playwright');
const errors = [];
const consoleErrors = [];
const failedRequests = [];

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();

  p.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push('CONSOLE: ' + m.text());
  });
  p.on('requestfailed', (r) => failedRequests.push(`FAILED ${r.url()} (${r.failure()?.errorText})`));
  p.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('favicon')) {
      failedRequests.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  // Test 1: gate disabled — load page, see landing
  console.log('=== Landing page (gate disabled) ===');
  await p.goto('http://127.0.0.1:4189/?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 10000 });
  await p.waitForTimeout(800);

  const landing = await p.evaluate(() => {
    const land = document.getElementById('landing');
    const enter = document.querySelector('[data-action="enter-the-grid"]');
    const explore = document.querySelector('[data-action="explore-the-system"]');
    const gate = document.getElementById('gnBetaGateRoot');
    return {
      landingExists: !!land,
      landingVisible: land && getComputedStyle(land).display !== 'none',
      enterBtn: !!enter,
      exploreBtn: !!explore,
      gateMounted: !!gate
    };
  });
  console.log('  landing:', JSON.stringify(landing));
  await p.screenshot({ path: '/home/thinkpadwinbash/.hermes/cache/images/predeploy-1-landing.png' });

  // Test 2: gate enabled — load page with the flag set
  console.log('=== Gate enabled (with flag) ===');
  await ctx.addInitScript(() => { window.GN_BETA_GATE = true; });
  await p.goto('http://127.0.0.1:4189/?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 10000 });
  await p.waitForTimeout(800);
  const gate = await p.evaluate(() => {
    const g = document.getElementById('gnBetaGateRoot');
    if (!g) return null;
    return {
      mounted: true,
      state: g.getAttribute('data-state'),
      hasMark: !!g.querySelector('.gn-beta-gate__gn'),
      hasTitle: g.querySelector('.gn-beta-gate__headline')?.textContent,
      hasCta: g.querySelector('.gn-beta-gate__cta')?.textContent,
      ctaDisabled: g.querySelector('.gn-beta-gate__cta')?.disabled
    };
  });
  console.log('  gate:', JSON.stringify(gate));
  await p.screenshot({ path: '/home/thinkpadwinbash/.hermes/cache/images/predeploy-2-gate.png' });

  // Test 3: type a code, screenshot READY
  await p.fill('#gnBetaGateInput', 'NODE-GRNT-AB7K');
  await p.waitForTimeout(300);
  const ready = await p.evaluate(() => ({
    state: document.getElementById('gnBetaGateRoot').getAttribute('data-state'),
    ctaDisabled: document.querySelector('.gn-beta-gate__cta').disabled
  }));
  console.log('  ready:', JSON.stringify(ready));
  await p.screenshot({ path: '/home/thinkpadwinbash/.hermes/cache/images/predeploy-3-ready.png' });

  // Test 4: submit -> wait for dissolve
  await p.click('.gn-beta-gate__cta');
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => ({
    gatePresent: !!document.getElementById('gnBetaGateRoot'),
    landingVisible: getComputedStyle(document.getElementById('landing')).display !== 'none'
  }));
  console.log('  after-grant:', JSON.stringify(after));
  await p.screenshot({ path: '/home/thinkpadwinbash/.hermes/cache/images/predeploy-4-after-grant.png' });

  // Test 5: probe all asset URLs
  console.log('=== Asset sanity check ===');
  await p.goto('http://127.0.0.1:4189/?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 10000 });
  const assets = await p.evaluate(async () => {
    const urls = [
      '/css/gridnode-native.css',
      '/css/gridnode-beta-gate.css',
      '/js/gridnode-version.js',
      '/js/gridnode-beta-gate.js',
      '/js/gridnode-bundle.js',
      '/js/gridnode-i18n.js',
      '/js/gridnode-theme.js',
      '/i18n/en.json',
      '/i18n/es-419.json',
      '/assets/brand/icons/favicon.svg',
      '/assets/brand/ui/header-lockup.svg',
      '/assets/scanner/arms/arms-cinematic.webp',
      '/assets/scanner/core/core-cinematic.webp',
      '/assets/scanner/legs/legs-cinematic.webp',
      '/manifest.json',
      '/sw.js'
    ];
    const results = {};
    for (const url of urls) {
      try {
        const r = await fetch(url, { method: 'GET', cache: 'no-store' });
        results[url] = r.status;
      } catch (e) {
        results[url] = 'error: ' + e.message;
      }
    }
    return results;
  });
  let badAssets = 0;
  for (const [url, status] of Object.entries(assets)) {
    if (status !== 200) {
      console.log(`  BAD: ${url} -> ${status}`);
      badAssets++;
    }
  }
  if (badAssets === 0) console.log('  all 16 assets returned 200');

  // Summary
  console.log();
  console.log('=== Summary ===');
  console.log('  page errors:', errors.length);
  if (errors.length) errors.forEach((e) => console.log('   ', e));
  console.log('  console errors:', consoleErrors.length);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ', e));
  console.log('  failed requests:', failedRequests.length);
  if (failedRequests.length) failedRequests.forEach((r) => console.log('   ', r));

  await b.close();
})();
