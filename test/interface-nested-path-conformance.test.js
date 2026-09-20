"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyInterfaceNestedPaths } = require("../src/interface-nested-path-conformance");

const interfacePath = process.env.INTERFACE_NESTED_PATH_REPO_PATH;
const interfaceCommit = process.env.INTERFACE_NESTED_PATH_COMMIT;
const corePath = process.env.INTERFACE_NESTED_PATH_MORPHTILE_CORE_PATH;
const coreCommit = process.env.INTERFACE_NESTED_PATH_MORPHTILE_COMMIT;
const ready = [interfacePath, interfaceCommit, corePath, coreCommit].every(Boolean);

test("independently verifies Interface v0.5.1 nested target and anchor paths through real MorphTile runtime", { skip: !ready }, () => {
  const Interface = require(path.join(path.resolve(interfacePath), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyInterfaceNestedPaths(Interface, MorphTile, {
    expectedVersion: "0.5.1",
    revisions: { interface: interfaceCommit, morphtile: coreCommit }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.candidate_status, "CANDIDATE");
  assert.equal(result.receipt.nested_path, "mt_shell/mt_inner");
  assert.deepEqual(result.receipt.commit_units, [
    "tile:mt_shell/mt_inner#presentation",
    "tile:mt_shell/mt_inner#view"
  ]);
  assert.equal(result.receipt.resolved_anchor, "mt_shell/mt_inner");
  assert.equal(result.receipt.panel_contains_nested_proof, true);
  assert.equal(result.receipt.rollback_exact, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
  assert.equal(result.receipt.invalid_cases.length, 5);
  for (const item of result.receipt.invalid_cases) {
    assert.equal(item.status, "HOLD", JSON.stringify(item));
    assert.equal(item.code, "HOLD_INTERFACE_TILE_PATH_INVALID", JSON.stringify(item));
    assert.equal(item.mutated, false, JSON.stringify(item));
  }
  assert.deepEqual(result.receipt.invalid_anchor, {
    status: "HOLD",
    code: "HOLD_INVALID_PRESENTATION_PLACEMENT",
    mutated: false
  });
});
