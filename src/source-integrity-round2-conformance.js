"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function baseEnvelope(requestId, goal, intent, extra = {}) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" },
    ...extra
  };
}

function firstHoldCode(output) {
  return output && Array.isArray(output.holds) && output.holds[0] ? output.holds[0].code || null : null;
}

function verifySurfaceRepairAndIntentBoundary(surface, verificationOptions = {}) {
  const surfaceCommit = verificationOptions.surfaceCommit || null;
  const errors = [];
  const checked = [];
  if (!surfaceCommit || !surface || typeof surface.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_VERIFICATION_CONTRACT_MISSING", "Exact Surface revision and run() are required.")], receipt: null };
  }

  let nestedAccessorCalls = 0;
  const nestedPaint = { vars: { gain: 0.3 } };
  Object.defineProperty(nestedPaint, "color", {
    enumerable: true,
    configurable: true,
    get() {
      nestedAccessorCalls += 1;
      return [["+", 0.2, ["*", 0.3, ["var", "ny"]]], 0.55, 0.2];
    }
  });
  const nestedDescriptorBefore = Object.getOwnPropertyDescriptor(nestedPaint, "color");
  const nestedOut = surface.run(baseEnvelope(
    "verification-surface-repaired-paint-accessor",
    "Replay the previous rejected-paint accessor attack on the repaired revision",
    { base_color: [0.2, 0.25, 0.3], paint: nestedPaint }
  ));
  const nestedDescriptorAfter = Object.getOwnPropertyDescriptor(nestedPaint, "color");
  const nestedHold = firstHoldCode(nestedOut);
  const previousAttackPass = nestedOut.status === "HOLD"
    && nestedHold === "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE"
    && nestedOut.candidate === null
    && nestedAccessorCalls === 0
    && nestedDescriptorAfter
    && nestedDescriptorAfter.get === nestedDescriptorBefore.get;
  if (!previousAttackPass) {
    errors.push(failure("SURFACE_REPAIRED_PAINT_ACCESSOR_REPLAY_FAILED", "The repaired Surface revision did not close the previous nested paint accessor boundary.", {
      status: nestedOut.status,
      hold: nestedHold,
      accessor_calls: nestedAccessorCalls
    }));
  }
  checked.push("previous-paint-accessor-attack-replayed-on-repaired-head");

  let intentAccessorCalls = 0;
  const authoredPaint = {
    color: [["+", 0.15, ["*", 0.2, ["var", "ny"]]], 0.45, 0.25],
    vars: { gain: 0.2 }
  };
  const authoredIntent = { base_color: [0.3, 0.3, 0.35] };
  Object.defineProperty(authoredIntent, "paint", {
    enumerable: true,
    configurable: true,
    get() {
      intentAccessorCalls += 1;
      return authoredPaint;
    }
  });
  const intentDescriptorBefore = Object.getOwnPropertyDescriptor(authoredIntent, "paint");
  let intentOut = null;
  let intentThrew = null;
  try {
    intentOut = surface.run(baseEnvelope(
      "verification-surface-intent-paint-accessor",
      "Reject accessor-backed Surface intent before reading caller-controlled fields",
      authoredIntent
    ));
  } catch (error) {
    intentThrew = error && error.message || String(error);
  }
  const intentDescriptorAfter = Object.getOwnPropertyDescriptor(authoredIntent, "paint");
  const intentHold = firstHoldCode(intentOut);
  const intentSourceSafe = !intentThrew
    && intentOut
    && intentOut.status === "HOLD"
    && intentOut.candidate === null
    && intentAccessorCalls === 0
    && intentDescriptorAfter
    && intentDescriptorAfter.get === intentDescriptorBefore.get;
  if (!intentSourceSafe) {
    errors.push(failure("SURFACE_INTENT_FIELD_ACCESSOR_EXECUTED_BEFORE_HOLD", "Surface read caller-owned intent.paint before establishing a source-safe descriptor boundary.", {
      status: intentOut && intentOut.status || null,
      hold: intentHold,
      accessor_calls: intentAccessorCalls,
      threw: intentThrew
    }));
  }
  checked.push("intent-paint-accessor-source-safety");

  const portablePaint = {
    color: [["+", 0.2, ["*", 0.3, ["var", "ny"]]], 0.55, 0.2],
    vars: { gain: 0.3 }
  };
  const portableBefore = JSON.stringify(portablePaint);
  const portableOut = surface.run(baseEnvelope(
    "verification-surface-round2-portable-control",
    "Keep ordinary portable Surface paint accepted unchanged",
    { base_color: [0.2, 0.25, 0.3], paint: portablePaint }
  ));
  const candidatePaint = portableOut && portableOut.candidate && portableOut.candidate.value
    && portableOut.candidate.value.data && portableOut.candidate.value.data.paint;
  const portableControlPass = portableOut.status === "CANDIDATE"
    && JSON.stringify(candidatePaint) === portableBefore
    && JSON.stringify(portablePaint) === portableBefore;
  if (!portableControlPass) {
    errors.push(failure("SURFACE_ROUND2_PORTABLE_CONTROL_DRIFT", "Ordinary portable paint was rejected or rewritten.", { status: portableOut.status }));
  }
  checked.push("portable-surface-control-remains-candidate");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-source-integrity-round2-conformance/v0.1",
      surface_commit: surfaceCommit,
      previous_attack: { status: nestedOut.status, hold: nestedHold, accessor_calls: nestedAccessorCalls, pass: previousAttackPass },
      intent_field_attack: {
        status: intentOut && intentOut.status || null,
        hold: intentHold,
        accessor_calls: intentAccessorCalls,
        threw: intentThrew,
        source_safe: intentSourceSafe
      },
      portable_control: { status: portableOut.status, preserved: portableControlPass },
      visual_quality: "NOT_TESTED"
    }
  };
}

