"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifySurfaceGradientComposition } = require("../src/surface-gradient-conformance");

const surfacePath = process.env.SURFACE_GRADIENT_REPAIR_REPO_PATH;
const surfaceCommit = process.env.SURFACE_GRADIENT_REPAIR_COMMIT;
const corePath = process.env.SURFACE_GRADIENT_REPAIR_MORPHTILE_CORE_PATH;
const coreCommit = process.env.SURFACE_GRADIENT_REPAIR_MORPHTILE_COMMIT;
const ready = [surfacePath, surfaceCommit, corePath, coreCommit].every(Boolean);

test("replays the original mixed-direction Surface gradient attack against repaired v0.5.1", { skip: !ready }, () => {
  const Surface = require(path.join(path.resolve(surfacePath), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifySurfaceGradientComposition(Surface, MorphTile, {
    expectedVersion: "0.5.1",
    revisions: { surface: surfaceCommit, morphtile: coreCommit }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.visual_status, "NOT_TESTED");
  assert.equal(result.receipt.saw_clamped_start, true);
  assert.equal(result.receipt.saw_clamped_end, true);
  assert.ok(result.receipt.unique_gradient_colors >= 3);
  assert.equal(result.receipt.patterned_status, "CANDIDATE");
  assert.ok(result.receipt.checker_attenuated_triangles > 0);
  assert.ok(result.receipt.checker_unchanged_triangles > 0);
  assert.equal(result.receipt.strict_cases.length, 6);
  for (const item of result.receipt.strict_cases) {
    assert.equal(item.status, "HOLD", JSON.stringify(item));
    assert.equal(item.mutated, false, JSON.stringify(item));
  }
});
