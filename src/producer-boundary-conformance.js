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

  const expectedProducer = {
    repository: "mike-axiom-mir/axm-morphtile-machine-surface",
    commit: surfaceCommit
  };

  let first;
  let second;
  try {
    first = renderTool.buildEvidence(MorphTile, morphTileCommit, expectedProducer);
    second = renderTool.buildEvidence(MorphTile, morphTileCommit, expectedProducer);
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
  if (!producer || producer.repository !== expectedProducer.repository || producer.commit !== surfaceCommit) {
    errors.push(failure("SURFACE_RENDER_PRODUCER_REVISION_MISSING", "Pixel identity is not source provenance: the portable render receipt must identify the exact Surface producer revision that generated it.", {
      expected_repository: expectedProducer.repository,
      expected_commit: surfaceCommit,
      observed_producer: producer || null
    }));
  }
  checked.push("producer-revision-provenance");

  let baselineStatus = null;
  try {
    const baseline = renderTool.verifyBaseline(first, undefined, expectedProducer);
    baselineStatus = baseline && baseline.status || null;
    if (baselineStatus !== "PASS") {
      errors.push(failure("SURFACE_RENDER_BASELINE_NOT_PASS", "Producer baseline checker did not PASS its own exact technical evidence.", { observed_status: baselineStatus }));
    }
  } catch (error) {
    errors.push(failure("SURFACE_RENDER_BASELINE_REJECTED", "Producer baseline checker rejected the exact generated technical evidence.", { observed_error: error && error.message || String(error) }));
  }
  checked.push("producer-pixel-baseline");

  let mismatchRejected = null;
  const explicitIdentityContract = typeof renderTool.requireProducerIdentity === "function";
  if (explicitIdentityContract && producer && producer.repository === expectedProducer.repository && producer.commit === surfaceCommit) {
    const wrongProducer = {
      repository: expectedProducer.repository,
      commit: surfaceCommit === "0000000000000000000000000000000000000000"
        ? "1111111111111111111111111111111111111111"
        : "0000000000000000000000000000000000000000"
    };
    try {
      renderTool.verifyBaseline(first, undefined, wrongProducer);
      mismatchRejected = false;
      errors.push(failure("SURFACE_RENDER_PRODUCER_MISMATCH_ACCEPTED", "Baseline verification accepted evidence under a different independently supplied producer revision."));
    } catch (_error) {
      mismatchRejected = true;
    }
    checked.push("independent-producer-mismatch-rejection");
  }

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-render-provenance-conformance/v0.2",
      surface_commit: surfaceCommit,
      morphtile_commit: morphTileCommit,
      producer_identity: producer || null,
      baseline_status: baselineStatus,
      mismatched_expected_producer_rejected: mismatchRejected,
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

function runFailClosedProbe(formMachine, request, expectedCode, acceptedFailureCode) {
  const before = JSON.stringify(request);
  let output = null;
  let threw = null;
  try {
    output = formMachine.run(request);
  } catch (error) {
    threw = { name: error && error.name || "Error", message: error && error.message || String(error) };
  }
  const mutated = JSON.stringify(request) !== before;
  const observedStatus = output && output.status || null;
  const observedCode = firstHoldCode(output);
  const errors = [];
  if (mutated) errors.push(failure(`${acceptedFailureCode}_REQUEST_MUTATED`, "Form Machine mutated an adversarial finite-domain request."));
  if (threw) errors.push(failure(`${acceptedFailureCode}_THREW`, "Form Machine threw instead of returning a fail-closed result.", { observed_error: threw }));
  if (observedStatus !== "HOLD") {
    errors.push(failure(acceptedFailureCode, "Form accepted finite authored inputs whose known bounded generated domain contains a non-finite value.", { observed_status: observedStatus, observed_code: observedCode }));
  } else if (observedCode !== expectedCode) {
    errors.push(failure(`${acceptedFailureCode}_HOLD_IDENTITY_DRIFT`, "Form held the non-finite generated domain under an unexpected boundary.", { expected_code: expectedCode, observed_code: observedCode }));
  }
  return { errors, observedStatus, observedCode, mutated };
}

function verifyFormRepeatFiniteProgression(formMachine, options = {}) {
  const formCommit = options.formCommit || null;
  const errors = [];
  const checked = [];
  if (!formMachine || typeof formMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("FORM_MACHINE_CONTRACT_MISSING", "Form verification requires machine.run().")], receipt: null };
  }

  const request = makeFiniteOverflowRequest();
  const base = Number.MAX_VALUE;
  const delta = Number.MAX_VALUE;
  const finalValue = base + delta;
  if (Number.isFinite(finalValue)) {
    errors.push(failure("VERIFIER_OVERFLOW_PROBE_INVALID", "The verifier overflow probe no longer exceeds the finite Number domain."));
  }
  checked.push("known-nonfinite-expansion-probe");

  const probe = runFailClosedProbe(formMachine, request, "HOLD_FORM_REPEAT_INVALID", "FORM_REPEAT_PROGRESSION_NONFINITE_EXPANSION_ACCEPTED");
  errors.push(...probe.errors);
  checked.push("request-immutability-and-no-throw", "finite-expanded-domain-fail-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-repeat-finite-progression-conformance/v0.2",
      form_commit: formCommit,
      observed_status: probe.observedStatus,
      observed_code: probe.observedCode,
      request_mutated: probe.mutated,
      base,
      delta,
      count: 2,
      expanded_i1_finite: Number.isFinite(finalValue)
    }
  };
}

