#!/usr/bin/env node
/* GRID//NODE data-integrity interleaving harness (audit 2026-10-14).
 *
 * Re-runs the saving/recovery audit's deterministic interleavings against
 * the real cloud engine (js/gridnode-core.js) with an in-memory
 * localStorage (per-key fault injection) and an in-memory Supabase-shaped
 * transport (promise gates + failure injection, every call logged).
 *
 * Scenarios:
 *   S1  hydration write failure per target key -> failure, zero uploads,
 *       retry preserves local-only + remote-only records
 *   S2  upload -> archive (edit during in-flight upload survives)
 *   S3  upload -> undo weight (deletion dominates, no resurrection)
 *   S4  A -> B switch during an awaited full sync
 *   S5  A -> sign out -> A during hydration (generation guard)
 *   S6  concurrent delete flushes (exact acknowledgement)
 *   S7  ASSAY null preservation in normalizeLabTest + storage round trip
 *   S8  write-ahead journal safeguard spot-check
 *   S9  failed fresh hydration blocks uploads despite stale 'ok' state
 *   S10 sign-out during an awaited full sync leaves LOCAL_ONLY
 *   S11 individual retry dequeues its entry and status derives synced
 */

const assert = require('node:assert/strict');
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
    holds: [],    // { match(op), gate, fail }
    failures: [], // { match(op), times }
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
async function until(fn, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (fn()) return true; await sleep(10); }
  return fn();
}

let core;
let transport;

function login(userId) {
  core.activateSession({ user: { id: userId, email: `${userId}@qa.test` } }, true);
  core.state.cloudClient = transport.client;
}
function seedRemoteShot(userId, id, overrides = {}) {
  transport.db.shots.set(id, {
    id, user_id: userId, date: '2026-10-02T08:00', compound: 'semaglutide', dose_mg: 0.25,
    site: null, notes: null, side_effects: [], archived: false,
    created_at: '2026-10-02T08:00', updated_at: '2026-10-02T08:00', ...overrides
  });
}
function seedRemoteWeight(userId, id, overrides = {}) {
  transport.db.weights.set(id, {
    id, user_id: userId, date: '2026-10-02T08:00', weight_kg: 90, notes: null,
    created_at: '2026-10-02T08:00', updated_at: '2026-10-02T08:00', ...overrides
  });
}

/* ── S1: hydration write failure per target key ──────────────────────── */
async function scenarioS1() {
  for (const target of ['shots', 'weights', 'profile', 'notes']) {
    const userId = `u-s1-${target}`;
    login(userId);
    core.S.set('shots', [{ id: 's1-local-shot', date: '2026-10-01T08:00', med: 'BPC-157', dose: 1, createdAt: '2026-10-01T08:00', modifiedAt: '2026-10-01T08:00' }]);
    core.S.set('weights', [{ id: 's1-local-weight', date: '2026-10-01T08:00', weight: 200, createdAt: '2026-10-01T08:00', modifiedAt: '2026-10-01T08:00' }]);
    seedRemoteShot(userId, 's1-remote-shot-uuid');
    seedRemoteWeight(userId, 's1-remote-weight-uuid');
    transport.db.profiles.set(userId, { id: userId, display_name: 'REMOTE', dose_mg: null, profile_data: { goalWt: 180 } });
    transport.db.workspaces.set(userId, { user_id: userId, results_data: [], notes_data: [{ id: 's1-remote-note', text: 'remote note' }], symptoms_data: [], labs_data: [], preferences: {}, settings: {}, arsenal: [] });

    storage.failSubstrings.add(`_${target}`);
    const callsBefore = transport.calls.length;
    const failed = await core.hydrateCloudData();
    check(`S1[${target}] hydration reports failure`, failed.ok === false, JSON.stringify(failed));
    check(`S1[${target}] reason is HYDRATION_PERSIST_FAILED`, failed.reason === 'HYDRATION_PERSIST_FAILED', failed.reason);
    check(`S1[${target}] uploads prohibited`, core.cloudUploadsReady() === false);
    const syncAttempt = await core.syncAllCloudData();
    check(`S1[${target}] full sync refused`, syncAttempt && syncAttempt.ok === false && syncAttempt.reason === 'HYDRATION_NOT_OK', JSON.stringify(syncAttempt));
    const upserts = transport.calls.slice(callsBefore).filter(call => call.op === 'upsert');
    check(`S1[${target}] zero cloud writes after failure`, upserts.length === 0, `${upserts.length} upserts`);
    const localShots = core.getAllShots();
    check(`S1[${target}] local snapshot preserved, remote not merged in`, localShots.length === 1 && localShots[0].id === 's1-local-shot', JSON.stringify(localShots.map(s => s.id)));

    storage.failSubstrings.delete(`_${target}`);
    const retried = await core.hydrateCloudData();
    check(`S1[${target}] retry succeeds`, retried.ok === true, JSON.stringify(retried));
    const mergedShots = core.getAllShots();
    check(`S1[${target}] retry preserves local-only + remote-only shots`,
      mergedShots.some(s => s.id === 's1-local-shot') && mergedShots.some(s => s.cloudId === 's1-remote-shot-uuid'),
      JSON.stringify(mergedShots.map(s => s.id)));
    const syncResult = await core.syncAllCloudData();
    check(`S1[${target}] post-retry sync ok`, Boolean(syncResult && syncResult.ok), JSON.stringify(syncResult));
    check(`S1[${target}] local-only shot reached the cloud`,
      [...transport.db.shots.values()].some(row => row.user_id === userId && row.compound !== undefined && row.id !== 's1-remote-shot-uuid' && row.dose_mg === 1));
  }
}

