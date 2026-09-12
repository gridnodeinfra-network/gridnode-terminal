#!/usr/bin/env node
'use strict';
/**
 * v0.15.42 launch-readiness contract test (static, no browser).
 * v0.15.43: updated for simplicity cut (3-beat tour, version 0.15.43).
 *
 * Guards the 2026-09-12 second-sweep fixes:
 *  1. Visible VAULT bottom-nav tab (five-section model: HOME, SHOTS,
 *     RESULTS, LAB, VAULT); showPage maps Profile -> navVault; the old
 *     standalone Calendar page is gone and Calendar lives inside RESULTS.
 *  2. Boot skip — any tap skips the boot sequence immediately; TAP TO SKIP
 *     hint present in EN + ES.
 *  3. Local login routes to HOME (showApp forces showPage('Dash')).
 *  4. VAULT hub carries an explicit working REPLAY TOUR control calling
 *     replayGuidedTour() (no fragile DOM injection).
 *  5. Dedicated bilingual privacy policy overlay, linked from the landing
 *     footer and from VAULT -> YOUR DATA.
 *  6. Explicit bilingual "not a source" disclaimer on the landing page
 *     (EN + ES), alongside the medical-advice disclaimer.
 *  7. RESULTS never exposes raw medication slugs.
 *  8. Entry funnel discipline: single primary CTA, no pre-commit theme
 *     config, EXPLORE demoted to a quiet anchor, one plain-language
 *     local-vs-cloud choice screen.
 *  9. SCOPE replaces BOUNDARY in EN + ES.
 * 10. Tour is 3 beats (signal, dose, curve).
 * 11. Version agreement on 0.15.43; whatsnew placeholder rewritten.
 *
 * Usage: node scripts/test-v01542-launch-readiness.cjs
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

console.log('v0.15.42 launch-readiness contract (updated for 0.15.43):');

const app05 = read('html/partials/05-app.html');
const landing03 = read('html/partials/03-landing.html');
const boot04 = read('html/partials/04-boot.html');
const privacyPartial = read('html/partials/18-overlay-privacy.html');
const shell01 = read('js/modules/01-shell.js');
const dash02 = read('js/modules/02-dashboard.js');
const results06 = read('js/modules/06-results.js');
const lab08 = read('js/modules/08-lab.js');
const logShot05 = read('js/modules/05-log-shot.js');
const vault09 = read('js/modules/09-vault.js');
const app = read('js/gridnode-app.js');
const native = read('js/gridnode-native.js');
const fc = read('js/gridnode-firstcontact.js');
const wn = read('js/gridnode-whatsnew.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// --- 1. VAULT tab + Calendar inside RESULTS -----------------------------
check('visible VAULT bottom-nav item exists (not hidden)',
  /id="navVault"/.test(app05) && !/id="navVault"[^>]*gn-nav-hidden/.test(app05));
check('VAULT tab labels the section (nav.vault in EN + ES)',
  en['nav.vault'] === 'VAULT' && es['nav.vault'] === 'VAULT');
check('showPage maps Profile to navVault, no Cal/navCal/navPro refs',
  /Profile: 'navVault'/.test(shell01) && !/navPro/.test(shell01) && !/navCal/.test(shell01) && !/'Cal'/.test(shell01));
check('standalone pageCal markup is gone',
  !/id="pageCal"/.test(app05));
check('pageCal removed from native PAGE_NAMES',
  !/pageCal/.test(native));
check('RESULTS has CHARTS | CALENDAR toggle wired to setResultsView',
  /data-results-view="charts"/.test(app05) && /data-results-view="calendar"/.test(app05) &&
  /onclick="setResultsView\('charts'\)"/.test(app05) && /onclick="setResultsView\('calendar'\)"/.test(app05));
check('results view labels exist in EN + ES',
  en['results.viewCharts'] && es['results.viewCharts'] && en['results.viewCalendar'] && es['results.viewCalendar']);
check('setResultsView exported and bridged to window',
  /export function setResultsView/.test(results06) && /'setResultsView'/.test(app));
check('renderResults restores the active RESULTS view',
  /setResultsView\(moduleState\.resultsView/.test(results06));
check('dashboard goal card points at navVault',
  dash02.includes("getElementById(\\'navVault\\')") || dash02.includes("getElementById('navVault')"));

// --- 2. Boot skip --------------------------------------------------------
check('boot sequence aborts on any tap (pointerdown skip flag)',
  /bootEl\.addEventListener\('pointerdown', markBootSkipped/.test(app) && /let bootSkipped = false/.test(app) &&
  /if \(bootSkipped\) break/.test(app));
check('TAP TO SKIP hint in boot markup with i18n key',
  /data-i18n="boot\.tapToSkip"/.test(boot04));
check('boot.tapToSkip translated in EN + ES',
  en['boot.tapToSkip'] === 'TAP TO SKIP' && es['boot.tapToSkip'] === 'TOCA PARA OMITIR');

// --- 3. Local entry lands on HOME ----------------------------------------
check('showApp forces showPage(\'Dash\') before loadApp',
  /modules\.showPage\('Dash'\);?\s*\n\s*modules\.loadApp\(\)/.test(app));

// --- 4. VAULT replay-tour control -----------------------------------------
check('replayGuidedTour exported and calls the tour engine',
  /export function replayGuidedTour/.test(lab08) && /GN_FIRSTCONTACT\?\.restart/.test(lab08));
check('VAULT hub has an explicit REPLAY TOUR row',
  /onclick="replayGuidedTour\(\)"/.test(lab08) && /data-i18n="vault\.replayTour"/.test(lab08));
check('vault.replayTour translated in EN + ES',
  en['vault.replayTour'] === 'Replay Tour' && es['vault.replayTour'] === 'Repetir tour');
check('obsolete dynamic replay injection is retired',
  !/new MutationObserver\(injectReplay\)/.test(fc));
check('replayGuidedTour bridged to window',
  /'replayGuidedTour'/.test(app));

// --- 5. Privacy policy ----------------------------------------------------
check('privacy overlay partial exists with policy sections',
  /id="gnPrivacyOverlay"/.test(privacyPartial) && /data-i18n="privacy\.localFirstTitle"/.test(privacyPartial) &&
  /data-i18n="privacy\.exportTitle"/.test(privacyPartial) && /data-i18n="privacy\.deleteTitle"/.test(privacyPartial) &&
  /data-i18n="privacy\.notASourceTitle"/.test(privacyPartial));
check('openPrivacyPolicy/closePrivacyPolicy exported and bridged',
  /export function openPrivacyPolicy/.test(vault09) && /export function closePrivacyPolicy/.test(vault09) &&
  /'openPrivacyPolicy'/.test(app) && /'closePrivacyPolicy'/.test(app));
check('landing footer PRIVACY opens the policy overlay',
  /onclick="openPrivacyPolicy\(\);return false"/.test(landing03) && /data-i18n="landing\.footerPrivacy"/.test(landing03));
check('VAULT YOUR DATA links the privacy policy',
  /onclick="openPrivacyPolicy\(\)"/.test(lab08) && /data-i18n="vault\.privacyPolicy"/.test(lab08));
check('privacy policy fully translated in EN + ES',
  en['privacy.title'] === 'PRIVACY POLICY' && es['privacy.title'] === 'POLÍTICA DE PRIVACIDAD' &&
  en['privacy.localFirstBody'] && es['privacy.localFirstBody'] && en['privacy.close'] === 'CLOSE' && es['privacy.close'] === 'CERRAR');

// --- 6. Not-a-source disclaimer (EN + ES) ----------------------------------
check('not-a-source disclaimer on landing in markup',
  /data-i18n="landing\.notASource"/.test(landing03));
check('not-a-source disclaimer translated in EN + ES',
  /does not sell, source, or facilitate peptide purchases/.test(en['landing.notASource']) &&
  /no vende, consigue ni facilita la compra de péptidos/.test(es['landing.notASource']));
check('medical-advice disclaimer still present (boundaryCopy2)',
  en['landing.boundaryCopy2'] && /not a doctor/i.test(en['landing.boundaryCopy2']));

// --- 7. No raw medication slugs in RESULTS --------------------------------
check('RESULTS uses medicationLabel (no raw .med interpolation in templates)',
  /medicationLabel\(/.test(results06) && !/\$\{[^}]*shot\.med[^a-zA-Z][^}]*\}/.test(results06.replace(/medicationLabel\(shot\.med\)/g, '')));
check('RESULTS has no literal slug-looking medication interpolations',
  !/\$\{(shot|entry|record)\.medication\}/.test(results06));

// --- 8. Entry funnel discipline -------------------------------------------
check('landing has no competing entry door (CONTINUE LOCALLY gone)',
  !/continueLocallyFromWelcome/.test(landing03) && !/landing-local-link/.test(landing03));
check('EXPLORE demoted to a quiet text anchor',
  /class="landing-explore-link"[^>]*data-i18n="landing\.explore"/.test(landing03) &&
  !/landing-btn secondary[^>]*data-i18n="landing\.explore"/.test(landing03));
check('no pre-commit theme config on landing',
  !/landing-theme-toggle-host/.test(landing03));
check('theme lives in the VAULT hub TOOLS section',
  /gn-theme-toggle-host/.test(lab08) && /data-i18n="vault\.theme"/.test(lab08));
check('auth screen makes the local-vs-cloud choice plain-language',
  /data-i18n="auth\.cloudHint"/.test(app) && /data-i18n="auth\.localHint"/.test(app) &&
  /Sync with Google/.test(en['auth.cloudHint']) && /nothing leaves this phone/i.test(en['auth.localHint']) &&
  es['auth.cloudHint'] && es['auth.localHint']);
check('auth policy link opens the full privacy policy',
  /\$\('gnVaultPolicyLink'\)\?\.addEventListener\('click', openPrivacyPolicy\)/.test(app) &&
  !/function showVaultPolicy/.test(app));

// --- 9. SCOPE replaces BOUNDARY --------------------------------------------
check('boundaryLabel is SCOPE / ALCANCE',
  en['landing.boundaryLabel'] === 'SCOPE' && es['landing.boundaryLabel'] === 'ALCANCE');

// --- 10. Tour: 3 beats (v0.15.43 simplicity cut) ------------------------------
check('tour is 3 beats',
  /var BEATS = 3;/.test(fc));

// --- 11. Version agreement + whatsnew --------------------------------------
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const verJs = read('js/gridnode-version.js');
const appVer = (verJs.match(/APP_VERSION:\s*'([^']+)'/) || [])[1];
const semver = (verJs.match(/semver:\s*'([^']+)'/) || [])[1];
check('package.json version is 0.15.43', pkg.version === '0.15.43', pkg.version);
check('package-lock root version matches', lock.version === pkg.version && lock.packages[''].version === pkg.version);
check('gridnode-version.js APP_VERSION/semver match package.json', appVer === pkg.version && semver === pkg.version);
check('whatsnew placeholder rewritten for 0.15.43',
  /'__CURRENT_BUILD__': \{\s*\n?\s*version: '0\.15\.43'/.test(wn));
check('whatsnew no longer invents a TRENDS tab',
  !/TRENDS/.test(wn));

// --- 12. Spanish-leftover guards --------------------------------------------
check('measurement spinbutton aria-labels refresh on render',
  /field\.setAttribute\('aria-label', tx\(key, label\)\)/.test(lab08));
check('shot-form step headers carry data-i18n for live language refresh',
  /data-gn-shot-step="timing" data-i18n="shot\.timing"/.test(logShot05) &&
  /data-gn-shot-step="location" data-i18n="shot\.location"/.test(logShot05));
check('shot.timeHelp teaches the p-shorthand in EN + ES',
  /typing p picks PM/.test(en['shot.timeHelp']) && /escribir p elige PM/.test(es['shot.timeHelp']));
check('landing wedge line translated in EN + ES',
  /real stack/.test(en['landing.realStack']) && /stack real/.test(es['landing.realStack']) &&
  /data-i18n-html="landing\.realStack"/.test(landing03));

console.log(failures === 0 ? '\nALL v0.15.42 CONTRACT CHECKS PASSED (0.15.43)' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
