"use strict";

const { verifyCoreRecipeNonfiniteBoundary } = require("./current-evidence-boundaries-conformance");
const { verifyKitCandidate } = require("./kit-conformance");
const { failure } = require("./verdict");

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function tileFor(MorphTile, parts) {
  return MorphTile.createTile({
    id: "mt_nonfinite_repair_verify",
    name: "Verification repaired non-finite recipe probe",
    facets: {
      mesh: {
        type: "generated",
        source: null,
        data: { generator: "recipe", parts }
      }
    }
  });
}

function verifyCoreRecipeNonfiniteRepair(MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  const coreCommit = options.coreCommit || null;
  const expectedHold = "HOLD_RECIPE_NONFINITE_VALUE";

  const base = verifyCoreRecipeNonfiniteBoundary(MorphTile, { coreCommit });
  if (!base || base.status !== "PASS") {
    errors.push(failure(
      "CORE_RECIPE_REPAIR_ORIGINAL_ATTACK_NOT_PASS",
      "The repaired core head did not pass the original independent non-finite recipe attack.",
      { verifier_errors: clone(base && base.errors || []) }
    ));
  }
  checked.push("original-failing-attack-replayed-on-repaired-head");

  const expressionCases = [
    ["positive-infinity", ["*", Number.MAX_VALUE, 2]],
    ["negative-infinity", ["*", -Number.MAX_VALUE, 2]],
    ["nan", ["pow", -1, 0.5]]
  ];
  const resultClasses = [];

  for (const [name, expression] of expressionCases) {
    let mesh = null;
    let threw = null;
    try {
      mesh = MorphTile.compileMesh(tileFor(MorphTile, [{ shape: "plane", pos: [expression, 0, 0] }]));
    } catch (error) {
      threw = error && error.message || String(error);
    }
    const hold = mesh && mesh.hold || null;
    resultClasses.push({ name, hold, threw });
    if (threw) {
      errors.push(failure("CORE_RECIPE_REPAIR_RESULT_CLASS_THREW", "A numeric non-finite result class threw instead of exposing the deterministic recipe HOLD.", { result_class: name, observed_error: threw }));
    } else if (hold !== expectedHold) {
      errors.push(failure("CORE_RECIPE_REPAIR_RESULT_CLASS_ACCEPTED", "A numeric non-finite result class did not fail closed at the shared recipe boundary.", { result_class: name, expected_hold: expectedHold, observed_hold: hold }));
    }
  }
  checked.push("positive-negative-infinity-and-nan-fail-closed");

  let omittedMesh = null;
  let omittedThrew = null;
  try {
    omittedMesh = MorphTile.compileMesh(tileFor(MorphTile, [{ shape: "plane" }]));
  } catch (error) {
    omittedThrew = error && error.message || String(error);
  }
  const omittedHold = omittedMesh && omittedMesh.hold || null;
  const omittedFinite = omittedMesh && Array.isArray(omittedMesh.P) ? omittedMesh.P.every(Number.isFinite) : false;
  if (omittedThrew || omittedHold !== null || !omittedFinite) {
    errors.push(failure("CORE_RECIPE_REPAIR_OMISSION_DEFAULT_DRIFT", "The non-finite repair overreached into truly omitted optional recipe values.", { observed_error: omittedThrew, observed_hold: omittedHold, positions_finite: omittedFinite }));
  }
  checked.push("omitted-optional-values-keep-existing-defaults");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.core-recipe-nonfinite-repair-conformance/v0.1",
      core_commit: coreCommit,
      original_attack_status: base && base.status || null,
      original_attack_receipt: clone(base && base.receipt || null),
      result_classes: resultClasses,
      omission_control: {
        hold: omittedHold,
        threw: omittedThrew,
        positions_finite: omittedFinite
      }
    }
  };
}

function evidenceReceipt(entry) {
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
}