/* ── S2: upload -> archive ───────────────────────────────────────────── */
async function scenarioS2() {
  const userId = 'u-s2';
  login(userId);
  await core.hydrateCloudData();
  const shot = { id: 's2-shot', date: '2026-10-10T08:00', med: 'BPC-157', dose: 1, archived: false, createdAt: '2026-10-10T08:00', modifiedAt: '2026-10-10T08:00' };
  core.S.set('shots', [shot]);
  const gate = transport.holdNext(op => op.op === 'upsert' && op.table === 'shots');
  const first = core.syncShot(core.getAllShots()[0]);
  await until(() => transport.calls.some(call => call.op === 'upsert' && call.table === 'shots'));
  const edited = core.getAllShots()[0];
  edited.archived = true;
  edited.modifiedAt = new Date().toISOString();
  core.S.set('shots', [edited]);
  await core.queueCloudSync('shot', edited); // in-flight -> must mark dirty, not drop
  gate.open();
  await first;
  const drained = await until(() => {
    const row = [...transport.db.shots.values()].find(r => r.user_id === userId);
    return row && row.archived === true;
  });
  check('S2 remote shot ends archived after queue drain', drained);
  check('S2 retry queue empty after drain', core.S.get('syncQueue', []).length === 0, JSON.stringify(core.S.get('syncQueue', [])));
  await core.hydrateCloudData();
  const afterHydration = core.getAllShots().find(s => s.id === 's2-shot');
  check('S2 fresh hydration keeps the shot archived', afterHydration && afterHydration.archived === true);
}

/* ── S3: upload -> undo weight (resurrection) ────────────────────────── */
async function scenarioS3() {
  const userId = 'u-s3';
  login(userId);
  await core.hydrateCloudData();
  const weight = { id: 's3-weight', date: '2026-10-10T08:00', weight: 200, createdAt: '2026-10-10T08:00', modifiedAt: '2026-10-10T08:00' };
  core.S.set('weights', [weight]);
  const gate = transport.holdNext(op => op.op === 'upsert' && op.table === 'weights');
  const first = core.syncWeight(core.getWeights()[0]);
  await until(() => Boolean(core.getWeights()[0] && core.getWeights()[0].cloudId));
  const cloudId = core.getWeights()[0].cloudId;
  // Mirror the module undo: remove locally + tombstone + flush, all while
  // the original upload is still in flight.
  core.S.multiWrite([
    { key: 'weights', value: [] },
    { key: 'cloudDeletes', value: [{ table: 'weights', id: cloudId }] }
  ]);
  await core.flushCloudDeletes(); // consumes the tombstone against a row that does not exist yet
  gate.open();
  await first;
  const drained = await until(() =>
    !transport.db.weights.has(cloudId) && core.S.get('cloudDeletes', []).length === 0);
  check('S3 remote weight deleted after drain (no resurrection)', drained && !transport.db.weights.has(cloudId));
  await core.hydrateCloudData();
  check('S3 fresh hydration does not restore the weight', core.getWeights().length === 0, JSON.stringify(core.getWeights()));
}

