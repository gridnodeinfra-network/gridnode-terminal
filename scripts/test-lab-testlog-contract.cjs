#!/usr/bin/env node
/* GRID//NODE lab-test log (ASSAY) contract test.
 *
 * Verifies the pure logic in js/gridnode-lab-tests.js:
 *  - labTestVariance() derives (measured - claim) / claim, null when inputs missing
 *  - labTestVarianceBand() greens within ±5%, ambers within ±10%, reds beyond
 *  - validateLabTest() requires peptide + vendor + testDate, nothing else
 *  - methodLabel()/endotoxinLabel() cover every enum value
 *
 * Exit 0 = contract holds. Exit 1 = violation.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };

function makeEnv() {
  const listeners = {};
  global.window = {
    GNModules: {},
    GN_MEDICATION_IDENTITY: { ids: [], normalize: (v) => v, label: (v) => v },
    setTimeout() {},
  };
  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => { throw new Error('no DOM in contract test'); },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    body: { appendChild() {} },
  };
}

function loadModule() {
  makeEnv();
  const src = readFileSync(join(ROOT, 'js', 'gridnode-lab-tests.js'), 'utf8');
  eval(src);
  return global.window.GN_ASSAY;
}

const A = loadModule();
if (!A) { fail('GN_ASSAY namespace exposed'); process.exit(1); }
ok('GN_ASSAY namespace exposed');

// ── variance ──
{
  const v = A.labTestVariance({ measuredMg: 9.7, labelClaimMg: 10 });
  Math.abs(v - -0.03) < 1e-9 ? ok('variance (9.7 vs 10mg) = -3%') : fail(`variance expected -0.03 got ${v}`);
  const v2 = A.labTestVariance({ measuredMg: 10.5, labelClaimMg: 10 });
  Math.abs(v2 - 0.05) < 1e-9 ? ok('variance (10.5 vs 10mg) = +5%') : fail(`variance expected 0.05 got ${v2}`);
  A.labTestVariance({ measuredMg: 9.7, labelClaimMg: null }) === null ? ok('variance null when claim missing') : fail('variance should be null without claim');
  A.labTestVariance({ measuredMg: null, labelClaimMg: 10 }) === null ? ok('variance null when measured missing') : fail('variance should be null without measured');
  A.labTestVariance({ measuredMg: 9.7, labelClaimMg: 0 }) === null ? ok('variance null when claim is zero') : fail('variance should be null on zero claim');
}

// ── bands ──
{
  A.labTestVarianceBand(0.03) === 'green' ? ok('band green within ±5%') : fail('band: 3% should be green');
  A.labTestVarianceBand(-0.05) === 'green' ? ok('band green at exactly 5%') : fail('band: 5% should be green');
  A.labTestVarianceBand(0.08) === 'amber' ? ok('band amber within ±10%') : fail('band: 8% should be amber');
  A.labTestVarianceBand(-0.10) === 'amber' ? ok('band amber at exactly 10%') : fail('band: 10% should be amber');
  A.labTestVarianceBand(0.101) === 'red' ? ok('band red beyond 10%') : fail('band: 10.1% should be red');
  A.labTestVarianceBand(null) === null ? ok('band null for null input') : fail('band should be null for null');
}

// ── validation ──
{
  const good = A.validateLabTest({ peptide: 'tirzepatide_compound', vendor: 'Vendor X', testDate: '2026-09-09' });
  good.ok ? ok('validation passes with peptide+vendor+date') : fail('validation should pass');
  const noPeptide = A.validateLabTest({ peptide: '', vendor: 'Vendor X', testDate: '2026-09-09' });
  !noPeptide.ok && noPeptide.errors.includes('peptide') ? ok('validation rejects missing peptide') : fail('validation should flag peptide');
  const noVendor = A.validateLabTest({ peptide: 'bpc157', vendor: '  ', testDate: '2026-09-09' });
  !noVendor.ok && noVendor.errors.includes('vendor') ? ok('validation rejects blank vendor') : fail('validation should flag vendor');
  const noDate = A.validateLabTest({ peptide: 'bpc157', vendor: 'Vendor X', testDate: '' });
  !noDate.ok && noDate.errors.includes('testDate') ? ok('validation rejects missing date') : fail('validation should flag testDate');
  const minimal = A.validateLabTest({ peptide: 'bpc157', vendor: 'V', testDate: '2026-01-01', purityPct: null, notes: '' });
  minimal.ok ? ok('validation allows everything else optional') : fail('validation should allow optional fields empty');
}

// ── labels cover every enum ──
{
  const methods = ['hplc', 'ms', 'hplc_ms', 'coa', 'other'];
  const labels = methods.map((m) => A.methodLabel(m));
  labels.every((l) => l && l !== '—') ? ok('methodLabel covers all 5 methods') : fail('methodLabel missing a method');
  const endo = ['pass', 'fail', 'untested'].map((e) => A.endotoxinLabel(e));
  endo.every((l) => l && l !== '—') ? ok('endotoxinLabel covers all 3 states') : fail('endotoxinLabel missing a state');
}

console.log(failures === 0 ? 'lab-testlog-contract OK' : `lab-testlog-contract FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
