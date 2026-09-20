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

test("detects merged Surface v0.5 exact-clamp drift while preserving the passing composition boundaries", { skip: !ready }, () => {
  const Surface = require(path.join(path.resolve(surfacePath), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifySurfaceGradientComposition(Surface, MorphTile, {
    expectedVersion: "0.5.0",
    revisions: { surface: surfaceCommit, morphtile: coreCommit }
  });

  assert.equal(result.status, "FAIL", "the exact merged Surface head must remain FAIL/HOLD until the clamp contract is repaired");
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(codes.has("GRADIENT_CLAMP_ENDPOINT_MISSING"), true, JSON.stringify(result, null, 2));
  assert.equal(codes.has("GRADIENT_CHANNEL_ESCAPED_BOUNDS"), true, JSON.stringify(result, null, 2));
  assert.equal([...codes].every((code) => code === "GRADIENT_CLAMP_ENDPOINT_MISSING" || code === "GRADIENT_CHANNEL_ESCAPED_BOUNDS"), true, JSON.stringify(result, null, 2));

  assert.equal(result.receipt.visual_status, "NOT_TESTED");
  assert.ok(result.receipt.unique_gradient_colors >= 3);
  assert.equal(result.receipt.saw_clamped_start, true);
  assert.equal(result.receipt.saw_clamped_end, false);

  // These independent boundaries passed even though the overall producer claim does not.
  assert.equal(result.receipt.patterned_status, "CANDIDATE");
  assert.ok(result.receipt.checker_attenuated_triangles > 0);
  assert.ok(result.receipt.checker_unchanged_triangles > 0);
  assert.equal(result.receipt.strict_cases.length, 6);
  for (const item of result.receipt.strict_cases) {
    assert.equal(item.status, "HOLD", JSON.stringify(item));
    assert.equal(item.mutated, false, JSON.stringify(item));
  }
});