function verifySurfaceStripesObservation(renderTool, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  const surfaceCommit = options.surfaceCommit || null;
  const morphTileCommit = options.morphTileCommit || null;

  if (!renderTool || typeof renderTool.buildEvidence !== "function" || typeof renderTool.verifyBaseline !== "function" || typeof renderTool.assertUniqueEvidenceIdentities !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_STRIPES_TOOL_CONTRACT_MISSING", "Surface stripes verification requires buildEvidence(), verifyBaseline(), and assertUniqueEvidenceIdentities().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.renderAsset !== "function" || typeof MorphTile.renderReceipt !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_STRIPES_RUNTIME_CONTRACT_MISSING", "Surface stripes verification requires the pinned MorphTile render contract.")], receipt: null };
  }
  if (!surfaceCommit || !morphTileCommit) {
    return { status: "FAIL", checked, errors: [failure("SURFACE_STRIPES_REVISION_PIN_MISSING", "Exact Surface and MorphTile commits are required.")], receipt: null };
  }

  const producer = { repository: "mike-axiom-mir/axm-morphtile-machine-surface", commit: surfaceCommit };
  let first;
  let second;
  try {
    first = renderTool.buildEvidence(MorphTile, morphTileCommit, producer);
    second = renderTool.buildEvidence(MorphTile, morphTileCommit, producer);
  } catch (error) {
    return { status: "FAIL", checked, errors: [failure("SURFACE_STRIPES_EVIDENCE_BUILD_FAILED", "Surface evidence generation failed on the exact candidate.", { observed_error: error && error.message || String(error) })], receipt: null };
  }

  const reviewed = Array.isArray(first && first.cases) ? first.cases.map(evidenceReceipt) : [];
  const observations = Array.isArray(first && first.observations) ? first.observations.map(evidenceReceipt) : [];
  const observationsSecond = Array.isArray(second && second.observations) ? second.observations.map(evidenceReceipt) : [];
  const reviewedIds = reviewed.map((entry) => entry.id).sort();
  const observationIds = observations.map((entry) => entry.id).sort();

  if (!first || first.schema !== "axm.morphtile.surface-render-evidence/v0.3") {
    errors.push(failure("SURFACE_STRIPES_SCHEMA_DRIFT", "The stripes candidate must preserve the v0.3 split-evidence schema.", { observed_schema: first && first.schema || null }));
  }
  if (first && first.visual_quality !== "NOT_REVIEWED") {
    errors.push(failure("SURFACE_STRIPES_VISUAL_AUTHORITY_WIDENED", "Technical stripes evidence must not become aesthetic acceptance.", { observed_visual_quality: first.visual_quality || null }));
  }
  if (JSON.stringify(reviewedIds) !== JSON.stringify(["checker", "facing-up"])) {
    errors.push(failure("SURFACE_STRIPES_REVIEWED_SET_DRIFT", "Reviewed pixel-baseline authority must remain exactly facing-up and checker.", { observed_ids: reviewedIds }));
  }
  if (JSON.stringify(observationIds) !== JSON.stringify(["axis-gradient", "stripes"])) {
    errors.push(failure("SURFACE_STRIPES_OBSERVATION_SET_DRIFT", "The candidate must expose exactly axis-gradient and stripes as unbaselined observations.", { observed_ids: observationIds }));
  }
  if (JSON.stringify((first && first.baseline_scope || []).slice().sort()) !== JSON.stringify(["checker", "facing-up"])) {
    errors.push(failure("SURFACE_STRIPES_BASELINE_SCOPE_WIDENED", "Adding stripes must not widen baseline_scope.", { observed_scope: first && first.baseline_scope || null }));
  }
  checked.push("reviewed-vs-observation-authority-split");

  for (const item of observations) {
    if (item.technical_render !== "PASS" || item.deterministic_replay !== "PASS" || item.pixel_baseline !== "NOT_ESTABLISHED" || item.evidence_tier !== "TECHNICALLY_RENDERED_UNBASELINED" || item.visual_judgement !== "NOT_REVIEWED" || !item.render_sha256 || item.tower_pixels <= 0) {
      errors.push(failure("SURFACE_STRIPES_OBSERVATION_BOUNDARY_INVALID", "Every unbaselined observation must remain technical-only, deterministic, covered, and non-aesthetic.", { observation: item }));
    }
  }
  if (JSON.stringify(observations) !== JSON.stringify(observationsSecond)) {
    errors.push(failure("SURFACE_STRIPES_CROSS_BUILD_NONDETERMINISTIC", "Repeated exact-input evidence builds produced different observation receipts.", { first: observations, second: observationsSecond }));
  }
  checked.push("observation-repeat-determinism-and-boundaries");

  const all = [...reviewed, ...observations];
  const ids = all.map((entry) => entry.id);
  const requestIds = all.map((entry) => entry.request_id);
  if (new Set(ids).size !== ids.length || new Set(requestIds).size !== requestIds.length) {
    errors.push(failure("SURFACE_STRIPES_EVIDENCE_IDENTITY_COLLISION", "Exact evidence already contains duplicate case or request identities.", { ids, request_ids: requestIds }));
  }
  const reviewedHashes = new Set(reviewed.map((entry) => entry.render_sha256));
  for (const observation of observations) {
    if (reviewedHashes.has(observation.render_sha256)) {
      errors.push(failure("SURFACE_STRIPES_COLLAPSED_TO_REVIEWED_PIXELS", "An unbaselined observation unexpectedly shares a reviewed pixel identity.", { observation: observation.id, render_sha256: observation.render_sha256 }));
    }
  }
  checked.push("independent-evidence-identity-separation");

  let baselineStatus = null;
  try {
    const baseline = renderTool.verifyBaseline(first, undefined, producer);
    baselineStatus = baseline && baseline.status || null;
    if (baselineStatus !== "PASS") errors.push(failure("SURFACE_STRIPES_REVIEWED_BASELINE_NOT_PASS", "Existing reviewed baseline no longer passes after adding stripes.", { observed_status: baselineStatus }));
  } catch (error) {
    errors.push(failure("SURFACE_STRIPES_REVIEWED_BASELINE_REJECTED", "Existing reviewed baseline rejected exact generated evidence.", { observed_error: error && error.message || String(error) }));
  }
  checked.push("existing-reviewed-baseline-still-pass");

  const stripesIndex = observations.findIndex((entry) => entry.id === "stripes");
  let observationTamperIgnoredByBaseline = null;
  let promotionRejected = null;
  if (stripesIndex >= 0) {
    try {
      const tampered = {
        ...first,
        observations: first.observations.map((entry) => entry.receipt.id === "stripes"
          ? { ...entry, receipt: { ...entry.receipt, render_sha256: "0".repeat(64) } }
          : entry)
      };
      const baseline = renderTool.verifyBaseline(tampered, undefined, producer);
      observationTamperIgnoredByBaseline = baseline && baseline.status === "PASS";
      if (!observationTamperIgnoredByBaseline) errors.push(failure("SURFACE_STRIPES_LEAKED_INTO_REVIEWED_BASELINE", "Changing only stripes observation pixels changed reviewed baseline authority."));
    } catch (error) {
      observationTamperIgnoredByBaseline = false;
      errors.push(failure("SURFACE_STRIPES_LEAKED_INTO_REVIEWED_BASELINE", "Reviewed baseline checker rejected evidence only because stripes observation pixels changed.", { observed_error: error && error.message || String(error) }));
    }

    try {
      const stripesEntry = first.observations.find((entry) => entry.receipt.id === "stripes");
      const promoted = { ...first, cases: [...first.cases, stripesEntry] };
      renderTool.verifyBaseline(promoted, undefined, producer);
      promotionRejected = false;
      errors.push(failure("SURFACE_STRIPES_SILENT_BASELINE_PROMOTION_ACCEPTED", "Reviewed baseline checker accepted stripes inserted into the reviewed case set."));
    } catch (_error) {
      promotionRejected = true;
    }
  }
  checked.push("stripes-cannot-gain-reviewed-authority-silently");

  let duplicateIdRejected = false;
  let duplicateRequestRejected = false;
  try {
    const entries = [...first.cases, ...first.observations].map((entry) => ({ receipt: { ...entry.receipt } }));
    entries.push({ receipt: { ...entries[0].receipt, request_id: `${entries[0].receipt.request_id}:duplicate-case`, id: entries[0].receipt.id } });
    renderTool.assertUniqueEvidenceIdentities(entries);
  } catch (_error) {
    duplicateIdRejected = true;
  }
  try {
    const entries = [...first.cases, ...first.observations].map((entry) => ({ receipt: { ...entry.receipt } }));
    entries.push({ receipt: { ...entries[0].receipt, id: "verification-duplicate-request", request_id: entries[0].receipt.request_id } });
    renderTool.assertUniqueEvidenceIdentities(entries);
  } catch (_error) {
    duplicateRequestRejected = true;
  }
  if (!duplicateIdRejected) errors.push(failure("SURFACE_STRIPES_DUPLICATE_CASE_ID_ACCEPTED", "Portable evidence identity guard accepted a duplicate case id."));
  if (!duplicateRequestRejected) errors.push(failure("SURFACE_STRIPES_DUPLICATE_REQUEST_ID_ACCEPTED", "Portable evidence identity guard accepted a duplicate request id."));
  checked.push("duplicate-case-and-request-identities-fail-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-stripes-observation-conformance/v0.1",
      surface_commit: surfaceCommit,
      morphtile_commit: morphTileCommit,
      baseline_status: baselineStatus,
      reviewed,
      observations,
      observation_tamper_ignored_by_reviewed_baseline: observationTamperIgnoredByBaseline,
      stripes_promotion_rejected: promotionRejected,
      duplicate_case_id_rejected: duplicateIdRejected,
      duplicate_request_id_rejected: duplicateRequestRejected,
      visual_quality: first && first.visual_quality || null
    }
  };
}