function verifyFormPreSerializationBoundary(form, verificationOptions = {}) {
  const formCommit = verificationOptions.formCommit || null;
  const errors = [];
  const checked = [];
  if (!formCommit || !form || typeof form.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("FORM_VERIFICATION_CONTRACT_MISSING", "Exact Form revision and run() are required.")], receipt: null };
  }

  let intentAccessorCalls = 0;
  const accessorRequest = {
    envelope_version: "0.1",
    request_id: "verification-form-root-intent-accessor",
    goal: "Reject accessor-backed Form input before geometry normalization",
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  Object.defineProperty(accessorRequest, "intent", {
    enumerable: true,
    configurable: true,
    get() {
      intentAccessorCalls += 1;
      return { name: "Accessor geometry", recipe: [{ shape: "box", size: [1, 1, 1] }] };
    }
  });
  const accessorDescriptorBefore = Object.getOwnPropertyDescriptor(accessorRequest, "intent");
  const accessorOut = form.run(accessorRequest);
  const accessorDescriptorAfter = Object.getOwnPropertyDescriptor(accessorRequest, "intent");
  const accessorHold = firstHoldCode(accessorOut);
  if (accessorOut.status !== "HOLD"
      || accessorHold !== "HOLD_FORM_INPUT_NONPORTABLE_VALUE"
      || accessorOut.candidate !== null
      || intentAccessorCalls !== 0
      || !accessorDescriptorAfter
      || accessorDescriptorAfter.get !== accessorDescriptorBefore.get) {
    errors.push(failure("FORM_ROOT_ACCESSOR_SOURCE_BOUNDARY_FAILED", "Form did not reject a root request accessor without executing caller code.", {
      status: accessorOut.status,
      hold: accessorHold,
      accessor_calls: intentAccessorCalls
    }));
  }
  checked.push("root-request-accessor-rejected-without-execution");

  const negativeZeroRequest = baseEnvelope(
    "verification-form-negative-zero",
    "Reject geometry values whose portable transport would erase authored sign identity",
    { name: "Negative zero", recipe: [{ shape: "box", pos: [-0, 0, 0], size: [1, 1, 1] }] }
  );
  const negativeZeroOut = form.run(negativeZeroRequest);
  const negativeZeroHold = firstHoldCode(negativeZeroOut);
  const negativeZeroPath = negativeZeroOut && negativeZeroOut.holds && negativeZeroOut.holds[0] && negativeZeroOut.holds[0].path || null;
  if (negativeZeroOut.status !== "HOLD"
      || negativeZeroHold !== "HOLD_FORM_INPUT_NONPORTABLE_VALUE"
      || negativeZeroPath !== "request.intent.recipe[0].pos[0]"
      || negativeZeroOut.candidate !== null) {
    errors.push(failure("FORM_NEGATIVE_ZERO_PORTABILITY_BOUNDARY_FAILED", "Form did not fail closed on authored -0 before transport could rewrite it to 0.", {
      status: negativeZeroOut.status,
      hold: negativeZeroHold,
      path: negativeZeroPath
    }));
  }
  checked.push("negative-zero-authorship-remains-distinct-from-portable-zero");

  const portableRequest = baseEnvelope(
    "verification-form-round2-portable-control",
    "Preserve a normal portable caller recipe unchanged",
    { name: "Portable geometry", recipe: [{ shape: "box", size: [2, 3, 4], pos: [1, 2, 3] }] }
  );
  const portableBefore = JSON.stringify(portableRequest);
  const portableOut = form.run(portableRequest);
  const candidateParts = portableOut && portableOut.candidate && portableOut.candidate.facets
    && portableOut.candidate.facets.mesh && portableOut.candidate.facets.mesh.data
    && portableOut.candidate.facets.mesh.data.parts;
  const portablePass = portableOut.status === "CANDIDATE"
    && JSON.stringify(candidateParts) === JSON.stringify(portableRequest.intent.recipe)
    && JSON.stringify(portableRequest) === portableBefore;
  if (!portablePass) {
    errors.push(failure("FORM_ROUND2_PORTABLE_CONTROL_DRIFT", "Portable caller recipe was rejected, mutated, or rewritten.", { status: portableOut.status }));
  }
  checked.push("portable-form-recipe-remains-exact-candidate");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-source-integrity-conformance/v0.1",
      form_commit: formCommit,
      root_accessor: { status: accessorOut.status, hold: accessorHold, accessor_calls: intentAccessorCalls },
      negative_zero: { status: negativeZeroOut.status, hold: negativeZeroHold, path: negativeZeroPath },
      portable_control: { status: portableOut.status, preserved: portablePass }
    }
  };
}

