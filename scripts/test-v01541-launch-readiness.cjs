#!/usr/bin/env node
'use strict';
/**
 * v0.15.41 launch-readiness contract test (static, no browser).
 *
 * Guards the 2026-09-12 launch-readiness audit fixes:
 *  1. Vibration removal — no reachable navigator.vibrate() call anywhere in
 *     source; gnHaptics.play() is a documented hard no-op.
 *  2. Version stamping — package.json, package-lock.json root, and
 *     gridnode-version.js APP_VERSION/semver all agree.
 *  3. Cloud-only controls — Delete Cloud Account / SIGN OUT carry
 *     data-gn-cloud-only and syncCloudOnlyButtons() hides them locally.
 *  4. Inline injection-site picker — the log modal owns a zone picker;
 *     the old close-and-navigate-to-SHOTS path is gone.
 *  5. Naming consistency — one canonical name per real destination; no
 *     TRENDS tab invented; landing has no "// NODE MARK" literal.
 *  6. Tour plain language — beat 1 (THE GRID) names no Phase Engine;
 *     DARK/LIGHT labels; beat-0 language toggle; local-first trust story.
 *  7. Canonical "injection site" term; MOST COMMON medication group first;
 *     DEVICE REGISTRY disambiguation; zero-shot plain chrome.
 *
 * Usage: node scripts/test-v01541-launch-readiness.cjs
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

console.log('v0.15.41 launch-readiness contract:');

// --- 1. Vibration removal ---------------------------------------------
const srcJs = ['js/gridnode-core.js', 'js/gridnode-native.js', 'js/gridnode-motivation.js',
  'js/gridnode-firstcontact.js', 'js/gridnode-app.js', 'js/gridnode-i18n.js'];
const modules = fs.readdirSync(path.join(ROOT, 'js/modules')).filter(f => f.endsWith('.js')).map(f => 'js/modules/' + f);
const partials = fs.readdirSync(path.join(ROOT, 'html/partials')).filter(f => f.endsWith('.html')).map(f => 'html/partials/' + f);
const allSources = srcJs.concat(modules, partials);
let vibrateCalls = [];
for (const f of allSources) {
  const body = read(f);
  const hits = [...body.matchAll(/navigator\s*\.\s*vibrate\s*\(/g)];
  if (hits.length) vibrateCalls.push(f + ' x' + hits.length);
}
check('no navigator.vibrate() calls in source', vibrateCalls.length === 0, vibrateCalls.join(', '));
const lab08 = read('js/modules/08-lab.js');
const enJson = read('i18n/en.json');
const esJson = read('i18n/es-419.json');
check('gnHaptics.play is a hard no-op stub', /const play = \(pattern, opts = \{\}\) => \{\s*\/\* v0\.15\.41[\s\S]{0,220}?return;\s*\};/.test(lab08));
const hapticsDoc = read('js/modules/13-haptics.js');
check('13-haptics.js documents inert vibration', /inert|no-op|removed/i.test(hapticsDoc));

// --- 2. Version stamping ----------------------------------------------
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const verJs = read('js/gridnode-version.js');
const appVer = (verJs.match(/APP_VERSION:\s*'([^']+)'/) || [])[1];
const semver = (verJs.match(/semver:\s*'([^']+)'/) || [])[1];
check('package.json version is 0.15.41', pkg.version === '0.15.41', pkg.version);
check('package-lock root version matches', lock.version === pkg.version && lock.packages[''].version === pkg.version);
check('gridnode-version.js APP_VERSION matches package.json', appVer === pkg.version, String(appVer));
check('gridnode-version.js semver matches package.json', semver === pkg.version, String(semver));
check('build.mjs guards version match', /APP_VERSION/.test(read('scripts/build.mjs')) && /semver/.test(read('scripts/build.mjs')));

// --- 3. Cloud-only controls -------------------------------------------
check('Delete Cloud Account + SIGN OUT carry data-gn-cloud-only',
  (lab08.match(/data-gn-cloud-only/g) || []).length >= 2);
check('syncCloudOnlyButtons hides local-only controls', /function syncCloudOnlyButtons/.test(lab08) && /data-gn-cloud-only/.test(lab08));
const vault09 = read('js/modules/09-vault.js');
check('vault render calls syncCloudOnlyButtons', /syncCloudOnlyButtons\(\)/.test(vault09));

// --- 4. Inline injection-site picker ----------------------------------
const logOverlay = read('html/partials/06-overlay-log-shot.html');
const logShot = read('js/modules/05-log-shot.js');
check('modal owns an inline zone grid', /gn-modal-zone-grid/.test(logOverlay));
check('no button navigates to SHOTS for location', !/logLocationAction/.test(logOverlay) && !/goToScannerForLocationFromLog/.test(logOverlay));
check('renderModalZonePicker exists', /function renderModalZonePicker/.test(logShot));
check('installModalZonePicker exists', /function installModalZonePicker/.test(logShot));
check('picker reuses selectScannerLocation source of truth', /selectScannerLocation\(/.test(logShot));
const appJs = read('js/gridnode-app.js');
check('deleted nav helper absent from app exports', !/goToScannerForLocationFromLog/.test(appJs));
check('deleted nav helper absent from all sources',
  !allSources.some(f => read(f).includes('goToScannerForLocationFromLog')));

// --- 5. Naming consistency --------------------------------------------
const appPartial = read('html/partials/05-app.html');
const landing = read('html/partials/03-landing.html');
check('landing has no "// NODE MARK" literal', !landing.includes('// NODE MARK'));
check('no TRENDS destination invented', !/TRENDS/.test(appPartial) || !/nav\.trends/.test(appPartial + read('i18n/en.json')));
check('nav label key is nav.results', /data-i18n="nav\.results"/.test(appPartial));
check('RESULTS page heading', /data-i18n-html="results\.headingHtml"[^>]*>RESULTS/.test(appPartial) && enJson.includes('"results.headingHtml": "RESULTS <span'));
check('header tooltip says HOME', /Return to HOME/.test(appPartial));
check('profile page title is VAULT', /data-i18n="vault\.pageTitle"[^>]*>VAULT/.test(appPartial));
check('topbar hub button says VAULT', /topbar-hub-label">VAULT</.test(appPartial));
check('no SIGNAL nav label remains', !/data-i18n="nav\.signal"/.test(appPartial));

// --- 6. Tour plain language -------------------------------------------
const fc = read('js/gridnode-firstcontact.js');
check('beat 1 names no Phase Engine', !/fc\.grid\.(resultsBody|labBody)[\s\S]{0,120}Phase Engine/.test(fc) && !fc.includes("'fc.grid.resultsBody': 'Your curve. The Phase Engine"));
check('beat 3 still explains Phase Engine', /fc\.curve\.body.*Phase Engine/.test(fc));
check('DARK/LIGHT theme labels', fc.includes("'fc.comfort.night': 'DARK'") && fc.includes("'fc.comfort.dusk': 'LIGHT'"));
check('beat 0 owns a language toggle', /renderSignal[\s\S]{0,900}data-fc-lang/.test(fc));
check('trust story is local-first, cloud-optional', /cloud sync is optional/i.test(fc));
check('landing trust story matches', /LOCAL-FIRST/.test(read('i18n/en.json')) && !/"landing\.localFirst": "CLOUD-FIRST"/.test(read('i18n/en.json')));

// --- 7. Terminology ----------------------------------------------------
check('MOST COMMON medication group exists', /data-gn-med-options="COMMON"/.test(logOverlay) && /gn-revealed/.test(logOverlay) && /"shot\.groupMostCommon"/.test(enJson));
check('canonical "injection site" copy', /INJECTION SITE/.test(logOverlay) && /"shot\.noInjectionSite"/.test(enJson));
check('no application-zone fallback remains', !/application zone/i.test(read('js/modules/02-dashboard.js')));
check('device registry disambiguation', /DEVICE REGISTRY/.test(enJson) && !/"lab\.deviceVault": "DEVICE VAULT"/.test(enJson));
check('zero-shot plain chrome', /dashboard\.zeroShotSub/.test(enJson) && /STORED ON THIS DEVICE/.test(appPartial));

console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
