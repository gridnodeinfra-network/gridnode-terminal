#!/usr/bin/env node
/* GRID//NODE reminders contract test.
 *
 * Verifies the dose-reminder engine in js/gridnode-reminders.js:
 *  - nextDose() is null without a protocol frequency
 *  - nextDose() rolls a past start date forward to a future slot
 *  - nextDose() anchors on the last SHOT record + frequency
 *  - checkDue() fires gn:reminder-due only when a dose is actually due
 *  - reschedule() with notifications=off schedules nothing
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
  const store = {};
  const listeners = {};
  global.window = { setTimeout() {} };
  global.document = {
    readyState: 'complete',
    documentElement: { lang: 'en' },
    hidden: false,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  };
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  };
  let dispatched = [];
  global.window.dispatchEvent = (e) => { dispatched.push(e); return true; };
  global.window.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } };
  delete global.window.GN_REMINDERS;
  eval(readFileSync(join(ROOT, 'js', 'gridnode-reminders.js'), 'utf8'));
  return { store, dispatched, listeners };
}

function put(store, name, value) {
  store[`gn_local_${name}`] = JSON.stringify(value);
}

// 1. No protocol -> null
{
  const { store } = makeEnv();
  put(store, 'preferences', { notifications: 'local' });
  window.GN_REMINDERS.nextDose() === null
    ? ok('no frequency -> no next dose')
    : fail('expected null nextDose without frequency');
}

// 2. Past start date rolls forward to a future slot
{
  const { store } = makeEnv();
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  put(store, 'preferences', { notifications: 'local', frequencyDays: 7, startDate: past });
  const next = window.GN_REMINDERS.nextDose();
  next && new Date(next).getTime() > Date.now()
    ? ok('past start date rolls forward to a future dose')
    : fail(`expected future nextDose, got ${next}`);
}

// 3. Anchors on last shot + frequency
{
  const { store } = makeEnv();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  put(store, 'shots', [{ id: 's1', date: threeDaysAgo, archived: false }]);
  put(store, 'preferences', { notifications: 'local', frequencyDays: 7 });
  const next = new Date(window.GN_REMINDERS.nextDose()).getTime();
  const expected = new Date(threeDaysAgo).getTime() + 7 * 86400000;
  Math.abs(next - expected) < 60000
    ? ok('next dose = last shot + frequency')
    : fail(`expected ~${new Date(expected).toISOString()}, got ${window.GN_REMINDERS.nextDose()}`);
}

// 4a. Due dose fires the event
{
  const env = makeEnv();
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  put(env.store, 'shots', [{ id: 's1', date: tenDaysAgo, archived: false }]);
  put(env.store, 'preferences', { notifications: 'local', frequencyDays: 7 });
  const fired = window.GN_REMINDERS.checkDue();
  fired && env.dispatched.some((e) => e.type === 'gn:reminder-due')
    ? ok('overdue dose dispatches gn:reminder-due')
    : fail('expected gn:reminder-due for overdue dose');
}

// 4b. Future dose does not fire
{
  const env = makeEnv();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  put(env.store, 'shots', [{ id: 's1', date: yesterday, archived: false }]);
  put(env.store, 'preferences', { notifications: 'local', frequencyDays: 7 });
  const fired = window.GN_REMINDERS.checkDue();
  !fired && !env.dispatched.some((e) => e.type === 'gn:reminder-due')
    ? ok('future dose does not dispatch')
    : fail('unexpected gn:reminder-due for future dose');
}

// 5. Mode off -> reschedule reports off and stores no system state
{
  const { store } = makeEnv();
  put(store, 'preferences', { notifications: 'off', frequencyDays: 7, startDate: '2026-09-01' });
  window.GN_REMINDERS.reschedule({ interactive: false }).then((r) => {
    !r.ok && r.reason === 'off'
      ? ok('notifications=off -> reschedule stands down')
      : fail(`expected {ok:false,reason:off}, got ${JSON.stringify(r)}`);
    console.log(failures === 0 ? 'reminders-contract OK' : `reminders-contract FAILED (${failures})`);
    process.exit(failures === 0 ? 0 : 1);
  });
}
