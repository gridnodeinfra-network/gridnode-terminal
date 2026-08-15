const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { window.GN_BETA_GATE = true; });
  const p = await ctx.newPage();

  // Step 1: get to gate
  await p.goto('http://127.0.0.1:4189/?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // Step 2: fill and submit
  await p.fill('#gnBetaGateInput', 'NODE-GRNT-AB7K');
  await p.waitForTimeout(200);
  await p.click('.gn-beta-gate__cta');
  await p.waitForTimeout(1500);

  console.log('--- After grant ---');
  console.log('Cookies:', JSON.stringify(await ctx.cookies(), null, 2));

  // Step 3: session check DIRECTLY (no reload)
  let r = await p.evaluate(async () => {
    const resp = await fetch('/api/beta-session', { method: 'GET', credentials: 'include' });
    return { status: resp.status, body: await resp.text() };
  });
  console.log('In-page session check:', r);

  // Step 4: reload
  console.log('--- Reloading ---');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  console.log('Cookies after reload:', JSON.stringify(await ctx.cookies(), null, 2));

  // Step 5: explicitly check session after reload
  r = await p.evaluate(async () => {
    const resp = await fetch('/api/beta-session', { method: 'GET', credentials: 'include' });
    return { status: resp.status, body: await resp.text() };
  });
  console.log('Post-reload session check:', r);

  // Step 6: inspect request headers via a different mechanism
  const headerInfo = await p.evaluate(() => {
    // look at what cookies are sent by reading document.cookie (will be empty for HttpOnly)
    return {
      documentCookie: document.cookie,
      navigatorCookieEnabled: navigator.cookieEnabled
    };
  });
  console.log('Client-side cookie info:', headerInfo);

  await b.close();
})();
