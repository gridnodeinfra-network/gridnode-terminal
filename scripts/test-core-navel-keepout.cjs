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

const modulesJs = fs.readFileSync(path.join(root, 'js/gridnode-modules.js'), 'utf8');
assert.match(
  modulesJs,
  /qa\('\.scanner-keepout-legend'\)\.forEach\(legend => \{\s*legend\.hidden = moduleState\.scannerMode !== 'core';/,
  'setScannerMode must hide the navel keep-out legend on LEGS and ARMS views (CORE-only)'
);

const bundleJs = fs.readFileSync(path.join(root, 'js/gridnode-bundle.js'), 'utf8');
assert.match(
  bundleJs,
  /legend\.hidden = moduleState\.scannerMode !== 'core'/,
  'served bundle must carry the CORE-only keep-out legend gating'
);

assert.ok(
  fs.existsSync(path.join(root, 'assets/scanner/core/core-cinematic-no-navel.webp')),
  'clean CORE substrate must ship with the preview'
);

console.log('PASS: CORE navel keep-out contract');
