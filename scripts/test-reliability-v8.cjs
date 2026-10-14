#!/usr/bin/env node
/* GRID//NODE reliability v8 harness (audit 2026-10-14, Mission 8 fixes).
 *
 * Deterministic coverage for the confirmed v8 mechanisms at the core
 * layer, in the same style as scripts/test-data-integrity.cjs: the real
 * js/gridnode-core.js against an in-memory localStorage (fault
 * injection) and an in-memory Supabase-shaped transport (promise gates
 * + failure injection, every call logged).
 *
 * Scenarios:
 *   R1  canonical weight: payload derives kg from pounds, never from a
 *       stale cached weightKg; kg-only legacy records still upload
 *   R2  claim-before-migration ownership helper: write + verify, fault
 *       injection fails closed, a landed claim blocks other accounts
 *   R3  reconnect recovery: a queue parked by an offline failure is
 *       flushed by recoverPendingSync; hydration gate + session
 *       binding hold
 *   R4  workspace ordering: two saves, the first transport held — no
 *       second workspace write may issue until the first settles, and
 *       the final remote state is the NEWEST snapshot
 *   R5  session bridges: GN_SESSION_EPOCH mirrors the generation
 *       (changes on sign-out AND on same-account re-login); core calls
 *       the native draft purge/guard hooks at session boundaries
 *   R6  date/time table: explicit instants with per-date offsets,
 *       DST-gap rejection, strict calendar validation (item 6 T1-T6
 *       semantics at the helper layer; UI paths are browser-driven)
 */

process.env.TZ = 'America/New_York';

