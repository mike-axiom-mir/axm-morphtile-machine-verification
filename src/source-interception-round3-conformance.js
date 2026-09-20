"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function firstHoldCode(output) {
  return output && Array.isArray(output.holds) && output.holds[0] ? output.holds[0].code || null : null;
}

function findHold(output, code) {
  if (!output || !Array.isArray(output.holds)) return null;
  return output.holds.find((item) => item && item.code === code) || null;
}

function capture(fn) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return { value: null, error: error && error.message ? error.message : String(error) };
  }
}

function trappingProxy(target, counter) {
  return new Proxy(target, {
    getPrototypeOf(value) {
      counter.calls += 1;
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      counter.calls += 1;
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(value, key) {
      counter.calls += 1;
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
    get(value, key, receiver) {
      counter.calls += 1;
      return Reflect.get(value, key, receiver);
    }
  });
}

function envelope(requestId, goal, intent, extra = {}) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" },
    ...extra
  };
}

function verifySurfaceOuterRepairAndProxyBoundary(surface, options = {}) {
  const surfaceCommit = options.surfaceCommit || null;
  const errors = [];
  const checked = [];
  if (!surfaceCommit || !surface || typeof surface.run !== "function") {
    return {
      status: "FAIL",
      errors: [failure("SURFACE_R3_CONTRACT_MISSING", "Exact Surface revision and run() are required.")],
      checked,
      receipt: null
    };
  }

  const supportedIntentFields = ["base_color", "paint", "surface_rule", "pattern", "external_dependency"];
  const accessorReceipts = [];
  for (const field of supportedIntentFields) {
    let calls = 0;
    const intent = {};
    Object.defineProperty(intent, field, {
      enumerable: true,
      configurable: true,
      get() {
        calls += 1;
        return null;
      }
    });
    const before = Object.getOwnPropertyDescriptor(intent, field);
    const observed = capture(() => surface.run(envelope(
      "verification-surface-r3-accessor-" + field,
      "Reject Surface authored intent accessors before caller code executes",
      intent
    )));
    const after = Object.getOwnPropertyDescriptor(intent, field);
    const out = observed.value;
    const hold = firstHoldCode(out);
    const pass = !observed.error
      && out
      && out.status === "HOLD"
      && out.candidate === null
      && hold === "HOLD_SURFACE_INTENT_NONPORTABLE_VALUE"
      && calls === 0
      && after
      && before
      && after.get === before.get;
    accessorReceipts.push({ field, status: out && out.status || null, hold, calls, threw: observed.error, pass });
    if (!pass) {
      errors.push(failure(
        "SURFACE_OUTER_INTENT_ACCESSOR_REPAIR_FAILED",
        "Surface did not reject an accessor-backed supported intent field before caller code executed.",
        { field, status: out && out.status || null, hold, calls, threw: observed.error }
      ));
    }
  }
  checked.push("surface-supported-intent-fields-are-descriptor-gated");

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
  const nestedObserved = capture(() => surface.run(envelope(
    "verification-surface-r3-nested-paint-accessor",
    "Preserve the previously repaired nested paint source-integrity boundary",
    { base_color: [0.2, 0.25, 0.3], paint: nestedPaint }
  )));
  const nestedOut = nestedObserved.value;
  const nestedHold = firstHoldCode(nestedOut);
  const nestedPass = !nestedObserved.error
    && nestedOut
    && nestedOut.status === "HOLD"
    && nestedHold === "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE"
    && nestedAccessorCalls === 0
    && nestedOut.candidate === null;
  if (!nestedPass) {
    errors.push(failure("SURFACE_NESTED_PAINT_REPAIR_REGRESSED", "The previously repaired nested paint accessor boundary regressed.", {
      status: nestedOut && nestedOut.status || null,
      hold: nestedHold,
      calls: nestedAccessorCalls,
      threw: nestedObserved.error
    }));
  }
  checked.push("surface-nested-paint-repair-preserved");

  const intentProxyCounter = { calls: 0 };
  const proxiedIntent = trappingProxy({
    base_color: [0.2, 0.25, 0.3],
    paint: { color: [0.4, 0.5, 0.6], vars: { gain: 0.2 } }
  }, intentProxyCounter);
  const intentProxyObserved = capture(() => surface.run(envelope(
    "verification-surface-r3-intent-proxy",
    "Reject a Proxy-intercepted Surface intent before reflective preflight executes traps",
    proxiedIntent
  )));
  const intentProxyOut = intentProxyObserved.value;
  const intentProxySourceSafe = intentProxyCounter.calls === 0
    && !intentProxyObserved.error
    && intentProxyOut
    && intentProxyOut.status === "HOLD"
    && firstHoldCode(intentProxyOut) === "HOLD_SURFACE_INTENT_NONPORTABLE_VALUE";
  if (!intentProxySourceSafe) {
    errors.push(failure(
      "SURFACE_INTENT_PROXY_TRAP_EXECUTED",
      "Surface reflective authored-intent preflight executed caller-controlled Proxy traps or did not fail closed before reflection.",
      {
        trap_calls: intentProxyCounter.calls,
        status: intentProxyOut && intentProxyOut.status || null,
        hold: firstHoldCode(intentProxyOut),
        threw: intentProxyObserved.error
      }
    ));
  }
  checked.push("surface-root-intent-proxy-source-safety");

  const paintProxyCounter = { calls: 0 };
  const proxiedPaint = trappingProxy({
    color: [["+", 0.2, ["*", 0.3, ["var", "ny"]]], 0.55, 0.2],
    vars: { gain: 0.3 }
  }, paintProxyCounter);
  const paintProxyObserved = capture(() => surface.run(envelope(
    "verification-surface-r3-paint-proxy",
    "Reject Proxy-intercepted Surface paint before reflective preflight executes traps",
    { base_color: [0.2, 0.25, 0.3], paint: proxiedPaint }
  )));
  const paintProxyOut = paintProxyObserved.value;
  const paintProxySourceSafe = paintProxyCounter.calls === 0
    && !paintProxyObserved.error
    && paintProxyOut
    && paintProxyOut.status === "HOLD"
    && firstHoldCode(paintProxyOut) === "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE";
  if (!paintProxySourceSafe) {
    errors.push(failure(
      "SURFACE_PAINT_PROXY_TRAP_EXECUTED",
      "Surface paint preflight executed caller-controlled Proxy traps or did not fail closed before reflection.",
      {
        trap_calls: paintProxyCounter.calls,
        status: paintProxyOut && paintProxyOut.status || null,
        hold: firstHoldCode(paintProxyOut),
        threw: paintProxyObserved.error
      }
    ));
  }
  checked.push("surface-nested-paint-proxy-source-safety");

  const portablePaint = {
    color: [["+", 0.2, ["*", 0.3, ["var", "ny"]]], 0.55, 0.2],
    vars: { gain: 0.3 }
  };
  const portableIntent = { base_color: [0.2, 0.25, 0.3], paint: portablePaint };
  const portableBefore = JSON.stringify(portableIntent);
  const portableObserved = capture(() => surface.run(envelope(
    "verification-surface-r3-portable-control",
    "Keep ordinary portable Surface intent unchanged",
    portableIntent
  )));
  const portableOut = portableObserved.value;
  const candidatePaint = portableOut && portableOut.candidate && portableOut.candidate.value
    && portableOut.candidate.value.data && portableOut.candidate.value.data.paint;
  const portablePass = !portableObserved.error
    && portableOut
    && portableOut.status === "CANDIDATE"
    && JSON.stringify(portableIntent) === portableBefore
    && JSON.stringify(candidatePaint) === JSON.stringify(portablePaint);
  if (!portablePass) {
    errors.push(failure("SURFACE_R3_PORTABLE_CONTROL_DRIFT", "Ordinary portable Surface intent was rejected, mutated, or rewritten.", {
      status: portableOut && portableOut.status || null,
      threw: portableObserved.error
    }));
  }
  checked.push("surface-portable-control-preserved");

  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    checked,
    receipt: {
      schema: "axm.morphtile.surface-source-interception-conformance/v0.1",
      surface_commit: surfaceCommit,
      outer_accessor_fields: accessorReceipts,
      nested_paint_accessor: {
        status: nestedOut && nestedOut.status || null,
        hold: nestedHold,
        calls: nestedAccessorCalls,
        pass: nestedPass
      },
      intent_proxy: {
        status: intentProxyOut && intentProxyOut.status || null,
        hold: firstHoldCode(intentProxyOut),
        trap_calls: intentProxyCounter.calls,
        threw: intentProxyObserved.error,
        source_safe: intentProxySourceSafe
      },
      paint_proxy: {
        status: paintProxyOut && paintProxyOut.status || null,
        hold: firstHoldCode(paintProxyOut),
        trap_calls: paintProxyCounter.calls,
        threw: paintProxyObserved.error,
        source_safe: paintProxySourceSafe
      },
      portable_control: { status: portableOut && portableOut.status || null, preserved: portablePass },
      visual_quality: "NOT_TESTED"
    }
  };
}

