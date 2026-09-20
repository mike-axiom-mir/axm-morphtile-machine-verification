"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function reviewedCaseSummary(evidence) {
  if (!evidence || !Array.isArray(evidence.cases)) return [];
  return evidence.cases.map((entry) => {
    const receipt = entry && entry.receipt ? entry.receipt : entry;
    return {
      id: receipt && receipt.id || null,
      request_id: receipt && receipt.request_id || null,
      render_sha256: receipt && receipt.render_sha256 || null,
      tower_pixels: receipt && receipt.tower_pixels || 0,
      technical_render: receipt && receipt.technical_render || null,
      visual_judgement: receipt && receipt.visual_judgement || null
    };
  });
}

function observationSummary(evidence) {
  if (!evidence || !Array.isArray(evidence.observations)) return [];
  return evidence.observations.map((entry) => {
    const receipt = entry && entry.receipt ? entry.receipt : entry;
    return {
      id: receipt && receipt.id || null,
      request_id: receipt && receipt.request_id || null,
      render_sha256: receipt && receipt.render_sha256 || null,
      tower_pixels: receipt && receipt.tower_pixels || 0,
      technical_render: receipt && receipt.technical_render || null,
      deterministic_replay: receipt && receipt.deterministic_replay || null,
      pixel_baseline: receipt && receipt.pixel_baseline || null,
      evidence_tier: receipt && receipt.evidence_tier || null,
      visual_judgement: receipt && receipt.visual_judgement || null
    };
  });
}

function validateSurfaceEvidenceShape(evidence) {
  const errors = [];
  if (!evidence || evidence.schema !== "axm.morphtile.surface-render-evidence/v0.3") {
    errors.push(failure("SURFACE_EVIDENCE_SCHEMA_UNEXPECTED", "Surface render evidence must use the v0.3 split-evidence schema.", { observed_schema: evidence && evidence.schema || null }));
    return errors;
  }

  if (evidence.status !== "TECHNICALLY_RENDERED") {
    errors.push(failure("SURFACE_TECHNICAL_STATUS_UNEXPECTED", "Surface evidence left the technical-render status class.", { observed_status: evidence.status || null }));
  }
  if (evidence.visual_quality !== "NOT_REVIEWED") {
    errors.push(failure("SURFACE_VISUAL_QUALITY_WIDENED", "Technical render evidence must not become aesthetic acceptance.", { observed_visual_quality: evidence.visual_quality || null }));
  }

  const reviewed = reviewedCaseSummary(evidence);
  const reviewedIds = reviewed.map((entry) => entry.id).sort();
  const expectedReviewedIds = ["checker", "facing-up"];
  if (JSON.stringify(reviewedIds) !== JSON.stringify(expectedReviewedIds)) {
    errors.push(failure("SURFACE_REVIEWED_CASE_SET_DRIFT", "Reviewed pixel authority must remain the closed facing-up/checker case set.", { observed_ids: reviewedIds }));
  }

  const baselineScope = Array.isArray(evidence.baseline_scope) ? [...evidence.baseline_scope].sort() : [];
  if (JSON.stringify(baselineScope) !== JSON.stringify(expectedReviewedIds)) {
    errors.push(failure("SURFACE_BASELINE_SCOPE_DRIFT", "Portable evidence baseline_scope widened or lost reviewed cases.", { observed_scope: baselineScope }));
  }

  for (const item of reviewed) {
    if (item.technical_render !== "PASS" || item.visual_judgement !== "NOT_REVIEWED") {
      errors.push(failure("SURFACE_REVIEWED_CASE_BOUNDARY_INVALID", "Reviewed pixel sentinels must remain technical evidence with no aesthetic judgement.", { case: item.id, technical_render: item.technical_render, visual_judgement: item.visual_judgement }));
    }
    if (!item.render_sha256 || item.tower_pixels <= 0) {
      errors.push(failure("SURFACE_REVIEWED_RECEIPT_INCOMPLETE", "Reviewed pixel sentinel lacks render identity or target coverage.", { case: item.id }));
    }
  }

  const observations = observationSummary(evidence);
  if (observations.length !== 1 || observations[0].id !== "axis-gradient") {
    errors.push(failure("SURFACE_OBSERVATION_SET_DRIFT", "The current unbaselined observation contract is exactly one axis-gradient case.", { observed_ids: observations.map((entry) => entry.id) }));
  }

  for (const item of observations) {
    if (item.technical_render !== "PASS") {
      errors.push(failure("SURFACE_OBSERVATION_NOT_RENDERED", "Unbaselined observation did not retain technical-render PASS.", { case: item.id, technical_render: item.technical_render }));
    }
    if (item.deterministic_replay !== "PASS") {
      errors.push(failure("SURFACE_OBSERVATION_REPLAY_UNPROVEN", "Unbaselined observation must prove exact-input deterministic replay.", { case: item.id, deterministic_replay: item.deterministic_replay }));
    }
    if (item.pixel_baseline !== "NOT_ESTABLISHED" || item.evidence_tier !== "TECHNICALLY_RENDERED_UNBASELINED") {
      errors.push(failure("SURFACE_OBSERVATION_BASELINE_AUTHORITY_WIDENED", "A deterministic observation must not silently acquire reviewed pixel-baseline authority.", { case: item.id, pixel_baseline: item.pixel_baseline, evidence_tier: item.evidence_tier }));
    }
    if (item.visual_judgement !== "NOT_REVIEWED") {
      errors.push(failure("SURFACE_OBSERVATION_VISUAL_JUDGEMENT_WIDENED", "Technical observation must not silently become aesthetic approval.", { case: item.id, visual_judgement: item.visual_judgement }));
    }
    if (!item.render_sha256 || item.tower_pixels <= 0) {
      errors.push(failure("SURFACE_OBSERVATION_RECEIPT_INCOMPLETE", "Unbaselined observation lacks render identity or target coverage.", { case: item.id }));
    }
  }

  const reviewedHashes = new Set(reviewed.map((entry) => entry.render_sha256).filter(Boolean));
  for (const item of observations) {
    if (item.render_sha256 && reviewedHashes.has(item.render_sha256)) {
      errors.push(failure("SURFACE_OBSERVATION_COLLAPSED_TO_REVIEWED_CASE", "Unbaselined observation unexpectedly shares exact pixels with a reviewed case.", { case: item.id, render_sha256: item.render_sha256 }));
    }
  }

  return errors;
}

