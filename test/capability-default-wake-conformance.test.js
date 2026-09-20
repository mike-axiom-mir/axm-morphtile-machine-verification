"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyCapabilityDefaultWakeVisibility } = require("../src/capability-default-wake-conformance");

const capabilityPath = process.env.CAPABILITY_DEFAULT_WAKE_REPO_PATH;
const capabilityCommit = process.env.CAPABILITY_DEFAULT_WAKE_COMMIT;
const corePath = process.env.CAPABILITY_DEFAULT_WAKE_MORPHTILE_CORE_PATH;
const coreCommit = process.env.CAPABILITY_DEFAULT_WAKE_MORPHTILE_COMMIT;
const ready = [capabilityPath, capabilityCommit, corePath, coreCommit].every(Boolean);

test("independently verifies visible machine default versus raw MorphTile wake omission", { skip: !ready }, () => {
  const Capability = require(path.join(path.resolve(capabilityPath), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyCapabilityDefaultWakeVisibility(Capability, MorphTile, {
    revisions: { capability: capabilityCommit, morphtile: coreCommit }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.receipt.omitted_warning_codes, ["WAKE_DEFAULT_COMPATIBILITY"]);
  assert.deepEqual(result.receipt.explicit_signal_warning_codes, []);
  assert.deepEqual(result.receipt.explicit_manual_warning_codes, []);
  assert.equal(result.receipt.omitted_candidate_sha256, result.receipt.explicit_signal_candidate_sha256);
  assert.equal(result.receipt.null_wake_status, "HOLD");
  assert.equal(result.receipt.empty_wake_status, "HOLD");
  assert.equal(result.receipt.runtime.machine_awake_after_increment, true);
  assert.equal(result.receipt.runtime.machine_count_after_increment, 4);
  assert.equal(result.receipt.runtime.raw_awake_after_increment, false);
  assert.equal(result.receipt.runtime.raw_count_after_increment, null);
  assert.equal(result.receipt.runtime.raw_awake_after_manual, true);
  assert.equal(result.receipt.runtime.raw_count_after_manual, 3);
  assert.equal(result.receipt.runtime.machine_replay_exact, true);
  assert.equal(result.receipt.runtime.raw_replay_exact, true);
});