/* ── S4: A -> B during an awaited full sync ──────────────────────────── */
async function scenarioS4() {
  const userA = 'u-s4-a'; const userB = 'u-s4-b';
  login(userA);
  await core.hydrateCloudData();
  core.S.set('shots', [{ id: 's4-a-shot', date: '2026-10-10T08:00', med: 'BPC-157', dose: 1, createdAt: '2026-10-10T08:00', modifiedAt: '2026-10-10T08:00' }]);
  const gate = transport.holdNext(op => op.op === 'upsert' && op.table === 'shots' && op.userId === userA);
  const syncPromise = core.syncAllCloudData();
  await until(() => transport.calls.some(call => call.op === 'upsert' && call.table === 'shots' && call.userId === userA));
  login(userB);
  await core.hydrateCloudData();
  const bQueueBefore = JSON.stringify(core.S.get('syncQueue', []));
  const bDeletesBefore = JSON.stringify(core.S.get('cloudDeletes', []));
  const callsBeforeRelease = transport.calls.length;
  gate.open();
  const result = await syncPromise;
  check('S4 stale full sync reports SESSION_CHANGED', result && result.ok === false && result.reason === 'SESSION_CHANGED', JSON.stringify(result));
  const strayWrites = transport.calls.slice(callsBeforeRelease).filter(call => call.op !== 'select' && call.userId === userB);
  check('S4 no writes issued under B by A continuation', strayWrites.length === 0, JSON.stringify(strayWrites));
  check('S4 B sync queue untouched', JSON.stringify(core.S.get('syncQueue', [])) === bQueueBefore);
  check('S4 B delete queue untouched', JSON.stringify(core.S.get('cloudDeletes', [])) === bDeletesBefore);
  check('S4 A shot upload itself landed under A', [...transport.db.shots.values()].some(row => row.user_id === userA));
}

/* ── S5: A -> sign out -> A during hydration ─────────────────────────── */
async function scenarioS5() {
  const userId = 'u-s5';
  login(userId);
  seedRemoteShot(userId, 's5-remote-shot-uuid');
  transport.db.workspaces.set(userId, { user_id: userId, results_data: [], notes_data: [{ id: 's5-note', text: 'remote' }], symptoms_data: [], labs_data: [], preferences: {}, settings: {}, arsenal: [] });
  const gate = transport.holdNext(op => op.op === 'select' && op.userId === userId);
  const staleHydration = core.hydrateCloudData();
  await sleep(20); // let the first hydration reach its held read
  core.clearSession();
  core.activateSession({ user: { id: 'local', email: '' } }, false);
  login(userId); // same account, NEW generation
  const fresh = await core.hydrateCloudData();
  check('S5 second hydration succeeds', fresh.ok === true, JSON.stringify(fresh));
  const shotsAfterFresh = JSON.stringify(core.getAllShots());
  const notesAfterFresh = JSON.stringify(core.S.get('notes', []));
  gate.open();
  const stale = await staleHydration;
  check('S5 stale hydration rejected with SESSION_CHANGED', stale.ok === false && stale.reason === 'SESSION_CHANGED', JSON.stringify(stale));
  check('S5 local data still equals the second hydration merge',
    JSON.stringify(core.getAllShots()) === shotsAfterFresh && JSON.stringify(core.S.get('notes', [])) === notesAfterFresh);
  check('S5 readiness belongs to the live generation', core.cloudUploadsReady() === true);
}

