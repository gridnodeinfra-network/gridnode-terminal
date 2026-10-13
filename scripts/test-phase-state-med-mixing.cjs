#!/usr/bin/env node
/*
 * P0-5 regression test: phase-state must never mix medications.
 *
 * Loads the REAL handler from supabase/functions/phase-state/index.ts
 * without Deno: the deno.land `serve` import is string-replaced with a
 * local stub that captures the handler, the result is written to a temp
 * .mjs, imported, and invoked with synthetic Request objects.
 *
 * Usage:
 *   node scripts/test-phase-state-med-mixing.cjs
 *   PHASE_STATE_INDEX=/tmp/base-index.ts node scripts/test-phase-state-med-mixing.cjs
 *
 * PHASE_STATE_INDEX lets the same harness run against another copy of
 * the handler (e.g. the pre-fix version extracted with
 * `git show HEAD:supabase/functions/phase-state/index.ts`), where
 * scenarios 1-3 are expected to FAIL and scenario 4 to PASS.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const SOURCE =
  process.env.PHASE_STATE_INDEX ||
  path.join(__dirname, '..', 'supabase', 'functions', 'phase-state', 'index.ts');

const NOW = Date.parse('2026-10-12T12:00:00Z');

async function loadHandler() {
  const raw = fs.readFileSync(SOURCE, 'utf8');
  const stub =
    'const serve = (fn) => { globalThis.__phaseStateHandler = fn; };';
  const replaced = raw.replace(
    /^import\s*\{\s*serve\s*\}\s*from\s*["']https:\/\/deno\.land[^"']*["'];?/m,
    stub
  );
  if (replaced === raw) {
    throw new Error('could not stub the deno.land serve import in ' + SOURCE);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-test-'));
  const tmp = path.join(dir, 'phase-state.mjs');
  fs.writeFileSync(tmp, replaced);
  await import(pathToFileURL(tmp).href);
  const handler = globalThis.__phaseStateHandler;
  if (typeof handler !== 'function') {
    throw new Error('serve stub did not capture a handler from ' + SOURCE);
  }
  return handler;
}

async function call(handler, body) {
  const req = new Request('http://localhost/functions/v1/phase-state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://gridnode.network',
    },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  return res.json();
}

let failures = 0;

function scenario(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (!ok) failures += 1;
}

function ms(iso) {
  return Date.parse(iso);
}

async function main() {
  const handler = await loadHandler();
  console.log('handler under test: ' + SOURCE);
  console.log('fixed now: ' + new Date(NOW).toISOString());
  console.log('');

  // 1. Cycle-group mixing: cjcipa-cycle groups sermorelin + ipamorelin
  //    (and others). The requested med's OWN first shot must anchor the
  //    cycle, not the earliest shot of any med in the template group.
  {
    const data = await call(handler, {
      med: 'ipamorelin',
      now: NOW,
      shots: [
        { date: '2026-06-01', med: 'sermorelin' },
        { date: '2026-10-01', med: 'ipamorelin' },
        { date: '2026-10-08', med: 'ipamorelin' },
      ],
    });
    const expected = ms('2026-10-01');
    scenario(
      '1 cycle-group mixing (ipamorelin anchored on its own first shot)',
      data.empty === false && data.cycleStart === expected,
      'cycleStart=' +
        (data.cycleStart ? new Date(data.cycleStart).toISOString() : String(data.cycleStart)) +
        ' expected=' +
        new Date(expected).toISOString()
    );
  }

  // 2. Weekly cross-med: glp1-weekly must anchor on the requested med's
  //    latest own shot, not the latest shot of ANY medication.
  {
    const data = await call(handler, {
      med: 'ozempic_semaglutide',
      now: NOW,
      shots: [
        { date: '2026-10-04', med: 'ozempic_semaglutide' },
        { date: '2026-10-11', med: 'bpc157' },
      ],
    });
    const expected = ms('2026-10-04');
    scenario(
      '2 weekly cross-med (ozempic anchored on its own latest shot)',
      data.empty === false &&
        data.cycleStart === expected &&
        data.progress === 1 &&
        data.phaseId === 'wear-off',
      'cycleStart=' +
        (data.cycleStart ? new Date(data.cycleStart).toISOString() : String(data.cycleStart)) +
        ' progress=' +
        data.progress +
        ' phaseId=' +
        data.phaseId +
        ' expected cycleStart=' +
        new Date(expected).toISOString() +
        ' progress=1 phaseId=wear-off'
    );
  }

  // 3. No shots of the requested med at all: must be empty, even when
  //    other medications have shots.
  {
    const data = await call(handler, {
      med: 'bpc157',
      now: NOW,
      shots: [{ date: '2026-10-05', med: 'tb500' }],
    });
    scenario(
      '3 no-own-med shots (bpc157 requested, only tb500 logged)',
      data.empty === true,
      'response=' + JSON.stringify(data).slice(0, 160) + ' expected={empty:true}'
    );
  }

  // 4. Regression guard: a single-med history behaves exactly as before.
  {
    const data = await call(handler, {
      med: 'bpc157',
      now: NOW,
      shots: [
        { date: '2026-09-01', med: 'bpc157' },
        { date: '2026-10-01', med: 'bpc157' },
      ],
    });
    const expected = ms('2026-09-01');
    scenario(
      '4 regression guard (single-med bpc157 history)',
      data.empty === false && data.cycleStart === expected,
      'cycleStart=' +
        (data.cycleStart ? new Date(data.cycleStart).toISOString() : String(data.cycleStart)) +
        ' expected=' +
        new Date(expected).toISOString()
    );
  }

  console.log('');
  if (failures) {
    console.log(failures + ' scenario(s) FAILED');
    process.exit(1);
  }
  console.log('all scenarios passed');
}

main().catch((err) => {
  console.error('test harness error:', err && err.stack ? err.stack : err);
  process.exit(2);
});
