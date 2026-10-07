/* S4 HISTORY subviews contract test (static, no browser).
 * Verifies the interim ALL / SHOTS / WEIGHT subviews:
 *  1. Markup: type filter buttons with data-history-type (all/shots/weight).
 *  2. State: moduleState.historyType defaults to 'all'.
 *  3. Wiring: setHistoryType defined + delegated click handler for [data-history-type].
 *  4. SHOTS path keeps existing behavior (filters, active/archived toggle).
 *  5. Storage untouched: no writes to shots/weights stores in the history module;
 *     no TimelineEvent union abstraction yet (S5 work).
 *  6. i18n en + es parity for history.* keys.
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

console.log('S4 HISTORY subviews contract:');

const app05 = read('html/partials/05-app.html');
const shared = read('js/modules/00-shared.js');
const history = read('js/modules/03-shots-history.js');
const misc = read('js/modules/11-misc.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1. Markup
check('type filter container', app05.includes('id="historyTypeFilter"'));
check('ALL button', app05.includes('data-history-type="all"'));
check('SHOTS button', app05.includes('data-history-type="shots"'));
check('WEIGHT button', app05.includes('data-history-type="weight"'));
check('type buttons reuse toggle styling', ['all', 'shots', 'weight'].every(t => new RegExp(`<button class="shot-history-toggle[^"]*" type="button" data-history-type="${t}"`).test(app05)));
check('type filter sits above shot controls', app05.indexOf('id="historyTypeFilter"') < app05.indexOf('id="shotHistoryControls"'));

// 2. State
check("historyType defaults to 'all'", shared.includes("historyType: 'all'"));

// 3. Wiring
check('setHistoryType defined', history.includes('export function setHistoryType'));
check('setHistoryType validates input', history.includes("type === 'weight' ? 'weight' : type === 'shots' ? 'shots' : 'all'"));
check('delegated click for [data-history-type]', misc.includes("[data-history-type]") && misc.includes('setHistoryType('));
check('type tabs sync active class', history.includes("[data-history-type]") && history.includes("button.dataset.historyType === historyType"));

// 4. SHOTS path keeps existing behavior
check('shots path keeps filters', history.includes('ensureShotHistoryFilters()'));
check('shots path keeps filterShots', history.includes('filterShots('));
check('shots path keeps archived toggle sync', history.includes("[data-shot-history-view]"));
check('shot-only chrome hidden outside SHOTS', history.includes("setDisplay('shotHistoryControls', shotsChrome"));

// 5. Storage untouched / no premature union
check('no shots store writes in history module', !history.includes("S.set('shots'"));
check('no weights store writes in history module', !history.includes("S.set('weights'"));
check('no TimelineEvent union yet', !/(function|class|const|let|var)\s+TimelineEvent|new TimelineEvent|TimelineEvent\s*\(/.test(history));
check('weight renderer exists', history.includes('function renderWeightHistory'));
check('all-view renderer exists', history.includes('function renderAllHistory'));
check('weight card builder exists', history.includes('function weightCardHtml'));
check('shot card builder reused', history.includes('function shotCardHtml'));
check('all view interleaves by date desc', history.includes('.sort((a, b) => b.t - a.t)'));
check('weight empty state offers LOG WEIGHT', history.includes('openWeightModal()'));

// 6. i18n parity
const keys = ['history.typeAll', 'history.typeShots', 'history.typeWeight', 'history.typeFilterAria', 'history.noWeights', 'history.noWeightsSub', 'history.logWeight', 'history.loggedWithShot', 'history.manualEntry', 'history.allEmptyTitle', 'history.allEmptySub'];
const expectedEn = { 'history.typeAll': 'ALL', 'history.typeShots': 'SHOTS', 'history.typeWeight': 'WEIGHT' };
const expectedEs = { 'history.typeAll': 'TODO', 'history.typeShots': 'DOSIS', 'history.typeWeight': 'PESO' };
keys.forEach(key => {
  check('en has ' + key, typeof en[key] === 'string' && en[key].length > 0);
  check('es has ' + key, typeof es[key] === 'string' && es[key].length > 0);
});
Object.entries(expectedEn).forEach(([key, value]) => check('en ' + key + ' = ' + value, en[key] === value));
Object.entries(expectedEs).forEach(([key, value]) => check('es ' + key + ' = ' + value, es[key] === value));

if (failures) { console.error(`\n${failures} S4 contract check(s) failed.`); process.exit(1); }
console.log('\nS4 contract: all checks passed.');
