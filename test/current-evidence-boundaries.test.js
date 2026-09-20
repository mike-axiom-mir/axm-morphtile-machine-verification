const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  validateSurfaceEvidenceShape,
  verifySurfaceObservationEvidence,
  verifyCoreRecipeNonfiniteBoundary
} = require("../src/current-evidence-boundaries-conformance");

const surfaceRepo = process.env.SURFACE_REPO_PATH;
const surfaceCommit = process.env.SURFACE_COMMIT;
const surfaceCorePath = process.env.SURFACE_MORPHTILE_CORE_PATH;
const surfaceCoreCommit = process.env.SURFACE_MORPHTILE_COMMIT;
const coreCandidatePath = process.env.CORE_CANDIDATE_PATH;
const coreCandidateCommit = process.env.CORE_CANDIDATE_COMMIT;

const surfaceIntegration = surfaceRepo && surfaceCommit && surfaceCorePath && surfaceCoreCommit ? test : test.skip;
const coreIntegration = coreCandidatePath && coreCandidateCommit ? test : test.skip;

surfaceIntegration("Surface PR #11 keeps deterministic gradient observation outside reviewed pixel authority", () => {
  const renderTool = require(path.join(path.resolve(surfaceRepo), "tools", "render-evidence.js"));
  const MorphTile = require(path.resolve(surfaceCorePath));
  const result = verifySurfaceObservationEvidence(renderTool, MorphTile, {
    surfaceCommit,
    morphTileCommit: surfaceCoreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.baseline_status, "PASS");
  assert.equal(result.receipt.observation_tamper_ignored_by_reviewed_baseline, true);
  assert.equal(result.receipt.observation_promotion_rejected, true);
  assert.equal(result.receipt.independent_authority_tamper_rejected, true);
  assert.equal(result.receipt.visual_quality, "NOT_REVIEWED");
  assert.deepEqual(result.receipt.reviewed_cases.map((entry) => entry.id).sort(), ["checker", "facing-up"]);
  assert.equal(result.receipt.observations.length, 1);
  assert.deepEqual(
    {
      id: result.receipt.observations[0].id,
      deterministic_replay: result.receipt.observations[0].deterministic_replay,
      pixel_baseline: result.receipt.observations[0].pixel_baseline,
      evidence_tier: result.receipt.observations[0].evidence_tier,
      visual_judgement: result.receipt.observations[0].visual_judgement
    },
    {
      id: "axis-gradient",
      deterministic_replay: "PASS",
      pixel_baseline: "NOT_ESTABLISHED",
      evidence_tier: "TECHNICALLY_RENDERED_UNBASELINED",
      visual_judgement: "NOT_REVIEWED"
    }
  );
});

test("independent Surface receipt validator rejects silent observation baseline promotion", () => {
  const evidence = {
    schema: "axm.morphtile.surface-render-evidence/v0.3",
    status: "TECHNICALLY_RENDERED",
    visual_quality: "NOT_REVIEWED",
    baseline_scope: ["facing-up", "checker"],
    cases: [
      { receipt: { id: "facing-up", technical_render: "PASS", visual_judgement: "NOT_REVIEWED", render_sha256: "1".repeat(64), tower_pixels: 1 } },
      { receipt: { id: "checker", technical_render: "PASS", visual_judgement: "NOT_REVIEWED", render_sha256: "2".repeat(64), tower_pixels: 1 } }
    ],
    observations: [
      { receipt: { id: "axis-gradient", technical_render: "PASS", deterministic_replay: "PASS", pixel_baseline: "PASS", evidence_tier: "TECHNICALLY_RENDERED_UNBASELINED", visual_judgement: "NOT_REVIEWED", render_sha256: "3".repeat(64), tower_pixels: 1 } }
    ]
  };

  const errors = validateSurfaceEvidenceShape(evidence);
  assert.ok(errors.some((entry) => entry.code === "SURFACE_OBSERVATION_BASELINE_AUTHORITY_WIDENED"), JSON.stringify(errors));
});

coreIntegration("MorphTile PR #13 exact head still FAIL/HOLDs the non-finite recipe truth boundary", () => {
  const MorphTile = require(path.resolve(coreCandidatePath));
  const result = verifyCoreRecipeNonfiniteBoundary(MorphTile, { coreCommit: coreCandidateCommit });

  assert.equal(result.status, "FAIL", "Current PR #13 is regression-first and should remain a detected producer/core failure until repaired.");
  assert.deepEqual(
    result.errors.map((entry) => entry.code).sort(),
    [
      "CORE_RECIPE_NONFINITE_DEFINITION_SETTING_ACCEPTED",
      "CORE_RECIPE_NONFINITE_POSITION_ACCEPTED",
      "CORE_RECIPE_NONFINITE_REPEAT_ACCEPTED",
      "CORE_RECIPE_NONFINITE_SIZE_ACCEPTED"
    ]
  );
  assert.deepEqual(
    result.receipt.probes.map(({ name, hold, threw }) => ({ name, hold, threw })),
    [
      { name: "position", hold: null, threw: null },
      { name: "size", hold: null, threw: null },
      { name: "repeat", hold: null, threw: null },
      { name: "definition-setting", hold: null, threw: null }
    ]
  );
  assert.equal(result.receipt.finite_control.hold, null);
  assert.equal(result.receipt.finite_control.threw, null);
  assert.equal(result.receipt.finite_control.positions_finite, true);
});
