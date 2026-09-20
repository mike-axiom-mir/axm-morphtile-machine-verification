"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyFlowRuntimeExport } = require("../src/flow-runtime-conformance");

const flowRepoPath = process.env.FLOW_MORPHTILE_REPO_PATH;
const expectedFlowCommit = "0d21088b581c1dcd535842873f33421a14e858b7";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reseal(value, field, hashOf) {
  const body = clone(value);
  delete body[field];
  value[field] = hashOf(body);
  return value;
}

function buildCommittedRuntime(Flow, MT) {
  const runtime = Flow.createRuntime({
    label: "Verification semantic import fixture",
    contracts: [
      { id: "derived:a", depends_on: ["state/a/**"], allowed_routes: ["rewrite-a"] },
      { id: "derived:b", depends_on: ["state/b/**"], allowed_routes: ["rewrite-b"] }
    ],
    artifacts: {
      "derived:a": { artifact_sha256: MT.hashOf({ value: "a0" }), representation: "fixture" },
      "derived:b": { artifact_sha256: MT.hashOf({ value: "b0" }), representation: "fixture" }
    }
  });

  const plan = Flow.planMutation(runtime, { selectors: ["state/a/item"], reason: "verification fixture" });
  assert.equal(plan.status, "PLANNED");
  const staged = Flow.stageGeneration(runtime, plan, {
    "derived:a": { artifact_sha256: MT.hashOf({ value: "a1" }), representation: "fixture", route: "rewrite-a" }
  });
  assert.equal(staged.status, "STAGED");
  const committed = Flow.commitGeneration(runtime, staged, "verification-machine");
  assert.equal(committed.status, "COMMITTED");
  return runtime;
}

test("valid Flowing runtime export passes independent semantic verification", {
  skip: flowRepoPath ? false : "set FLOW_MORPHTILE_REPO_PATH for pinned cross-repo verification"
}, () => {
  assert.equal(process.env.FLOW_MORPHTILE_COMMIT, expectedFlowCommit, "CI must verify the exact repaired Flowing runtime candidate head");
  const MT = require(path.resolve(flowRepoPath, "core/morphtile.js"));
  const Flow = require(path.resolve(flowRepoPath, "experimental/flowing-runtime.js"));
  const runtime = buildCommittedRuntime(Flow, MT);
  const exported = Flow.exportRuntime(runtime);

  assert.doesNotThrow(() => Flow.importRuntime(clone(exported)));
  const result = verifyFlowRuntimeExport(exported, MT);
  assert.equal(result.status, "PASS", JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.generations, 2);
  assert.equal(result.receipt.receipts, 1);
});

test("producer import and independent verifier reject a resealed commit receipt that points to no generation", {
  skip: flowRepoPath ? false : "set FLOW_MORPHTILE_REPO_PATH for pinned cross-repo verification"
}, () => {
  const MT = require(path.resolve(flowRepoPath, "core/morphtile.js"));
  const Flow = require(path.resolve(flowRepoPath, "experimental/flowing-runtime.js"));
  const runtime = buildCommittedRuntime(Flow, MT);
  const tampered = clone(Flow.exportRuntime(runtime));

  tampered.receipts[0].generation_sha256 = "0".repeat(64);
  reseal(tampered.receipts[0], "receipt_sha256", MT.hashOf);
  reseal(tampered, "runtime_sha256", MT.hashOf);

  assert.throws(() => Flow.importRuntime(clone(tampered)), /commit receipt generation unknown/);

  const result = verifyFlowRuntimeExport(tampered, MT);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some(error => error.code === "COMMIT_RECEIPT_GENERATION_UNKNOWN"), JSON.stringify(result.errors, null, 2));
});

test("producer import and independent verifier reject resealed contracts that violate constructor invariants", {
  skip: flowRepoPath ? false : "set FLOW_MORPHTILE_REPO_PATH for pinned cross-repo verification"
}, () => {
  const MT = require(path.resolve(flowRepoPath, "core/morphtile.js"));
  const Flow = require(path.resolve(flowRepoPath, "experimental/flowing-runtime.js"));
  const runtime = buildCommittedRuntime(Flow, MT);
  const tampered = clone(Flow.exportRuntime(runtime));

  tampered.registry["derived:a"].depends_on = [];
  reseal(tampered, "runtime_sha256", MT.hashOf);

  assert.throws(() => Flow.importRuntime(clone(tampered)), /needs depends_on selectors/);

  const result = verifyFlowRuntimeExport(tampered, MT);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some(error => error.code === "REGISTRY_DEPENDS_ON_EMPTY"), JSON.stringify(result.errors, null, 2));
});
