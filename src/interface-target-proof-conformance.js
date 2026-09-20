"use strict";

function fail(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function uniqueSortedStrings(value) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === "string" && entry.length > 0)
    && JSON.stringify(value) === JSON.stringify([...new Set(value)].sort());
}

function resolveInterfaceTargetProof(MorphTile, world, dependency) {
  const errors = [];
  const checked = [];
  if (!MorphTile || typeof MorphTile.resolveTile !== "function") {
    return { status: "FAIL", checked, errors: [fail("MORPHTILE_RESOLVE_CONTRACT_MISSING", "Target-proof verification requires MorphTile.resolveTile().")] };
  }
  if (!world || typeof world !== "object") {
    return { status: "FAIL", checked, errors: [fail("TARGET_WORLD_MISSING", "Target-proof verification requires canonical/live world matter.")] };
  }
  if (!dependency || dependency.kind !== "morphtile.interface-target-proof/v0.1" || typeof dependency.tile_path !== "string") {
    return { status: "FAIL", checked, errors: [fail("INTERFACE_TARGET_PROOF_SCHEMA_INVALID", "Expected a morphtile.interface-target-proof/v0.1 dependency with tile_path.")] };
  }
  const expectedId = `morphtile.interface-target-proof:${dependency.tile_path}`;
  if (dependency.id !== expectedId) {
    errors.push(fail("INTERFACE_TARGET_PROOF_ID_MISMATCH", "Proof identity must be derived from the exact canonical target path.", { expected_id: expectedId, observed_id: dependency.id || null }));
  }
  checked.push("proof-id-binds-target-path");

  const req = dependency.requires;
  if (!req || req.tile_exists !== true
    || !uniqueSortedStrings(req.form_hints_include)
    || !uniqueSortedStrings(req.readout_logic_vars)
    || !uniqueSortedStrings(req.control_param_ids)
    || !uniqueSortedStrings(req.action_input_signal_socket_ids)) {
    errors.push(fail("INTERFACE_TARGET_PROOF_REQUIREMENTS_INVALID", "Target proof requirements must be explicit canonical sets and require tile existence."));
    return { status: "FAIL", checked, errors };
  }
  checked.push("canonical-requirement-shape");

  const tile = MorphTile.resolveTile(world, dependency.tile_path);
  if (!tile) {
    errors.push(fail("INTERFACE_TARGET_TILE_MISSING", "Canonical/live target tile does not exist.", { tile_path: dependency.tile_path }));
    return { status: "HOLD", checked, errors };
  }
  checked.push("target-tile-exists");

  const hints = new Set(Array.isArray(tile.form_hints) ? tile.form_hints : []);
  for (const hint of req.form_hints_include) {
    if (!hints.has(hint)) errors.push(fail("INTERFACE_TARGET_FORM_HINT_MISSING", "Canonical/live target does not declare a required form hint.", { tile_path: dependency.tile_path, form_hint: hint }));
  }
  checked.push("required-form-hints");

  const vars = tile.facets && tile.facets.logic && tile.facets.logic.data && tile.facets.logic.data.vars;
  const varNames = new Set(vars && typeof vars === "object" && !Array.isArray(vars) ? Object.keys(vars) : []);
  for (const name of req.readout_logic_vars) {
    if (!varNames.has(name)) errors.push(fail("INTERFACE_TARGET_READOUT_MISSING", "Canonical/live target does not expose a required logic variable for readout.", { tile_path: dependency.tile_path, readout: name }));
  }
  checked.push("readout-logic-vars");

  const params = new Set((Array.isArray(tile.params) ? tile.params : []).map((entry) => entry && entry.id).filter(Boolean));
  for (const id of req.control_param_ids) {
    if (!params.has(id)) errors.push(fail("INTERFACE_TARGET_CONTROL_MISSING", "Canonical/live target does not expose a required parameter id for control.", { tile_path: dependency.tile_path, control: id }));
  }
  checked.push("control-param-ids");

  const sockets = tile.facets && tile.facets.connect && Array.isArray(tile.facets.connect.sockets)
    ? tile.facets.connect.sockets
    : [];
  const inputSignals = new Set(sockets
    .filter((socket) => socket && socket.kind === "signal" && socket.dir === "in" && typeof socket.id === "string")
    .map((socket) => socket.id));
  for (const id of req.action_input_signal_socket_ids) {
    if (!inputSignals.has(id)) errors.push(fail("INTERFACE_TARGET_ACTION_INPUT_SIGNAL_MISSING", "Canonical/live target does not expose the required action binding as a kind=signal dir=in socket id.", { tile_path: dependency.tile_path, action: id }));
  }
  checked.push("action-input-signal-socket-ids");

  return {
    status: errors.length ? "HOLD" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-target-proof-resolution/v0.1",
      dependency_id: dependency.id,
      tile_path: dependency.tile_path,
      requirement_counts: {
        form_hints: req.form_hints_include.length,
        readouts: req.readout_logic_vars.length,
        controls: req.control_param_ids.length,
        actions: req.action_input_signal_socket_ids.length
      },
      truth_boundary: "This resolves declared target-local structural facts against the supplied canonical/live world. It does not grant action authority or prove host/aesthetic quality."
    }
  };
}

