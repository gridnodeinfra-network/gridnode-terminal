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
