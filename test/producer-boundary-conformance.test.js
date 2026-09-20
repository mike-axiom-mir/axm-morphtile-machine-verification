const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  verifySurfaceRenderEvidenceProvenance,
  verifyFormRepeatFiniteProgression
} = require("../src/producer-boundary-conformance");

function syntheticRenderTool({ producer } = {}) {
  const evidence = {
    status: "TECHNICALLY_RENDERED",
    visual_quality: "NOT_REVIEWED",
    runtime: { repository: "mike-axiom-mir/axm-morphtile", commit: "core-sha" },
    ...(producer ? { producer } : {}),
    cases: [
      { receipt: { id: "a", request_id: "a", technical_render: "PASS", visual_judgement: "NOT_REVIEWED", tower_pixels: 10, render_sha256: "hash-a" } },
      { receipt: { id: "b", request_id: "b", technical_render: "PASS", visual_judgement: "NOT_REVIEWED", tower_pixels: 11, render_sha256: "hash-b" } }
    ]
  };
  return {
    buildEvidence() { return JSON.parse(JSON.stringify(evidence)); },
    verifyBaseline() { return { status: "PASS" }; }
  };
}

const fakeMorphTile = { renderAsset() {}, renderReceipt() {} };

test("render provenance rejects pixel evidence that omits the exact producer revision", () => {
  const result = verifySurfaceRenderEvidenceProvenance(syntheticRenderTool(), fakeMorphTile, {
    surfaceCommit: "surface-sha",
    morphTileCommit: "core-sha"
  });
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some((error) => error.code === "SURFACE_RENDER_PRODUCER_REVISION_MISSING"));
});

test("render provenance accepts separately pinned producer and runtime revisions", () => {
  const result = verifySurfaceRenderEvidenceProvenance(syntheticRenderTool({
    producer: { repository: "mike-axiom-mir/axm-morphtile-machine-surface", commit: "surface-sha" }
  }), fakeMorphTile, {
    surfaceCommit: "surface-sha",
    morphTileCommit: "core-sha"
  });
  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
});

test("finite progression verifier rejects a producer that emits a candidate for known overflow", () => {
  const candidateMachine = { run() { return { status: "CANDIDATE", candidate: {} }; } };
  const result = verifyFormRepeatFiniteProgression(candidateMachine, { formCommit: "form-sha" });
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some((error) => error.code === "FORM_REPEAT_PROGRESSION_NONFINITE_EXPANSION_ACCEPTED"));
});

test("finite progression verifier accepts fail-closed repeat overflow", () => {
  const holdingMachine = { run() { return { status: "HOLD", candidate: null, holds: [{ code: "HOLD_FORM_REPEAT_INVALID" }] }; } };
  const result = verifyFormRepeatFiniteProgression(holdingMachine, { formCommit: "form-sha" });
  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
});

const surfaceRepo = process.env.SURFACE_REPO_PATH;
const surfaceCommit = process.env.SURFACE_COMMIT;
const formRepo = process.env.FORM_REPO_PATH;
const formCommit = process.env.FORM_COMMIT;
const corePath = process.env.MORPHTILE_CORE_PATH;
const coreCommit = process.env.MORPHTILE_COMMIT;
const integrationTest = surfaceRepo && formRepo && corePath ? test : test.skip;

integrationTest("exact Surface render-evidence candidate is HOLD until its portable receipt pins producer revision", () => {
  const renderTool = require(path.join(path.resolve(surfaceRepo), "tools", "render-evidence.js"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifySurfaceRenderEvidenceProvenance(renderTool, MorphTile, { surfaceCommit, morphTileCommit: coreCommit });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.errors.map((error) => error.code), ["SURFACE_RENDER_PRODUCER_REVISION_MISSING"]);
  assert.equal(result.receipt.baseline_status, "PASS");
  assert.equal(result.receipt.visual_quality, "NOT_REVIEWED");
});

integrationTest("exact Form v0.9 candidate is HOLD for finite inputs whose bounded expansion overflows", () => {
  const formMachine = require(path.join(path.resolve(formRepo), "src"));
  const result = verifyFormRepeatFiniteProgression(formMachine, { formCommit });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.errors.map((error) => error.code), ["FORM_REPEAT_PROGRESSION_NONFINITE_EXPANSION_ACCEPTED"]);
  assert.equal(result.receipt.observed_status, "CANDIDATE");
  assert.equal(result.receipt.expanded_i1_finite, false);
});