/* ── S6: concurrent delete flushes ───────────────────────────────────── */
async function scenarioS6() {
  const userId = 'u-s6';
  login(userId);
  await core.hydrateCloudData();
  seedRemoteWeight(userId, 's6-cloud-1');
  seedRemoteWeight(userId, 's6-cloud-2');
  core.S.set('cloudDeletes', [{ table: 'weights', id: 's6-cloud-1' }]);
  /* The first delete is held (so the second tombstone lands mid-flush)
   * and every delete of s6-cloud-1 keeps failing, including the re-flush
   * retry: the audit's invariant is that failed work is never discarded. */
  const gate = transport.holdNext(op => op.op === 'delete' && op.id === 's6-cloud-1');
  transport.failures.push({ match: op => op.op === 'delete' && op.id === 's6-cloud-1', times: 99 });
  const first = core.flushCloudDeletes();
  await until(() => transport.calls.some(call => call.op === 'delete'));
  core.S.set('cloudDeletes', [...core.S.get('cloudDeletes', []), { table: 'weights', id: 's6-cloud-2' }]);
  const second = core.flushCloudDeletes();
  gate.open();
  await Promise.all([first, second]);
  const settled = await until(() => !transport.db.weights.has('s6-cloud-2'));
  const queue = core.S.get('cloudDeletes', []);
  check('S6 second tombstone delivered by the re-flush', settled && !transport.db.weights.has('s6-cloud-2'));
  check('S6 failed tombstone preserved exactly once',
    queue.length === 1 && queue[0].table === 'weights' && queue[0].id === 's6-cloud-1', JSON.stringify(queue));
  check('S6 failed row still present remotely', transport.db.weights.has('s6-cloud-1'));
}

/* ── S7: ASSAY null preservation ─────────────────────────────────────── */
async function scenarioS7() {
  const base = { id: 'assay-1', peptide: 'bpc-157', vendor: 'Lab', testDate: '2026-10-01', method: 'hplc', endotoxin: 'pass' };
  const nulls = core.normalizeLabTest({ ...base, purityPct: null, labelClaimMg: '', measuredMg: undefined });
  check('S7 null/blank/undefined stay null', nulls.purityPct === null && nulls.labelClaimMg === null && nulls.measuredMg === null, JSON.stringify(nulls));
  const zeros = core.normalizeLabTest({ ...base, purityPct: 0, labelClaimMg: 0, measuredMg: 0 });
  check('S7 explicit 0 stays 0', zeros.purityPct === 0 && zeros.labelClaimMg === 0 && zeros.measuredMg === 0, JSON.stringify(zeros));
  const strings = core.normalizeLabTest({ ...base, purityPct: '98.5', labelClaimMg: '10', measuredMg: '9.7' });
  check('S7 numeric strings still parse', strings.purityPct === 98.5 && strings.labelClaimMg === 10 && strings.measuredMg === 9.7, JSON.stringify(strings));
  core.activateSession({ user: { id: 'local', email: '' } }, false);
  core.setLabTests([nulls]);
  const roundTrip = core.getAllLabTests().find(record => record.id === 'assay-1');
  check('S7 storage round trip retains nulls', Boolean(roundTrip) && roundTrip.purityPct === null && roundTrip.labelClaimMg === null && roundTrip.measuredMg === null, JSON.stringify(roundTrip));
}

/* ── S8: journal safeguard spot-check ────────────────────────────────── */
async function scenarioS8() {
  core.activateSession({ user: { id: 'local', email: '' } }, false);
  core.S.set('shots', [{ id: 's8-original' }]);
  storage.failSubstrings.add('_weights');
  const committed = core.S.multiWrite([{ key: 'shots', value: [{ id: 's8-new' }] }, { key: 'weights', value: [{ id: 's8-w' }] }]);
  storage.failSubstrings.delete('_weights');
  check('S8 failed second write rejects the transaction', committed === false);
  check('S8 logical reads still return the prior value', JSON.stringify(core.S.get('shots', []).map(s => s.id)) === '["s8-original"]', JSON.stringify(core.S.get('shots', [])));
  const okWrite = core.S.multiWrite([{ key: 'shots', value: [{ id: 's8-new' }] }]);
  check('S8 clean transaction commits', okWrite === true && core.S.get('shots', [])[0].id === 's8-new');
}

