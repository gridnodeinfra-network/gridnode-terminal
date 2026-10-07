/* S5 unified-timeline contract test.
 * Static checks + behavioral verification of the TimelineEvent union:
 *  1. Union builders exist (toTimelineEvent, compareTimelineEvents, buildTimeline).
 *  2. ALL subview renders through buildTimeline; SHOTS/WEIGHT stay native.
 *  3. Storage models untouched (no writes in the history module).
 *  4. Behavioral: namespaced IDs, occurredAt/createdAt split, date-only
 *     precision preserved, deterministic sort
 *     (occurredAt DESC → createdAt DESC → type ASC → id ASC).
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

console.log('S5 unified-timeline contract:');

const history = read('js/modules/03-shots-history.js');

// 1+2. Static structure
check('toTimelineEvent defined', history.includes('function toTimelineEvent(record, type)'));
check('compareTimelineEvents defined', history.includes('function compareTimelineEvents(a, b)'));
check('buildTimeline defined', history.includes('function buildTimeline('));
check('ALL subview uses the union', /function renderAllHistory[\s\S]*?buildTimeline\(\)/.test(history));
check('WEIGHT subview stays native', history.includes('function renderWeightHistory'));
check('SHOTS path stays native', history.includes('filterShots('));
check('union reads shots via getAllShots', /function buildTimeline[\s\S]*?getAllShots\(\)/.test(history));
check('union reads weights via getWeights', /function buildTimeline[\s\S]*?validWeights\(\)/.test(history));
check('archived excluded by default', /function buildTimeline[\s\S]*?!record\.archived/.test(history));
check('includeArchived option exists', history.includes('includeArchived'));

// 3. Storage untouched
check('no shots store writes', !history.includes("S.set('shots'"));
check('no weights store writes', !history.includes("S.set('weights'"));

// 4. Behavioral: extract the pure union functions and exercise them.
function sliceFn(src, name, nextMarker) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('missing function: ' + name);
  const end = nextMarker ? src.indexOf(nextMarker, start) : src.length;
  if (end < 0) throw new Error('missing marker after: ' + name);
  return src.slice(start, end);
}
const toSrc = sliceFn(history, 'toTimelineEvent', '\nfunction compareTimelineEvents(');
const cmpSrc = sliceFn(history, 'compareTimelineEvents', '\nfunction buildTimeline(');
const { toTimelineEvent, compareTimelineEvents } = new Function(`${toSrc}\n${cmpSrc}\nreturn { toTimelineEvent, compareTimelineEvents };`)();

const shot1 = { id: 'a1', date: '2026-10-07T08:00:00Z', createdAt: '2026-10-07T08:05:00Z' };
const shotLegacy = { id: 'a2', date: '2026-10-07T08:00:00Z', createdAt: null };
const weightDay = { id: 'w1', date: '2026-10-07', createdAt: '2026-10-07T09:00:00Z' };
const shotOlder = { id: 'a3', date: '2026-10-06T08:00:00Z', createdAt: '2026-10-06T08:05:00Z' };

const eShot1 = toTimelineEvent(shot1, 'shot');
const eLegacy = toTimelineEvent(shotLegacy, 'shot');
const eWeight = toTimelineEvent(weightDay, 'weight');
const eOlder = toTimelineEvent(shotOlder, 'shot');

check('shot ID namespaced', eShot1.id === 'shot:a1');
check('weight ID namespaced', eWeight.id === 'weight:w1');
check('namespaces cannot collide', toTimelineEvent({ id: 'x', date: '2026-10-07T01:00:00Z' }, 'shot').id !== toTimelineEvent({ id: 'x', date: '2026-10-07T01:00:00Z' }, 'weight').id);
check('occurredAt preserved verbatim', eWeight.occurredAt === '2026-10-07');
check('createdAt kept separate', eShot1.createdAt === '2026-10-07T08:05:00Z' && eShot1.occurredAt === '2026-10-07T08:00:00Z');
check('date-only precision detected', eWeight.datePrecision === 'day');
check('datetime precision detected', eShot1.datePrecision === 'datetime');
check('record back-reference intact', eShot1.record === shot1);

const sorted = [eWeight, eOlder, eLegacy, eShot1].sort(compareTimelineEvents).map(e => e.id);
check('sort: occurredAt DESC first', JSON.stringify(sorted) === JSON.stringify(['shot:a1', 'shot:a2', 'weight:w1', 'shot:a3']), 'got ' + JSON.stringify(sorted));

// Tie-breaks: same occurredAt, same createdAt → type ASC → id ASC.
const tShot = toTimelineEvent({ id: 'b', date: '2026-10-07T08:00:00Z', createdAt: '2026-10-07T08:05:00Z' }, 'shot');
const tWeight = toTimelineEvent({ id: 'a', date: '2026-10-07T08:00:00Z', createdAt: '2026-10-07T08:05:00Z' }, 'weight');
check('type tiebreak: shot before weight', [tWeight, tShot].sort(compareTimelineEvents)[0].type === 'shot');
const tId1 = toTimelineEvent({ id: 'z9', date: '2026-10-07T08:00:00Z', createdAt: '2026-10-07T08:05:00Z' }, 'shot');
const tId2 = toTimelineEvent({ id: 'a1', date: '2026-10-07T08:00:00Z', createdAt: '2026-10-07T08:05:00Z' }, 'shot');
check('id tiebreak: ascending', [tId1, tId2].sort(compareTimelineEvents)[0].id === 'shot:a1');
// Determinism: same input, same output, repeatedly.
const twice = [eWeight, eOlder, eLegacy, eShot1, tShot, tWeight].sort(compareTimelineEvents).map(e => e.id).join('|');
const twice2 = [tWeight, eShot1, eOlder, tShot, eWeight, eLegacy].sort(compareTimelineEvents).map(e => e.id).join('|');
check('sort is deterministic regardless of input order', twice === twice2);

if (failures) { console.error(`\n${failures} S5 contract check(s) failed.`); process.exit(1); }
console.log('\nS5 contract: all checks passed.');
