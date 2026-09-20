const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  verifyCoreRecipeNonfiniteRepair,
  verifySurfaceStripesObservation,
  verifyFormV09AssemblyPortableClosure
} = require("../src/current-repairs-round2-conformance");

const repairedCorePath = process.env.REPAIRED_CORE_PATH;
const repairedCoreCommit = process.env.REPAIRED_CORE_COMMIT;

const surfaceRepo = process.env.SURFACE_V12_REPO_PATH;
const surfaceCommit = process.env.SURFACE_V12_COMMIT;
const surfaceCorePath = process.env.SURFACE_MORPHTILE_CORE_PATH;
const surfaceCoreCommit = process.env.SURFACE_MORPHTILE_COMMIT;

const formPath = process.env.FORM_V09_MACHINE_PATH;
const formCommit = process.env.FORM_V09_COMMIT;
const assemblyPath = process.env.ASSEMBLY_V16_MACHINE_PATH;
const assemblyCommit = process.env.ASSEMBLY_V16_COMMIT;
const assemblyCorePath = process.env.ASSEMBLY_MORPHTILE_CORE_PATH;
const assemblyCoreCommit = process.env.ASSEMBLY_MORPHTILE_COMMIT;

const coreIntegration = repairedCorePath && repairedCoreCommit ? test : test.skip;
const surfaceIntegration = surfaceRepo && surfaceCommit && surfaceCorePath && surfaceCoreCommit ? test : test.skip;
const assemblyIntegration = formPath && formCommit && assemblyPath && assemblyCommit && assemblyCorePath && assemblyCoreCommit ? test : test.skip;

coreIntegration("MorphTile PR #13 repaired exact head passes the original non-finite recipe attack", () => {
  const MorphTile = require(path.resolve(repairedCorePath));
  const result = verifyCoreRecipeNonfiniteRepair(MorphTile, { coreCommit: repairedCoreCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.original_attack_status, "PASS");
  assert.deepEqual(
    result.receipt.result_classes.map(({ name, hold, threw }) => ({ name, hold, threw })),
    [
      { name: "positive-infinity", hold: "HOLD_RECIPE_NONFINITE_VALUE", threw: null },
      { name: "negative-infinity", hold: "HOLD_RECIPE_NONFINITE_VALUE", threw: null },
      { name: "nan", hold: "HOLD_RECIPE_NONFINITE_VALUE", threw: null }
    ]
  );
  assert.equal(result.receipt.omission_control.hold, null);
  assert.equal(result.receipt.omission_control.threw, null);
  assert.equal(result.receipt.omission_control.positions_finite, true);
});

surfaceIntegration("Surface PR #12 keeps stripes technical-only and evidence identities fail closed", () => {
  const renderTool = require(path.join(path.resolve(surfaceRepo), "tools", "render-evidence.js"));
  const MorphTile = require(path.resolve(surfaceCorePath));
  const result = verifySurfaceStripesObservation(renderTool, MorphTile, {
    surfaceCommit,
    morphTileCommit: surfaceCoreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.baseline_status, "PASS");
  assert.equal(result.receipt.visual_quality, "NOT_REVIEWED");
  assert.deepEqual(result.receipt.reviewed.map((entry) => entry.id).sort(), ["checker", "facing-up"]);
  assert.deepEqual(result.receipt.observations.map((entry) => entry.id).sort(), ["axis-gradient", "stripes"]);
  for (const observation of result.receipt.observations) {
    assert.equal(observation.deterministic_replay, "PASS");
    assert.equal(observation.pixel_baseline, "NOT_ESTABLISHED");
    assert.equal(observation.evidence_tier, "TECHNICALLY_RENDERED_UNBASELINED");
    assert.equal(observation.visual_judgement, "NOT_REVIEWED");
  }
  assert.equal(result.receipt.observation_tamper_ignored_by_reviewed_baseline, true);
  assert.equal(result.receipt.stripes_promotion_rejected, true);
  assert.equal(result.receipt.duplicate_case_id_rejected, true);
  assert.equal(result.receipt.duplicate_request_id_rejected, true);
});

assemblyIntegration("Assembly PR #16 carries Form v0.9 progressive definition closure through portable import", () => {
  const Form = require(path.resolve(formPath));
  const Assembly = require(path.resolve(assemblyPath));
  const { materializeKit } = require(path.join(path.resolve(assemblyPath), "kit.js"));
  const MorphTile = require(path.resolve(assemblyCorePath));

  const result = verifyFormV09AssemblyPortableClosure({
    form: Form,
    assembly: Assembly,
    materializeKit,
    runtime: MorphTile,
    revisions: {
      form: formCommit,
      assembly: assemblyCommit,
      morphtile: assemblyCoreCommit
    }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.deepEqual(result.receipt.missing_definitions, ["panel"]);
  assert.equal(result.receipt.assembly_status, "CANDIDATE");
  assert.deepEqual(result.receipt.required_definitions, ["panel"]);
  assert.equal(result.receipt.kit_verification_status, "PASS");
  assert.equal(result.receipt.import_status, "READY");
  assert.deepEqual(result.receipt.compiled, {
    hold: null,
    recipe_parts: 3,
    positions: 54,
    triangles: 6,
    width_spans: [1, 2, 3]
  });
  assert.equal(result.receipt.definition_tamper_status, "HOLD_HASH_MISMATCH");
  assert.equal(result.receipt.definition_tamper_mutated_receiver, false);
});
