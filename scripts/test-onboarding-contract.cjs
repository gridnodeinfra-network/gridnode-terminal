/* ONBOARDING REBORN contract (DESIGN §5.4): the scrap is complete,
 * the new engine is wired exactly where First Contact was, the compat
 * surface (alias, event, v2 mirrors, stamp) is intact, whatsnew keeps
 * its release-workflow contract (§5.4 re-pinned 2026-10-14: the
 * byte-identity pin was retired with cause, see the §5.4 block below),
 * and the visual guide's structural invariants hold in source.
 * Run: node scripts/test-onboarding-contract.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

async function main() {
  /* ---- the scrap (§5.4 deletion list) ---- */
  assert.equal(exists('js/gridnode-firstcontact.js'), false, 'old FC engine must be deleted');
  assert.equal(exists('css/native/04-first-contact.css'), false, 'old FC stylesheet must be deleted');
  assert.equal(exists('scripts/test-firstcontact-contract.cjs'), false, 'old FC contract must be replaced');

  /* ---- sweep: no firstcontact / gn-fc / fc. references in source ----
   * Permitted (§5.4): the alias + compat event in gridnode-onboarding.js,
   * and the untouched consumers gridnode-whatsnew.js / modules/08-lab.js. */
  const sweepDirs = ['js', 'html', 'css'];
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(js|html|css|json)$/.test(entry.name)) continue;
      const rel = path.relative(root, p).replace(/\\/g, '/');
      /* generated chunk bundles are build outputs of js/modules (whose
       * sources are swept directly), same category as dist/ */
      if (/^js\/gridnode-chunk-.*\.js$/.test(rel)) continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/gn-fc/.test(line)) offenders.push(`${rel}:${i + 1} gn-fc`);
        if (/firstcontact/i.test(line)) {
          const permitted =
            (rel === 'js/gridnode-onboarding.js' && /GN_FIRSTCONTACT|gn:firstcontact-done/.test(line)) ||
            rel === 'js/gridnode-whatsnew.js' ||
            rel === 'js/modules/08-lab.js';
          // the engine header comment may describe the replacement once
          const docLine = rel === 'js/gridnode-onboarding.js' && i < 30 && /Replaces|scrapped/.test(line);
          if (!permitted && !docLine) offenders.push(`${rel}:${i + 1} firstcontact`);
        }
        if (/(^|[^a-zA-Z])fc\./.test(line) && rel !== 'js/gridnode-whatsnew.js') {
          offenders.push(`${rel}:${i + 1} fc.`);
        }
      });
    }
  }
  sweepDirs.forEach((d) => walk(path.join(root, d)));
  assert.deepEqual(offenders, [], `straggler references remain:\n${offenders.join('\n')}`);

  /* ---- catalogs: fc gone, ob present with exact parity (64) ---- */
  const en = JSON.parse(read('i18n/en.json'));
  const es = JSON.parse(read('i18n/es-419.json'));
  assert.equal(Object.keys(en).some((k) => k.startsWith('fc')), false, 'fc keys remain in en');
  assert.equal(Object.keys(es).some((k) => k.startsWith('fc')), false, 'fc keys remain in es-419');
  const enOb = Object.keys(en).filter((k) => k.startsWith('ob.')).sort();
  const esOb = Object.keys(es).filter((k) => k.startsWith('ob.')).sort();
  assert.equal(enOb.length, 64, `EN must carry exactly 64 ob.* keys, found ${enOb.length}`);
  assert.deepEqual(enOb, esOb, 'ob.* keys must have exact EN<->ES parity');
  for (const k of enOb) {
    assert.ok(String(en[k]).trim().length > 0, `EN catalog empty at ${k}`);
    assert.ok(String(es[k]).trim().length > 0, `ES catalog empty at ${k}`);
  }

  /* ---- loader: manifest + deferred batch, same slot before whatsnew ---- */
  const loader = read('js/gridnode-chunk-loader.js');
  assert.match(loader, /onboarding:\s*'gridnode-onboarding\.js'/, 'chunk manifest must map onboarding');
  assert.match(loader, /await GNLoadScript\('onboarding'\)/, 'deferred batch must load onboarding');
  const partials = fs.readdirSync(path.join(root, 'html/partials'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => read(path.join('html/partials', f))).join('\n');
  assert.doesNotMatch(partials, /gridnode-onboarding\.js/, 'onboarding must not be a static script tag');
  assert.match(partials, /gridnode-i18n\.js/, 'i18n stays a static script tag');

  /* ---- CSS / SW wiring ---- */
  const order = JSON.parse(read('css/native/order.json'));
  assert.equal(order[5], '04-onboarding.css', 'onboarding CSS keeps the old file\'s cascade slot (index 5)');
  assert.ok(!order.includes('04-first-contact.css'), 'old CSS must leave the bundle order');
  assert.match(read('js/gridnode-native.js'), /'04-onboarding\.css'/, 'injectCss must swap to onboarding CSS');
  assert.match(partials, /css\/native\/04-onboarding\.css/, 'head must link the onboarding stylesheet');
  const sw = read('sw.js');
  assert.match(sw, /css\/native\/04-onboarding\.css/, 'SW shell must precache the onboarding stylesheet');
  assert.doesNotMatch(sw, /04-first-contact\.css/, 'SW shell must drop the old stylesheet');

  /* ---- engine source: API, alias, state, mirrors ---- */
  const engine = read('js/gridnode-onboarding.js');
  assert.match(engine, /window\.GN_ONBOARDING = Object\.freeze/, 'GN_ONBOARDING API must be defined');
  assert.match(engine, /window\.GN_FIRSTCONTACT = window\.GN_ONBOARDING/, 'compat alias must be the same object');
  assert.match(engine, /gn_onboarding_v3/, 'v3 state key must be written');
  assert.match(engine, /gn_ob_session_v1/, 'session flag must be written');
  assert.match(engine, /gn_onboarding_v2/, 'v2 complete mirror must be written');
  assert.match(engine, /gn_onboarding_dismissed_v2/, 'v2 dismissed mirror must be written');
  assert.match(engine, /'guide'/, "mid-guide state 'guide' must be recorded");
  assert.match(engine, /gn:onboarding-done/, 'new done event must dispatch');
  assert.match(engine, /gn:firstcontact-done/, 'compat done event must dispatch');
  assert.match(engine, /dataset\.gnFcDoseStart/, 'dose-start stamp must be preserved');
  assert.match(engine, /startWhenWhatsNewClears/, 'F3 whatsnew deferral must be wired');
  assert.match(engine, /gn:whatsnew-resolved/, 'engine must release on the real gn:whatsnew-resolved event');
  assert.match(engine, /gn:whatsnew-dismissed/, 'engine must release on gn:whatsnew-dismissed');
  assert.match(engine, /shouldAutoShow/, 'engine must honor a pending whatsnew auto-show');
  assert.doesNotMatch(engine, /whatsnew-done|gn_whatsnew_seen_v1/, 'stale whatsnew contract names must not return');
  for (const key of ['ob.begin', 'ob.shot.cta', 'ob.curve.cta', 'ob.comfort.done', 'ob.done.cta', 'ob.guide.stepLog',
    'ob.guide.stepMed', 'ob.guide.stepDose', 'ob.guide.stepContinue', 'ob.guide.stepSite', 'ob.guide.stepSave',
    'ob.guide.blocked', 'ob.guide.openLog']) {
    assert.ok(engine.includes(`'${key}'`), `engine must reference ${key}`);
  }
  /* seven screens */
  for (const name of ['renderWelcome', 'renderLoop', 'renderMap', 'renderShot', 'renderPayoff', 'renderComfort', 'renderDone']) {
    assert.ok(engine.includes(`function ${name}`), `engine must define ${name}`);
  }

  /* ---- visual guide structural invariants (§2.7) ---- */
  assert.match(engine, /className = 'gn-ob-guide'/, 'guide root must carry .gn-ob-guide (the §5.3.1 guard target)');
  for (const pane of ['top', 'bottom', 'left', 'right']) {
    assert.ok(engine.includes(`data-pane="${pane}"`), `scrim pane ${pane} missing`);
  }
  const calloutTemplate = engine.slice(engine.indexOf('gn-ob-callout'), engine.indexOf('gn-ob-callout') + 400);
  assert.ok(calloutTemplate.includes('gn-ob-callout-skip'), 'callout must carry its Skip control');
  assert.doesNotMatch(calloutTemplate, /next|advance|data-ob-primary/i,
    'QA 14: the callout must contain NO advance control');
  assert.match(engine, /gn:shot-saved/, 'guide must complete G2e on the real save event');
  assert.match(engine, /gn:coach-save-blocked/, 'guide must surface save-blocked (§2.7.4)');
  assert.match(engine, /getBoundingClientRect/, 'spotlight must measure live targets');
  const css = read('css/native/04-onboarding.css');
  for (const sel of ['.gn-ob-guide', '.gn-ob-scrim', '.gn-ob-ring', '.gn-ob-callout', '.is-docked', '.gn-ob-check']) {
    assert.ok(css.includes(sel), `stylesheet missing ${sel}`);
  }
  assert.ok(css.includes('rgba(5, 5, 8, .78)'), 'DUSK scrim must be rgba(5,5,8,.78) (§2.7.1)');
  assert.ok(css.includes('rgba(28, 43, 49, .45)'), 'LIGHT scrim must be rgba(28,43,49,.45) (§2.7.1)');
  assert.doesNotMatch(css, /gn-fc|firstcontact/i, 'stylesheet must not reference the old system');
  assert.doesNotMatch(engine, /gn-fc/, 'engine must not reference the old class prefix');

  /* ---- wiring outside the new files (§5.3) ---- */
  assert.equal(exists('dist/js/gridnode-onboarding.js'), true, 'built dist must ship the new engine');
  assert.equal(exists('dist/js/gridnode-firstcontact.js'), false, 'built dist must not ship the scrapped engine');
  const modules = fs.readdirSync(path.join(root, 'js/modules')).filter((f) => f.endsWith('.js'))
    .map((f) => read(path.join('js/modules', f))).join('\n');
  assert.match(modules, /querySelector\('\.gn-ob-guide'\)/, '§5.3.1: blocked-event guard must target .gn-ob-guide');
  assert.match(modules, /gn:coach-save-blocked/, 'blocked event name must be unchanged');

  /* ---- whatsnew release contract (§5.4, RE-PINNED 2026-10-14) ----
   * The original §5.4 assertion pinned gridnode-whatsnew.js byte-identical
   * to base c2e85c1: its intent was that the onboarding rebuild must not
   * disturb the whatsnew consumer. That byte-pin collides with the
   * whatsnew RELEASE WORKFLOW contract, which requires the current entry
   * to be rewritten every release (first collision: c285e0a, changelog
   * 1.1.0). Retired with cause by the QA desk (same treatment as the
   * test-v01544 consoleSub retirement; see gridnode-qa regression-log.md)
   * and re-pinned to release mechanics: the file must compile, carry the
   * __CURRENT_BUILD__ release entry the build stamps, and keep emitting
   * the gn:whatsnew-resolved event the onboarding engine defers on. */
  const whatsnewSrc = read('js/gridnode-whatsnew.js');
  assert.doesNotThrow(() => new (require('node:vm').Script)(whatsnewSrc),
    'gridnode-whatsnew.js must compile');
  assert.match(whatsnewSrc, /__CURRENT_BUILD__/,
    'whatsnew must carry the __CURRENT_BUILD__ release entry (release workflow contract)');
  assert.match(whatsnewSrc, /gn:whatsnew-resolved/,
    'whatsnew must keep emitting gn:whatsnew-resolved (onboarding deferral contract)');

  /* ---- preserved consumers ---- */
  const native = read('js/gridnode-native.js');
  assert.match(native, /dataset\.gnFcDoseStart/, 'native.js must keep reading the draft stamp');
  assert.match(modules, /GN_FIRSTCONTACT\?\.restart/, 'VAULT replay must keep calling the alias');
  const logShot = read('js/modules/05-log-shot.js');
  assert.equal((logShot.match(/gn:shot-saved/g) || []).length, 1, 'gn:shot-saved must dispatch exactly once');
  assert.equal(exists('dist/index.html'), true, 'dist/index.html must exist (run npm run build)');
  const distChunk = read('dist/js/gridnode-chunk-logshot.js');
  assert.ok(distChunk.includes("querySelector('.gn-ob-guide')"), 'built logshot chunk must contain the §5.3.1 guard');

  console.log('onboarding contract: OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
