'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { classifyWorkflow, auditWorkflows } = require('../tools/workflow-trigger-policy');

const ROOT = path.join(__dirname, '..');
const MEASURED_MAIN_SHA = '569de6f5c224cb5afba81a9da1041d412b42bafc';
const MEASURED_MAIN_PUSH_RUNS = 48;

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

test('current automatic-main inventory is frozen to the measured 48-run baseline before migration', () => {
  const receipt = auditWorkflows(ROOT);
  assert.equal(
    receipt.main_push_automatic.length,
    MEASURED_MAIN_PUSH_RUNS,
    `automatic main-push workflow count drifted from measured head ${MEASURED_MAIN_SHA}; ` +
      `do not accept silent trigger growth or migration without updating the evidence boundary`,
  );
  assert.ok(
    receipt.main_push_automatic.includes('.github/workflows/test.yml'),
    'generic Verification suite must remain represented in automatic main coverage',
  );
  assert.equal(new Set(receipt.main_push_automatic).size, receipt.main_push_automatic.length);
  assert.match(receipt.inventory_sha256, /^[0-9a-f]{64}$/);
  console.log('WORKFLOW_TRIGGER_POLICY_RECEIPT ' + JSON.stringify({
    measured_main_sha: MEASURED_MAIN_SHA,
    measured_main_push_runs: MEASURED_MAIN_PUSH_RUNS,
    current_main_push_automatic: receipt.main_push_automatic.length,
    current_pull_request_automatic: receipt.pull_request_automatic.length,
    current_manual_replay: receipt.manual_replay.length,
    automatic_without_manual_replay: receipt.automatic_without_manual_replay.length,
    inventory_sha256: receipt.inventory_sha256,
  }));
});
