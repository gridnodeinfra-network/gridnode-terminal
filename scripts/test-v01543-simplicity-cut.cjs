#!/usr/bin/env node
'use strict';
/**
 * v0.15.43 simplicity-cut contract test (static, no browser).
 *
 * Guards the 2026-09-12 full simplicity audit (Tier 1 + Tier 2 + Tier 3):
 *  1. Legacy blocks absent: no data-gn-legacy-profile, no legacy HOME IDs.
 *  2. One zero-shot state: gnFirstShotMission only, no gnEmptyHero.
 *  3. VAULT bottom tab present; topbar VAULT button absent.
 *  4. No COMING LATER on landing.
 *  5. WHAT'S NEW trimmed to 0.15.x era (no pre-0.15 entries).
 *  6. Oskar memorial strings unchanged (For Oskar ♥, FOR O.).
 *  7. No reachable navigator.vibrate calls.
 *  8. Version agreement on 0.15.43.
 *  9. Landing has five module cards (HOME, SHOTS, RESULTS, LAB, VAULT).
 * 10. Tour is 3 beats.
 *
 * Usage: node scripts/test-v01543-simplicity-cut.cjs
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

console.log('v0.15.43 simplicity-cut contract:');

const app05 = read('html/partials/05-app.html');
const landing03 = read('html/partials/03-landing.html');
const boot04 = read('html/partials/04-boot.html');
const dash02 = read('js/modules/02-dashboard.js');
const lab08 = read('js/modules/08-lab.js');
const vault09 = read('js/modules/09-vault.js');
const fc = read('js/gridnode-firstcontact.js');
const wn = read('js/gridnode-whatsnew.js');
const scanner04 = read('js/modules/04-scanner.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1. Legacy blocks absent
check('legacy VAULT block absent', !app05.includes('data-gn-legacy-profile'));
check('legacy HOME IDs absent', !dash02.includes('stShots') && !dash02.includes('dashWtChart'));
check('nextShotCard absent', !app05.includes('nextShotCard'));

// 2. One zero-shot state
check('gnFirstShotMission present', dash02.includes('gnFirstShotMission'));
check('gnEmptyHero absent', !dash02.includes('gnEmptyHero'));

// 3. VAULT nav
check('VAULT bottom tab present', app05.includes('navVault') || app05.includes("showPage('Profile'"));
check('topbar VAULT button absent', !app05.includes('topAva'));

// 4. No COMING LATER
check('no COMING LATER', !landing03.includes('COMING LATER'));

// 5. WHAT'S NEW trimmed
check('no pre-0.15 whatsnew', !wn.includes("version: '0.14.") && !wn.includes("version: '0.12.") && !wn.includes("version: '0.11."));

// 6. Oskar memorial: footer dedication + VAULT row, green paw beside his name
const overlay10 = read('html/partials/10-overlays-confirm.html');
check('landing dedication keeps Oskar', landing03.includes('For <span class="oskar-name">Oskar</span>'));
check('VAULT memorial row present', lab08.includes('vault.oskarMemorialPre') && lab08.includes('vault.oskarName') && lab08.includes('vault.oskarMemorialPost'));
check('paw CSS present', overlay10.includes('.oskar-name::after') && overlay10.includes('#a6ff00'));
check('oskar i18n keys', en['vault.oskarName'] === 'Oskar' && es['vault.oskarMemorialPre'] === 'En memoria de');
check('DRAW memorial line intact', app05.includes('FOR O.'));

// 7. No vibration calls (feature detection typeof checks are fine)
const allJs = dash02 + lab08 + vault09 + fc + scanner04 + read('js/modules/13-haptics.js');
check('no navigator.vibrate() calls', !allJs.includes('navigator.vibrate('));

// 8. Version 0.15.43
const pkg = JSON.parse(read('package.json'));
check('package.json 0.15.43', pkg.version === '0.15.43');
check('gridnode-version 0.15.43', read('js/gridnode-version.js').includes("'0.15.43'"));

// 9. Five landing modules
const moduleCount = (landing03.match(/<article class="module-card/g) || []).length;
check('five landing modules', moduleCount === 5, `found ${moduleCount}`);

// 10. Tour is 3 beats
check('tour BEATS=3', fc.includes('var BEATS = 3;'));

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
