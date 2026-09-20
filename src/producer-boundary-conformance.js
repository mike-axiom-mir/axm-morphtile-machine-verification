"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function stableCaseSummary(evidence) {
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

function verifySurfaceRenderEvidenceProvenance(renderTool, MorphTile, options = {}) {
  const surfaceCommit = options.surfaceCommit || null;
  const morphTileCommit = options.morphTileCommit || null;
  const errors = [];
  const checked = [];

  if (!renderTool || typeof renderTool.buildEvidence !== "function" || typeof renderTool.verifyBaseline !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_RENDER_TOOL_CONTRACT_MISSING", "Surface render verification requires buildEvidence() and verifyBaseline().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.renderAsset !== "function" || typeof MorphTile.renderReceipt !== "function") {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_RENDER_CONTRACT_MISSING", "Surface render verification requires MorphTile renderAsset/renderReceipt.")], receipt: null };
  }
  if (!surfaceCommit || !morphTileCommit) {
    return { status: "FAIL", checked, errors: [failure("VERIFICATION_REVISION_PIN_MISSING", "Exact Surface and MorphTile commits are required for provenance verification.")], receipt: null };
  }

  let first;
  let second;
  try {
    first = renderTool.buildEvidence(MorphTile, morphTileCommit);
    second = renderTool.buildEvidence(MorphTile, morphTileCommit);
  } catch (error) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("SURFACE_RENDER_EVIDENCE_EXECUTION_FAILED", "Producer render evidence could not be generated.", { observed_error: error && error.message || String(error) })],
      receipt: null
    };
  }

  const firstCases = stableCaseSummary(first);
  const secondCases = stableCaseSummary(second);
  if (JSON.stringify(firstCases) !== JSON.stringify(secondCases)) {
    errors.push(failure("SURFACE_RENDER_NONDETERMINISTIC", "Repeated exact-input render evidence produced different technical receipts.", { first_cases: firstCases, second_cases: secondCases }));
  }
  checked.push("repeat-render-determinism");

  if (!first || first.status !== "TECHNICALLY_RENDERED") {
    errors.push(failure("SURFACE_RENDER_STATUS_UNEXPECTED", "Producer evidence did not remain in the technical-render evidence class.", { observed_status: first && first.status || null }));
  }
  if (!first || first.visual_quality !== "NOT_REVIEWED") {
    errors.push(failure("SURFACE_VISUAL_BOUNDARY_WIDENED", "Technical render evidence must not silently become aesthetic acceptance.", { observed_visual_quality: first && first.visual_quality || null }));
  }
  for (const item of firstCases) {
    if (item.technical_render !== "PASS" || item.visual_judgement !== "NOT_REVIEWED") {
      errors.push(failure("SURFACE_CASE_EVIDENCE_CLASS_INVALID", "Per-case render evidence blurred technical and visual judgement boundaries.", { case: item.id, technical_render: item.technical_render, visual_judgement: item.visual_judgement }));
    }
    if (!item.render_sha256 || item.tower_pixels <= 0) {
      errors.push(failure("SURFACE_CASE_RENDER_RECEIPT_INCOMPLETE", "Per-case technical render evidence lacks a hash or visible target coverage.", { case: item.id, render_sha256: item.render_sha256, tower_pixels: item.tower_pixels }));
    }
  }
  checked.push("technical-vs-visual-evidence-boundary");

  if (!first.runtime || first.runtime.commit !== morphTileCommit) {
    errors.push(failure("SURFACE_RENDER_RUNTIME_REVISION_MISMATCH", "Render evidence does not identify the exact MorphTile runtime revision used.", { expected: morphTileCommit, observed: first.runtime && first.runtime.commit || null }));
  }
  checked.push("runtime-revision-provenance");

  const producer = first && first.producer;
  if (!producer || producer.repository !== "mike-axiom-mir/axm-morphtile-machine-surface" || producer.commit !== surfaceCommit) {
    errors.push(failure("SURFACE_RENDER_PRODUCER_REVISION_MISSING", "Pixel identity is not source provenance: the portable render receipt must identify the exact Surface producer revision that generated it.", {
      expected_repository: "mike-axiom-mir/axm-morphtile-machine-surface",
      expected_commit: surfaceCommit,
      observed_producer: producer || null
    }));
  }
  checked.push("producer-revision-provenance");

  let baselineStatus = null;
  try {
    const baseline = renderTool.verifyBaseline(first);
    baselineStatus = baseline && baseline.status || null;
    if (baselineStatus !== "PASS") {
      errors.push(failure("SURFACE_RENDER_BASELINE_NOT_PASS", "Producer baseline checker did not PASS its own exact technical evidence.", { observed_status: baselineStatus }));
    }
  } catch (error) {
    errors.push(failure("SURFACE_RENDER_BASELINE_REJECTED", "Producer baseline checker rejected the exact generated technical evidence.", { observed_error: error && error.message || String(error) }));
  }
  checked.push("producer-pixel-baseline");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-render-provenance-conformance/v0.1",
      surface_commit: surfaceCommit,
      morphtile_commit: morphTileCommit,
      producer_identity: producer || null,
      baseline_status: baselineStatus,
      cases: firstCases,
      visual_quality: first && first.visual_quality || null
    }
  };
}

