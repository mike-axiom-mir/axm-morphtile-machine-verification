"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function baseEnvelope(requestId, goal, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function verifySurfacePreSerializationBoundary(surface, options = {}) {
  const surfaceCommit = options.surfaceCommit || null;
  const errors = [];
  const checked = [];

  if (!surfaceCommit) {
    return { status: "FAIL", checked, errors: [failure("SURFACE_REVISION_PIN_MISSING", "Exact Surface revision is required.")], receipt: null };
  }
  if (!surface || typeof surface.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_RUN_CONTRACT_MISSING", "Surface verification requires run().")], receipt: null };
  }

  let accessorCalls = 0;
  const authoredColor = [
    ["+", 0.2, ["*", 0.3, ["var", "ny"]]],
    0.55,
    0.2
  ];
  const paint = { vars: { gain: 0.3 } };
  const colorGetter = function colorGetter() {
    accessorCalls += 1;
    return authoredColor;
  };
  Object.defineProperty(paint, "color", {
    enumerable: true,
    configurable: true,
    get: colorGetter
  });

  const accessorRequest = baseEnvelope(
    "verification-surface-paint-accessor",
    "Reject non-portable authored paint without executing caller-controlled accessors",
    { base_color: [0.2, 0.25, 0.3], paint }
  );
  const descriptorBefore = Object.getOwnPropertyDescriptor(paint, "color");
  const accessorOut = surface.run(accessorRequest);
  const descriptorAfter = Object.getOwnPropertyDescriptor(paint, "color");
  const accessorHold = accessorOut && accessorOut.holds && accessorOut.holds[0] && accessorOut.holds[0].code || null;

  if (accessorOut.status !== "HOLD" || accessorHold !== "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE" || accessorOut.candidate !== null) {
    errors.push(failure(
      "SURFACE_PAINT_ACCESSOR_NOT_HELD",
      "An accessor-backed authored paint field was not rejected as non-portable source data.",
      { status: accessorOut.status, hold: accessorHold }
    ));
  }
  if (accessorCalls !== 0) {
    errors.push(failure(
      "SURFACE_PAINT_ACCESSOR_EXECUTED_BEFORE_HOLD",
      "Surface touched caller-controlled accessor code before reaching its non-portable-value HOLD.",
      { accessor_calls: accessorCalls, hold: accessorHold }
    ));
  }
  if (!descriptorAfter || descriptorAfter.get !== descriptorBefore.get || descriptorAfter.enumerable !== descriptorBefore.enumerable) {
    errors.push(failure(
      "SURFACE_PAINT_ACCESSOR_DESCRIPTOR_MUTATED",
      "Rejecting accessor-backed paint changed the caller-owned property descriptor."
    ));
  }
  checked.push("accessor-backed-paint-rejected-without-caller-code-execution");

  const validPaint = {
    color: [["+", 0.2, ["*", 0.3, ["var", "ny"]]], 0.55, 0.2],
    vars: { gain: 0.3 }
  };
  const validBefore = JSON.stringify(validPaint);
  const validOut = surface.run(baseEnvelope(
    "verification-surface-portable-control",
    "Keep ordinary portable authored paint accepted",
    { base_color: [0.2, 0.25, 0.3], paint: validPaint }
  ));
  const candidatePaint = validOut && validOut.candidate && validOut.candidate.value && validOut.candidate.value.data && validOut.candidate.value.data.paint;
  if (validOut.status !== "CANDIDATE" || JSON.stringify(candidatePaint) !== validBefore || JSON.stringify(validPaint) !== validBefore) {
    errors.push(failure(
      "SURFACE_PORTABLE_PAINT_CONTROL_DRIFT",
      "The source-integrity boundary widened into rejection or mutation of ordinary portable paint.",
      { status: validOut.status }
    ));
  }
  checked.push("portable-paint-control-remains-candidate");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-source-integrity-conformance/v0.1",
      surface_commit: surfaceCommit,
      accessor_probe: {
        status: accessorOut.status,
        hold: accessorHold,
        accessor_calls: accessorCalls,
        candidate_present: accessorOut.candidate !== null
      },
      portable_control: {
        status: validOut.status,
        preserved: JSON.stringify(candidatePaint) === validBefore
      },
      visual_quality: "NOT_TESTED"
    }
  };
}