function formRequest(id, recipe) {
  return envelope(id, "Verify Form source-interception boundaries", { name: "Proxy proof", recipe });
}

function verifyFormProxyBoundary(form, options = {}) {
  const formCommit = options.formCommit || null;
  const errors = [];
  const checked = [];
  if (!formCommit || !form || typeof form.run !== "function") {
    return { status: "FAIL", errors: [failure("FORM_R3_CONTRACT_MISSING", "Exact Form revision and run() are required.")], checked, receipt: null };
  }

  const nestedCounter = { calls: 0 };
  const nestedPart = trappingProxy({ shape: "box", size: [1, 1, 1] }, nestedCounter);
  const nestedObserved = capture(() => form.run(formRequest("verification-form-r3-nested-proxy", [nestedPart])));
  const nestedOut = nestedObserved.value;
  const nestedHold = findHold(nestedOut, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  const nestedPass = !nestedObserved.error && nestedOut && nestedOut.status === "HOLD"
    && nestedCounter.calls === 0 && nestedHold && nestedHold.path === "request.intent.recipe[0]";
  if (!nestedPass) {
    errors.push(failure("FORM_NESTED_PROXY_SOURCE_BOUNDARY_FAILED", "Form did not reject a nested Proxy before traps could execute.", {
      status: nestedOut && nestedOut.status || null,
      trap_calls: nestedCounter.calls,
      path: nestedHold && nestedHold.path || null,
      threw: nestedObserved.error
    }));
  }
  checked.push("form-nested-proxy-rejected-before-reflection");

  const rootCounter = { calls: 0 };
  const rootProxy = trappingProxy(formRequest("verification-form-r3-root-proxy", [{ shape: "box", size: [1, 1, 1] }]), rootCounter);
  const rootObserved = capture(() => form.run(rootProxy));
  const rootOut = rootObserved.value;
  const rootHold = findHold(rootOut, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  const rootPass = !rootObserved.error && rootOut && rootOut.status === "HOLD"
    && rootCounter.calls === 0 && rootHold && rootHold.path === "request";
  if (!rootPass) {
    errors.push(failure("FORM_ROOT_PROXY_SOURCE_BOUNDARY_FAILED", "Form did not reject a root Proxy before traps or fallback metadata access could execute.", {
      status: rootOut && rootOut.status || null,
      trap_calls: rootCounter.calls,
      path: rootHold && rootHold.path || null,
      threw: rootObserved.error
    }));
  }
  checked.push("form-root-proxy-rejected-before-reflection");

  const revocable = Proxy.revocable(formRequest("verification-form-r3-revoked-root", [{ shape: "box", size: [1, 1, 1] }]), {});
  revocable.revoke();
  const revokedObserved = capture(() => form.run(revocable.proxy));
  const revokedOut = revokedObserved.value;
  const revokedHold = findHold(revokedOut, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  const revokedPass = !revokedObserved.error && revokedOut && revokedOut.status === "HOLD"
    && revokedHold && revokedHold.path === "request";
  if (!revokedPass) {
    errors.push(failure("FORM_REVOKED_ROOT_PROXY_NOT_FAIL_CLOSED", "A revoked Form request Proxy threw or escaped the explicit HOLD boundary.", {
      status: revokedOut && revokedOut.status || null,
      path: revokedHold && revokedHold.path || null,
      threw: revokedObserved.error
    }));
  }
  checked.push("form-revoked-root-proxy-fails-closed");

  const portable = formRequest("verification-form-r3-portable-control", [{ shape: "box", size: [2, 3, 4], pos: [1, 2, 3] }]);
  const portableBefore = JSON.stringify(portable);
  const portableObserved = capture(() => form.run(portable));
  const portableOut = portableObserved.value;
  const parts = portableOut && portableOut.candidate && portableOut.candidate.facets
    && portableOut.candidate.facets.mesh && portableOut.candidate.facets.mesh.data
    && portableOut.candidate.facets.mesh.data.parts;
  const portablePass = !portableObserved.error && portableOut && portableOut.status === "CANDIDATE"
    && JSON.stringify(portable) === portableBefore
    && JSON.stringify(parts) === JSON.stringify(portable.intent.recipe);
  if (!portablePass) {
    errors.push(failure("FORM_R3_PORTABLE_CONTROL_DRIFT", "Ordinary portable Form input was rejected, mutated, or rewritten.", {
      status: portableOut && portableOut.status || null,
      threw: portableObserved.error
    }));
  }
  checked.push("form-portable-control-preserved");

  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    checked,
    receipt: {
      schema: "axm.morphtile.form-source-interception-conformance/v0.1",
      form_commit: formCommit,
      nested_proxy: { status: nestedOut && nestedOut.status || null, trap_calls: nestedCounter.calls, path: nestedHold && nestedHold.path || null, pass: nestedPass },
      root_proxy: { status: rootOut && rootOut.status || null, trap_calls: rootCounter.calls, path: rootHold && rootHold.path || null, pass: rootPass },
      revoked_root_proxy: { status: revokedOut && revokedOut.status || null, path: revokedHold && revokedHold.path || null, threw: revokedObserved.error, pass: revokedPass },
      portable_control: { status: portableOut && portableOut.status || null, preserved: portablePass }
    }
  };
}

function interfaceFixture(id = "verification-interface-r3") {
  return envelope(id, "Present and operate the canonical counter", {
    tile_path: "mt_counter",
    title: "Counter",
    readout: "count",
    action: "increment",
    bindings: { readouts: ["count"], actions: ["increment"] }
  });
}

function interfaceCandidateForNestedProof(interfaceMachine) {
  return interfaceMachine.run(envelope(
    "verification-interface-r3-receiver-proof",
    "Author a nested interface with explicit target-local proof requirements",
    {
      tile_path: "mt_shell/mt_inner",
      title: "Receiver proof",
      elements: [
        { kind: "readout", binding: "count", label: "Count" },
        { kind: "action", binding: "increment", label: "Increment" }
      ],
      bindings: { readouts: ["count"], actions: ["increment"], controls: [] }
    }
  ));
}

function verifyInterfaceProxyAndReceiverBoundary(interfaceMachine, assemblyReceiver, options = {}) {
  const interfaceCommit = options.interfaceCommit || null;
  const assemblyCommit = options.assemblyCommit || null;
  const errors = [];
  const checked = [];
  if (!interfaceCommit || !assemblyCommit || !interfaceMachine || typeof interfaceMachine.run !== "function"
      || !assemblyReceiver || typeof assemblyReceiver.run !== "function") {
    return { status: "FAIL", errors: [failure("INTERFACE_R3_CONTRACT_MISSING", "Exact Interface and Assembly receiver revisions plus run() are required.")], checked, receipt: null };
  }

  let requestIntentCalls = 0;
  const requestWithIntentAccessor = {
    envelope_version: "0.1",
    request_id: "verification-interface-r3-request-intent-accessor",
    goal: "Reject request.intent accessor without executing it",
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  Object.defineProperty(requestWithIntentAccessor, "intent", {
    enumerable: true,
    configurable: true,
    get() {
      requestIntentCalls += 1;
      return { tile_path: "mt_counter", title: "Injected" };
    }
  });
  const requestAccessorObserved = capture(() => interfaceMachine.run(requestWithIntentAccessor));
  const requestAccessorOut = requestAccessorObserved.value;
  const requestAccessorPass = !requestAccessorObserved.error && requestAccessorOut && requestAccessorOut.status === "HOLD"
    && firstHoldCode(requestAccessorOut) === "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE" && requestIntentCalls === 0;
  if (!requestAccessorPass) {
    errors.push(failure("INTERFACE_REQUEST_INTENT_ACCESSOR_EXECUTED", "Interface request.intent accessor executed or escaped the fail-closed boundary.", {
      calls: requestIntentCalls,
      status: requestAccessorOut && requestAccessorOut.status || null,
      hold: firstHoldCode(requestAccessorOut),
      threw: requestAccessorObserved.error
    }));
  }
  checked.push("interface-request-intent-accessor-source-safety");

  const rootProxyCounter = { calls: 0 };
  const proxiedIntent = trappingProxy(interfaceFixture("verification-interface-r3-root-intent-proxy").intent, rootProxyCounter);
  const proxyRequest = interfaceFixture("verification-interface-r3-root-intent-proxy");
  proxyRequest.intent = proxiedIntent;
  const rootProxyObserved = capture(() => interfaceMachine.run(proxyRequest));
  const rootProxyOut = rootProxyObserved.value;
  const rootProxyPass = !rootProxyObserved.error && rootProxyOut && rootProxyOut.status === "HOLD"
    && firstHoldCode(rootProxyOut) === "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE" && rootProxyCounter.calls === 0;
  if (!rootProxyPass) {
    errors.push(failure("INTERFACE_ROOT_INTENT_PROXY_SOURCE_BOUNDARY_FAILED", "Interface did not reject root authored-intent Proxy interception before traps could execute.", {
      trap_calls: rootProxyCounter.calls,
      status: rootProxyOut && rootProxyOut.status || null,
      hold: firstHoldCode(rootProxyOut),
      threw: rootProxyObserved.error
    }));
  }
  checked.push("interface-root-intent-proxy-rejected-before-reflection");

  const placementCounter = { calls: 0 };
  const placementRequest = interfaceFixture("verification-interface-r3-placement-proxy");
  placementRequest.intent.placement = trappingProxy({ mode: "screen" }, placementCounter);
  const placementObserved = capture(() => interfaceMachine.run(placementRequest));
  const placementOut = placementObserved.value;
  const placementPass = !placementObserved.error && placementOut && placementOut.status === "HOLD"
    && firstHoldCode(placementOut) === "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE" && placementCounter.calls === 0;
  if (!placementPass) {
    errors.push(failure("INTERFACE_NESTED_PROXY_SOURCE_BOUNDARY_FAILED", "Interface did not reject a nested placement Proxy before traps could execute.", {
      trap_calls: placementCounter.calls,
      status: placementOut && placementOut.status || null,
      hold: firstHoldCode(placementOut),
      threw: placementObserved.error
    }));
  }
  checked.push("interface-nested-placement-proxy-rejected-before-reflection");

  let toJSONCalls = 0;
  const toJSONRequest = interfaceFixture("verification-interface-r3-hidden-tojson");
  Object.defineProperty(toJSONRequest.intent, "toJSON", {
    enumerable: false,
    configurable: true,
    value() {
      toJSONCalls += 1;
      return { tile_path: "mt_other", title: "Rewritten" };
    }
  });
  const toJSONObserved = capture(() => interfaceMachine.run(toJSONRequest));
  const toJSONOut = toJSONObserved.value;
  const toJSONPass = !toJSONObserved.error && toJSONOut && toJSONOut.status === "HOLD"
    && firstHoldCode(toJSONOut) === "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE" && toJSONCalls === 0;
  if (!toJSONPass) {
    errors.push(failure("INTERFACE_HIDDEN_TOJSON_EXECUTED", "Interface executed a hidden toJSON hook or failed to reject it before transport.", {
      calls: toJSONCalls,
      status: toJSONOut && toJSONOut.status || null,
      hold: firstHoldCode(toJSONOut),
      threw: toJSONObserved.error
    }));
  }
  checked.push("interface-hidden-tojson-source-safety");

  const protoIntent = JSON.parse('{"tile_path":"mt_counter","__proto__":{"polluted":true}}');
  const protoRequest = envelope("verification-interface-r3-proto-key", "Preserve special authored keys into explicit unknown-field rejection", protoIntent);
  const protoBefore = Object.prototype.hasOwnProperty.call(protoIntent, "__proto__") && JSON.stringify(protoIntent["__proto__"]);
  const protoObserved = capture(() => interfaceMachine.run(protoRequest));
  const protoOut = protoObserved.value;
  const protoAfter = Object.prototype.hasOwnProperty.call(protoIntent, "__proto__") && JSON.stringify(protoIntent["__proto__"]);
  const protoPass = !protoObserved.error && protoOut && protoOut.status === "HOLD"
    && firstHoldCode(protoOut) === "HOLD_INTERFACE_INTENT_FIELD_UNKNOWN"
    && protoBefore === protoAfter
    && Object.prototype.polluted === undefined;
  if (!protoPass) {
    errors.push(failure("INTERFACE_SPECIAL_KEY_SOURCE_INTEGRITY_FAILED", "Interface did not preserve __proto__ as authored data into fail-closed unknown-field rejection.", {
      status: protoOut && protoOut.status || null,
      hold: firstHoldCode(protoOut),
      source_preserved: protoBefore === protoAfter,
      prototype_polluted: Object.prototype.polluted !== undefined,
      threw: protoObserved.error
    }));
  }
  checked.push("interface-special-proto-key-remains-data-not-authority");

  const portable = interfaceFixture("verification-interface-r3-portable-control");
  const portableBefore = JSON.stringify(portable);
  const portableObserved = capture(() => interfaceMachine.run(portable));
  const portableOut = portableObserved.value;
  const portablePass = !portableObserved.error && portableOut && portableOut.status === "CANDIDATE"
    && JSON.stringify(portable) === portableBefore;
  if (!portablePass) {
    errors.push(failure("INTERFACE_R3_PORTABLE_CONTROL_DRIFT", "Ordinary portable Interface intent was rejected or source-mutated.", {
      status: portableOut && portableOut.status || null,
      threw: portableObserved.error
    }));
  }
  checked.push("interface-portable-control-preserved");

  const nestedCandidate = interfaceCandidateForNestedProof(interfaceMachine);
  const eligibility = {
    candidate: { schema: "morphtile.tile-spec/v0.4", form_hints: ["ui_panel"], facets: {} },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const receiverObserved = capture(() => assemblyReceiver.run(envelope(
    "verification-interface-r3-current-assembly-receiver",
    "Preserve Interface proof obligations through current integrated Assembly receiver",
    { id: "mt_inner", tile_path: "mt_shell/mt_inner", name: "Nested receiver proof" },
    { inputs: [eligibility, nestedCandidate] }
  )));
  const receiverOut = receiverObserved.value;
  const expectedDependencyIds = ["morphtile.interface-target-proof:mt_shell/mt_inner"];
  const candidateDependencyIds = nestedCandidate && Array.isArray(nestedCandidate.dependencies)
    ? nestedCandidate.dependencies.map((dependency) => dependency.id)
    : [];
  const receiverDependencyIds = receiverOut && Array.isArray(receiverOut.dependencies)
    ? receiverOut.dependencies.map((dependency) => dependency.id)
    : [];
  const receiverPass = !receiverObserved.error
    && nestedCandidate && nestedCandidate.status === "CANDIDATE"
    && JSON.stringify(candidateDependencyIds) === JSON.stringify(expectedDependencyIds)
    && receiverOut && receiverOut.status === "CANDIDATE"
    && JSON.stringify(receiverOut.target_binding) === JSON.stringify({ id: "mt_inner", path: "mt_shell/mt_inner" })
    && JSON.stringify(receiverDependencyIds) === JSON.stringify(expectedDependencyIds)
    && receiverOut.closure_hash && receiverOut.closure_hash.scope === "candidate+dependencies+world_requirements";
  if (!receiverPass) {
    errors.push(failure("INTERFACE_CURRENT_ASSEMBLY_RECEIVER_PROOF_FAILED", "Current integrated Assembly did not preserve the exact Interface target-proof dependency and nested binding.", {
      interface_status: nestedCandidate && nestedCandidate.status || null,
      interface_dependencies: candidateDependencyIds,
      assembly_status: receiverOut && receiverOut.status || null,
      assembly_dependencies: receiverDependencyIds,
      target_binding: receiverOut && receiverOut.target_binding || null,
      threw: receiverObserved.error
    }));
  }
  checked.push("interface-current-assembly-receiver-proof-preserved");

  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    checked,
    receipt: {
      schema: "axm.morphtile.interface-source-interception-conformance/v0.1",
      interface_commit: interfaceCommit,
      assembly_receiver_commit: assemblyCommit,
      request_intent_accessor: { status: requestAccessorOut && requestAccessorOut.status || null, calls: requestIntentCalls, pass: requestAccessorPass },
      root_intent_proxy: { status: rootProxyOut && rootProxyOut.status || null, trap_calls: rootProxyCounter.calls, pass: rootProxyPass },
      nested_placement_proxy: { status: placementOut && placementOut.status || null, trap_calls: placementCounter.calls, pass: placementPass },
      hidden_tojson: { status: toJSONOut && toJSONOut.status || null, calls: toJSONCalls, pass: toJSONPass },
      special_proto_key: { status: protoOut && protoOut.status || null, hold: firstHoldCode(protoOut), source_preserved: protoBefore === protoAfter, prototype_polluted: Object.prototype.polluted !== undefined, pass: protoPass },
      portable_control: { status: portableOut && portableOut.status || null, source_preserved: portablePass },
      receiver_proof: {
        interface_status: nestedCandidate && nestedCandidate.status || null,
        assembly_status: receiverOut && receiverOut.status || null,
        dependency_ids: receiverDependencyIds,
        target_binding: receiverOut && receiverOut.target_binding || null,
        pass: receiverPass
      }
    }
  };
}

function assemblyRequest(id) {
  return envelope(
    id,
    "Reject intercepted Assembly input before reflective source inspection",
    { id: "mt_proxy_safe", name: "Proxy source proof" },
    {
      inputs: [{
        status: "CANDIDATE",
        candidate: {
          schema: "morphtile.tile-spec/v0.4",
          id: "mt_proxy_safe",
          form_hints: [],
          facets: {}
        },
        provenance: { caller: "axm.morphtile.machine.verification" }
      }]
    }
  );
}

function verifyAssemblyProxyBoundary(assembly, kitModule, MorphTile, options = {}) {
  const assemblyCommit = options.assemblyCommit || null;
  const coreCommit = options.coreCommit || null;
  const errors = [];
  const checked = [];
  if (!assemblyCommit || !coreCommit || !assembly || typeof assembly.run !== "function"
      || !kitModule || typeof kitModule.materializeKit !== "function" || !MorphTile) {
    return { status: "FAIL", errors: [failure("ASSEMBLY_R3_CONTRACT_MISSING", "Exact Assembly/Core revisions and Assembly/kit/runtime APIs are required.")], checked, receipt: null };
  }

  const rootCounter = { calls: 0 };
  const rootProxy = trappingProxy(assemblyRequest("verification-assembly-r3-root-proxy"), rootCounter);
  const rootObserved = capture(() => assembly.run(rootProxy));
  const rootOut = rootObserved.value;
  const rootHold = findHold(rootOut, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  const rootPass = !rootObserved.error && rootOut && rootOut.status === "HOLD"
    && rootCounter.calls === 0 && rootHold && rootHold.path === "request" && rootOut.candidate === null;
  if (!rootPass) {
    errors.push(failure("ASSEMBLY_ROOT_PROXY_SOURCE_BOUNDARY_FAILED", "Assembly root request Proxy was reflected or inspected before fail-closed rejection.", {
      trap_calls: rootCounter.calls,
      status: rootOut && rootOut.status || null,
      path: rootHold && rootHold.path || null,
      threw: rootObserved.error
    }));
  }
  checked.push("assembly-root-proxy-rejected-before-reflection");

  const nestedCounter = { calls: 0 };
  const nestedRequest = assemblyRequest("verification-assembly-r3-nested-proxy");
  nestedRequest.dependencies = [trappingProxy({ id: "dep.proxy", ref: "abc123" }, nestedCounter)];
  const nestedObserved = capture(() => assembly.run(nestedRequest));
  const nestedOut = nestedObserved.value;
  const nestedHold = findHold(nestedOut, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  const nestedPass = !nestedObserved.error && nestedOut && nestedOut.status === "HOLD"
    && nestedCounter.calls === 0 && nestedHold && nestedHold.path === "request.dependencies[0]";
  if (!nestedPass) {
    errors.push(failure("ASSEMBLY_NESTED_PROXY_SOURCE_BOUNDARY_FAILED", "Assembly nested dependency Proxy was reflected before fail-closed rejection.", {
      trap_calls: nestedCounter.calls,
      status: nestedOut && nestedOut.status || null,
      path: nestedHold && nestedHold.path || null,
      threw: nestedObserved.error
    }));
  }
  checked.push("assembly-nested-proxy-rejected-before-reflection");

  const revokedRequest = Proxy.revocable(assemblyRequest("verification-assembly-r3-revoked-request"), {});
  revokedRequest.revoke();
  const revokedRequestObserved = capture(() => assembly.run(revokedRequest.proxy));
  const revokedRequestOut = revokedRequestObserved.value;
  const revokedRequestHold = findHold(revokedRequestOut, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  const revokedRequestPass = !revokedRequestObserved.error && revokedRequestOut && revokedRequestOut.status === "HOLD"
    && revokedRequestHold && revokedRequestHold.path === "request";
  if (!revokedRequestPass) {
    errors.push(failure("ASSEMBLY_REVOKED_ROOT_PROXY_NOT_FAIL_CLOSED", "A revoked Assembly request Proxy threw or escaped the explicit HOLD boundary.", {
      status: revokedRequestOut && revokedRequestOut.status || null,
      path: revokedRequestHold && revokedRequestHold.path || null,
      threw: revokedRequestObserved.error
    }));
  }
  checked.push("assembly-revoked-request-proxy-fails-closed");

  const portableRequest = assemblyRequest("verification-assembly-r3-portable-control");
  const portableBefore = JSON.stringify(portableRequest);
  const portableObserved = capture(() => assembly.run(portableRequest));
  const portableOut = portableObserved.value;
  const portableRequestPass = !portableObserved.error && portableOut && portableOut.status === "CANDIDATE"
    && JSON.stringify(portableRequest) === portableBefore;
  if (!portableRequestPass) {
    errors.push(failure("ASSEMBLY_R3_PORTABLE_REQUEST_DRIFT", "Ordinary portable Assembly request was rejected or source-mutated.", {
      status: portableOut && portableOut.status || null,
      threw: portableObserved.error
    }));
  }
  checked.push("assembly-portable-request-preserved");

  const candidateCounter = { calls: 0 };
  const proxiedResult = portableOut && portableOut.status === "CANDIDATE" ? { ...portableOut } : null;
  if (proxiedResult) proxiedResult.candidate = trappingProxy(proxiedResult.candidate, candidateCounter);
  const candidateObserved = capture(() => kitModule.materializeKit(proxiedResult, MorphTile));
  const candidateOut = candidateObserved.value;
  const candidateHold = findHold(candidateOut, "HOLD_KIT_INPUT_NONPORTABLE_VALUE");
  const candidatePass = !candidateObserved.error && candidateOut && candidateOut.status === "HOLD"
    && candidateCounter.calls === 0 && candidateHold && candidateHold.path === "assembly_result.candidate";
  if (!candidatePass) {
    errors.push(failure("ASSEMBLY_KIT_CANDIDATE_PROXY_SOURCE_BOUNDARY_FAILED", "Kit materialization inspected a proxied Assembly candidate before fail-closed rejection.", {
      trap_calls: candidateCounter.calls,
      status: candidateOut && candidateOut.status || null,
      path: candidateHold && candidateHold.path || null,
      threw: candidateObserved.error
    }));
  }
  checked.push("assembly-kit-candidate-proxy-rejected-before-reflection");

  const revokedResult = portableOut && portableOut.status === "CANDIDATE" ? Proxy.revocable({ ...portableOut }, {}) : null;
  if (revokedResult) revokedResult.revoke();
  const revokedResultObserved = capture(() => kitModule.materializeKit(revokedResult ? revokedResult.proxy : null, MorphTile));
  const revokedResultOut = revokedResultObserved.value;
  const revokedResultHold = findHold(revokedResultOut, "HOLD_KIT_INPUT_NONPORTABLE_VALUE");
  const revokedResultPass = !revokedResultObserved.error && revokedResultOut && revokedResultOut.status === "HOLD"
    && revokedResultHold && revokedResultHold.path === "assembly_result";
  if (!revokedResultPass) {
    errors.push(failure("ASSEMBLY_REVOKED_RESULT_PROXY_NOT_FAIL_CLOSED", "A revoked Assembly result Proxy threw or escaped the kit HOLD boundary.", {
      status: revokedResultOut && revokedResultOut.status || null,
      path: revokedResultHold && revokedResultHold.path || null,
      threw: revokedResultObserved.error
    }));
  }
  checked.push("assembly-revoked-result-proxy-fails-closed");

  const revokedOptions = Proxy.revocable({ name: "never read" }, {});
  revokedOptions.revoke();
  const optionsObserved = capture(() => kitModule.materializeKit(portableOut, MorphTile, revokedOptions.proxy));
  const optionsOut = optionsObserved.value;
  const optionsHold = findHold(optionsOut, "HOLD_KIT_INPUT_NONPORTABLE_VALUE");
  const optionsPass = !optionsObserved.error && optionsOut && optionsOut.status === "HOLD"
    && optionsHold && optionsHold.path === "options";
  if (!optionsPass) {
    errors.push(failure("ASSEMBLY_REVOKED_OPTIONS_PROXY_NOT_FAIL_CLOSED", "Revoked kit options threw or escaped the explicit kit HOLD boundary.", {
      status: optionsOut && optionsOut.status || null,
      path: optionsHold && optionsHold.path || null,
      threw: optionsObserved.error
    }));
  }
  checked.push("assembly-revoked-options-proxy-fails-closed");

  const kitObserved = capture(() => kitModule.materializeKit(portableOut, MorphTile, { name: "Verification portable kit" }));
  const kitOut = kitObserved.value;
  const kitPass = !kitObserved.error && kitOut && kitOut.status === "CANDIDATE"
    && kitOut.kit && kitOut.kit.format === "morphtile-kit";
  if (!kitPass) {
    errors.push(failure("ASSEMBLY_R3_PORTABLE_KIT_CONTROL_FAILED", "Ordinary portable Assembly output no longer materializes into a MorphTile kit.", {
      status: kitOut && kitOut.status || null,
      format: kitOut && kitOut.kit && kitOut.kit.format || null,
      threw: kitObserved.error
    }));
  }
  checked.push("assembly-portable-kit-control-preserved");

  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    checked,
    receipt: {
      schema: "axm.morphtile.assembly-source-interception-conformance/v0.1",
      assembly_commit: assemblyCommit,
      core_commit: coreCommit,
      root_proxy: { status: rootOut && rootOut.status || null, trap_calls: rootCounter.calls, path: rootHold && rootHold.path || null, pass: rootPass },
      nested_proxy: { status: nestedOut && nestedOut.status || null, trap_calls: nestedCounter.calls, path: nestedHold && nestedHold.path || null, pass: nestedPass },
      revoked_request: { status: revokedRequestOut && revokedRequestOut.status || null, path: revokedRequestHold && revokedRequestHold.path || null, threw: revokedRequestObserved.error, pass: revokedRequestPass },
      portable_request: { status: portableOut && portableOut.status || null, preserved: portableRequestPass },
      kit_candidate_proxy: { status: candidateOut && candidateOut.status || null, trap_calls: candidateCounter.calls, path: candidateHold && candidateHold.path || null, pass: candidatePass },
      revoked_result: { status: revokedResultOut && revokedResultOut.status || null, path: revokedResultHold && revokedResultHold.path || null, threw: revokedResultObserved.error, pass: revokedResultPass },
      revoked_options: { status: optionsOut && optionsOut.status || null, path: optionsHold && optionsHold.path || null, threw: optionsObserved.error, pass: optionsPass },
      portable_kit: { status: kitOut && kitOut.status || null, format: kitOut && kitOut.kit && kitOut.kit.format || null, pass: kitPass }
    }
  };
}

module.exports = {
  verifySurfaceOuterRepairAndProxyBoundary,
  verifyFormProxyBoundary,
  verifyInterfaceProxyAndReceiverBoundary,
  verifyAssemblyProxyBoundary
};
