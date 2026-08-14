#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseURL = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || '/tmp/gridnode-dayops-proof';
const auditLang = process.argv[4] === 'es' ? 'es' : 'en';
const expectedRelease = process.argv[5] || '20260804.1';
const auditTheme = process.argv[6] === 'dark' ? 'dark' : 'light';
fs.mkdirSync(outDir, { recursive: true });

function filename(name, width) { return path.join(outDir, `${String(width)}-${name}.png`); }

async function contrastAudit(page, label) {
  return page.evaluate(labelValue => {
    const parse = value => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] == null ? 1 : parts[3] };
    };
    const luminance = rgb => {
      const f = value => { value /= 255; return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
      return .2126 * f(rgb.r) + .7152 * f(rgb.g) + .0722 * f(rgb.b);
    };
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const backgroundsFor = element => {
      let node = element;
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
          const colors = [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match => parse(match[0])).filter(color => color && color.a > .85);
          if (colors.length) return colors;
        }
        const color = parse(style.backgroundColor);
        if (color && color.a > .92) return [color];
        node = node.parentElement;
      }
      return document.documentElement.dataset.theme === 'light'
        ? [{ r: 244, g: 241, b: 233, a: 1 }]
        : [{ r: 5, g: 5, b: 8, a: 1 }];
    };
    const decorative = /scanline|particle|ticker|glyph|ornament|boot-prog-seg|landing-preview-dot|landing-preview-tag|phase-segment|(?:^|\s)(?:landing-kicker|gn-auth-kicker|gn-foundation-kicker|gn-dashboard-mission-kicker|gn-whatsnew-kicker)(?:\s|$)|gn-language-control|sec-title/i;
    const nodes = Array.from(document.querySelectorAll('body *')).filter(element => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      for (let node = element.parentElement; node; node = node.parentElement) {
        const ancestor = getComputedStyle(node);
        if (ancestor.display === 'none' || ancestor.visibility === 'hidden' || Number(ancestor.opacity) < .1) return false;
      }
      if (!element.getClientRects().length || element.closest('[aria-hidden="true"]')) return false;
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return false;
      const x = Math.min(innerWidth - 1, Math.max(0, rect.left + Math.min(rect.width / 2, 12)));
      const y = Math.min(innerHeight - 1, Math.max(0, rect.top + Math.min(rect.height / 2, 12)));
      const top = document.elementFromPoint(x, y);
      if (top && top !== element && !element.contains(top) && !top.contains(element)) return false;
      if (element.matches('.gn-language-control > span, .sec-title .a')) return false;
      if (decorative.test(element.className || '')) return false;
      return Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 1);
    });
    const failures = [];
    nodes.forEach(element => {
      const text = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ').replace(/\s+/g, ' ').slice(0, 90);
      if (!text) return;
      const style = getComputedStyle(element);
      const fg = parse(style.color);
      if (!fg) return;
      let opacity = fg.a;
      for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1);
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const cr = Math.min(...backgroundsFor(element).map(bg => ratio(fg, bg)));
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const reasons = [];
      const role = `${element.tagName} ${element.id || ''} ${element.className || ''}`;
      const sentence = text.length >= 34 && !/LABEL|page-sub|kicker|micro|code|meta|ticker|version|date|tag/i.test(role);
      const functional = /INPUT|SELECT|OPTION|BUTTON|LABEL|TEXTAREA/.test(element.tagName) || /helper|copy|body|description|notice|warning|empty|instruction|disclaimer|guidance|status|label|option|tab|nav-lbl|modal|toast|error/i.test(role);
      const minimumSize = sentence ? 15 : functional ? 14 : 12;
      if (size < minimumSize) reasons.push(`size ${size.toFixed(1)}px < ${minimumSize}px role floor`);
      if (weight < 400) reasons.push(`weight ${weight}`);
      if (opacity < .72) reasons.push(`opacity ${opacity.toFixed(2)}`);
      if (cr < (large ? 3 : 4.5)) reasons.push(`contrast ${cr.toFixed(2)}`);
      if (reasons.length) failures.push({
        text,
        selector: element.id ? '#' + element.id : '.' + String(element.className || element.tagName).trim().replace(/\s+/g, '.'),
        reasons,
        computed: {
          color: style.color,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          parent: element.parentElement?.id || element.parentElement?.className || ''
        }
      });
    });
    return { label: labelValue, checked: nodes.length, failures: failures.slice(0, 80), totalFailures: failures.length };
  }, label);
}

