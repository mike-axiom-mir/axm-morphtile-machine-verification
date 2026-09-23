'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { classifyWorkflow, auditWorkflows } = require('../tools/workflow-trigger-policy');

const ROOT = path.join(__dirname, '..');
const PRE_MIGRATION_MAIN_SHA = 'ccf7e4d3e1dc52e86a9487796aefa67bcb2f5260';
const PRE_MIGRATION_MAIN_PUSH_RUNS = 48;
const EXPECTED_MAIN_PUSH_AUTOMATIC = 16;
const MIGRATED_MANUAL_ONLY = [
  '.github/workflows/current-growth-round9.yml',
  '.github/workflows/current-growth-round10.yml',
  '.github/workflows/current-growth-round11.yml',
  '.github/workflows/current-growth-round12.yml',
  '.github/workflows/current-growth-round13.yml',
  '.github/workflows/current-growth-round14.yml',
  '.github/workflows/current-growth-round14-assembly-final.yml',
  '.github/workflows/current-growth-round15.yml',
  '.github/workflows/current-growth-round16.yml',
  '.github/workflows/current-growth-round16-assembly-final.yml',
  '.github/workflows/current-growth-round17.yml',
  '.github/workflows/current-growth-round18.yml',
  '.github/workflows/current-growth-round19.yml',
  '.github/workflows/current-growth-round20.yml',
  '.github/workflows/current-growth-round21.yml',
  '.github/workflows/current-growth-round22.yml',
  '.github/workflows/current-growth-round23.yml',
  '.github/workflows/current-growth-round24.yml',
  '.github/workflows/current-growth-round25.yml',
  '.github/workflows/current-growth-round26.yml',
  '.github/workflows/current-growth-round27.yml',
  '.github/workflows/current-growth-round28-assembly-upstream-hold.yml',
  '.github/workflows/current-growth-round29-assembly-wrapper-shape.yml',
  '.github/workflows/current-growth-round30-form-interface.yml',
  '.github/workflows/current-growth-round31-assembly-kit-apply.yml',
  '.github/workflows/current-growth-round32-assembly-final-head.yml',
  '.github/workflows/current-growth-round32-form-interface-assembly.yml',
  '.github/workflows/current-growth-round33-form-interface.yml',
  '.github/workflows/current-growth-round34-form42-interface35.yml',
  '.github/workflows/current-growth-round35-assembly41-42.yml',
  '.github/workflows/current-growth-round36-form43-interface36.yml',
  '.github/workflows/current-growth-round37-form44-interface37.yml',
  '.github/workflows/current-growth-round38-form46.yml',
  '.github/workflows/current-growth-round39-form45.yml',
  '.github/workflows/current-growth-round40-assembly44.yml',
];

test('trigger classifier distinguishes unrestricted, branch-bounded, manual and PR lanes', () => {
  assert.deepEqual(classifyWorkflow(`on:\n  push:\n  pull_request:\n`), {
    main_push_automatic: true,
    pull_request_automatic: true,
    manual_replay: false,
  });
  assert.deepEqual(classifyWorkflow(`on:\n  push:\n    branches:\n      - verification/example\n  workflow_dispatch:\n`), {
    main_push_automatic: false,
    pull_request_automatic: false,
    manual_replay: true,
  });
  assert.deepEqual(classifyWorkflow(`on:\n  push:\n    branches:\n      - main\n  workflow_dispatch:\n`), {
    main_push_automatic: true,
    pull_request_automatic: false,
    manual_replay: true,
  });
  assert.deepEqual(classifyWorkflow(`on: [push, pull_request, workflow_dispatch]\n`), {
    main_push_automatic: true,
    pull_request_automatic: true,
    manual_replay: true,
  });
});

test('bounded migration removes thirty-five historical automatic lanes while preserving replayability', () => {
  const receipt = auditWorkflows(ROOT);
  assert.equal(
    receipt.main_push_automatic.length,
    EXPECTED_MAIN_PUSH_AUTOMATIC,
    `automatic main-push workflow count must fall from measured ${PRE_MIGRATION_MAIN_PUSH_RUNS} at ${PRE_MIGRATION_MAIN_SHA} ` +
      `to the explicit migration boundary ${EXPECTED_MAIN_PUSH_AUTOMATIC}; reject silent growth or unreviewed migration`,
  );
  assert.ok(
    receipt.main_push_automatic.includes('.github/workflows/test.yml'),
    'generic Verification suite must remain represented in automatic main coverage',
  );
  for (const workflow of MIGRATED_MANUAL_ONLY) {
    assert.ok(receipt.manual_replay.includes(workflow), `${workflow} must remain manually replayable`);
    assert.ok(!receipt.main_push_automatic.includes(workflow), `${workflow} must not auto-run on main pushes after migration`);
    assert.ok(!receipt.pull_request_automatic.includes(workflow), `${workflow} must not auto-run on unrelated PRs after migration`);
  }
  assert.equal(new Set(receipt.main_push_automatic).size, receipt.main_push_automatic.length);
  assert.match(receipt.inventory_sha256, /^[0-9a-f]{64}$/);
  console.log('WORKFLOW_TRIGGER_POLICY_RECEIPT ' + JSON.stringify({
    pre_migration_main_sha: PRE_MIGRATION_MAIN_SHA,
    pre_migration_main_push_runs: PRE_MIGRATION_MAIN_PUSH_RUNS,
    migrated_manual_only: MIGRATED_MANUAL_ONLY,
    current_main_push_automatic: receipt.main_push_automatic.length,
    current_pull_request_automatic: receipt.pull_request_automatic.length,
    current_manual_replay: receipt.manual_replay.length,
    automatic_without_manual_replay: receipt.automatic_without_manual_replay.length,
    inventory_sha256: receipt.inventory_sha256,
  }));
});