function verifyFormGeneratedPositionClosure(formMachine, options = {}) {
  const formCommit = options.formCommit || null;
  const errors = [];
  const checked = [];
  if (!formMachine || typeof formMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("FORM_MACHINE_CONTRACT_MISSING", "Form verification requires machine.run().")], receipt: null };
  }

  const common = {
    envelope_version: "0.1",
    goal: "Verify machine-generated bounded positions remain finite",
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const repeatRequest = {
    ...common,
    request_id: "verification-repeat-position-finite-expansion",
    intent: {
      repeat: {
        count: 2,
        step: [Number.MAX_VALUE, 0, 0],
        part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
      }
    }
  };
  const gridRequest = {
    ...common,
    request_id: "verification-grid-position-finite-expansion",
    intent: {
      grid: {
        counts: [2, 1, 1],
        step: [Number.MAX_VALUE, 0, 0],
        part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
      }
    }
  };
  const controlRequest = {
    ...common,
    request_id: "verification-repeat-position-large-finite-control",
    intent: {
      repeat: {
        count: 2,
        step: [Number.MAX_VALUE / 4, 0, 0],
        part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_VALUE / 4, 0, 0] }
      }
    }
  };

  const repeat = runFailClosedProbe(formMachine, repeatRequest, "HOLD_FORM_REPEAT_INVALID", "FORM_REPEAT_POSITION_NONFINITE_EXPANSION_ACCEPTED");
  const grid = runFailClosedProbe(formMachine, gridRequest, "HOLD_FORM_GRID_INVALID", "FORM_GRID_POSITION_NONFINITE_EXPANSION_ACCEPTED");
  errors.push(...repeat.errors, ...grid.errors);
  checked.push("repeat-generated-position-finite-domain", "grid-generated-position-finite-domain");

  const beforeControl = JSON.stringify(controlRequest);
  let controlOutput = null;
  let controlThrew = null;
  try {
    controlOutput = formMachine.run(controlRequest);
  } catch (error) {
    controlThrew = error && error.message || String(error);
  }
  const controlMutated = JSON.stringify(controlRequest) !== beforeControl;
  if (controlThrew) errors.push(failure("FORM_LARGE_FINITE_CONTROL_THREW", "Large but finite control request threw unexpectedly.", { observed_error: controlThrew }));
  if (controlMutated) errors.push(failure("FORM_LARGE_FINITE_CONTROL_MUTATED", "Large but finite control request was mutated."));
  if (!controlOutput || controlOutput.status !== "CANDIDATE") {
    errors.push(failure("FORM_LARGE_FINITE_CONTROL_REJECTED", "Finite-domain guard overreached and rejected a large but still finite bounded progression.", { observed_status: controlOutput && controlOutput.status || null, observed_code: firstHoldCode(controlOutput) }));
  }
  checked.push("large-finite-control-remains-accepted");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-generated-position-finite-closure/v0.1",
      form_commit: formCommit,
      repeat: { status: repeat.observedStatus, code: repeat.observedCode, request_mutated: repeat.mutated },
      grid: { status: grid.observedStatus, code: grid.observedCode, request_mutated: grid.mutated },
      finite_control: {
        status: controlOutput && controlOutput.status || null,
        code: firstHoldCode(controlOutput),
        request_mutated: controlMutated
      }
    }
  };
}

module.exports = {
  verifySurfaceRenderEvidenceProvenance,
  verifyFormRepeatFiniteProgression,
  verifyFormGeneratedPositionClosure,
  makeFiniteOverflowRequest
};
