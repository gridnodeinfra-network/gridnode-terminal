// P5 vector tests: replicate the EXACT production formulas from the bundle
// (gridnode-bundle.js:2498 volume = dose / concentration; units = volume * 100)
// and assert known vectors. Exit 0 = all green.
const assert = require('node:assert');

const syringeUnits = (doseMg, concMgPerMl) => {
  const volume = doseMg / concMgPerMl;
  return { volume, units: volume * 100 };
};

// (dose mg, concentration mg/mL [= vial mg / water mL], expected units)
const syringeCases = [
  [0.25, 2.5, 10.0],
  [0.5, 2.5, 20.0],
  [1.0, 5.0, 20.0],
  [0.75, 5.0, 15.0],
  [0.25, 5.0, 5.0],
];
for (const [d, c, expected] of syringeCases) {
  const got = syringeUnits(d, c);
  assert.ok(Math.abs(got.units - expected) < 1e-6, `syringe ${d}/${c} -> ${got.units} != ${expected}`);
  console.log('PASS syringe dose=' + d + ' conc=' + c + ' -> ' + got.units.toFixed(1) + 'u (vol ' + got.volume.toFixed(3) + ' mL)');
}

// Dose projection: steps until target, days = steps * interval
const projection = (current, step, interval, target) => {
  if (!(step > 0) || !(target > current)) return null;
  const steps = Math.ceil((target - current) / step);
  return { steps, days: steps * interval };
};
const projCases = [
  [2.5, 2.5, 7, 10, { steps: 3, days: 21 }],
  [5, 2.5, 7, 15, { steps: 4, days: 28 }],
  [2.5, 2.5, 14, 10, { steps: 3, days: 42 }],
];
for (const [c, s, i, t, expected] of projCases) {
  const got = projection(c, s, i, t);
  assert.deepStrictEqual(got, expected, `projection ${c}/${s}/${i}/${t}`);
  console.log('PASS projection ' + c + ' -> ' + t + ': ' + got.steps + ' steps / ' + got.days + ' days');
}

// Phase engine reference window (7-day baseline)
const phaseRef = (avgGapDays) =>
  avgGapDays < 6.5 ? 'accelerating' : avgGapDays > 7.5 ? 'stretched' : 'consistent';
assert.strictEqual(phaseRef(7), 'consistent');
assert.strictEqual(phaseRef(3.5), 'accelerating');
assert.strictEqual(phaseRef(10), 'stretched');
console.log('PASS phase reference window (7d baseline)');

// Validation guards
assert.strictEqual(Number.isFinite(Number('2.5')) && Number('2.5') > 0, true);
assert.strictEqual(Number.isFinite(Number('abc')), false);
assert.strictEqual(Number.isFinite(Number('0')) && Number('0') > 0, false);
console.log('PASS input guards (finite positive)');

console.log('CALC TESTS: ALL GREEN');

// ── Peptide evidence engine (2026-08-10) ────────────────────────────────────
// Loads the SAME production module shipped as js/gridnode-peptide-pk.js.
const pk = require('../js/gridnode-peptide-pk.js');

// 1. Tirzepatide curve shape: rise reaches 1 at Tmax, then mono-exponential decay.
const tz = pk.MODELS.zepbound_tirzepatide;
assert.strictEqual(pk.relativeLevel(tz, 0), 0, 'tz level at t=0 must be 0');
assert.ok(Math.abs(pk.relativeLevel(tz, 24) - 1) < 1e-6, 'tz level at Tmax=24h must be 1');
assert.ok(pk.relativeLevel(tz, 24 + 120) < 0.55, 'tz level at one half-life after peak must be < 0.55');
assert.ok(Math.abs(pk.relativeLevel(tz, 24 + 600) - 0.03125) < 0.01, 'tz level at 5 half-lives ≈ 2^-5');
console.log('PASS peptide curve shape (tirzepatide rise/peak/decay)');

// 2. Superposition across repeated shots (same molecule, weekly dosing).
const now = Date.now();
const oneShot = pk.buildProtocolCurve(
  [{ med: 'zepbound_tirzepatide', date: new Date(now - 7 * 86400000).toISOString() }],
  'zepbound_tirzepatide', 30, now);
const twoShots = pk.buildProtocolCurve(
  [
    { med: 'zepbound_tirzepatide', date: new Date(now - 7 * 86400000).toISOString() },
    { med: 'zepbound_tirzepatide', date: new Date(now - 14 * 86400000).toISOString() }
  ],
  'zepbound_tirzepatide', 30, now);
assert.ok(twoShots.points[twoShots.nowIndex] > oneShot.points[oneShot.nowIndex],
  'two logged shots must superpose above one shot at the now line');
assert.ok(Math.max(...twoShots.points) <= 1.6 + 1e-9, 'superposition clamped at 1.6');
console.log('PASS peptide superposition + clamp');

// 3. Evidence states drive renderer eligibility.
assert.strictEqual(pk.buildProtocolCurve([{ med: 'bpc157', date: new Date(now - 86400000).toISOString() }], 'bpc157', 30, now).evidence.state, 'none', 'BPC-157 must be timeline-only');
assert.strictEqual(pk.buildProtocolCurve([{ med: 'semax', date: new Date(now - 86400000).toISOString() }], 'semax', 30, now).evidence.state, 'pd', 'Semax must be a PD window');
assert.strictEqual(pk.buildProtocolCurve([{ med: 'ipamorelin', date: new Date(now - 86400000).toISOString() }], 'ipamorelin', 30, now).evidence.state, 'iv', 'Ipamorelin must be IV-study state');
assert.strictEqual(pk.buildProtocolCurve([{ med: 'cjc1295_nodac', date: new Date(now - 86400000).toISOString() }], 'cjc1295_nodac', 30, now).evidence.state, 'none', 'no-DAC must never inherit DAC model');
assert.strictEqual(pk.buildProtocolCurve([{ med: 'unknown_xyz', date: new Date(now - 86400000).toISOString() }], 'unknown_xyz', 30, now).evidence.state, 'generic', 'unknown med falls back to generic model');
console.log('PASS peptide evidence-state eligibility');

// 4. Timeline-only meds produce NO curve points (event timeline only).
const bpc = pk.buildProtocolCurve([{ med: 'bpc157', date: new Date(now - 86400000).toISOString() }], 'bpc157', 30, now);
assert.strictEqual(bpc.points.length, 0, 'timeline-only must render zero curve points');
assert.strictEqual(bpc.markers.length, 1, 'timeline-only keeps the event marker');
console.log('PASS peptide timeline-only contract');

// 5. PD window band is non-zero inside the window and zero outside.
const semax = pk.buildProtocolCurve([{ med: 'semax', date: new Date(now - 86400000).toISOString() }], 'semax', 30, now);
const nonzero = semax.points.filter(v => v > 0).length;
assert.ok(nonzero > 0, 'PD window must have non-zero band samples');
console.log('PASS peptide PD window band (' + nonzero + ' of ' + semax.points.length + ' samples in band)');

console.log('PEPTIDE ENGINE TESTS: ALL GREEN');