function formRequest(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify Form v0.9 progressive definition closure through Assembly transport",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function panelDefinition() {
  return {
    id: "panel",
    name: "Verification parametric panel",
    created_by: "verification",
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
        }
      }
    }
  };
}

function holdOf(output, code) {
  return output && Array.isArray(output.holds) ? output.holds.find((entry) => entry && (!code || entry.code === code)) || null : null;
}

function planeWidthSpans(compiled, count) {
  const scalarsPerPlane = 18;
  return Array.from({ length: count }, (_, index) => {
    const chunk = compiled.P.slice(index * scalarsPerPlane, (index + 1) * scalarsPerPlane);
    const xs = [];
    for (let i = 0; i < chunk.length; i += 3) xs.push(chunk[i]);
    return Math.max(...xs) - Math.min(...xs);
  });
}

function applyImported(runtime, receiver, imported) {
  for (const operation of imported.ops || []) runtime.applyStructOp(receiver, operation);
}

function verifyFormV09AssemblyPortableClosure({ form, assembly, materializeKit, runtime, revisions = {} } = {}) {
  const errors = [];
  const checked = [];
  const missingContracts = [];
  if (!form || typeof form.run !== "function") missingContracts.push("form.run");
  if (!assembly || typeof assembly.run !== "function") missingContracts.push("assembly.run");
  if (typeof materializeKit !== "function") missingContracts.push("assembly.materializeKit");
  for (const name of ["hashOf", "createWorld", "importKit", "applyStructOp", "resolveTile", "compileMesh"]) {
    if (!runtime || typeof runtime[name] !== "function") missingContracts.push(`runtime.${name}`);
  }
  if (missingContracts.length) {
    return { status: "FAIL", checked, errors: [failure("FORM_V09_PORTABLE_VERIFY_CONTRACT_MISSING", "Pinned Form/Assembly/MorphTile entry points are missing.", { missing: missingContracts })], receipt: null };
  }

  try {
    const request = formRequest("verify-form-v09-progressive-panel", {
      name: "Verification progressive definition-backed panels",
      repeat: {
        count: 3,
        step: [4, 0, 0],
        instance: { use: "panel", with: { width: 1 } },
        with_step: { width: 1 }
      }
    });
    const requestBefore = JSON.stringify(request);
    const formA = form.run(request);
    const formB = form.run(clone(request));
    if (JSON.stringify(request) !== requestBefore) errors.push(failure("FORM_V09_PORTABLE_REQUEST_MUTATED", "Form mutated the caller-owned progressive-definition request."));
    if (!formA || formA.status !== "CANDIDATE") errors.push(failure("FORM_V09_PORTABLE_NOT_CANDIDATE", "Form v0.9 did not produce the expected progressive definition candidate.", { observed_status: formA && formA.status || null, observed_hold: holdOf(formA) && holdOf(formA).code || null }));
    if (JSON.stringify(formA) !== JSON.stringify(formB)) errors.push(failure("FORM_V09_PORTABLE_NONDETERMINISTIC", "Identical Form v0.9 requests produced different output envelopes."));

    const expectedParts = [{
      repeat: 3,
      as: "i",
      body: [{
        use: "panel",
        with: { width: ["+", 1, ["*", ["var", "i"], 1]] },
        pos: [["+", 0, ["*", ["var", "i"], 4]], 0, 0]
      }]
    }];
    const observedParts = formA && formA.candidate && formA.candidate.facets && formA.candidate.facets.mesh && formA.candidate.facets.mesh.data && formA.candidate.facets.mesh.data.parts;
    if (JSON.stringify(observedParts) !== JSON.stringify(expectedParts)) errors.push(failure("FORM_V09_PORTABLE_SCOPED_EXPRESSION_DRIFT", "Form v0.9 did not preserve the expected loop-scoped definition-setting progression.", { observed_parts: clone(observedParts) }));
    checked.push("form-v09-determinism-and-scoped-progression");

    const base = {
      envelope_version: "0.1",
      goal: "verify Form v0.9 progressive definition closure through Assembly",
      intent: { id: "mt_progressive_panel_verify", name: "Verification progressive panels" },
      inputs: [clone(formA)],
      provenance: { caller: "axm.morphtile.machine.verification" }
    };

    const missing = assembly.run({ ...clone(base), request_id: "verify-form-v09-assembly-missing" });
    const missingHold = holdOf(missing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE");
    const missingDefs = missingHold && Array.isArray(missingHold.missing) ? missingHold.missing : [];
    if (!missing || missing.status !== "HOLD" || JSON.stringify(missingDefs) !== JSON.stringify(["panel"])) {
      errors.push(failure("FORM_V09_PORTABLE_MISSING_DEFINITION_NOT_HELD", "Assembly must HOLD the progressive Form candidate until panel definition closure is explicit.", { observed_status: missing && missing.status || null, observed_missing: clone(missingDefs) }));
    }
    checked.push("assembly-missing-definition-fails-closed");

    const defs = { panel: panelDefinition() };
    const completeRequest = { ...clone(base), request_id: "verify-form-v09-assembly-complete", world_requirements: { definitions: clone(defs) } };
    const completeBefore = JSON.stringify(completeRequest);
    const complete = assembly.run(completeRequest);
    if (JSON.stringify(completeRequest) !== completeBefore) errors.push(failure("FORM_V09_PORTABLE_ASSEMBLY_REQUEST_MUTATED", "Assembly mutated the caller-owned complete-closure request."));
    if (!complete || complete.status !== "CANDIDATE") errors.push(failure("FORM_V09_PORTABLE_COMPLETE_NOT_CANDIDATE", "Explicit panel closure did not become an Assembly candidate.", { observed_status: complete && complete.status || null, holds: clone(complete && complete.holds || []) }));
    if (JSON.stringify(complete && complete.required_definitions || []) !== JSON.stringify(["panel"])) errors.push(failure("FORM_V09_PORTABLE_REQUIRED_DEFINITION_DRIFT", "Assembly did not retain exact panel closure identity.", { observed_required: clone(complete && complete.required_definitions || []) }));
    if (JSON.stringify(complete && complete.candidate && complete.candidate.facets && complete.candidate.facets.mesh && complete.candidate.facets.mesh.data && complete.candidate.facets.mesh.data.parts) !== JSON.stringify(expectedParts)) {
      errors.push(failure("FORM_V09_PORTABLE_ASSEMBLY_REWROTE_RECIPE", "Assembly changed the exact loop-scoped Form recipe while closing dependencies."));
    }
    checked.push("assembly-complete-closure-preserves-form-recipe");

    let kitVerification = null;
    let importStatus = null;
    let compiledReceipt = null;
    let definitionTamperStatus = null;
    let definitionTamperMutatedReceiver = null;

    if (complete && complete.status === "CANDIDATE") {
      const materialized = materializeKit(complete, runtime, { name: "Verification Form v0.9 progressive closure kit" });
      if (!materialized || materialized.status !== "CANDIDATE") {
        errors.push(failure("FORM_V09_PORTABLE_KIT_NOT_CANDIDATE", "Complete progressive closure did not materialize a portable kit.", { observed_status: materialized && materialized.status || null, holds: clone(materialized && materialized.holds || []) }));
      } else {
        if (materialized.kit.expect.defs !== 1 || JSON.stringify(Object.keys(materialized.kit.defs || {}).sort()) !== JSON.stringify(["panel"])) {
          errors.push(failure("FORM_V09_PORTABLE_KIT_DEFINITION_CLOSURE_DRIFT", "Portable kit did not carry exactly the panel definition closure.", { observed_defs: Object.keys(materialized.kit.defs || {}).sort(), observed_expected_count: materialized.kit.expect.defs }));
        }
        if (JSON.stringify(materialized.kit.tile.facets.mesh.data.parts) !== JSON.stringify(expectedParts)) {
          errors.push(failure("FORM_V09_PORTABLE_KIT_RECIPE_DRIFT", "Portable kit changed the exact loop-scoped Form recipe."));
        }

        kitVerification = verifyKitCandidate(materialized, runtime);
        if (!kitVerification || kitVerification.status !== "PASS") {
          errors.push(failure("FORM_V09_PORTABLE_KIT_VERIFY_FAIL", "Portable kit failed independent hash/count/fresh-import/tile-tamper verification.", { verifier_errors: clone(kitVerification && kitVerification.errors || []) }));
        }

        const receiver = runtime.createWorld("Verification progressive receiver");
        const imported = runtime.importKit(receiver, clone(materialized.kit));
        importStatus = imported && imported.status || null;
        if (!imported || imported.status !== "READY") {
          errors.push(failure("FORM_V09_PORTABLE_IMPORT_NOT_READY", "Fresh receiver did not stage the progressive kit as READY.", { observed_status: importStatus }));
        } else {
          applyImported(runtime, receiver, imported);
          const received = runtime.resolveTile(receiver, "mt_progressive_panel_verify");
          if (!received) {
            errors.push(failure("FORM_V09_PORTABLE_IMPORTED_TILE_MISSING", "Imported progressive tile did not resolve in the fresh receiver."));
          } else {
            const compiled = runtime.compileMesh(received, receiver);
            const spans = compiled && Array.isArray(compiled.P) ? planeWidthSpans(compiled, 3) : [];
            compiledReceipt = {
              hold: compiled && compiled.hold || null,
              recipe_parts: compiled && compiled.recipe_parts || null,
              positions: compiled && Array.isArray(compiled.P) ? compiled.P.length : null,
              triangles: compiled && Array.isArray(compiled.T) ? compiled.T.length : null,
              width_spans: spans
            };
            if (!compiled || compiled.hold !== null || compiled.recipe_parts !== 3 || compiled.P.length !== 54 || compiled.T.length !== 6 || JSON.stringify(spans) !== JSON.stringify([1, 2, 3])) {
              errors.push(failure("FORM_V09_PORTABLE_IMPORTED_COMPILE_DRIFT", "Fresh imported world did not reproduce widths [1,2,3] from the exact transported progression.", { compiled: compiledReceipt }));
            }
          }
        }

        const tampered = clone(materialized.kit);
        tampered.defs.panel.body.facets.mesh.data.vars.width = 9;
        const tamperReceiver = runtime.createWorld("Verification progressive definition tamper receiver");
        const before = runtime.hashOf(tamperReceiver);
        const tamperResult = runtime.importKit(tamperReceiver, tampered);
        const after = runtime.hashOf(tamperReceiver);
        definitionTamperStatus = tamperResult && tamperResult.status || null;
        definitionTamperMutatedReceiver = before !== after;
        if (definitionTamperStatus !== "HOLD_HASH_MISMATCH") {
          errors.push(failure("FORM_V09_PORTABLE_DEFINITION_TAMPER_ACCEPTED", "Definition-only kit tampering was not rejected by stale payload identity.", { observed_status: definitionTamperStatus }));
        }
        if (definitionTamperMutatedReceiver) {
          errors.push(failure("FORM_V09_PORTABLE_DEFINITION_TAMPER_MUTATED_RECEIVER", "Rejected definition tampering changed the receiver during import analysis.", { before, after }));
        }
      }
    }
    checked.push("portable-kit-hash-import-compile-and-definition-tamper");

    return {
      status: errors.length ? "FAIL" : "PASS",
      checked,
      errors,
      receipt: {
        schema: "axm.morphtile.form-v09-assembly-portable-closure/v0.1",
        revisions: clone(revisions),
        expected_parts: expectedParts,
        missing_definitions: clone(missingDefs),
        assembly_status: complete && complete.status || null,
        required_definitions: clone(complete && complete.required_definitions || []),
        kit_verification_status: kitVerification && kitVerification.status || null,
        import_status: importStatus,
        compiled: compiledReceipt,
        definition_tamper_status: definitionTamperStatus,
        definition_tamper_mutated_receiver: definitionTamperMutatedReceiver
      }
    };
  } catch (error) {
    errors.push(failure("FORM_V09_PORTABLE_VERIFY_EXCEPTION", "Independent Form v0.9 / Assembly portable-closure verifier threw.", { observed_name: error && error.name || "Error", observed_message: error && error.message || String(error) }));
    return { status: "FAIL", checked, errors, receipt: null };
  }
}

module.exports = {
  verifyCoreRecipeNonfiniteRepair,
  verifySurfaceStripesObservation,
  verifyFormV09AssemblyPortableClosure
};