function verifySurfaceObservationEvidence(renderTool, MorphTile, options = {}) {
  const surfaceCommit = options.surfaceCommit || null;
  const morphTileCommit = options.morphTileCommit || null;
  const errors = [];
  const checked = [];

  if (!renderTool || typeof renderTool.buildEvidence !== "function" || typeof renderTool.verifyBaseline !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_RENDER_TOOL_CONTRACT_MISSING", "Surface observation verification requires buildEvidence() and verifyBaseline().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.renderAsset !== "function" || typeof MorphTile.renderReceipt !== "function") {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_RENDER_CONTRACT_MISSING", "Surface observation verification requires MorphTile renderAsset/renderReceipt.")], receipt: null };
  }
  if (!surfaceCommit || !morphTileCommit) {
    return { status: "FAIL", checked, errors: [failure("VERIFICATION_REVISION_PIN_MISSING", "Exact Surface and MorphTile commits are required.")], receipt: null };
  }

  const producer = { repository: "mike-axiom-mir/axm-morphtile-machine-surface", commit: surfaceCommit };
  let first;
  let second;
  try {
    first = renderTool.buildEvidence(MorphTile, morphTileCommit, producer);
    second = renderTool.buildEvidence(MorphTile, morphTileCommit, producer);
  } catch (error) {
    return { status: "FAIL", checked, errors: [failure("SURFACE_OBSERVATION_EXECUTION_FAILED", "Surface evidence generation failed.", { observed_error: error && error.message || String(error) })], receipt: null };
  }

  errors.push(...validateSurfaceEvidenceShape(first));
  checked.push("split-evidence-shape-and-authority");

  if (!first.producer || first.producer.repository !== producer.repository || first.producer.commit !== surfaceCommit) {
    errors.push(failure("SURFACE_OBSERVATION_PRODUCER_PROVENANCE_MISMATCH", "Observation evidence must identify the exact Surface producer revision.", { expected: producer, observed: first.producer || null }));
  }
  if (!first.runtime || first.runtime.commit !== morphTileCommit) {
    errors.push(failure("SURFACE_OBSERVATION_RUNTIME_PROVENANCE_MISMATCH", "Observation evidence must identify the exact MorphTile runtime revision.", { expected: morphTileCommit, observed: first.runtime && first.runtime.commit || null }));
  }
  checked.push("producer-and-runtime-provenance");

  const firstObservation = observationSummary(first);
  const secondObservation = observationSummary(second);
  if (JSON.stringify(firstObservation) !== JSON.stringify(secondObservation)) {
    errors.push(failure("SURFACE_OBSERVATION_NONDETERMINISTIC", "Repeated exact-input evidence builds produced different axis-gradient observation receipts.", { first: firstObservation, second: secondObservation }));
  }
  checked.push("observation-repeat-determinism");

  let baselineStatus = null;
  try {
    const baseline = renderTool.verifyBaseline(first, undefined, producer);
    baselineStatus = baseline && baseline.status || null;
    if (baselineStatus !== "PASS") {
      errors.push(failure("SURFACE_REVIEWED_BASELINE_NOT_PASS", "The reviewed facing/checker pixel baseline did not PASS independently.", { observed_status: baselineStatus }));
    }
  } catch (error) {
    errors.push(failure("SURFACE_REVIEWED_BASELINE_REJECTED", "The reviewed facing/checker pixel baseline rejected exact generated evidence.", { observed_error: error && error.message || String(error) }));
  }
  checked.push("reviewed-baseline-still-pass");

  let observationTamperIgnoredByReviewedBaseline = null;
  try {
    const tampered = {
      ...first,
      observations: first.observations.map((entry) => ({
        ...entry,
        receipt: { ...entry.receipt, render_sha256: "0".repeat(64) }
      }))
    };
    const baseline = renderTool.verifyBaseline(tampered, undefined, producer);
    observationTamperIgnoredByReviewedBaseline = baseline && baseline.status === "PASS";
    if (!observationTamperIgnoredByReviewedBaseline) {
      errors.push(failure("SURFACE_OBSERVATION_LEAKED_INTO_REVIEWED_BASELINE", "Changing only unbaselined observation pixels unexpectedly changed reviewed baseline authority."));
    }
  } catch (error) {
    observationTamperIgnoredByReviewedBaseline = false;
    errors.push(failure("SURFACE_OBSERVATION_LEAKED_INTO_REVIEWED_BASELINE", "Reviewed baseline checker rejected evidence only because an unbaselined observation changed.", { observed_error: error && error.message || String(error) }));
  }
  checked.push("observation-isolation-from-reviewed-baseline");

  let promotionRejected = null;
  try {
    const promoted = {
      ...first,
      cases: [...first.cases, first.observations[0]]
    };
    renderTool.verifyBaseline(promoted, undefined, producer);
    promotionRejected = false;
    errors.push(failure("SURFACE_OBSERVATION_PROMOTION_ACCEPTED", "Reviewed baseline checker accepted an unbaselined observation inserted into the reviewed case set."));
  } catch (_error) {
    promotionRejected = true;
  }
  checked.push("observation-cannot-enter-reviewed-case-set-silently");

  const widenedObservation = {
    ...first,
    observations: first.observations.map((entry) => ({
      ...entry,
      receipt: { ...entry.receipt, pixel_baseline: "PASS" }
    }))
  };
  const widenedErrors = validateSurfaceEvidenceShape(widenedObservation);
  const independentWideningRejected = widenedErrors.some((entry) => entry.code === "SURFACE_OBSERVATION_BASELINE_AUTHORITY_WIDENED");
  if (!independentWideningRejected) {
    errors.push(failure("VERIFIER_SURFACE_AUTHORITY_ATTACK_FAILED", "Independent verifier did not reject a tampered observation that claimed reviewed pixel authority."));
  }
  checked.push("independent-observation-authority-tamper-rejection");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-observation-evidence-conformance/v0.1",
      surface_commit: surfaceCommit,
      morphtile_commit: morphTileCommit,
      baseline_status: baselineStatus,
      observation_tamper_ignored_by_reviewed_baseline: observationTamperIgnoredByReviewedBaseline,
      observation_promotion_rejected: promotionRejected,
      independent_authority_tamper_rejected: independentWideningRejected,
      reviewed_cases: reviewedCaseSummary(first),
      observations: firstObservation,
      visual_quality: first.visual_quality || null
    }
  };
}

