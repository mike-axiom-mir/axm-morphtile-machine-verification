"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifyCoreMeshFiniteBoundary,
  verifySurfacePortableFiniteBoundary
} = require("../src/current-nonfinite-boundaries-conformance");

const EXPECTED_CORE = "8ca51aedbc7c82cdd5969aa44490912609227405";
const EXPECTED_SURFACE = "c2c4d0a6e77945c0828abd76d4805049c4bde982";

const corePath = process.env.CURRENT_NONFINITE_CORE_PATH;
const coreCommit = process.env.CURRENT_NONFINITE_CORE_COMMIT;
const surfaceRoot = process.env.CURRENT_NONFINITE_SURFACE_ROOT;
const surfaceCommit = process.env.CURRENT_NONFINITE_SURFACE_COMMIT;

const integrationTest = corePath && surfaceRoot ? test : test.skip;

integrationTest("MorphTile PR #14 fails closed on derived non-finite geometry without rejecting a large finite control", () => {
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin the exact MorphTile PR #14 head");
  const MorphTile = require(path.resolve(corePath));
  const result = verifyCoreMeshFiniteBoundary(MorphTile, { coreCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.deepEqual(
    result.receipt.probes.map((probe) => [probe.name, probe.hold, probe.positions, probe.triangles, probe.colors, probe.threw]),
    [
      ["direct-box-overflow", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null],
      ["multi-part-no-partial-leak", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null],
      ["generated-tower-overflow", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null]
    ]
  );
  assert.equal(result.receipt.finite_control.hold, null);
  assert.equal(result.receipt.finite_control.all_positions_finite, true);
});

integrationTest("Surface PR #14 rejects non-finite portable meaning before JSON rewriting and preserves finite controls", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin the exact Surface PR #14 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfacePortableFiniteBoundary(surface, { surfaceCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
  assert.deepEqual(
    result.receipt.outcomes.map((outcome) => [outcome.name, outcome.status, outcome.hold || null]),
    [
      ["gradient-derived-overflow", "HOLD", "HOLD_SURFACE_RULE_RANGE_INVALID"],
      ["gradient-large-finite-control", "CANDIDATE", null],
      ["paint-nested-infinity", "HOLD", "HOLD_SURFACE_PAINT_NONFINITE_VALUE"],
      ["paint-nested-nan", "HOLD", "HOLD_SURFACE_PAINT_NONFINITE_VALUE"],
      ["paint-var-infinity", "HOLD", "HOLD_SURFACE_PAINT_VARS_INVALID"],
      ["paint-finite-control", "CANDIDATE", null]
    ]
  );
});
