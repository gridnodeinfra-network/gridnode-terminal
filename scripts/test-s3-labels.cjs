/* S3 IA-labels contract test (static, no browser).
 * Verifies the display-label rename (TODAY / HISTORY / PROGRESS):
 *  1. Nav labels renamed; element IDs and showPage routes untouched.
 *  2. Page headers aligned with nav.
 *  3. LAB / VAULT keep branded nouns with plain-language subtitles.
 *  4. i18n en + es parity for renamed keys.
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

console.log('S3 IA-labels contract:');

const app05 = read('html/partials/05-app.html');
const shell01 = read('js/modules/01-shell.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1. Nav labels renamed in markup fallbacks
check('nav HOME -> TODAY', app05.includes('data-i18n="nav.home">TODAY<'));
check('nav SHOTS -> HISTORY', app05.includes('data-i18n="nav.shots">HISTORY<'));
check('nav RESULTS -> PROGRESS', app05.includes('data-i18n="nav.results">PROGRESS<'));
check('nav LAB unchanged', app05.includes('data-i18n="nav.lab">LAB<'));
check('nav VAULT unchanged', app05.includes('data-i18n="nav.vault">VAULT</span>'));
// 2. Routes and element IDs untouched
check('showPage Dash route intact', app05.includes("showPage('Dash'"));
check('showPage Log route intact', app05.includes("showPage('Log'"));
check('showPage Results route intact', app05.includes("showPage('Results'"));
check('nav element IDs intact', ['navDash', 'navLog', 'navRes', 'navLab', 'navVault'].every(id => app05.includes(`id="${id}"`)));
check('shell route map untouched', shell01.includes("Dash: 'navDash'") && shell01.includes("Results: 'navRes'"));
// 3. Page headers aligned
check('dash header TODAY', app05.includes('data-i18n-html="dashboard.headingHtml"') && />TODAY</.test(app05));
check('log header HISTORY', app05.includes('data-i18n-html="shots.historyHeadingHtml">HISTORY<'));
check('results header PROGRESS', app05.includes('data-i18n-html="results.headingHtml">PROGRESS<'));
// 4. LAB / VAULT keep branded nouns with plain subtitles
check('lab keeps branded noun', app05.includes('data-i18n="lab.calcTitle"'));
check('lab has plain subtitle', app05.includes('data-i18n="lab.calcSub"'));
check('vault keeps branded noun', app05.includes('data-i18n="vault.pageTitle">VAULT<'));
check('vault has plain subtitle', app05.includes('data-i18n="vault.pageSub"'));
// 5. i18n values
const expected = { 'nav.home': ['TODAY', 'HOY'], 'nav.shots': ['HISTORY', 'HISTORIAL'], 'nav.results': ['PROGRESS', 'PROGRESO'] };
for (const [k, [enV, esV]] of Object.entries(expected)) {
  check(`i18n en ${k}=${enV}`, en[k] === enV);
  check(`i18n es ${k}=${esV}`, es[k] === esV);
}

if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('S3 contract OK');
