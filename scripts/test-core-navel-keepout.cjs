const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const coreStage = html.match(/<div class="biotech-stage active" data-view="core"[\s\S]*?<\/svg>/)?.[0];
assert.ok(coreStage, 'CORE scanner SVG must exist');

assert.match(
  coreStage,
  /src="assets\/scanner\/core\/core-cinematic-no-navel\.webp"/,
  'CORE must use the clean substrate without the recessed bullseye mark'
);

const keepout = coreStage.match(/<circle class="zone-excluded"([^>]*)\/>/)?.[1] || '';
assert.match(keepout, /\bcx="500"/, 'keep-out ring must stay centered horizontally');
assert.match(keepout, /\bcy="730"/, 'keep-out ring must align with the approved natural navel position');
assert.match(keepout, /\br="70"/, 'keep-out ring must visibly represent the 2 in / 5 cm boundary');
assert.match(keepout, /\baria-hidden="true"/, 'keep-out ring must not be announced as a selectable site');
assert.match(keepout, /\bpointer-events="none"/, 'keep-out ring must never receive injection-site taps');

assert.match(
  html,
  /2 IN \/ 5 CM NAVEL KEEP-OUT/,
  'scanner legend must explain the red ring without making it look selectable'
);

assert.match(
  html,
  /\.scanner-keepout-legend\[hidden\]\{display:none\}/,
  'keep-out legend must honor the hidden attribute (its display:flex would otherwise override it)'
);

const modulesJs = require('./read-modules-source.cjs');
assert.match(
  modulesJs,
  /qa\('\.scanner-keepout-legend'\)\.forEach\(legend => \{\s*legend\.hidden = moduleState\.scannerMode !== 'core';/,
  'setScannerMode must hide the navel keep-out legend on LEGS and ARMS views (CORE-only)'
);

// 2026-10-12 code-split delivery change: module 04 (scanner) no longer ships
// in the core bundle; it is emitted as the lazy history chunk (modules 03+04)
// in js/gridnode-chunk-history.js. Assert the keep-out legend gating there,
// assert it is gone from the core bundle, and assert the build emits the
// history chunk from modules 03+04.
const bundleJs = fs.readFileSync(path.join(root, 'js/gridnode-bundle.js'), 'utf8');
const historyChunkJs = fs.readFileSync(path.join(root, 'js/gridnode-chunk-history.js'), 'utf8');
assert.match(
  historyChunkJs,
  /legend\.hidden = moduleState\.scannerMode !== 'core'/,
  'served history chunk must carry the CORE-only keep-out legend gating'
);
assert.ok(
  !/legend\.hidden = moduleState\.scannerMode !== 'core'/.test(bundleJs),
  'core bundle must no longer carry the scanner keep-out legend gating (it ships in the history chunk)'
);
const buildBundle = fs.readFileSync(path.join(root, 'scripts/build-bundle.sh'), 'utf8');
assert.ok(
  buildBundle.includes('"history": ["03-shots-history.js", "04-scanner.js"]'),
  'build must emit the history chunk from modules 03+04'
);

assert.ok(
  fs.existsSync(path.join(root, 'assets/scanner/core/core-cinematic-no-navel.webp')),
  'clean CORE substrate must ship with the preview'
);

console.log('PASS: CORE navel keep-out contract');
