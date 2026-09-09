#!/usr/bin/env node

const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const tempModule = path.join(os.tmpdir(), `gridnode-core-${process.pid}.mjs`);
  fs.copyFileSync(path.resolve(__dirname, '../js/gridnode-core.js'), tempModule);
  const core = await import(pathToFileURL(tempModule));

  const shot = { id: 'shot_local_1', date: '2026-09-07T08:00', med: 'Zepbound', dose: 5 };
  const weight = { id: 'weight_local_1', shotId: shot.id, date: shot.date, weight: 201.2 };
  const uuids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  const createUuid = () => uuids.shift();

  assert.equal(core.ensureCloudRecordId(shot, createUuid), '11111111-1111-4111-8111-111111111111');
  assert.equal(core.ensureCloudRecordId(shot, createUuid), '11111111-1111-4111-8111-111111111111');
  assert.equal(core.ensureCloudRecordId(weight, createUuid), '22222222-2222-4222-8222-222222222222');
  weight.shotCloudId = shot.cloudId;

  assert.deepEqual(core.cloudShotPayload(shot, 'user-1'), {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    date: shot.date,
    compound: 'zepbound_tirzepatide',
    dose_mg: 5,
    site: null,
    notes: null,
    side_effects: [],
    archived: false,
    updated_at: shot.date,
  });
  assert.deepEqual(core.cloudWeightPayload(weight, 'user-1'), {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: 'user-1',
    shot_id: '11111111-1111-4111-8111-111111111111',
    date: shot.date,
    weight_kg: 91.26278484601912,
    notes: 'GRIDNODE_LINKED_SHOT:11111111-1111-4111-8111-111111111111',
    updated_at: shot.date,
  });
  assert.equal(Object.hasOwn(core.cloudWeightPayload({ date: shot.date, weight: 190, notes: 'standalone' }, 'user-1'), 'shot_id'), false);
  assert.equal(core.parseLinkedShotCloudId('GRIDNODE_LINKED_SHOT:11111111-1111-4111-8111-111111111111'), shot.cloudId);
  assert.equal(core.parseLinkedShotCloudId('ordinary user note'), null);

  const plan = core.planPermanentShotDelete(
    { ...shot, inventoryDeduction: { itemId: 'vial-1', amount: 5, unit: 'mg' } },
    [weight, { id: 'weight-standalone', weight: 199 }],
    [{ table: 'shots', id: shot.cloudId }],
  );
  assert.deepEqual(plan.remainingWeights.map(item => item.id), ['weight-standalone']);
  assert.deepEqual(plan.cloudDeletes, [
    { table: 'shots', id: shot.cloudId },
    { table: 'weights', id: weight.cloudId },
  ]);
  assert.deepEqual(plan.inventoryReturn, { itemId: 'vial-1', amount: 5, unit: 'mg' });

  const localEdit = { id: 'local', cloudId: shot.cloudId, date: shot.date, dose: 7.5, modifiedAt: '2026-09-07T10:00:00Z' };
  const staleCloud = { id: 'cloud', cloudId: shot.cloudId, date: shot.date, dose: 5, modifiedAt: '2026-09-07T09:00:00Z' };
  assert.equal(core.mergeRecords([localEdit], [staleCloud], item => item.cloudId)[0].dose, 7.5);
  assert.equal(core.mergeRecords([staleCloud], [localEdit], item => item.cloudId)[0].dose, 7.5);

  fs.rmSync(tempModule, { force: true });
  console.log('record-integrity OK · deterministic cloud IDs · linked deletion plan');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
