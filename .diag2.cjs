const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('gn_session_v2', JSON.stringify({ type: 'local', user: { id: 'local', email: '', user_metadata: { full_name: 'NODE_USER' } }, createdAt: new Date().toISOString() }));
    localStorage.setItem('gn_local_weights', JSON.stringify([{date:'2026-09-01',weight:205},{date:'2026-09-10',weight:202},{date:'2026-09-20',weight:199},{date:'2026-10-01',weight:196}]));
    localStorage.setItem('gn_local_shots', JSON.stringify([{id:'s1',date:'2026-09-06',dose:2.5,med:'BPC-157'},{id:'s2',date:'2026-09-20',dose:5,med:'BPC-157'}]));
    localStorage.setItem('gn_local_profile', JSON.stringify({ goalWt: 180, startWt: 205 }));
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const r1 = await page.evaluate(() => {
    try { showPage('Results', document.getElementById('navRes')); return 'ok'; }
    catch (e) { return 'THREW: ' + String(e).slice(0,200); }
  });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    showPageResult: 'n/a',
    activePage: document.querySelector('.page.active')?.id || 'none',
    pageResClasses: document.getElementById('pageResults')?.className,
    wtRect: (() => { const r = document.getElementById('wtChart').getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
    wtCanvasWH: [document.getElementById('wtChart').width, document.getElementById('wtChart').height],
    legend: document.getElementById('wtChartLegend').innerHTML.slice(0,120)
  }));
  console.log('showPage:', r1);
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
