"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifySleepingCounterLifecycle } = require("../src/capability-runtime-conformance");

const capabilityPath = process.env.CAPABILITY_REPO_PATH;
const corePath = process.env.CAPABILITY_MORPHTILE_CORE_PATH;
const expectedCapabilityCommit = "6446f355f4aeea676269524d410ea42e17324737";
const expectedMorphTileCommit = "4346df01ed18cd1336064f9323d7766ff4f6338a";

test("independently verifies authored default, sparse divergence, forget, replay and workspace roundtrip", {
  skip: capabilityPath && corePath ? false : "set CAPABILITY_REPO_PATH and CAPABILITY_MORPHTILE_CORE_PATH for pinned cross-repo verification"
}, () => {
  assert.equal(process.env.CAPABILITY_COMMIT, expectedCapabilityCommit, "CI must verify the exact Capability Machine candidate head");
  assert.equal(process.env.CAPABILITY_MORPHTILE_COMMIT, expectedMorphTileCommit, "CI must verify the exact MorphTile runtime pin");

  const machine = require(path.resolve(capabilityPath, "src"));
  const runtime = require(path.resolve(corePath));
  const result = verifySleepingCounterLifecycle(machine, runtime, { initial: 7 });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.schema, "axm.morphtile.capability-runtime-conformance-receipt/v0.1");
  assert.equal(result.receipt.authored_initial, 7);
  assert.equal(result.receipt.matter_sha256_before, result.receipt.matter_sha256_after, "sleep/wake/forget must not rewrite canonical matter");
  assert.equal(result.receipt.live_sha256, result.receipt.replay_sha256, "ledger replay must reproduce exact live hash");
  assert.equal(result.receipt.live_sha256, result.receipt.imported_live_sha256, "workspace export/import must preserve exact live hash");
  assert.equal(result.receipt.invalid_initial_status, "HOLD");
  assert.equal(result.receipt.invalid_initial_code, "HOLD_COUNTER_INITIAL_INVALID");
});