function verifyFormCurrentCoreBoundary(form, MorphTile, options = {}) {
  const formCommit = options.formCommit || null;
  const coreCommit = options.coreCommit || null;
  const errors = [];
  const checked = [];
  const probes = [];

  if (!formCommit || !coreCommit) {
    return { status: "FAIL", checked, errors: [failure("FORM_CORE_REVISION_PIN_MISSING", "Exact Form and MorphTile revisions are required.")], receipt: null };
  }
  if (!form || typeof form.run !== "function" || !MorphTile || typeof MorphTile.createTile !== "function" || typeof MorphTile.compileMesh !== "function") {
    return { status: "FAIL", checked, errors: [failure("FORM_CORE_CONTRACT_MISSING", "Form run() plus MorphTile createTile()/compileMesh() are required.")], receipt: null };
  }

  function formRequest(requestId, pos, size) {
    return baseEnvelope(requestId, "Verify Form output against the current derived-mesh finite boundary", {
      name: requestId,
      shape: "box",
      pos,
      size
    });
  }

  function probeOverflow(name, pos, size) {
    const request = formRequest(`verification-${name}`, pos, size);
    const before = JSON.stringify(request);
    const out = form.run(request);
    let mesh = null;
    let threw = null;
    try {
      if (out.status === "CANDIDATE") mesh = MorphTile.compileMesh(MorphTile.createTile(out.candidate));
    } catch (error) {
      threw = error && error.message || String(error);
    }
    const observed = {
      name,
      producer_status: out.status,
      hold: mesh && mesh.hold || null,
      positions: mesh && Array.isArray(mesh.P) ? mesh.P.length : null,
      triangles: mesh && Array.isArray(mesh.T) ? mesh.T.length : null,
      colors: mesh && Array.isArray(mesh.K) ? mesh.K.length : null,
      request_unchanged: JSON.stringify(request) === before,
      threw
    };
    probes.push(observed);
    if (out.status !== "CANDIDATE" || threw || observed.hold !== "HOLD_MESH_NONFINITE_VALUE" || observed.positions !== 0 || observed.triangles !== 0 || observed.colors !== 0 || !observed.request_unchanged) {
      errors.push(failure("FORM_CURRENT_CORE_DERIVED_OVERFLOW_BOUNDARY_FAILED", `${name} did not preserve the producer/core fail-closed split.`, { probe: observed }));
    }
  }

  probeOverflow("positive-derived-overflow", [Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 1, 1]);
  probeOverflow("negative-derived-overflow", [-Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 1, 1]);
  checked.push("signed-derived-overflow-reaches-core-and-clears-partial-mesh");

  const finiteRequest = formRequest("verification-large-finite-control", [-1e150, 1e150, -1e150], [1e150, 2e150, 3e150]);
  const finiteOut = form.run(finiteRequest);
  let finiteMesh = null;
  let finiteThrew = null;
  try {
    if (finiteOut.status === "CANDIDATE") finiteMesh = MorphTile.compileMesh(MorphTile.createTile(finiteOut.candidate));
  } catch (error) {
    finiteThrew = error && error.message || String(error);
  }
  const finiteControl = {
    producer_status: finiteOut.status,
    hold: finiteMesh && finiteMesh.hold || null,
    positions: finiteMesh && Array.isArray(finiteMesh.P) ? finiteMesh.P.length : null,
    all_positions_finite: !!(finiteMesh && Array.isArray(finiteMesh.P) && finiteMesh.P.length && finiteMesh.P.every(Number.isFinite)),
    threw: finiteThrew
  };
  if (finiteControl.producer_status !== "CANDIDATE" || finiteControl.threw || finiteControl.hold !== null || !finiteControl.all_positions_finite) {
    errors.push(failure("FORM_CURRENT_CORE_LARGE_FINITE_CONTROL_REJECTED", "Current-core re-proof widened into rejection of a large finite Form control.", { control: finiteControl }));
  }
  checked.push("large-finite-form-control-remains-representable");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-current-core-conformance/v0.1",
      form_commit: formCommit,
      core_commit: coreCommit,
      probes,
      finite_control: finiteControl
    }
  };
}

function commitInterfaceCandidate(MorphTile, workspace, output) {
  const candidate = MorphTile.cloneBody(workspace, "ai", "verification:interface-current-boundary");
  for (const operation of output.candidate.operations) {
    const edited = MorphTile.editCandidate(workspace, candidate, operation);
    if (!edited.ok) throw new Error(edited.error || "Interface candidate edit failed");
  }
  const plan = MorphTile.planMerge(workspace, [candidate]);
  if (plan.status !== "READY") throw new Error(`Interface candidate plan was ${plan.status}`);
  const committed = MorphTile.commitPlan(workspace, plan.id);
  if (!committed.ok) throw new Error(committed.error || "Interface candidate commit failed");
  return committed.receipt;
}

