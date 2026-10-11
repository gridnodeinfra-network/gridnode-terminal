const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('gn_session_v2', JSON.stringify({ type: 'local', user: { id: 'local', email: '', user_metadata: { full_name: 'NODE_USER' } }, createdAt: new Date().toISOString() }));
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({
    loginVisible: !!document.getElementById('login') && getComputedStyle(document.getElementById('login')).display !== 'none',
    appVisible: !!document.getElementById('app') && getComputedStyle(document.getElementById('app')).display !== 'none',
    hasShowPage: typeof showPage,
    hasGNModules: typeof window.GNModules,
    wtChart: !!document.getElementById('wtChart'),
    activePage: document.querySelector('.page.active')?.id || 'none',
    title: document.title
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