/* ── S9: stale readiness cannot authorize uploads ────────────────────── */
async function scenarioS9() {
  const userId = 'u-s9';
  login(userId);
  seedRemoteShot(userId, 's9-remote-shot-uuid');
  const good = await core.hydrateCloudData();
  check('S9 initial hydration ok', good.ok === true, JSON.stringify(good));
  core.state.cloudHydration = 'ok'; // stale string from the earlier success
  storage.failSubstrings.add('_shots');
  const failed = await core.hydrateCloudData();
  storage.failSubstrings.delete('_shots');
  check('S9 fresh hydration fails on storage fault', failed.ok === false && failed.reason === 'HYDRATION_PERSIST_FAILED', JSON.stringify(failed));
  check('S9 readiness revoked despite stale ok string', core.cloudUploadsReady() === false);
  const callsBefore = transport.calls.length;
  const syncAttempt = await core.syncAllCloudData();
  check('S9 full sync refused with HYDRATION_NOT_OK', syncAttempt && syncAttempt.ok === false && syncAttempt.reason === 'HYDRATION_NOT_OK', JSON.stringify(syncAttempt));
  await core.queueCloudSync('shot', { id: 's9-queued', med: 'BPC-157', dose: 1 });
  const upserts = transport.calls.slice(callsBefore).filter(call => call.op === 'upsert');
  check('S9 queued sync defers with zero upserts', upserts.length === 0 && core.S.get('syncQueue', []).some(entry => entry.id === 's9-queued'), JSON.stringify(core.S.get('syncQueue', [])));
}

/* ── S10: sign-out during an awaited full sync ───────────────────────── */
async function scenarioS10() {
  const userId = 'u-s10';
  login(userId);
  await core.hydrateCloudData();
  core.S.set('shots', [{ id: 's10-shot', date: '2026-10-10T08:00', med: 'BPC-157', dose: 1, createdAt: '2026-10-10T08:00', modifiedAt: '2026-10-10T08:00' }]);
  const gate = transport.holdNext(op => op.op === 'upsert' && op.table === 'shots');
  const syncPromise = core.syncAllCloudData();
  await until(() => transport.calls.some(call => call.op === 'upsert' && call.table === 'shots'));
  core.clearSession();
  gate.open();
  await syncPromise;
  check('S10 status stays LOCAL_ONLY after sign-out mid-sync', core.state.cloudStatus === 'LOCAL_ONLY', core.state.cloudStatus);
  check('S10 cloud flag cleared', core.state.cloud === false);
}

/* ── S11: individual retry leaves no stale queue/status ──────────────── */
async function scenarioS11() {
  const userId = 'u-s11';
  login(userId);
  await core.hydrateCloudData();
  const shot = { id: 's11-shot', date: '2026-10-10T08:00', med: 'BPC-157', dose: 1, createdAt: '2026-10-10T08:00', modifiedAt: '2026-10-10T08:00' };
  core.S.set('shots', [shot]);
  transport.failNext(op => op.op === 'upsert' && op.table === 'shots', 1);
  await core.syncShot(core.getAllShots()[0]);
  check('S11 failed sync enqueues a retry', core.S.get('syncQueue', []).some(entry => entry.kind === 'shot' && entry.id === 's11-shot'), JSON.stringify(core.S.get('syncQueue', [])));
  check('S11 status shows outstanding work', core.state.cloudStatus === 'LOCAL_BACKUP', core.state.cloudStatus);
  await core.syncShot(core.getAllShots()[0]);
  check('S11 successful retry dequeues its entry', core.S.get('syncQueue', []).length === 0, JSON.stringify(core.S.get('syncQueue', [])));
  check('S11 status derives CLOUD_SYNCED once drained', core.state.cloudStatus === 'CLOUD_SYNCED', core.state.cloudStatus);
}

/* ── run ─────────────────────────────────────────────────────────────── */
(async () => {
  const tempModule = path.join(os.tmpdir(), `gridnode-core-di-${process.pid}.mjs`);
  fs.copyFileSync(path.resolve(__dirname, '../js/gridnode-core.js'), tempModule);
  core = await import(pathToFileURL(tempModule));
  transport = createTransport();

  await scenarioS1();
  await scenarioS2();
  await scenarioS3();
  await scenarioS4();
  await scenarioS5();
  await scenarioS6();
  await scenarioS7();
  await scenarioS8();
  await scenarioS9();
  await scenarioS10();
  await scenarioS11();

  fs.rmSync(tempModule, { force: true });
  const failed = results.filter(result => !result.ok);
  console.log(`\ndata-integrity: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error(`FAILED: ${failed.map(f => f.name).join(' | ')}`); process.exit(1); }
  console.log('data-integrity OK · audit interleavings hold');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