function verifyInterfaceTargetProofBoundary(interfaceMachine, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  if (!interfaceMachine || typeof interfaceMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [fail("INTERFACE_MACHINE_CONTRACT_MISSING", "Verification requires Interface Machine run().")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.seedWorld !== "function" || typeof MorphTile.clone !== "function") {
    return { status: "FAIL", checked, errors: [fail("MORPHTILE_TARGET_PROOF_CONTRACT_MISSING", "Verification requires MorphTile seedWorld(), clone(), and resolveTile().")], receipt: null };
  }

  const request = {
    envelope_version: "0.1",
    request_id: "verification-interface-target-proof-live-resolution",
    goal: "Verify emitted Interface proof obligations against canonical MorphTile matter",
    intent: {
      tile_path: "mt_tower",
      title: "Tower proof",
      elements: [
        { kind: "readout", binding: "beacon", label: "Beacon" },
        { kind: "control", binding: "levels", label: "Levels" },
        { kind: "action", binding: "toggle", label: "Toggle" }
      ],
      bindings: { readouts: ["beacon"], controls: ["levels"], actions: ["toggle"] }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const beforeRequest = JSON.stringify(request);
  let output;
  try {
    output = interfaceMachine.run(request);
  } catch (error) {
    return { status: "FAIL", checked, errors: [fail("INTERFACE_TARGET_PROOF_PRODUCER_THREW", "Interface Machine threw while producing the target-proof candidate.", { observed_error: error && error.message || String(error) })], receipt: null };
  }
  if (JSON.stringify(request) !== beforeRequest) errors.push(fail("INTERFACE_TARGET_PROOF_REQUEST_MUTATED", "Interface Machine mutated the verifier request."));
  if (!output || output.status !== "CANDIDATE") errors.push(fail("INTERFACE_TARGET_PROOF_CANDIDATE_MISSING", "Interface Machine did not emit the expected candidate.", { observed_status: output && output.status || null }));
  checked.push("producer-request-immutability", "candidate-emission");

  const dependencies = output && Array.isArray(output.dependencies) ? output.dependencies : [];
  const dependency = dependencies.find((entry) => entry && entry.kind === "morphtile.interface-target-proof/v0.1");
  if (!dependency) {
    errors.push(fail("INTERFACE_TARGET_PROOF_DEPENDENCY_MISSING", "Interface candidate omitted its target-local proof dependency."));
    return { status: "FAIL", checked, errors, receipt: null };
  }
  checked.push("proof-dependency-present");

  const expectedRequires = {
    tile_exists: true,
    form_hints_include: ["ui_panel"],
    readout_logic_vars: ["beacon"],
    control_param_ids: ["levels"],
    action_input_signal_socket_ids: ["toggle"]
  };
  if (JSON.stringify(dependency.requires) !== JSON.stringify(expectedRequires)) {
    errors.push(fail("INTERFACE_TARGET_PROOF_REQUIREMENT_DRIFT", "Producer proof obligations do not exactly describe the authored bindings.", { expected: expectedRequires, observed: dependency.requires || null }));
  }
  checked.push("proof-obligations-match-authored-bindings");

  const world = MorphTile.seedWorld();
  const worldBefore = MorphTile.hashOf(world);
  const live = resolveInterfaceTargetProof(MorphTile, world, dependency);
  if (live.status !== "PASS") errors.push(fail("INTERFACE_TARGET_PROOF_LIVE_RESOLUTION_FAILED", "Known canonical target failed its emitted proof obligations.", { observed: live }));
  if (MorphTile.hashOf(world) !== worldBefore) errors.push(fail("INTERFACE_TARGET_PROOF_RESOLUTION_MUTATED_WORLD", "Resolving proof obligations mutated canonical world matter."));
  checked.push("canonical-live-target-pass", "resolution-is-read-only");

  function attack(label, mutate, expectedCode) {
    const attacked = MorphTile.clone(world);
    mutate(attacked);
    const attackedBefore = MorphTile.hashOf(attacked);
    const result = resolveInterfaceTargetProof(MorphTile, attacked, dependency);
    if (result.status !== "HOLD" || !result.errors.some((entry) => entry.code === expectedCode)) {
      errors.push(fail("INTERFACE_TARGET_PROOF_ATTACK_NOT_HELD", "A missing canonical target fact did not fail closed under the expected identity.", { attack: label, expected_code: expectedCode, observed: result }));
    }
    if (MorphTile.hashOf(attacked) !== attackedBefore) {
      errors.push(fail("INTERFACE_TARGET_PROOF_ATTACK_MUTATED_WORLD", "Adversarial proof resolution mutated the attacked world.", { attack: label }));
    }
    return { attack: label, expected_code: expectedCode, status: result.status, observed_codes: result.errors.map((entry) => entry.code) };
  }

  const attacks = [
    attack("remove-ui-panel", (attacked) => {
      attacked.tiles.mt_tower.form_hints = attacked.tiles.mt_tower.form_hints.filter((hint) => hint !== "ui_panel");
    }, "INTERFACE_TARGET_FORM_HINT_MISSING"),
    attack("remove-readout-var", (attacked) => {
      delete attacked.tiles.mt_tower.facets.logic.data.vars.beacon;
    }, "INTERFACE_TARGET_READOUT_MISSING"),
    attack("remove-control-param", (attacked) => {
      attacked.tiles.mt_tower.params = attacked.tiles.mt_tower.params.filter((param) => param.id !== "levels");
    }, "INTERFACE_TARGET_CONTROL_MISSING"),
    attack("flip-action-socket-direction", (attacked) => {
      const socket = attacked.tiles.mt_tower.facets.connect.sockets.find((entry) => entry.id === "toggle");
      socket.dir = "out";
    }, "INTERFACE_TARGET_ACTION_INPUT_SIGNAL_MISSING")
  ];
  checked.push("missing-target-fact-attacks-fail-closed");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-target-proof-conformance/v0.1",
      interface_commit: options.interfaceCommit || null,
      morphtile_commit: options.morphTileCommit || null,
      dependency_id: dependency.id,
      live_resolution: live.status,
      attacks,
      action_authority: "NOT_PROVEN",
      visual_quality: "NOT_TESTED"
    }
  };
}

module.exports = {
  resolveInterfaceTargetProof,
  verifyInterfaceTargetProofBoundary
};
