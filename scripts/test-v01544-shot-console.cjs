#!/usr/bin/env node
'use strict';
/**
 * v0.15.44 shot-console contract test (static, no browser).
 *
 * Guards the 2026-09-12 SHOT CONSOLE redesign (FAB + LOG SHOT sheet), and
 * carries forward the still-valid v0.15.43 guards:
 *  1. Legacy blocks absent (simplicity cut intact).
 *  2. One zero-shot state.
 *  3. VAULT bottom tab present; topbar VAULT button absent.
 *  4. No COMING LATER on landing.
 *  5. Oskar memorial strings unchanged.
 *  6. No reachable navigator.vibrate calls.
 *  7. Version agreement on 0.15.44.
 *  8. v0.15.43 OnePlus fixes intact (no dangling initScannerAudioControl call;
 *     #logOv full-width column flex retained).
 *  9. Shot-console redesign present: syringe FAB, console sheet chrome,
 *     sticky action bar with live summary, summary watcher in the bundle,
 *     new i18n keys in en + es-419.
 *
 * Usage: node scripts/test-v01544-shot-console.cjs
 * Exit 0 = all assertions pass. Exit 1 = failures (listed on stderr).
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

console.log('v0.15.44 shot-console contract:');

const app05 = read('html/partials/05-app.html');
const head01 = read('html/partials/01-head.html');
const shell02 = read('html/partials/02-body-shell.html');
const landing03 = read('html/partials/03-landing.html');
const logshot06 = read('html/partials/06-overlay-log-shot.html');
const dash02 = read('js/modules/02-dashboard.js');
const lab08 = read('js/modules/08-lab.js');
const vault09 = read('js/modules/09-vault.js');
const logshot05 = read('js/modules/05-log-shot.js');
const misc11 = read('js/modules/11-misc.js');
const fc = read('js/gridnode-firstcontact.js');
const scanner04 = read('js/modules/04-scanner.js');
const bundle = read('js/gridnode-bundle.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1-6. Simplicity-cut guards carried forward
check('legacy VAULT block absent', !app05.includes('data-gn-legacy-profile'));
check('legacy HOME IDs absent', !dash02.includes('stShots') && !dash02.includes('dashWtChart'));
check('gnFirstShotMission present', dash02.includes('gnFirstShotMission'));
check('gnEmptyHero absent', !dash02.includes('gnEmptyHero'));
check('VAULT bottom tab present', app05.includes('navVault') || app05.includes("showPage('Profile'"));
check('VAULT icon has size wrapper', app05.includes('<span class="nav-ico"><span class="gn-icon gn-icon-sm"><svg><use href="#gn-vault-core">'));
check('topbar VAULT button absent', !app05.includes('topAva'));
check('no COMING LATER', !landing03.includes('COMING LATER'));
check('landing dedication keeps Oskar', landing03.includes('<span class="oskar-name">Oskar</span>'));
const allJs = dash02 + lab08 + vault09 + fc + scanner04 + read('js/modules/13-haptics.js');
check('no navigator.vibrate() calls', !allJs.includes('navigator.vibrate('));

// 7. Version 0.15.44
const pkg = JSON.parse(read('package.json'));
check('package.json 0.15.44', pkg.version === '0.15.44');
check('gridnode-version 0.15.44', read('js/gridnode-version.js').includes("'0.15.44'"));

// 8. v0.15.43 OnePlus fixes intact
check('no dangling initScannerAudioControl call', !misc11.includes('initScannerAudioControl()'));
check('logOv column flex retained', read('html/partials/12-styles-polish-patches.html').includes('#logOv.active'));

// 9. Shot-console redesign
check('gn-syringe icon defined', shell02.includes('id="gn-syringe"'));
check('FAB uses syringe icon', app05.includes('<use href="#gn-syringe">'));
check('FAB reticle CSS present', head01.includes('@keyframes fab-reticle') && head01.includes('.fab::before'));
check('FAB clears the tab bar', head01.includes('bottom:calc(106px + var(--safe-bottom))'));
check('FAB small-phone rule keeps reticle geometry', read('html/partials/12-styles-polish-patches.html').includes('bottom:calc(106px + var(--safe-bottom));'));
check('no lava background on .fab', !read('css/native/00-base.css').match(/\.fab,\n/) && !read('css/native/03-premium-system.css').includes('#gnPreferencesSave,.fab,'));
check('premium FAB block is reticle-sized', read('css/native/03-premium-system.css').includes('width: 64px !important;'));
check('daylight FAB bottom clears tabs', read('css/daylight-nexus-pilot.css').includes('bottom: calc(106px + var(--safe-bottom, 0px)) !important;'));
check('pill FAB scoped to label variant', read('css/daylight-nexus-pilot.css').includes('.fab:has(.fab-label)'));
check('console sheet class', logshot06.includes('gn-shot-console'));
check('scroll region', logshot06.includes('gn-shot-scroll'));
check('action bar', logshot06.includes('gn-shot-actionbar'));
check('summary spans', logshot06.includes('id="gnShotSummaryMed"') && logshot06.includes('id="gnShotSummaryDose"') && logshot06.includes('id="gnShotSummarySite"'));
check('fire button keeps saveShot hook', logshot06.includes('gn-shot-fire') && logshot06.includes('onclick="saveShot()"'));
check('gear step header', logshot06.includes('data-gn-shot-step="gear"'));
check('summary watcher in module', logshot05.includes('installShotSummaryWatcher') && logshot05.includes('gnRenderShotSummary'));
check('summary watcher in bundle', bundle.includes('gnShotSummaryMed'));
check('dose-pill hooks intact', logshot06.includes('id="dosePills"') && logshot06.includes('id="sDose"'));
check('zone picker hooks intact', logshot06.includes('id="modalZonePicker"') && logshot06.includes('id="modalZoneModes"') && logshot06.includes('id="modalSelectedLocation"'));
check('i18n stepGear en+es', en['shot.stepGear'] === '04 // GEAR' && es['shot.stepGear'] === '04 // EQUIPO');
check('i18n consoleSub en+es', en['shot.consoleSub'] === 'SHOT PROTOCOL CONSOLE' && es['shot.consoleSub'] === 'CONSOLA DE PROTOCOLO');

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