function assemblyPortableRequest(requestId) {
  return baseEnvelope(
    requestId,
    "Assemble one portable tile without rewriting authored closure",
    { id: "mt_portable", name: "Portable source proof" },
    {
      inputs: [{
        status: "CANDIDATE",
        candidate: {
          schema: "morphtile.tile-spec/v0.4",
          id: "mt_portable",
          name: "Portable source proof",
          form_hints: [],
          facets: {}
        },
        provenance: { caller: "axm.morphtile.machine.verification" }
      }]
    }
  );
}

function verifyAssemblyPreSerializationBoundary(assembly, kitModule, MorphTile, verificationOptions = {}) {
  const assemblyCommit = verificationOptions.assemblyCommit || null;
  const coreCommit = verificationOptions.coreCommit || null;
  const errors = [];
  const checked = [];
  if (!assemblyCommit || !coreCommit || !assembly || typeof assembly.run !== "function"
      || !kitModule || typeof kitModule.materializeKit !== "function" || !MorphTile) {
    return { status: "FAIL", checked, errors: [failure("ASSEMBLY_VERIFICATION_CONTRACT_MISSING", "Exact Assembly/Core revisions plus run(), materializeKit(), and MorphTile are required.")], receipt: null };
  }

  let requestAccessorCalls = 0;
  const accessorRequest = baseEnvelope(
    "verification-assembly-root-inputs-accessor",
    "Reject accessor-backed Assembly input before closure processing",
    { id: "mt_portable", name: "Accessor source proof" }
  );
  Object.defineProperty(accessorRequest, "inputs", {
    enumerable: true,
    configurable: true,
    get() {
      requestAccessorCalls += 1;
      return [{ status: "CANDIDATE", candidate: { schema: "morphtile.tile-spec/v0.4", id: "mt_portable", form_hints: [], facets: {} } }];
    }
  });
  const requestDescriptorBefore = Object.getOwnPropertyDescriptor(accessorRequest, "inputs");
  const accessorOut = assembly.run(accessorRequest);
  const requestDescriptorAfter = Object.getOwnPropertyDescriptor(accessorRequest, "inputs");
  const accessorHold = firstHoldCode(accessorOut);
  const requestBoundaryPass = accessorOut.status === "HOLD"
    && accessorHold === "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE"
    && accessorOut.candidate === null
    && requestAccessorCalls === 0
    && requestDescriptorAfter
    && requestDescriptorAfter.get === requestDescriptorBefore.get;
  if (!requestBoundaryPass) {
    errors.push(failure("ASSEMBLY_REQUEST_ACCESSOR_SOURCE_BOUNDARY_FAILED", "Assembly did not reject a root inputs accessor without executing caller code.", {
      status: accessorOut.status,
      hold: accessorHold,
      accessor_calls: requestAccessorCalls
    }));
  }
  checked.push("assembly-request-accessor-rejected-without-execution");

  const portableRequest = assemblyPortableRequest("verification-assembly-round2-portable-control");
  portableRequest.dependencies = [{ id: "dep.portable", ref: "abc123" }];
  const portableBefore = JSON.stringify(portableRequest);
  const portableOut = assembly.run(portableRequest);
  const portableRequestPass = portableOut.status === "CANDIDATE"
    && portableOut.candidate && portableOut.candidate.id === "mt_portable"
    && JSON.stringify(portableOut.dependencies) === JSON.stringify(portableRequest.dependencies)
    && JSON.stringify(portableRequest) === portableBefore;
  if (!portableRequestPass) {
    errors.push(failure("ASSEMBLY_ROUND2_PORTABLE_REQUEST_DRIFT", "Portable Assembly closure was rejected or rewritten.", { status: portableOut.status }));
  }
  checked.push("portable-assembly-request-remains-candidate");

  const unboundNestedOut = assembly.run(baseEnvelope(
    "verification-assembly-round2-unbound-nested-target",
    "Do not infer parent context from a matching nested Interface leaf id",
    { id: "mt_inner", name: "Nested target" },
    {
      inputs: [
        { status: "CANDIDATE", candidate: { schema: "morphtile.tile-spec/v0.4", id: "mt_inner", form_hints: ["ui_panel"], facets: {} } },
        { status: "CANDIDATE", candidate: { schema: "morphtile.view-operation/v0.5", operation: { op: "view.set", id: "mt_shell/mt_inner", view: { title: "Nested", body: [] } } } }
      ]
    }
  ));
  const unboundNestedPass = unboundNestedOut.status === "HOLD"
    && Array.isArray(unboundNestedOut.holds)
    && unboundNestedOut.holds.some((entry) => entry.code === "HOLD_VIEW_OPERATION_TARGET_PATH_UNBOUND");
  if (!unboundNestedPass) {
    errors.push(failure("ASSEMBLY_SOURCE_PREFLIGHT_WIDENED_PARENT_CONTEXT", "Source preflight changed the no-parent-inference semantic boundary.", {
      status: unboundNestedOut.status,
      holds: unboundNestedOut.holds
    }));
  }
  checked.push("nested-parent-context-remains-explicit-and-uninvented");

  const forgedCandidate = assemblyPortableRequest("verification-assembly-kit-forged-source").inputs[0].candidate;
  const forgedEnvelope = {
    status: "CANDIDATE",
    target_binding: { id: "mt_portable", path: "mt_portable" },
    dependencies: [],
    world_requirements: null,
    closure_hash: { algorithm: "sha256", canonicalization: "sorted-key-json/v1", scope: "candidate+dependencies+world_requirements", value: "forged" },
    source_provenance: [],
    warnings: []
  };
  let kitResultAccessorCalls = 0;
  Object.defineProperty(forgedEnvelope, "candidate", {
    enumerable: true,
    configurable: true,
    get() {
      kitResultAccessorCalls += 1;
      return forgedCandidate;
    }
  });
  const forgedOut = kitModule.materializeKit(forgedEnvelope, MorphTile);
  const forgedHold = firstHoldCode(forgedOut);
  const forgedPath = forgedOut && forgedOut.holds && forgedOut.holds[0] && forgedOut.holds[0].path || null;
  const kitResultBoundaryPass = forgedOut.status === "HOLD"
    && forgedHold === "HOLD_KIT_INPUT_NONPORTABLE_VALUE"
    && forgedOut.kit === null
    && kitResultAccessorCalls === 0
    && forgedPath === "assembly_result.candidate";
  if (!kitResultBoundaryPass) {
    errors.push(failure("ASSEMBLY_KIT_RESULT_ACCESSOR_SOURCE_BOUNDARY_FAILED", "Kit materialization did not reject an accessor-backed supplied Assembly result without execution.", {
      status: forgedOut.status,
      hold: forgedHold,
      path: forgedPath,
      accessor_calls: kitResultAccessorCalls
    }));
  }
  checked.push("kit-result-accessor-rejected-before-source-trace");

  const kitSource = assembly.run(assemblyPortableRequest("verification-assembly-kit-source"));
  let optionsAccessorCalls = 0;
  const kitOptions = {};
  Object.defineProperty(kitOptions, "name", {
    enumerable: true,
    configurable: true,
    get() {
      optionsAccessorCalls += 1;
      return "Accessor kit name";
    }
  });
  const optionsOut = kitModule.materializeKit(kitSource, MorphTile, kitOptions);
  const optionsHold = firstHoldCode(optionsOut);
  const optionsPath = optionsOut && optionsOut.holds && optionsOut.holds[0] && optionsOut.holds[0].path || null;
  const kitOptionsBoundaryPass = optionsOut.status === "HOLD"
    && optionsHold === "HOLD_KIT_INPUT_NONPORTABLE_VALUE"
    && optionsOut.kit === null
    && optionsAccessorCalls === 0
    && optionsPath === "options.name";
  if (!kitOptionsBoundaryPass) {
    errors.push(failure("ASSEMBLY_KIT_OPTIONS_ACCESSOR_SOURCE_BOUNDARY_FAILED", "Kit materialization did not reject accessor-backed options without execution.", {
      status: optionsOut.status,
      hold: optionsHold,
      path: optionsPath,
      accessor_calls: optionsAccessorCalls
    }));
  }
  checked.push("kit-options-accessor-rejected-before-runtime-translation");

  const kitControlOut = kitModule.materializeKit(kitSource, MorphTile, { name: "Verification portable kit" });
  const kitControlPass = kitControlOut.status === "CANDIDATE"
    && kitControlOut.kit
    && kitControlOut.kit.format === "morphtile-kit"
    && Array.isArray(kitControlOut.holds)
    && kitControlOut.holds.length === 0;
  if (!kitControlPass) {
    errors.push(failure("ASSEMBLY_KIT_PORTABLE_CONTROL_FAILED", "A normal portable Assembly result no longer materialized to a verified MorphTile kit.", {
      status: kitControlOut.status,
      holds: kitControlOut.holds
    }));
  }
  checked.push("portable-kit-control-still-materializes-and-imports");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.assembly-source-integrity-conformance/v0.1",
      assembly_commit: assemblyCommit,
      core_commit: coreCommit,
      request_accessor: { status: accessorOut.status, hold: accessorHold, accessor_calls: requestAccessorCalls, pass: requestBoundaryPass },
      portable_request: { status: portableOut.status, preserved: portableRequestPass },
      nested_parent_context: { status: unboundNestedOut.status, hold_preserved: unboundNestedPass },
      kit_result_accessor: { status: forgedOut.status, hold: forgedHold, path: forgedPath, accessor_calls: kitResultAccessorCalls, pass: kitResultBoundaryPass },
      kit_options_accessor: { status: optionsOut.status, hold: optionsHold, path: optionsPath, accessor_calls: optionsAccessorCalls, pass: kitOptionsBoundaryPass },
      portable_kit_control: { status: kitControlOut.status, format: kitControlOut.kit && kitControlOut.kit.format || null, pass: kitControlPass }
    }
  };
}

module.exports = {
  verifySurfaceRepairAndIntentBoundary,
  verifyFormPreSerializationBoundary,
  verifyAssemblyPreSerializationBoundary
};