function tileFor(MorphTile, parts) {
  return MorphTile.createTile({
    id: "mt_nonfinite",
    name: "Verification non-finite recipe probe",
    facets: {
      mesh: {
        type: "generated",
        source: null,
        data: { generator: "recipe", parts }
      }
    }
  });
}

function verifyCoreRecipeNonfiniteBoundary(MorphTile, options = {}) {
  const coreCommit = options.coreCommit || null;
  const expectedHold = "HOLD_RECIPE_NONFINITE_VALUE";
  const overflow = ["*", Number.MAX_VALUE, 2];
  const errors = [];
  const checked = [];

  if (!MorphTile || typeof MorphTile.createTile !== "function" || typeof MorphTile.compileMesh !== "function" || typeof MorphTile.createWorld !== "function") {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_RECIPE_CONTRACT_MISSING", "Core recipe verification requires createTile(), createWorld(), and compileMesh().")], receipt: null };
  }

  const probes = [];
  function probe(name, parts) {
    let mesh = null;
    let threw = null;
    try {
      mesh = MorphTile.compileMesh(tileFor(MorphTile, parts));
    } catch (error) {
      threw = error && error.message || String(error);
    }
    const hold = mesh && mesh.hold || null;
    probes.push({ name, hold, threw });
    if (threw) {
      errors.push(failure(`CORE_RECIPE_NONFINITE_${name.toUpperCase()}_THREW`, "Core recipe runtime threw instead of exposing a deterministic HOLD.", { observed_error: threw }));
    } else if (hold !== expectedHold) {
      errors.push(failure(`CORE_RECIPE_NONFINITE_${name.toUpperCase()}_ACCEPTED`, "Present recipe expression evaluated non-finite but was silently defaulted/accepted instead of HOLDing.", { expected_hold: expectedHold, observed_hold: hold }));
    }
  }

  probe("position", [{ shape: "plane", pos: [overflow, 0, 0] }]);
  probe("size", [{ shape: "plane", size: [overflow, 1, 1] }]);
  probe("repeat", [{ repeat: overflow, as: "i", body: [{ shape: "plane" }] }]);
  checked.push("position-size-repeat-nonfinite-fail-closed");

  let definitionMesh = null;
  let definitionThrew = null;
  try {
    const world = MorphTile.createWorld("Verification non-finite setting probe");
    world.defs = {
      def_parametric: {
        id: "def_parametric",
        name: "Parametric plane",
        body: {
          facets: {
            mesh: {
              type: "generated",
              source: null,
              data: {
                generator: "recipe",
                vars: { width: 1 },
                parts: [{ shape: "plane", size: [["var", "width"], 1, 1] }]
              }
            },
            material: { type: "primitive", source: null, data: { color: [0.7, 0.7, 0.9] } }
          }
        }
      }
    };
    const tile = tileFor(MorphTile, [{ use: "def_parametric", with: { width: overflow } }]);
    world.tiles[tile.id] = tile;
    definitionMesh = MorphTile.compileMesh(tile, world);
  } catch (error) {
    definitionThrew = error && error.message || String(error);
  }
  const definitionHold = definitionMesh && definitionMesh.hold || null;
  probes.push({ name: "definition-setting", hold: definitionHold, threw: definitionThrew });
  if (definitionThrew) {
    errors.push(failure("CORE_RECIPE_NONFINITE_DEFINITION_SETTING_THREW", "Definition-setting overflow threw instead of exposing a deterministic HOLD.", { observed_error: definitionThrew }));
  } else if (definitionHold !== expectedHold) {
    errors.push(failure("CORE_RECIPE_NONFINITE_DEFINITION_SETTING_ACCEPTED", "Non-finite reusable-definition setting was silently accepted/fell through.", { expected_hold: expectedHold, observed_hold: definitionHold }));
  }
  checked.push("definition-setting-nonfinite-fail-closed");

  let finiteMesh = null;
  let finiteThrew = null;
  try {
    finiteMesh = MorphTile.compileMesh(tileFor(MorphTile, [{ shape: "plane", pos: [Number.MAX_VALUE / 4, 0, 0], size: [2, 1, 2] }]));
  } catch (error) {
    finiteThrew = error && error.message || String(error);
  }
  const finiteHold = finiteMesh && finiteMesh.hold || null;
  const finitePositions = finiteMesh && Array.isArray(finiteMesh.P) ? finiteMesh.P.every(Number.isFinite) : false;
  if (finiteThrew) {
    errors.push(failure("CORE_RECIPE_LARGE_FINITE_CONTROL_THREW", "Large-but-finite control threw unexpectedly.", { observed_error: finiteThrew }));
  } else if (finiteHold !== null || !finitePositions) {
    errors.push(failure("CORE_RECIPE_LARGE_FINITE_CONTROL_REJECTED", "Non-finite guard overreached into a large-but-finite recipe control.", { observed_hold: finiteHold, finite_positions: finitePositions }));
  }
  checked.push("large-finite-control-remains-accepted");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.core-recipe-nonfinite-conformance/v0.1",
      core_commit: coreCommit,
      expected_hold: expectedHold,
      probes,
      finite_control: {
        hold: finiteHold,
        threw: finiteThrew,
        positions_finite: finitePositions
      }
    }
  };
}

module.exports = {
  validateSurfaceEvidenceShape,
  verifySurfaceObservationEvidence,
  verifyCoreRecipeNonfiniteBoundary
};