function makeFiniteOverflowRequest() {
  return {
    envelope_version: "0.1",
    request_id: "verification-repeat-setting-finite-expansion",
    goal: "Verify bounded repeat setting progression cannot expand finite authored inputs into non-finite runtime values",
    intent: {
      repeat: {
        count: 2,
        step: [1, 0, 0],
        instance: {
          use: "panel",
          with: { width: Number.MAX_VALUE }
        },
        with_step: { width: Number.MAX_VALUE }
      }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstHoldCode(result) {
  return result && Array.isArray(result.holds) && result.holds[0] ? result.holds[0].code || null : null;
}

function verifyFormRepeatFiniteProgression(formMachine, options = {}) {
  const formCommit = options.formCommit || null;
  const errors = [];
  const checked = [];
  if (!formMachine || typeof formMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("FORM_MACHINE_CONTRACT_MISSING", "Form verification requires machine.run().")], receipt: null };
  }

  const request = makeFiniteOverflowRequest();
  const before = JSON.stringify(request);
  let output = null;
  let threw = null;
  try {
    output = formMachine.run(request);
  } catch (error) {
    threw = { name: error && error.name || "Error", message: error && error.message || String(error) };
  }
  const mutated = JSON.stringify(request) !== before;
  if (mutated) errors.push(failure("FORM_REPEAT_OVERFLOW_REQUEST_MUTATED", "Form Machine mutated the adversarial repeat-setting request."));
  if (threw) errors.push(failure("FORM_REPEAT_OVERFLOW_THREW", "Form Machine threw instead of returning a fail-closed result.", { observed_error: threw }));
  checked.push("request-immutability-and-no-throw");

  const base = Number.MAX_VALUE;
  const delta = Number.MAX_VALUE;
  const finalValue = base + delta;
  if (Number.isFinite(finalValue)) {
    errors.push(failure("VERIFIER_OVERFLOW_PROBE_INVALID", "The verifier overflow probe no longer exceeds the finite Number domain."));
  }
  checked.push("known-nonfinite-expansion-probe");

  const observedStatus = output && output.status || null;
  const observedCode = firstHoldCode(output);
  if (observedStatus !== "HOLD") {
    errors.push(failure("FORM_REPEAT_PROGRESSION_NONFINITE_EXPANSION_ACCEPTED", "Form accepted individually finite base/delta values even though the known bounded repeat expands them to Infinity at i=1.", {
      form_commit: formCommit,
      observed_status: observedStatus,
      observed_code: observedCode,
      base,
      delta,
      count: 2,
      expanded_i1: String(finalValue)
    }));
  } else if (observedCode !== "HOLD_FORM_REPEAT_INVALID") {
    errors.push(failure("FORM_REPEAT_OVERFLOW_HOLD_IDENTITY_DRIFT", "Form held the non-finite progression, but not under the repeat-invalid boundary.", { observed_code: observedCode }));
  }
  checked.push("finite-expanded-domain-fail-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-repeat-finite-progression-conformance/v0.1",
      form_commit: formCommit,
      observed_status: observedStatus,
      observed_code: observedCode,
      request_mutated: mutated,
      base,
      delta,
      count: 2,
      expanded_i1_finite: Number.isFinite(finalValue)
    }
  };
}

module.exports = {
  verifySurfaceRenderEvidenceProvenance,
  verifyFormRepeatFiniteProgression,
  makeFiniteOverflowRequest
};
