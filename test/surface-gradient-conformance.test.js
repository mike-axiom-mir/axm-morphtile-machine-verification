"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifySurfaceGradientComposition } = require("../src/surface-gradient-conformance");

const surfacePath = process.env.SURFACE_GRADIENT_REPO_PATH;
const surfaceCommit = process.env.SURFACE_GRADIENT_COMMIT;
const corePath = process.env.SURFACE_GRADIENT_MORPHTILE_CORE_PATH;
const coreCommit = process.env.SURFACE_GRADIENT_MORPHTILE_COMMIT;
const ready = [surfacePath, surfaceCommit, corePath, coreCommit].every(Boolean);

test("independently verifies merged Surface v0.5 mixed gradient and checker composition", { skip: !ready }, () => {
  const Surface = require(path.join(path.resolve(surfacePath), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifySurfaceGradientComposition(Surface, MorphTile, {
    expectedVersion: "0.5.0",
    revisions: { surface: surfaceCommit, morphtile: coreCommit }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.visual_status, "NOT_TESTED");
  assert.ok(result.receipt.unique_gradient_colors >= 3);
  assert.equal(result.receipt.saw_clamped_start, true);
  assert.equal(result.receipt.saw_clamped_end, true);
  assert.ok(result.receipt.checker_attenuated_triangles > 0);
  assert.ok(result.receipt.checker_unchanged_triangles > 0);
});
