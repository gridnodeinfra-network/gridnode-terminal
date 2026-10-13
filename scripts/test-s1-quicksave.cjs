/* S1 five-second logger contract test (static, no browser).
 * Verifies the QUICK REPEAT confirm path and the honest empty-state modes:
 *  1. Quick-confirm block exists in the log-shot partial with the right hooks.
 *  2. quickLogShot routes a complete last shot to openQuickConfirm.
 *  3. confirmQuickShot reuses saveShot() (no duplicated commit logic).
 *  4. CSS hides the full form in quick mode.
 *  5. Hydration status is tracked; dashboard distinguishes
 *     first-shot / syncing / sync-failed.
 *  6. New i18n keys exist in en + es-419.
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

console.log('S1 five-second logger contract:');

const partial06 = read('html/partials/06-overlay-log-shot.html');
const styles12 = read('html/partials/12-styles-polish-patches.html');
const logshot05 = read('js/modules/05-log-shot.js');
const dash02 = read('js/modules/02-dashboard.js');
const appJs = read('js/gridnode-app.js');
const bundle = read('js/gridnode-bundle.js');
// 2026-10-12 code-split delivery change: module 05 (log-shot) no longer ships
// in the core bundle; it is emitted as the lazy logshot chunk, loaded on
// demand by js/gridnode-chunk-loader.js.
const chunkLogshot = read('js/gridnode-chunk-logshot.js');
const chunkLoader = read('js/gridnode-chunk-loader.js');
const buildBundle = read('scripts/build-bundle.sh');
const en = JSON.parse(read('i18n/en.json'));
const es = JSON.parse(read('i18n/es-419.json'));

// 1. Quick-confirm block
check('quick-confirm block in partial', partial06.includes('id="gnQuickConfirm"'));
check('quick-confirm summary hook', partial06.includes('id="gnQuickConfirmSummary"'));
check('quick-confirm fire calls confirmQuickShot', partial06.includes('onclick="confirmQuickShot()"'));
check('quick-confirm details calls quickConfirmDetails', partial06.includes('onclick="quickConfirmDetails()"'));
check('quick-confirm hidden by default', styles12.includes('#logOv #gnQuickConfirm{display:none}'));

// 2. FAB routing
check('quickLogShot routes to openQuickConfirm', logshot05.includes('openQuickConfirm(lastShot'));
check('incomplete prefill falls back to full modal', logshot05.includes('openLogModal({ preserve: true })'));
check('openQuickConfirm exported', /export function openQuickConfirm/.test(logshot05));
check('confirmQuickShot exported', /export function confirmQuickShot/.test(logshot05));
check('quickConfirmDetails exported', /export function quickConfirmDetails/.test(logshot05));

// 3. confirmQuickShot reuses saveShot (single commit path)
check('confirmQuickShot calls saveShot()', logshot05.includes('closeQuickConfirm();\n  saveShot();'));
const confirmBody = logshot05.slice(logshot05.indexOf('export function confirmQuickShot'));
const confirmEnd = confirmBody.indexOf('\n}\n');
const confirmFn = confirmBody.slice(0, confirmEnd);
check('no duplicated cloud write in confirmQuickShot', !confirmFn.includes('supabase') && !confirmFn.includes('cloudClient'));

// 4. Quick-mode CSS
check('quick-mode hides form scroll', styles12.includes('#logOv.gn-quick-mode .gn-shot-scroll'));
check('quick-mode hides action bar', styles12.includes('#logOv.gn-quick-mode .gn-shot-actionbar'));
check('quick-mode shows confirm', styles12.includes('#logOv.gn-quick-mode #gnQuickConfirm'));

// 5. Honest empty states
check('hydration tracked in completeCloudSession', appJs.includes("state.cloudHydration = 'pending'") && appJs.includes("state.cloudHydration = hydration.ok ? 'ok' : 'failed'"));
check('dashboard computes mission mode', dash02.includes("missionMode = state.cloudHydration === 'failed' ? 'sync-failed' : 'syncing'"));
check('renderFirstShotMission handles sync-failed', dash02.includes("mode === 'sync-failed'"));
check('retryCloudHydration exported', /export async function retryCloudHydration/.test(dash02));
check('retry button wired', dash02.includes('onclick="retryCloudHydration()"'));

// 6. Delivery carries the new code
// 2026-10-12 code-split delivery change: the quick-confirm functions
// (module 05) moved out of the core bundle into js/gridnode-chunk-logshot.js.
// Assert them there as real function declarations, assert the chunk registers
// them with GNRegisterChunk (so GNModules consumers can reach them), assert
// they are gone from the core bundle, and assert the delivery wiring: the
// build emits the logshot chunk from module 05 and the chunk loader has a
// logshot manifest entry. The loader does NOT stub the quick-confirm names
// directly (verified in the loader source); it stubs the logshot entry
// points that gate them (openLogModal / handleShotFab / saveShot), which
// load the logshot composite before the confirm UI can be reached, so
// assert those stubs instead. The core-bundle functions stay in the bundle.
for (const fn of ['openQuickConfirm', 'confirmQuickShot', 'quickConfirmDetails']) {
  check('logshot chunk contains ' + fn, chunkLogshot.includes('function ' + fn));
  check('logshot chunk registers ' + fn, chunkLogshot.includes(fn + ':' + fn) && chunkLogshot.includes("GNRegisterChunk('logshot'"));
  check('core bundle no longer contains ' + fn, !bundle.includes('function ' + fn));
}
check('build emits logshot chunk from module 05', buildBundle.includes('"logshot": ["05-log-shot.js"]'));
check('loader manifest has logshot entry', chunkLoader.includes("logshot: 'gridnode-chunk-logshot.js'"));
check('loader stubs logshot entry points', chunkLoader.includes("logshot: ['openLogModal', 'handleShotFab', 'closeLog', 'saveShot'"));
for (const fn of ['renderFirstShotMission', 'retryCloudHydration']) {
  check('bundle contains ' + fn, bundle.includes('function ' + fn));
}

// 7. i18n keys
const keys = ['shot.quickRepeatKicker', 'shot.quickRepeatTitle', 'shot.changeDetails',
  'dashboard.syncingKicker', 'dashboard.syncingTitle', 'dashboard.syncingSub',
  'dashboard.syncFailedKicker', 'dashboard.syncFailedTitle', 'dashboard.syncFailedSub',
  'dashboard.retrySync'];
for (const k of keys) {
  check('i18n en has ' + k, typeof en[k] === 'string' && en[k].length > 0);
  check('i18n es has ' + k, typeof es[k] === 'string' && es[k].length > 0);
}

if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('S1 contract OK');
