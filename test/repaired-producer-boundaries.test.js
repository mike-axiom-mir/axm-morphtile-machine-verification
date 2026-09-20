const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  verifySurfaceRenderEvidenceProvenance,
  verifyFormRepeatFiniteProgression,
  verifyFormGeneratedPositionClosure
} = require("../src/producer-boundary-conformance");

const surfaceRepo = process.env.SURFACE_REPO_PATH;
const surfaceCommit = process.env.SURFACE_COMMIT;
const formRepo = process.env.FORM_REPO_PATH;
const formCommit = process.env.FORM_COMMIT;
const corePath = process.env.MORPHTILE_CORE_PATH;
const coreCommit = process.env.MORPHTILE_COMMIT;
const integrationTest = surfaceRepo && surfaceCommit && formRepo && formCommit && corePath && coreCommit ? test : test.skip;

integrationTest("repaired Surface provenance boundary passes with independently pinned producer identity", () => {
  const renderTool = require(path.join(path.resolve(surfaceRepo), "tools", "render-evidence.js"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifySurfaceRenderEvidenceProvenance(renderTool, MorphTile, {
    surfaceCommit,
    morphTileCommit: coreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.producer_identity.repository, "mike-axiom-mir/axm-morphtile-machine-surface");
  assert.equal(result.receipt.producer_identity.commit, surfaceCommit);
  assert.equal(result.receipt.baseline_status, "PASS");
  assert.equal(result.receipt.mismatched_expected_producer_rejected, true);
  assert.equal(result.receipt.visual_quality, "NOT_REVIEWED");
  assert.deepEqual(
    result.receipt.cases.map(({ id, render_sha256, tower_pixels }) => ({ id, render_sha256, tower_pixels })),
    [
      {
        id: "facing-up",
        render_sha256: "54ca8766c52bb13e8a55268f5794a638befc49fc6045189826059e30f327fb1e",
        tower_pixels: 1638
      },
      {
        id: "checker",
        render_sha256: "a440cf8410e48730fef743fd1c86bfd88c49e982c912c662a89d68b27549d73d",
        tower_pixels: 1638
      }
    ]
  );
});

integrationTest("repaired Form repeat setting progression rejects the original overflow receipt", () => {
  const formMachine = require(path.join(path.resolve(formRepo), "src"));
  const result = verifyFormRepeatFiniteProgression(formMachine, { formCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.observed_status, "HOLD");
  assert.equal(result.receipt.observed_code, "HOLD_FORM_REPEAT_INVALID");
  assert.equal(result.receipt.request_mutated, false);
  assert.equal(result.receipt.expanded_i1_finite, false);
});

integrationTest("repaired Form also closes repeat/grid generated-position overflow without rejecting a large finite control", () => {
  const formMachine = require(path.join(path.resolve(formRepo), "src"));
  const result = verifyFormGeneratedPositionClosure(formMachine, { formCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.deepEqual(result.receipt.repeat, {
    status: "HOLD",
    code: "HOLD_FORM_REPEAT_INVALID",
    request_mutated: false
  });
  assert.deepEqual(result.receipt.grid, {
    status: "HOLD",
    code: "HOLD_FORM_GRID_INVALID",
    request_mutated: false
  });
  assert.deepEqual(result.receipt.finite_control, {
    status: "CANDIDATE",
    code: null,
    request_mutated: false
  });
});
