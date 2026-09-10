#!/usr/bin/env node
'use strict';
/**
 * FIRST CONTACT onboarding contract test (static, no browser).
 *
 * Guards the 2026-09-10 onboarding rebuild:
 *  - the old v1 spotlight tour is fully gone (no file, no wiring, no CSS, no i18n)
 *  - the new FIRST CONTACT system is wired end to end:
 *    script tag, service-worker precache, gn:shot-saved success-only event,
 *    6 beats, real-save listener, replay hook, EN+ES copy, spotlight CSS,
 *    reduced-motion support.
 *
 * Usage: node scripts/test-firstcontact-contract.cjs
 * Exit 0 = all assertions pass. Exit 1 = first failure (message on stderr).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failures = 0;
function check(name, cond, hint) {
  if (cond) { console.log('  PASS ' + name); return; }
  failures++;
  console.error('  FAIL ' + name + (hint ? ' — ' + hint : ''));
}

console.log('firstcontact contract:');

// --- Old implementation is gone ---------------------------------------
check('old js file deleted', !fs.existsSync(path.join(ROOT, 'js/gridnode-onboarding.js')));
const indexHtml = read('index.html');
check('index.html has no old script ref', !indexHtml.includes('gridnode-onboarding'));
const nativeCss = read('css/gridnode-native.css');
check('no gn-onb- selectors in CSS', !/gn-onb-/.test(nativeCss), 'stale v1 spotlight styles');
const bundle = read('js/gridnode-bundle.js');
check('bundle has no data-onboard hooks', !bundle.includes('data-onboard'));
check('bundle has no GN_ONBOARDING refs', !bundle.includes('GN_ONBOARDING'));
const enJson = read('i18n/en.json');
const esJson = read('i18n/es-419.json');
check('en.json has no onb.* keys', !/"onb\./.test(enJson));
check('es-419.json has no onb.* keys', !/"onb\./.test(esJson));

// --- New script is wired ------------------------------------------------
check('index.html loads gridnode-firstcontact.js', indexHtml.includes('gridnode-firstcontact.js'));
const sw = read('sw.js');
check('sw.js precaches gridnode-firstcontact.js', sw.includes('js/gridnode-firstcontact.js'));

// --- Real-save event contract -------------------------------------------
const modules = require('./read-modules-source.cjs');
const fc = read('js/gridnode-firstcontact.js');
check('saveShot dispatches gn:shot-saved', modules.includes("dispatchEvent(new CustomEvent('gn:shot-saved'"));
const saves = modules.match(/function saveShot\(\)[\s\S]*?\n}/);
check('gn:shot-saved only inside saveShot', (modules.match(/gn:shot-saved/g) || []).length === 1,
  'the event must fire exactly once, on the successful save path only');
check('tour listens for gn:shot-saved', fc.includes("addEventListener('gn:shot-saved'"));

// --- Six beats ------------------------------------------------------------
check('BEATS = 6', /var BEATS = 6;/.test(fc));
for (const fn of ['renderSignal', 'renderGrid', 'renderDose', 'renderCurve', 'renderComfort', 'renderOnline']) {
  check('beat renderer ' + fn + ' exists', fc.includes('function ' + fn + '('));
}

// --- State keys + migration ----------------------------------------------
check('v2 state key', fc.includes("'gn_onboarding_v2'"));
check('v2 dismissal key', fc.includes("'gn_onboarding_dismissed_v2'"));
check('v1 migration guard', fc.includes("'gn_onboarding_v1'") && fc.includes('migrate()'));

// --- Replay ---------------------------------------------------------------
check('replay hook exists', fc.includes('injectReplay') && fc.includes('data-gn-fc-replay'));

// --- i18n -----------------------------------------------------------------
function fcKeys(src, langName) {
  const block = src.slice(src.indexOf('var COPY ='), src.indexOf('function lang()'));
  const langBlock = langName === 'en'
    ? block.slice(block.indexOf('en: {'), block.indexOf('es: {'))
    : block.slice(block.indexOf('es: {'));
  return new Set([...langBlock.matchAll(/'(fc\.[\w.]+)'\s*:/g)].map(m => m[1]));
}
const enKeys = fcKeys(fc, 'en');
const esKeys = fcKeys(fc, 'es');
check('EN copy keys present (>=40)', enKeys.size >= 40, 'found ' + enKeys.size);
check('ES copy keys present (>=40)', esKeys.size >= 40, 'found ' + esKeys.size);
const enOnly = [...enKeys].filter(k => !esKeys.has(k));
const esOnly = [...esKeys].filter(k => !enKeys.has(k));
check('EN/ES key sets identical', enOnly.length === 0 && esOnly.length === 0,
  'en-only: ' + enOnly.join(',') + ' es-only: ' + esOnly.join(','));

// --- CSS ------------------------------------------------------------------
for (const sel of ['.gn-fc-overlay', '.gn-fc-veil', '.gn-fc-dim', '.gn-fc-card',
                   '.gn-fc-target', '.gn-fc-arrow', '.gn-fc-coach', '.gn-fc-steps',
                   '.gn-fc-seg', '.gn-fc-replay', '.gn-fc-pulse', '.gn-fc-zones']) {
  check('CSS selector ' + sel, nativeCss.includes(sel));
}
check('gold spotlight ring (gold #ffd166)', /#ffd166/.test(nativeCss));
check('reduced-motion guard for tour', /prefers-reduced-motion[\s\S]{0,400}gn-fc-/.test(nativeCss));
check('light theme variants for tour', /data-theme="light"[\s\S]{0,200}gn-fc-/.test(nativeCss) ||
      /html\[data-theme="light"\] \.gn-fc-/.test(nativeCss));

// --- Stylesheet integrity: the v1 cleanup once broke :is() selectors ---------
// (unclosed parens), which silently killed the entire sheet in the browser.
{
  const css = nativeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const noStr = css.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0, start = 0, badPreludes = [];
  for (let i = 0; i < noStr.length; i++) {
    if (noStr[i] === '{') {
      const prelude = noStr.slice(start, i);
      if (depth === 0 && !prelude.includes('@media')) {
        let pd = 0;
        for (const ch of prelude) { if (ch === '(') pd++; if (ch === ')') pd--; }
        if (pd !== 0) badPreludes.push(prelude.trim().slice(-80));
      }
      depth++;
    } else if (noStr[i] === '}') { depth--; if (depth === 0) start = i + 1; }
  }
  check('CSS braces balanced', depth === 0, 'depth=' + depth);
  check('no unclosed :is() selector preludes', badPreludes.length === 0, badPreludes[0] || '');
  const topRules = (noStr.match(/\}/g) || []).length;
  check('stylesheet has substantial rule count', topRules > 1000, 'found ' + topRules + ' closing braces');
}

// --- No trap on beat 2: fallback must offer "I'll log later" ----------------
{
  const laterCount = (fc.match(/data-fc-later/g) || []).length;
  check('fallback card has the log-later escape', laterCount >= 4 && fc.includes('renderDoseFallback'),
    'Open-the-log fallback otherwise loops back on itself (' + laterCount + ' refs)');
}

// --- Location round trip must not trigger the modal-close retreat ------------
check('location pick suppresses the close retreat',
  fc.includes('pickingLocation') && fc.includes('#logLocationAction') && fc.includes('90000'),
  '1.2s grace always fires mid-pick, bouncing beat 2 back to the fallback card');

// --- Stray gold arrow: screen beats must park it off-screen ----------------
check('screen beats park the gold arrow off-screen',
  fc.includes("if (mode === 'screen')") && /querySelector\('\.gn-fc-arrow'\)[\s\S]{0,160}'-99px'/.test(fc),
  'arrow renders dead-center on fullscreen beats');

// --- Phase Engine source readout has real layout rules ----------------------
check('phase-source-grid label/value layout exists',
  nativeCss.includes('.phase-source-grid > div') && nativeCss.includes('justify-content: space-between'),
  'readout renders jammed label+value text');

// --- Coach watches modal close (retreat to spotlight) ----------------------
check('modal-close observer retreats to spot', fc.includes('MutationObserver') && fc.includes("dosePhase = 'spot'"));

// --- Coach skip is bound exactly once per render ---------------------------
const skipBinds = (fc.match(/data-fc-coach-skip/g) || []).length;
check('coach skip binding single-source', skipBinds >= 2 && fc.includes('function renderCoachCopy'),
  'skip listener must live in renderCoachCopy only (' + skipBinds + ' refs)');

if (failures) { console.error(`\nfirstcontact contract: ${failures} FAILURE(S)`); process.exit(1); }

// --- Replay anchor must exist in the profile page ---------------------------
{
  const html = read('index.html');
  check('replay anchor (Reload App utility row) exists', html.includes('gn-utility-row') && html.includes('window.location.reload()'), '');
  check('injectReplay targets the real anchor', fc.includes('#pageProfile .gn-utility-row[onclick*="reload"]'), '');
}

// --- QA 2026-09-10: coach must tick immediately on modal interaction --------
check('coach ticks on modal input/click (no 600ms-only poll)',
  fc.includes('coachInputHandler') && fc.includes("addEventListener('input', coachInputHandler)") && fc.includes("addEventListener('click', coachInputHandler)"),
  'fast pill-tap then save leaves the dose step visibly unchecked');

// --- QA 2026-09-10: modal action buttons must clear the coach sheet --------
check('coaching modal pads buttons clear of coach sheet',
  nativeCss.includes('#logOv.gn-fc-coaching .modal') && nativeCss.includes('padding-bottom: 240px') &&
  fc.includes("classList.add('gn-fc-coaching')") && fc.includes("classList.remove('gn-fc-coaching')"),
  'coach bottom sheet covers the SAVE SHOT button');

// --- QA 2026-09-10: tour card lang buttons reflect the active language ------
check('comfort card lang buttons toggle active immediately',
  /data-fc-lang[\s\S]{0,400}classList\.toggle\('active'/.test(fc) && fc.includes("localStorage.setItem('gn.lang', next)"),
  'ES button keeps pressed state after switching back to EN');

console.log('\nfirstcontact contract: ALL PASS');
