const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { window.GN_BETA_GATE = true; });
  const p = await ctx.newPage();

  await p.goto('http://127.0.0.1:4189/?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // Fill, submit, wait for GRANTED
  await p.fill('#gnBetaGateInput', 'NODE-GRNT-AB7K');
  await p.waitForTimeout(200);
  await p.click('.gn-beta-gate__cta');
  await p.waitForTimeout(1500);

  // Inspect cookies
  const cookies = await ctx.cookies();
  console.log('Cookies after grant:');
  for (const c of cookies) {
    console.log(`  ${c.name}=${c.value.slice(0, 20)}... secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite} path=${c.path}`);
  }

  // Hit /api/beta-session directly with explicit cookie read
  const resp = await p.evaluate(async () => {
    const r = await fetch('/api/beta-session', { method: 'GET', credentials: 'include' });
    return { status: r.status, body: await r.text() };
  });
  console.log('session check from page (credentials: include):', resp);

  // Reload
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const gatePresent = await p.evaluate(() => !!document.getElementById('gnBetaGateRoot'));
  console.log('Gate after reload:', gatePresent);

  await b.close();
})();