const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/* ── in-memory localStorage with fault injection ─────────────────────── */
class MemStorage {
  constructor() { this.map = new Map(); this.failSubstrings = new Set(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    for (const fragment of this.failSubstrings) {
      if (String(key).includes(fragment)) throw new Error(`INJECTED_STORAGE_FAULT:${fragment}`);
    }
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
const storage = new MemStorage();
globalThis.localStorage = storage;
globalThis.window = globalThis;

/* Native-shell stub: core calls the draft hooks at session boundaries. */
const nativeCalls = { purge: 0, guard: 0 };
globalThis.GN_NATIVE = {
  purgeSessionDraft() { nativeCalls.purge += 1; },
  guardSessionDraft() { nativeCalls.guard += 1; }
};

/* ── in-memory Supabase-shaped transport ─────────────────────────────── */
function createGate() {
  let open;
  const promise = new Promise(resolve => { open = resolve; });
  return { promise, open };
}

class Query {
  constructor(transport, table) {
    this.transport = transport; this.table = table;
    this.mode = null; this.payload = null; this.filters = []; this.singleMode = null;
  }
  upsert(payload) { this.mode = 'upsert'; this.payload = payload; return this; }
  select() { if (this.mode !== 'upsert') this.mode = 'select'; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  single() { this.singleMode = 'single'; return this.execute(); }
  maybeSingle() { this.singleMode = 'maybe'; return this.execute(); }
  then(onFulfilled, onRejected) { return this.execute().then(onFulfilled, onRejected); }
  async execute() {
    const t = this.transport;
    const filter = Object.fromEntries(this.filters);
    if (this.mode === 'upsert') {
      const op = { op: 'upsert', table: this.table, payload: this.payload, userId: this.payload.user_id || this.payload.id };
      const failure = await t.before(op);
      if (failure) return failure;
      t.applyUpsert(this.table, this.payload);
      return { data: this.payload, error: null };
    }
    if (this.mode === 'delete') {
      const op = { op: 'delete', table: this.table, id: filter.id, userId: filter.user_id };
      const failure = await t.before(op);
      if (failure) return failure;
      t.applyDelete(this.table, filter);
      return { data: null, error: null };
    }
    const op = { op: 'select', table: this.table, filters: filter, userId: filter.user_id || filter.id };
    const failure = await t.before(op);
    if (failure) return failure;
    const rows = t.applySelect(this.table, filter);
    if (this.singleMode) return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
}

function createTransport() {
  const db = { shots: new Map(), weights: new Map(), profiles: new Map(), workspaces: new Map() };
  const transport = {
    db,
    calls: [],
    holds: [],
    failures: [],
    client: null,
    holdNext(match, { fail = false } = {}) {
      const gate = createGate();
      transport.holds.push({ match, gate, fail });
      return gate;
    },
    failNext(match, times = 1) { transport.failures.push({ match, times }); },
    async before(op) {
      transport.calls.push(op);
      const holdIndex = transport.holds.findIndex(h => h.match(op));
      if (holdIndex >= 0) {
        const [hold] = transport.holds.splice(holdIndex, 1);
        await hold.gate.promise;
        if (hold.fail) return { data: null, error: { message: 'INJECTED_TRANSPORT_FAILURE', code: '500' } };
      }
      const failIndex = transport.failures.findIndex(f => f.times > 0 && f.match(op));
      if (failIndex >= 0) {
        transport.failures[failIndex].times -= 1;
        return { data: null, error: { message: 'INJECTED_TRANSPORT_FAILURE', code: '500' } };
      }
      return null;
    },
    applyUpsert(table, payload) {
      if (table === 'workspaces') db.workspaces.set(payload.user_id, { ...payload });
      else db[table].set(payload.id, { ...payload });
    },
    applySelect(table, filter) {
      const rows = [...db[table].values()];
      return rows.filter(row => {
        if (filter.user_id !== undefined) return row.user_id === filter.user_id;
        if (filter.id !== undefined) return row.id === filter.id;
        return true;
      }).map(row => ({ ...row }));
    },
    applyDelete(table, filter) {
      for (const [key, row] of db[table]) {
        if (row.id === filter.id && row.user_id === filter.user_id) db[table].delete(key);
      }
    }
  };
  transport.client = { from: table => new Query(transport, table) };
  return transport;
}

/* ── tiny test framework ─────────────────────────────────────────────── */
const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (fn()) return true; await sleep(10); }
  return fn();
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

let core;
let transport;

function login(userId) {
  core.activateSession({ user: { id: userId, email: `${userId}@qa.test` } }, true);
  core.state.cloudClient = transport.client;
}

/* ── R1: canonical weight payload ────────────────────────────────────── */
function scenarioR1() {
  const stale = { id: 'w1', date: '2026-10-10', weight: 170, weightKg: 81.6466, notes: '' };
  const payload = core.cloudWeightPayload(stale, 'u-r1');
  check('R1 payload derives kg from canonical pounds, ignoring stale cache',
    approx(payload.weight_kg, 170 / 2.2046226218), `weight_kg=${payload.weight_kg}`);
  const legacy = core.cloudWeightPayload({ id: 'w2', date: '2026-10-10', weightKg: 80 }, 'u-r1');
  check('R1 kg-only legacy record still uploads its kg', approx(legacy.weight_kg, 80), `weight_kg=${legacy.weight_kg}`);
  const noCache = core.cloudWeightPayload({ id: 'w3', date: '2026-10-10', weight: 180 }, 'u-r1');
  check('R1 pounds-only record derives kg', approx(noCache.weight_kg, 180 / 2.2046226218), `weight_kg=${noCache.weight_kg}`);
  const rebuilt = core.withCanonicalWeight({ weight: 170, weightKg: 81.6466 });
  check('R1 withCanonicalWeight recomputes the derived cache on rebuild',
    approx(rebuilt.weightKg, 170 / 2.2046226218), `weightKg=${rebuilt.weightKg}`);
  check('R1 canonicalWeightKg prefers pounds over cache',
    approx(core.canonicalWeightKg(stale), 170 / 2.2046226218));
  const roundTripped = JSON.parse(JSON.stringify(stale));
  check('R1 export/import serialization keeps the canonical payload',
    approx(core.cloudWeightPayload(roundTripped, 'u-r1').weight_kg, 170 / 2.2046226218));
}

/* ── R2: claim-before-migration ownership ────────────────────────────── */
function scenarioR2() {
  storage.map.delete('gn_local_cloud_owner_v1');
  check('R2 unclaimed device allows first-account migration', core.localWorkspaceMigrationAllowed('u-r2-a') === true);
  check('R2 claim succeeds on healthy storage', core.claimLocalWorkspaceOwner('u-r2-a') === true);
  check('R2 landed claim blocks a different account', core.localWorkspaceMigrationAllowed('u-r2-b') === false);
  check('R2 landed claim still allows the owner', core.localWorkspaceMigrationAllowed('u-r2-a') === true);

  storage.map.delete('gn_local_cloud_owner_v1');
  storage.failSubstrings.add('gn_local_cloud_owner_v1');
  check('R2 claim fails closed when the ownership write cannot persist',
    core.claimLocalWorkspaceOwner('u-r2-c') === false);
  check('R2 failed claim leaves no ownership mark behind',
    storage.getItem('gn_local_cloud_owner_v1') === null);
  storage.failSubstrings.delete('gn_local_cloud_owner_v1');
  check('R2 retry after the fault clears succeeds', core.claimLocalWorkspaceOwner('u-r2-c') === true);
  storage.map.delete('gn_local_cloud_owner_v1');
}

/* ── R3: reconnect recovery ──────────────────────────────────────────── */
async function scenarioR3() {
  login('u-r3');
  const hydration = await core.hydrateCloudData();
  check('R3 hydration ok', hydration.ok === true, JSON.stringify(hydration));
  core.state.cloudHydration = 'ok';

  const record = { id: 'w-r3', date: '2026-10-12', weight: 170, weightKg: 81.6466, notes: '', source: 'manual', createdAt: '2026-10-12T08:00:00.000Z', modifiedAt: '2026-10-12T08:00:00.000Z' };
  core.S.set('weights', [record]);
  transport.failNext(op => op.table === 'weights' && op.op === 'upsert');
  await core.queueCloudSync('weight', record);
  await until(() => core.S.get('syncQueue', []).some(entry => entry.kind === 'weight'));
  check('R3 offline failure parks the weight in the persisted queue',
    core.S.get('syncQueue', []).some(entry => entry.kind === 'weight' && entry.id === 'w-r3'),
    JSON.stringify(core.S.get('syncQueue', [])));
  check('R3 parked record has not reached the cloud', transport.db.weights.size === 0);

  const callsBefore = transport.calls.length;
  const recovered = await core.recoverPendingSync();
  check('R3 recovery reports success once acked', recovered.ok === true, JSON.stringify(recovered));
  const delivered = transport.calls.slice(callsBefore).find(call => call.table === 'weights' && call.op === 'upsert');
  check('R3 recovery delivered the parked weight',
    Boolean(delivered) && [...transport.db.weights.values()].some(row => approx(row.weight_kg, 170 / 2.2046226218)),
    JSON.stringify([...transport.db.weights.values()]));
  check('R3 delivered payload carries the canonical kg (stale cache ignored)',
    delivered && approx(delivered.payload.weight_kg, 170 / 2.2046226218),
    delivered ? `weight_kg=${delivered.payload.weight_kg}` : 'no delivery');
  check('R3 queue is empty after recovery', core.S.get('syncQueue', []).length === 0,
    JSON.stringify(core.S.get('syncQueue', [])));

  /* Hydration gate: recovery must not upload mid-hydration. */
  const record2 = { ...record, id: 'w-r3b' };
  delete record2.cloudId; // distinct record: the first sync assigned `record` a cloud id
  core.S.set('weights', [record, record2]);
  transport.failNext(op => op.table === 'weights' && op.op === 'upsert');
  await core.queueCloudSync('weight', record2);
  await until(() => core.S.get('syncQueue', []).some(entry => entry.id === 'w-r3b'));
  core.state.cloudHydration = 'pending';
  const gatedCalls = transport.calls.length;
  const gated = await core.recoverPendingSync();
  check('R3 recovery refuses while hydration is pending', gated.ok === false && gated.reason === 'hydration-pending', JSON.stringify(gated));
  check('R3 gated recovery made zero transport calls', transport.calls.length === gatedCalls);
  core.state.cloudHydration = 'ok';
  const rowsBeforeFlush = transport.db.weights.size;
  const flushed = await core.recoverPendingSync();
  check('R3 recovery flushes once hydration lands',
    flushed.ok === true && transport.db.weights.size === rowsBeforeFlush + 1,
    JSON.stringify(flushed));
}

/* ── R4: workspace write ordering ────────────────────────────────────── */
async function scenarioR4() {
  login('u-r4');
  const hydration = await core.hydrateCloudData();
  check('R4 hydration ok', hydration.ok === true, JSON.stringify(hydration));
  core.state.cloudHydration = 'ok';

  core.S.set('results', [{ id: 'r4-a', value: 91 }]);
  const gate = transport.holdNext(op => op.table === 'workspaces' && op.op === 'upsert');
  const first = core.syncWorkspace();
  await until(() => transport.calls.some(call => call.table === 'workspaces'));
  const workspaceCalls = () => transport.calls.filter(call => call.table === 'workspaces' && call.op === 'upsert');

  core.S.set('results', [{ id: 'r4-a', value: 91 }, { id: 'r4-b', value: 92 }]);
  core.syncWorkspace().catch(() => {});
  await sleep(60);
  check('R4 second save does NOT issue a concurrent workspace write while the first is held',
    workspaceCalls().length === 1, `${workspaceCalls().length} workspace upserts issued`);

  gate.open();
  await first;
  const settled = await until(() => {
    const row = transport.db.workspaces.get('u-r4');
    return row && Array.isArray(row.results_data) && row.results_data.length === 2;
  });
  check('R4 after release, the fresher snapshot is issued and lands last', settled,
    JSON.stringify(transport.db.workspaces.get('u-r4')?.results_data));
  const calls = workspaceCalls();
  check('R4 exactly two workspace writes, oldest first, newest last',
    calls.length === 2
      && calls[0].payload.results_data.length === 1
      && calls[1].payload.results_data.length === 2,
    JSON.stringify(calls.map(c => c.payload.results_data?.length)));
  const remote = transport.db.workspaces.get('u-r4');
  check('R4 final remote state is the newest snapshot [91, 92]',
    remote.results_data.some(r => r.value === 92) && remote.results_data.length === 2);
}

/* ── R5: session bridges (epoch mirror + draft hooks) ────────────────── */
async function scenarioR5() {
  const purgeBefore = nativeCalls.purge;
  const guardBefore = nativeCalls.guard;
  login('u-r5');
  const epochA1 = globalThis.GN_SESSION_EPOCH;
  check('R5 epoch mirror is a number after login', typeof epochA1 === 'number', String(epochA1));
  check('R5 draft guard ran at session activation', nativeCalls.guard > guardBefore);
  core.clearSession();
  check('R5 epoch advanced on sign-out', globalThis.GN_SESSION_EPOCH > epochA1);
  check('R5 draft purge ran at session exit', nativeCalls.purge > purgeBefore);
  const epochSignedOut = globalThis.GN_SESSION_EPOCH;
  login('u-r5');
  check('R5 same-account re-login is a NEW generation (phase-cache guard works)',
    globalThis.GN_SESSION_EPOCH > epochSignedOut,
    `${epochSignedOut} -> ${globalThis.GN_SESSION_EPOCH}`);
}

/* ── R6: date/time semantics table ───────────────────────────────────── */
function scenarioR6() {
  const cases = [
    ['2026-03-07', '23:30', '2026-03-07T23:30:00-05:00', 'T1 timed weight stores explicit instant, EST offset'],
    ['2026-03-08', '02:30', null, 'T2 DST-gap wall time rejected, never shifted'],
    ['2026-03-09', '12:00', '2026-03-09T12:00:00-04:00', 'T3 date after the boundary carries the NEW offset (EDT)'],
    ['2026-03-07', '12:00', '2026-03-07T12:00:00-05:00', 'T3 date before the boundary keeps EST'],
    ['2026-02-31', '12:00', null, 'T5/T6 impossible calendar date rejected'],
    ['2026-03-07', '24:00', null, 'invalid hour rejected'],
    ['2026-03-07', '9:05', '2026-03-07T09:05:00-05:00', 'single-digit hour normalized'],
    ['2026-11-01', '01:30', '2026-11-01T01:30:00-04:00', 'fall-back ambiguous hour resolves to first occurrence, wall time preserved']
  ];
  for (const [date, time, expected, label] of cases) {
    const actual = core.stampLocalInstant(date, time);
    check(`R6 ${label}`, actual === expected, `${date} ${time} -> ${actual}, expected ${expected}`);
  }
  check('R6 isRealCalendarDate: Feb 29 on a non-leap year is not real', core.isRealCalendarDate(2026, 2, 29) === false);
  check('R6 isRealCalendarDate: Feb 29 on a leap year is real', core.isRealCalendarDate(2024, 2, 29) === true);
  check('R6 isRealCalendarDate: Feb 31 is not real', core.isRealCalendarDate(2026, 2, 31) === false);
  check('R6 isRealCalendarDate: month 13 is not real', core.isRealCalendarDate(2026, 13, 1) === false);
}

/* ── boot + run ──────────────────────────────────────────────────────── */
(async () => {
  const tempModule = path.join(os.tmpdir(), `gridnode-core-reliability-${process.pid}.mjs`);
  fs.copyFileSync(path.resolve(__dirname, '../js/gridnode-core.js'), tempModule);
  core = await import(pathToFileURL(tempModule));
  transport = createTransport();

  scenarioR1();
  scenarioR2();
  await scenarioR3();
  await scenarioR4();
  await scenarioR5();
  scenarioR6();

  fs.rmSync(tempModule, { force: true });
  const failed = results.filter(result => !result.ok);
  console.log(`\nreliability-v8: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error(`FAILED: ${failed.map(f => f.name).join(' | ')}`); process.exit(1); }
  console.log('reliability-v8 OK · core mechanisms hold');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
