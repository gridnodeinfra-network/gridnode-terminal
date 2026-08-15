const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { window.GN_BETA_GATE = true; });
  const p = await ctx.newPage();

  // Test 1: no session, no ?invite -> gate mounts
  await p.goto('http://127.0.0.1:4189/?v=test1&_' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const r1 = await p.evaluate(() => {
    const g = document.getElementById('gnBetaGateRoot');
    return g ? { gate: true, state: g.getAttribute('data-state') } : { gate: false };
  });
  console.log('Case M (no session, no ?invite):', JSON.stringify(r1));

  // Test 2: ?invite=NODE-GRNT-AB7K -> prefill, no auto-submit, URL stripped
  await p.goto('http://127.0.0.1:4189/?_=' + Date.now() + '&invite=NODE-GRNT-AB7K', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const r2 = await p.evaluate(() => {
    const input = document.getElementById('gnBetaGateInput');
    const url = window.location.href;
    return {
      inputValue: input ? input.value : null,
      urlHasInvite: url.includes('invite=')
    };
  });
  console.log('Case N (?invite= prefilled, URL stripped):', JSON.stringify(r2));

  // Test 3: fill, submit, wait for GRANTED -> gate removed
  await p.fill('#gnBetaGateInput', 'NODE-GRNT-AB7K');
  await p.waitForTimeout(200);
  await p.click('.gn-beta-gate__cta');
  await p.waitForTimeout(1500);
  const r3a = await p.evaluate(() => ({ gatePresent: !!document.getElementById('gnBetaGateRoot') }));
  console.log('Case B (after grant, gate removed):', JSON.stringify(r3a));

  // Test 4: reload after grant -> gate should be skipped (session check returns 200)
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const r4 = await p.evaluate(() => {
    const g = document.getElementById('gnBetaGateRoot');
    return { gatePresent: !!g, url: window.location.href };
  });
  console.log('Case C (reload after grant, gate skipped):', JSON.stringify(r4));

  // Test 5: clear session, reload -> gate returns
  await ctx.clearCookies();
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const r5 = await p.evaluate(() => {
    const g = document.getElementById('gnBetaGateRoot');
    return g ? { gate: true, state: g.getAttribute('data-state') } : { gate: false };
  });
  console.log('Case H (logout, gate returns):', JSON.stringify(r5));

  await b.close();
})();
