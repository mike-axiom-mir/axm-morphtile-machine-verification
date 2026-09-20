"use strict";

const { resolveInterfaceTargetProof } = require("./interface-target-proof-conformance");
const { verifyAssemblyProxyBoundary } = require("./source-interception-round3-conformance");

function fail(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function clonePortable(value) {
  return JSON.parse(JSON.stringify(value));
}

function surfaceRequest(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify recursive Surface authoring source integrity",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function verifySurfaceNestedAuthoring(surface, options = {}) {
  const errors = [];
  const checked = [];
  if (!surface || typeof surface.run !== "function") {
    return { status: "FAIL", checked, errors: [fail("SURFACE_MACHINE_CONTRACT_MISSING", "Surface verification requires run().")], receipt: null };
  }

  const portableIntent = {
    surface_rule: {
      kind: "facing",
      direction: "up",
      threshold: 0.6,
      match_color: [0.9, 0.8, 0.7],
      else_color: [0.1, 0.2, 0.3]
    }
  };
  const portable = surfaceRequest("verification-surface-nested-portable", clonePortable(portableIntent));
  const portableBefore = JSON.stringify(portable);
  const portableFirst = surface.run(portable);
  const portableSecond = surface.run(portable);
  const portablePass = portableFirst && portableFirst.status === "CANDIDATE"
    && JSON.stringify(portableFirst) === JSON.stringify(portableSecond)
    && JSON.stringify(portable) === portableBefore;
  if (!portablePass) {
    errors.push(fail("SURFACE_NESTED_PORTABLE_CONTROL_DRIFT", "Ordinary portable compiled authoring did not remain deterministic, candidate-producing, and source-preserving.", {
      first_status: portableFirst && portableFirst.status || null
    }));
  }
  checked.push("portable-compiled-authoring-control");

  const proxyCalls = { count: 0 };
  const patternTarget = { kind: "checker", scale: 0.5 };
  const patternProxy = new Proxy(patternTarget, {
    getPrototypeOf(target) { proxyCalls.count += 1; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { proxyCalls.count += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { proxyCalls.count += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    get(target, key, receiver) { proxyCalls.count += 1; return Reflect.get(target, key, receiver); }
  });
  const proxyOut = surface.run(surfaceRequest("verification-surface-nested-proxy", { pattern: patternProxy }));
  const proxyHold = proxyOut && Array.isArray(proxyOut.holds) && proxyOut.holds[0] && proxyOut.holds[0].code || null;
  if (proxyCalls.count !== 0 || !proxyOut || proxyOut.status !== "HOLD" || proxyHold !== "HOLD_SURFACE_PATTERN_NONPORTABLE_VALUE" || proxyOut.candidate !== null) {
    errors.push(fail("SURFACE_NESTED_PROXY_BOUNDARY_REGRESSED", "Nested pattern Proxy did not fail closed before caller-controlled reflection.", {
      trap_calls: proxyCalls.count,
      observed_status: proxyOut && proxyOut.status || null,
      observed_hold: proxyHold
    }));
  }
  checked.push("nested-proxy-zero-execution-replay");

  // Adversarial special-key case. `__proto__` is ordinary authored data when it
  // is an own data property. A snapshot must not turn it into prototype
  // authority or silently erase it before the semantic unknown-field gate.
  const specialRule = {
    kind: "facing",
    direction: "up",
    threshold: 0.6,
    match_color: [0.9, 0.8, 0.7],
    else_color: [0.1, 0.2, 0.3]
  };
  const poison = { verification_surface_special_key: true };
  Object.defineProperty(specialRule, "__proto__", {
    value: poison,
    enumerable: true,
    configurable: true,
    writable: true
  });
  const sourcePrototypeBefore = Object.getPrototypeOf(specialRule);
  const sourceDescriptorBefore = Object.getOwnPropertyDescriptor(specialRule, "__proto__");
  const specialRequest = surfaceRequest("verification-surface-special-proto-key", { surface_rule: specialRule });
  let specialOut = null;
  let specialThrew = null;
  try {
    specialOut = surface.run(specialRequest);
  } catch (error) {
    specialThrew = error && error.message || String(error);
  }
  const sourceDescriptorAfter = Object.getOwnPropertyDescriptor(specialRule, "__proto__");
  const sourcePreserved = Object.getPrototypeOf(specialRule) === sourcePrototypeBefore
    && !!sourceDescriptorAfter
    && sourceDescriptorAfter.value === sourceDescriptorBefore.value
    && sourceDescriptorAfter.enumerable === true;
  const globalPrototypeClean = Object.prototype.verification_surface_special_key === undefined;
  const specialHold = specialOut && Array.isArray(specialOut.holds) && specialOut.holds[0] && specialOut.holds[0].code || null;
  const specialRejected = !specialThrew && specialOut && specialOut.status === "HOLD" && specialOut.candidate === null;

  if (specialThrew) {
    errors.push(fail("SURFACE_COMPILED_AUTHORING_SPECIAL_KEY_THREW", "Own enumerable __proto__ authored data escaped as an exception instead of an explicit HOLD.", { observed_error: specialThrew }));
  } else if (!specialRejected) {
    errors.push(fail(
      "SURFACE_COMPILED_AUTHORING_PROTO_KEY_REWRITTEN",
      "Own enumerable __proto__ authored data was not rejected by the compiled-authoring grammar; a plain-object snapshot may silently reinterpret it as prototype authority.",
      { observed_status: specialOut && specialOut.status || null, observed_hold: specialHold, candidate_present: !!(specialOut && specialOut.candidate) }
    ));
  }
  if (!sourcePreserved) {
    errors.push(fail("SURFACE_SPECIAL_KEY_SOURCE_MUTATED", "The adversarial special-key request mutated caller-owned source data."));
  }
  if (!globalPrototypeClean) {
    errors.push(fail("SURFACE_SPECIAL_KEY_GLOBAL_PROTOTYPE_POLLUTED", "The special-key probe modified Object.prototype."));
  }
  checked.push("own-special-key-remains-data-and-fails-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-nested-authoring-conformance/v0.1",
      surface_commit: options.surfaceCommit || null,
      portable_control: { status: portableFirst && portableFirst.status || null, deterministic: JSON.stringify(portableFirst) === JSON.stringify(portableSecond), source_preserved: JSON.stringify(portable) === portableBefore },
      nested_proxy: { status: proxyOut && proxyOut.status || null, hold: proxyHold, trap_calls: proxyCalls.count },
      special_key: {
        status: specialOut && specialOut.status || null,
        hold: specialHold,
        threw: specialThrew,
        candidate_present: !!(specialOut && specialOut.candidate),
        source_preserved: sourcePreserved,
        global_prototype_clean: globalPrototypeClean
      },
      visual_quality: "NOT_TESTED"
    }
  };
}

function formRequest(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify bounded repeat rotation progression",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function verifyFormRepeatRotation(form, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  if (!form || typeof form.run !== "function") {
    return { status: "FAIL", checked, errors: [fail("FORM_MACHINE_CONTRACT_MISSING", "Form repeat-rotation verification requires run().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.createTile !== "function" || typeof MorphTile.compileMesh !== "function") {
    return { status: "FAIL", checked, errors: [fail("MORPHTILE_MESH_CONTRACT_MISSING", "Repeat-rotation verification requires createTile() and compileMesh().")], receipt: null };
  }

  const turningIntent = {
    repeat: {
      count: 4,
      step: [0.2, 0.45, 0],
      rot_step: [-0.15, 0.4, 0.1],
      part: { shape: "box", size: [1.1, 0.12, 0.24], pos: [1, 0, 0], rot: [0.3, -0.2, 0.05] }
    }
  };
  const turningRequest = formRequest("verification-form-repeat-rotation", clonePortable(turningIntent));
  const turningBefore = JSON.stringify(turningRequest);
  const first = form.run(turningRequest);
  const second = form.run(turningRequest);
  const target = first && first.candidate && first.candidate.facets && first.candidate.facets.mesh && first.candidate.facets.mesh.data
    && first.candidate.facets.mesh.data.parts && first.candidate.facets.mesh.data.parts[0]
    && first.candidate.facets.mesh.data.parts[0].body && first.candidate.facets.mesh.data.parts[0].body[0];
  const expectedRot = [
    ["+", 0.3, ["*", ["var", "i"], -0.15]],
    ["+", -0.2, ["*", ["var", "i"], 0.4]],
    ["+", 0.05, ["*", ["var", "i"], 0.1]]
  ];
  const deterministic = JSON.stringify(first) === JSON.stringify(second);
  const sourcePreserved = JSON.stringify(turningRequest) === turningBefore;
  if (!first || first.status !== "CANDIDATE" || !target || JSON.stringify(target.rot) !== JSON.stringify(expectedRot) || !deterministic || !sourcePreserved) {
    errors.push(fail("FORM_REPEAT_ROTATION_EMISSION_INVALID", "Bounded repeat rotation did not preserve exact authored base/delta meaning under deterministic replay.", {
      observed_status: first && first.status || null,
      observed_rot: target && target.rot || null,
      deterministic,
      source_preserved: sourcePreserved
    }));
  }
  checked.push("exact-multi-axis-rotation-emission-and-replay");

  let turningMesh = null;
  let straightMesh = null;
  let runtimeThrew = null;
  try {
    turningMesh = MorphTile.compileMesh(MorphTile.createTile(first.candidate));
    const straight = form.run(formRequest("verification-form-repeat-straight-control", {
      repeat: {
        count: 4,
        step: [0.2, 0.45, 0],
        part: { shape: "box", size: [1.1, 0.12, 0.24], pos: [1, 0, 0], rot: [0.3, -0.2, 0.05] }
      }
    }));
    straightMesh = MorphTile.compileMesh(MorphTile.createTile(straight.candidate));
  } catch (error) {
    runtimeThrew = error && error.message || String(error);
  }
  const finite = !!turningMesh && Array.isArray(turningMesh.P) && turningMesh.P.length > 0 && turningMesh.P.every(Number.isFinite);
  const geometryDiffers = !!turningMesh && !!straightMesh && JSON.stringify(turningMesh.P) !== JSON.stringify(straightMesh.P);
  const sameBoundedTriangles = !!turningMesh && !!straightMesh && turningMesh.T.length === straightMesh.T.length;
  if (runtimeThrew || !turningMesh || turningMesh.hold !== null || !finite || turningMesh.recipe_parts !== 4 || !geometryDiffers || !sameBoundedTriangles) {
    errors.push(fail("FORM_REPEAT_ROTATION_RUNTIME_MEANING_INVALID", "Pinned MorphTile did not execute the emitted rotation progression as finite, bounded, meaningfully different geometry.", {
      observed_error: runtimeThrew,
      hold: turningMesh && turningMesh.hold || null,
      recipe_parts: turningMesh && turningMesh.recipe_parts || null,
      finite,
      geometry_differs: geometryDiffers,
      same_bounded_triangles: sameBoundedTriangles
    }));
  }
  checked.push("real-runtime-rotation-meaning");

  const overflowRequest = formRequest("verification-form-repeat-rotation-overflow", {
    repeat: {
      count: 2,
      step: [0, 1, 0],
      rot_step: [Number.MAX_VALUE, 0, 0],
      part: { shape: "box", rot: [Number.MAX_VALUE, 0, 0] }
    }
  });
  const overflowBefore = JSON.stringify(overflowRequest);
  const overflow = form.run(overflowRequest);
  const overflowHold = overflow && Array.isArray(overflow.holds) && overflow.holds[0] || null;
  if (!overflow || overflow.status !== "HOLD" || !overflowHold || overflowHold.code !== "HOLD_FORM_REPEAT_INVALID" || !/non-finite generated value/.test(overflowHold.detail || "") || overflow.candidate !== null || JSON.stringify(overflowRequest) !== overflowBefore) {
    errors.push(fail("FORM_REPEAT_ROTATION_OVERFLOW_NOT_CLOSED", "Finite-authored repeat rotation that expands non-finite did not fail closed without source mutation.", {
      observed_status: overflow && overflow.status || null,
      observed_hold: overflowHold
    }));
  }
  checked.push("bounded-domain-overflow-fails-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.form-repeat-rotation-conformance/v0.1",
      form_commit: options.formCommit || null,
      morphtile_commit: options.morphTileCommit || null,
      emitted_rotation: target && target.rot || null,
      deterministic_replay: deterministic,
      source_preserved: sourcePreserved,
      runtime: {
        hold: turningMesh && turningMesh.hold || null,
        recipe_parts: turningMesh && turningMesh.recipe_parts || null,
        positions_finite: finite,
        geometry_differs_from_straight: geometryDiffers,
        triangle_count_preserved: sameBoundedTriangles
      },
      overflow: { status: overflow && overflow.status || null, hold: overflowHold && overflowHold.code || null }
    }
  };
}

function verifyInterfaceMeter(interfaceMachine, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  if (!interfaceMachine || typeof interfaceMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [fail("INTERFACE_MACHINE_CONTRACT_MISSING", "Meter verification requires Interface run().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.seedWorld !== "function" || typeof MorphTile.createWorkspace !== "function") {
    return { status: "FAIL", checked, errors: [fail("MORPHTILE_METER_CONTRACT_MISSING", "Meter verification requires the pinned MorphTile workspace/view contract.")], receipt: null };
  }

  const request = {
    envelope_version: "0.1",
    request_id: "verification-interface-meter",
    goal: "verify a bounded symbolic meter follows canonical state without copying it",
    intent: {
      tile_path: "mt_tower",
      title: "Tower meter",
      elements: [{ kind: "meter", binding: "beacon", min: 0, max: 1, label: "Brightness" }],
      bindings: { readouts: ["beacon"] }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const beforeRequest = JSON.stringify(request);
  const first = interfaceMachine.run(request);
  const second = interfaceMachine.run(request);
  const deterministic = JSON.stringify(first) === JSON.stringify(second);
  const sourcePreserved = JSON.stringify(request) === beforeRequest;
  const dependency = first && Array.isArray(first.dependencies)
    ? first.dependencies.find((entry) => entry && entry.kind === "morphtile.interface-target-proof/v0.1")
    : null;
  const body = first && first.candidate && first.candidate.operation && first.candidate.operation.view && first.candidate.operation.view.body;
  const expectedBody = [{ meter: ["var", "beacon"], min: 0, max: 1, label: "Brightness" }];
  const proofExact = !!dependency
    && JSON.stringify(dependency.requires.readout_logic_vars) === JSON.stringify(["beacon"])
    && JSON.stringify(dependency.requires.control_param_ids) === JSON.stringify([])
    && JSON.stringify(dependency.requires.action_input_signal_socket_ids) === JSON.stringify([]);
  if (!first || first.status !== "CANDIDATE" || JSON.stringify(body) !== JSON.stringify(expectedBody) || !proofExact || !deterministic || !sourcePreserved) {
    errors.push(fail("INTERFACE_METER_SYMBOLIC_CANDIDATE_INVALID", "Meter candidate did not remain an exact symbolic state-view with the expected target-proof obligation.", {
      observed_status: first && first.status || null,
      observed_body: body || null,
      observed_dependency: dependency || null,
      deterministic,
      source_preserved: sourcePreserved
    }));
  }
  checked.push("symbolic-meter-candidate-and-proof-identity");

  const world = MorphTile.seedWorld();
  const worldBefore = MorphTile.hashOf(world);
  const liveProof = dependency ? resolveInterfaceTargetProof(MorphTile, world, dependency) : { status: "FAIL", errors: [] };
  const proofReadOnly = MorphTile.hashOf(world) === worldBefore;
  const missingWorld = MorphTile.clone(world);
  delete missingWorld.tiles.mt_tower.facets.logic.data.vars.beacon;
  const missingBefore = MorphTile.hashOf(missingWorld);
  const missingProof = dependency ? resolveInterfaceTargetProof(MorphTile, missingWorld, dependency) : { status: "FAIL", errors: [] };
  const missingHeld = missingProof.status === "HOLD" && missingProof.errors.some((entry) => entry.code === "INTERFACE_TARGET_READOUT_MISSING");
  const missingReadOnly = MorphTile.hashOf(missingWorld) === missingBefore;
  if (liveProof.status !== "PASS" || !proofReadOnly || !missingHeld || !missingReadOnly) {
    errors.push(fail("INTERFACE_METER_TARGET_PROOF_INVALID", "Meter target proof did not independently pass on canonical state and HOLD when the bound variable was absent.", {
      live_status: liveProof.status,
      missing_status: missingProof.status,
      missing_codes: missingProof.errors.map((entry) => entry.code),
      proof_read_only: proofReadOnly,
      missing_read_only: missingReadOnly
    }));
  }
  checked.push("target-local-readout-proof-pass-and-negative-hold");

  let runtime = null;
  let runtimeThrew = null;
  try {
    const ws = MorphTile.createWorkspace(MorphTile.seedWorld());
    const structuralBefore = MorphTile.structHash(ws.live);
    const candidate = MorphTile.cloneBody(ws, "ai", "ai:verification-interface-meter");
    const edited = MorphTile.editCandidate(ws, candidate, first.candidate.operation);
    if (!edited.ok) throw new Error(edited.error || "meter edit rejected");
    const plan = MorphTile.planMerge(ws, [candidate]);
    if (plan.status !== "READY") throw new Error(`meter plan ${plan.status}`);
    const committed = MorphTile.commitPlan(ws, plan.id);
    if (!committed.ok) throw new Error("meter commit failed");
    const committedHash = MorphTile.structHash(ws.live);
    const offHtml = MorphTile.vnodeToHTML(MorphTile.compilePanel(ws.live).root);
    const compileReadOnlyOff = MorphTile.structHash(ws.live) === committedHash;
    const beforeValue = MorphTile.readVars(ws.live, "mt_tower", 0).beacon;
    MorphTile.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
    const onValue = MorphTile.readVars(ws.live, "mt_tower", 0).beacon;
    const onHtml = MorphTile.vnodeToHTML(MorphTile.compilePanel(ws.live).root);
    const compileReadOnlyOn = MorphTile.readVars(ws.live, "mt_tower", 0).beacon === onValue;
    MorphTile.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
    const restoredValue = MorphTile.readVars(ws.live, "mt_tower", 0).beacon;
    const rollback = MorphTile.rollback(ws, committed.receipt.rollback_token);
    runtime = {
      before_value: beforeValue,
      on_value: onValue,
      restored_value: restoredValue,
      off_zero: /width:0\.0%/.test(offHtml),
      on_full: /width:100\.0%/.test(onHtml),
      compile_read_only_off: compileReadOnlyOff,
      compile_read_only_on: compileReadOnlyOn,
      rollback_exact: !!(rollback && rollback.ok && rollback.exact),
      structural_restored: MorphTile.structHash(ws.live) === structuralBefore
    };
  } catch (error) {
    runtimeThrew = error && error.message || String(error);
  }
  const runtimePass = !runtimeThrew && runtime
    && runtime.before_value === 0 && runtime.on_value === 1 && runtime.restored_value === 0
    && runtime.off_zero && runtime.on_full
    && runtime.compile_read_only_off && runtime.compile_read_only_on
    && runtime.rollback_exact && runtime.structural_restored;
  if (!runtimePass) {
    errors.push(fail("INTERFACE_METER_CANONICAL_RUNTIME_INVALID", "Meter did not follow canonical state through the real runtime with read-only rendering and exact rollback.", { observed_error: runtimeThrew, runtime }));
  }
  checked.push("canonical-state-runtime-and-exact-rollback");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-meter-conformance/v0.1",
      interface_commit: options.interfaceCommit || null,
      morphtile_commit: options.morphTileCommit || null,
      deterministic_replay: deterministic,
      source_preserved: sourcePreserved,
      dependency_id: dependency && dependency.id || null,
      live_proof: liveProof.status,
      missing_readout_proof: { status: missingProof.status, codes: missingProof.errors.map((entry) => entry.code) },
      runtime,
      state_authority: "CANONICAL_MORPHTILE_ONLY",
      visual_quality: "NOT_TESTED"
    }
  };
}

function verifyAssemblyCurrentHead(assembly, kitModule, MorphTile, options = {}) {
  return verifyAssemblyProxyBoundary(assembly, kitModule, MorphTile, options);
}

module.exports = {
  verifySurfaceNestedAuthoring,
  verifyFormRepeatRotation,
  verifyInterfaceMeter,
  verifyAssemblyCurrentHead
};