async function enterLocal(page) {
  await page.goto(baseURL + '/?qa=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ release, appearance }) => {
    localStorage.setItem('gn_theme_v1', appearance);
    localStorage.setItem('gn.lang', window.__GN_AUDIT_LANG || 'en');
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', release);
  }, { release: expectedRelease, appearance: auditTheme });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.landing-local-link').click();
  await page.locator('#app.active').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const errors = [];
  const audits = [];
  const widths = [320, 360, 390, 412, 430, 768, 1440];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block', locale: auditLang === 'es' ? 'es-419' : 'en-US' });
  const page = await context.newPage();
  await page.addInitScript(lang => { window.__GN_AUDIT_LANG = lang; }, auditLang);
  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  const isHeadlessGoogleIdentityFrame = value => /accounts\.google\.com\/gsi\//.test(value);
  page.on('console', msg => {
    const value = msg.text();
    const browserNetworkEcho = /^Failed to load resource: the server responded with a status of \d+/.test(value);
    if (msg.type() === 'error' && !browserNetworkEcho && !isHeadlessGoogleIdentityFrame(value)) errors.push('console: ' + value);
  });
  page.on('response', response => {
    const localCloudflareHelper = baseURL.includes('127.0.0.1') && response.url().includes('/cdn-cgi/');
    if (response.status() >= 400 && !isHeadlessGoogleIdentityFrame(response.url()) && !localCloudflareHelper) errors.push(`http ${response.status()}: ${response.url()}`);
  });

  await page.goto(baseURL + '/?landing=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ lang, appearance }) => { localStorage.setItem('gn_theme_v1', appearance); localStorage.setItem('gn.lang', lang); }, { lang: auditLang, appearance: auditTheme });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: filename('landing', 390), fullPage: true });
  audits.push(await contrastAudit(page, 'landing'));
  await page.locator('.landing-btn.primary').first().click();
  await page.locator('#login.active').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: filename('jack-in', 390) });
  audits.push(await contrastAudit(page, 'jack-in'));

  await enterLocal(page);
  await page.screenshot({ path: filename('dashboard', 390) });
  audits.push(await contrastAudit(page, 'dashboard'));

  const show = async (name, shotName, fullPage = false) => {
    await page.evaluate(pageName => window.showPage(pageName), name);
    await page.waitForTimeout(220);
    await page.screenshot({ path: filename(shotName, 390), fullPage });
    audits.push(await contrastAudit(page, shotName));
  };
  await show('Log', 'shots-scanner');
  await page.evaluate(() => window.openLogModal());
  await page.waitForTimeout(150);
  await page.screenshot({ path: filename('shot-form', 390) });
  audits.push(await contrastAudit(page, 'shot-form'));
  await page.locator('#cpShotMed .cp-select-trigger').click();
  await page.waitForTimeout(240);
  await page.screenshot({ path: filename('shot-dropdown', 390) });
  audits.push(await contrastAudit(page, 'shot-dropdown'));
  await page.keyboard.press('Escape');
  if (await page.locator('#logOv.active').count()) await page.locator('#logOv .modal-btn.close').click();
  await page.waitForTimeout(220);

  await page.evaluate(() => window.openWeightModal());
  await page.waitForTimeout(150);
  await page.screenshot({ path: filename('weight-form', 390) });
  audits.push(await contrastAudit(page, 'weight-form'));
  await page.evaluate(() => window.closeWt());

  await show('Results', 'results-phase');
  await show('Lab', 'lab-directory');
  await page.locator('[data-lab-focus="calculators"]').click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: filename('lab-calculators', 390) });
  audits.push(await contrastAudit(page, 'lab-calculators'));
  await page.evaluate(() => window.showLabSeg('recon', document.querySelector('[data-labseg="recon"]')));
  await page.waitForTimeout(240);
  await page.screenshot({ path: filename('lab-mix-reference', 390) });
  audits.push(await contrastAudit(page, 'lab-mix-reference'));
  await page.locator('[data-lab-back]').click();
  await page.waitForTimeout(120);
  await page.evaluate(() => window.showPage('Lab'));
  await page.locator('[data-lab-focus="research"]').click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: filename('lab-research', 390) });
  audits.push(await contrastAudit(page, 'lab-research'));
  await page.locator('#gnResearchState').locator('xpath=..').locator('.gn-custom-picker-trigger').click();
  await page.waitForTimeout(160);
  await page.screenshot({ path: filename('lab-research-dropdown', 390) });
  audits.push(await contrastAudit(page, 'lab-research-dropdown'));
  await page.keyboard.press('Escape');
  await page.locator('[data-lab-back]').click();
  await page.waitForTimeout(120);
  await page.evaluate(() => window.showPage('Lab'));
  await page.locator('[data-lab-focus="inventory"]').click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: filename('lab-inventory', 390) });
  audits.push(await contrastAudit(page, 'lab-inventory'));
  await page.locator('#gnInventoryType').locator('xpath=..').locator('.gn-custom-picker-trigger').click();
  await page.waitForTimeout(160);
  await page.screenshot({ path: filename('lab-inventory-dropdown', 390) });
  audits.push(await contrastAudit(page, 'lab-inventory-dropdown'));
  await page.keyboard.press('Escape');
  await page.locator('[data-lab-back]').click();

  await show('Profile', 'node-vault');
  await page.locator('#gnDeviceType').locator('xpath=..').locator('.gn-custom-picker-trigger').click();
  await page.waitForTimeout(160);
  await page.screenshot({ path: filename('device-dropdown', 390) });
  audits.push(await contrastAudit(page, 'device-dropdown'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openSystemUpdate());
  await page.waitForTimeout(100);
  await page.screenshot({ path: filename('update-history', 390) });
  audits.push(await contrastAudit(page, 'update-history'));
  await page.locator('.gn-whatsnew-close').click();
  await show('Cal', 'calendar');

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.evaluate(() => window.showPage('Dash'));
    await page.waitForTimeout(80);
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, app: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth }));
    if (overflow.doc > 1 || overflow.app > 1) errors.push(`overflow ${width}px doc=${overflow.doc} app=${overflow.app}`);
    await page.screenshot({ path: filename('responsive-dashboard', width) });
  }

  if (auditLang === 'es') {
    const mixedLanguage = await page.evaluate(() => {
      const text = document.body.innerText;
      const forbidden = ['No location selected', 'SELECTED LOCATION', 'CORE TRACKABLE ZONES', 'Private identity preserved', 'Manual Entry', 'User Confirmed', 'No records on this day.'];
      return forbidden.filter(phrase => text.includes(phrase));
    });
    if (mixedLanguage.length) errors.push(`Spanish mixed-language phrases: ${mixedLanguage.join(' | ')}`);
  }

  const visibleIsoDates = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(element => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length;
  }).flatMap(element => Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim())).filter(text => /\b20\d{2}-\d{2}-\d{2}\b/.test(text)).slice(0, 20));
  if (visibleIsoDates.length) errors.push(`visible ISO dates: ${visibleIsoDates.join(' | ')}`);

  const result = { baseURL, lang: auditLang, theme: auditTheme, version: await page.evaluate(() => window.GN_VERSION), audits, errors: [...new Set(errors)] };
  fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ version: result.version, auditSummary: audits.map(item => ({ label: item.label, checked: item.checked, failures: item.totalFailures })), errors: result.errors, outDir }, null, 2));
  await context.close();
  await browser.close();
  if (result.errors.length) process.exitCode = 2;
}

main().catch(error => { console.error(error); process.exit(1); });