function verifyInterfaceCurrentRuntimeBoundary(interfaceMachine, MorphTile, options = {}) {
  const interfaceCommit = options.interfaceCommit || null;
  const coreCommit = options.coreCommit || null;
  const errors = [];
  const checked = [];

  if (!interfaceCommit || !coreCommit) {
    return { status: "FAIL", checked, errors: [failure("INTERFACE_CORE_REVISION_PIN_MISSING", "Exact Interface and MorphTile revisions are required.")], receipt: null };
  }
  if (!interfaceMachine || typeof interfaceMachine.run !== "function" || !MorphTile || typeof MorphTile.resolvePresentation !== "function") {
    return { status: "FAIL", checked, errors: [failure("INTERFACE_CORE_CONTRACT_MISSING", "Interface run() plus MorphTile presentation runtime are required.")], receipt: null };
  }

  const workspace = MorphTile.createWorkspace(MorphTile.seedWorld());
  const preCommitHash = MorphTile.structHash(workspace.live);
  const request = baseEnvelope(
    "verification-interface-nonadjustable-session",
    "Keep session placement subordinate to machine-authored non-adjustable presentation",
    {
      tile_path: "mt_tower",
      title: "Verification presentation boundary",
      text: "Canonical placement must remain authoritative",
      placement: {
        mode: "docked",
        dock: "right",
        preferred_size: [360, 480],
        preferred_position: [0, 0],
        user_adjustable: false
      }
    }
  );
  const output = interfaceMachine.run(request);
  if (output.status !== "CANDIDATE") {
    errors.push(failure("INTERFACE_NONADJUSTABLE_CONTROL_REJECTED", "Interface did not emit the ordinary non-adjustable presentation control.", { status: output.status }));
    return {
      status: "FAIL",
      checked,
      errors,
      receipt: { schema: "axm.morphtile.interface-current-runtime-conformance/v0.1", interface_commit: interfaceCommit, core_commit: coreCommit, producer_status: output.status }
    };
  }

  let commitReceipt = null;
  try {
    commitReceipt = commitInterfaceCandidate(MorphTile, workspace, output);
  } catch (error) {
    errors.push(failure("INTERFACE_CURRENT_RUNTIME_COMMIT_FAILED", error && error.message || String(error)));
  }

  const committedHash = MorphTile.structHash(workspace.live);
  const host = {
    presentation_modes: ["screen", "docked", "tile"],
    session_presentations: {
      mt_tower: {
        mode: "screen",
        dock: "left",
        preferred_size: [999, 111],
        preferred_position: [24, 12],
        anchor: "mt_inner"
      }
    }
  };
  const hostBefore = JSON.stringify(host);
  const first = MorphTile.resolvePresentation(workspace.live, "mt_tower", host);
  const second = MorphTile.resolvePresentation(workspace.live, "mt_tower", host);
  const deterministicReplay = JSON.stringify(first) === JSON.stringify(second);
  const canonicalUnchanged = MorphTile.structHash(workspace.live) === committedHash;
  const hostUnchanged = JSON.stringify(host) === hostBefore;

  if (first.status !== "READY" || first.session_applied !== false || first.resolved.mode !== "docked" || first.resolved.dock !== "right" || JSON.stringify(first.resolved.preferred_size) !== JSON.stringify([360, 480]) || JSON.stringify(first.resolved.preferred_position) !== JSON.stringify([0, 0])) {
    errors.push(failure("INTERFACE_NONADJUSTABLE_SESSION_OVERRIDE_APPLIED", "Session overlay widened placement authority on a non-adjustable canonical descriptor.", { resolved: first }));
  }
  if (!deterministicReplay) {
    errors.push(failure("INTERFACE_PRESENTATION_REPLAY_DRIFT", "Repeated presentation resolution against identical canonical/host inputs was not deterministic."));
  }
  if (!canonicalUnchanged || !hostUnchanged) {
    errors.push(failure("INTERFACE_PRESENTATION_RESOLUTION_MUTATED_INPUT", "Presentation resolution mutated canonical or host/session input.", { canonical_unchanged: canonicalUnchanged, host_unchanged: hostUnchanged }));
  }
  checked.push("nonadjustable-session-overlay-is-readonly-deterministic-and-subordinate");

  let rollback = null;
  if (commitReceipt) rollback = MorphTile.rollback(workspace, commitReceipt.rollback_token);
  const rollbackExact = !!(rollback && rollback.ok && rollback.exact && MorphTile.structHash(workspace.live) === preCommitHash);
  if (!rollbackExact) {
    errors.push(failure("INTERFACE_CURRENT_RUNTIME_ROLLBACK_NOT_EXACT", "Interface presentation proof did not roll back exactly to the pre-commit world."));
  }
  checked.push("interface-current-runtime-rollback-exact");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-current-runtime-conformance/v0.1",
      interface_commit: interfaceCommit,
      core_commit: coreCommit,
      producer_status: output.status,
      resolution_status: first.status,
      session_applied: first.session_applied,
      deterministic_replay: deterministicReplay,
      canonical_unchanged: canonicalUnchanged,
      host_unchanged: hostUnchanged,
      rollback_exact: rollbackExact,
      visual_quality: "NOT_TESTED"
    }
  };
}

module.exports = {
  verifySurfacePreSerializationBoundary,
  verifyFormCurrentCoreBoundary,
  verifyInterfaceCurrentRuntimeBoundary
};
