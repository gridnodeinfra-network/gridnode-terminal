/* S2 trust-grammar contract test (static, no browser).
 * Verifies the semantic system: tokens, badge component, copy rules,
 * and application to the highest-risk surfaces (phase hero, protocol curve).
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

console.log('S2 trust-grammar contract:');

const head01 = read('html/partials/01-head.html');
const tail15 = read('html/partials/15-styles-tail.html');
const app05 = read('html/partials/05-app.html');
const dash02 = read('js/modules/02-dashboard.js');
const misc11 = read('js/modules/11-misc.js');
const bundle = read('js/gridnode-bundle.js');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1. Tokens exist and are structural (not color-only)
for (const t of ['--trust-recorded-accent', '--trust-estimate-accent', '--trust-plan-accent',
  '--trust-recorded-border', '--trust-estimate-border', '--trust-plan-border']) {
  check('token ' + t, head01.includes(t));
}
// 2. Badge component: structural treatments differ per kind
check('recorded badge is solid', /gn-trust-recorded\{[^}]*border:1px solid/.test(tail15));
check('estimate badge is dashed', /gn-trust-estimate\{[^}]*border:1px dashed/.test(tail15));
check('plan badge is outlined', /gn-trust-plan\{[^}]*background:transparent/.test(tail15));
check('estimate ring halo is dashed', tail15.includes('.gn-phase-ring-estimate::after') && tail15.includes('border:1.5px dashed'));
// 3. trustBadge helper: system owns semantics, misuse is annoying
check('trustBadge exported', /export function trustBadge/.test(misc11));
check('trustBadge rejects unknown kinds', misc11.includes("if (!TRUST_BADGE_LABELS[key]) return ''"));
check('trustBadge uses tx for labels', misc11.includes("tx('trust.' + key"));
check('approxPct rounds to 5 with tilde', /export function approxPct/.test(misc11) && misc11.includes("'~' + (Math.round(n / 5) * 5)"));
// 4. Phase hero: estimate treatment
check('phase card declares data-trust estimate', dash02.includes("phaseCard.setAttribute('data-trust', 'estimate')"));
check('phase hero inserts estimate badge', dash02.includes("trustBadge('estimate')"));
check('ring gets estimate halo class', dash02.includes("classList.add('gn-phase-ring-estimate')"));
check('ringPct uses approximate language', dash02.includes("'~{pct}% CYCLE POSITION'"));
check('cyclePct uses approximate language', dash02.includes("'~{pct} of 7-day reference cycle'"));
check('no Math.round(x*100) false precision left in phase', !dash02.includes('Math.round(cyclePosition * 100)'));
check('empty phase clears trust treatment', dash02.includes("removeAttribute('data-trust')"));
// 5. Protocol curve: structural estimate treatment (copy was already honest)
check('phase curve card has estimate surface', app05.includes('id="phaseCurveCard"') && app05.includes('gn-trust-surface-estimate'));
check('phase curve card declares data-trust', /id="phaseCurveCard"[^>]*data-trust="estimate"/.test(app05));
// 6. Bundle carries it
for (const fn of ['trustBadge', 'approxPct', 'approxNum']) {
  check('bundle contains ' + fn, bundle.includes('function ' + fn));
}
// 7. i18n
for (const k of ['trust.recorded', 'trust.estimate', 'trust.plan']) {
  check('i18n en has ' + k, typeof en[k] === 'string' && en[k].length > 0);
  check('i18n es has ' + k, typeof es[k] === 'string' && es[k].length > 0);
}

if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('S2 contract OK');
