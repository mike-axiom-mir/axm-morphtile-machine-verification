"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function verifySleepingCounterLifecycle(machine, runtime, options = {}) {
  const initial = options.initial === undefined ? 7 : options.initial;
  const errors = [];
  const checked = [];
  const machineFns = ["run"];
  const runtimeFns = [
    "createTile", "createWorld", "validateWorld", "createWorkspace", "sleepingReport",
    "getVar", "act", "isAwake", "hashOf", "reconstruct", "exportWorkspace", "importWorkspace"
  ];

  const missingMachine = machineFns.filter(name => !machine || typeof machine[name] !== "function");
  const missingRuntime = runtimeFns.filter(name => !runtime || typeof runtime[name] !== "function");
  if (missingMachine.length || missingRuntime.length) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("RUNTIME_CONTRACT_MISSING", "Capability verification requires the machine entry point and public MorphTile runtime functions.", {
        missing_machine_functions: missingMachine,
        missing_runtime_functions: missingRuntime
      })],
      receipt: null
    };
  }

  const request = {
    envelope_version: "0.1",
    request_id: "verification-capability-initial-lifecycle",
    goal: "Verify sleeping counter authored initial state through wake, sparse mutation, forget, replay and workspace import",
    intent: { kind: "sleeping-counter", wake: { on: "manual" }, initial },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const built = machine.run(clone(request));
  checked.push("machine-candidate");
  if (!built || built.status !== "CANDIDATE") {
    errors.push(failure("MACHINE_DID_NOT_PRODUCE_CANDIDATE", "The pinned Capability Machine did not produce the requested candidate.", { actual: built && built.status ? built.status : null }));
    return { status: "FAIL", checked, errors, receipt: { schema: "axm.morphtile.capability-runtime-conformance-receipt/v0.1", initial, machine_status: built && built.status || null } };
  }

  const capability = built.candidate && Array.isArray(built.candidate.capabilities) ? built.candidate.capabilities[0] : null;
  if (!capability || capability.id !== "counter") {
    errors.push(failure("CAPABILITY_SHAPE", "Expected one sleeping counter capability named counter."));
    return { status: "FAIL", checked, errors, receipt: null };
  }

  const authoredInitial = capability.grants && capability.grants.facets && capability.grants.facets.logic &&
    capability.grants.facets.logic.data && capability.grants.facets.logic.data.vars &&
    capability.grants.facets.logic.data.vars.count;
  if (authoredInitial !== initial) {
    errors.push(failure("AUTHORED_INITIAL_MISMATCH", "Candidate did not preserve the requested authored initial value.", { expected: initial, observed: authoredInitial }));
  }
  checked.push("authored-initial");

  const tile = runtime.createTile({ id: "counter", name: "Verification sleeping counter", capabilities: clone(built.candidate.capabilities) });
  const originalMatterHash = runtime.hashOf(tile);
  const world = runtime.createWorld("Verification capability lifecycle");
  world.tiles.counter = tile;
  const validation = runtime.validateWorld(world);
  if (!validation || !validation.ok) {
    errors.push(failure("WORLD_INVALID", "Machine candidate did not form a valid MorphTile world.", { errors: clone(validation && validation.errors || []) }));
  }
  checked.push("world-validation");

  const ws = runtime.createWorkspace(world);
  const beforeReport = runtime.sleepingReport(ws.live);
  if (!beforeReport || beforeReport.awake !== 0 || beforeReport.asleep !== 1) {
    errors.push(failure("NOT_DORMANT_AT_START", "Sleeping counter must begin dormant.", { observed: clone(beforeReport) }));
  }
  if (runtime.getVar(ws.live, "counter", "count", ws.live.time) !== undefined) {
    errors.push(failure("SLEEPING_DEFAULT_LEAKED", "Authored default became active while the capability was still asleep."));
  }
  if (hasOwn(ws.live.vars && ws.live.vars.counter, "count")) {
    errors.push(failure("SLEEPING_SPARSE_STATE_CREATED", "Sleeping authored default must not create sparse runtime state."));
  }
  checked.push("dormant-no-state");

  const woke = runtime.act(ws, { do: "wake", tile: "counter", capability: "counter" }, "verification-machine");
  if (!woke || woke.ok !== true || !runtime.isAwake(ws.live, "counter", "counter")) {
    errors.push(failure("WAKE_FAILED", "Manual wake did not activate the capability."));
  }
  if (runtime.getVar(ws.live, "counter", "count", ws.live.time) !== initial) {
    errors.push(failure("WAKE_DEFAULT_NOT_VISIBLE", "Wake did not expose the authored default before sparse mutation.", { expected: initial, observed: runtime.getVar(ws.live, "counter", "count", ws.live.time) }));
  }
  if (hasOwn(ws.live.vars && ws.live.vars.counter, "count")) {
    errors.push(failure("WAKE_MATERIALIZED_SPARSE_DEFAULT", "Reading the authored default after wake created sparse state."));
  }
  if (runtime.hashOf(ws.live.tiles.counter) !== originalMatterHash) {
    errors.push(failure("WAKE_REWROTE_MATTER", "Wake changed canonical tile matter."));
  }
  checked.push("wake-authored-default");

  const incremented = runtime.act(ws, { do: "signal", tile: "counter", name: "increment" }, "verification-machine");
  if (!incremented || incremented.ok !== true || runtime.getVar(ws.live, "counter", "count", ws.live.time) !== initial + 1) {
    errors.push(failure("SPARSE_INCREMENT_FAILED", "First increment did not diverge from the authored default by exactly one.", { expected: initial + 1, observed: runtime.getVar(ws.live, "counter", "count", ws.live.time) }));
  }
  if (!hasOwn(ws.live.vars && ws.live.vars.counter, "count") || ws.live.vars.counter.count !== initial + 1) {
    errors.push(failure("SPARSE_STATE_NOT_EXPLICIT", "Divergence from authored default was not represented as sparse runtime state."));
  }
  checked.push("sparse-divergence");

  const forgot = runtime.act(ws, { do: "sleep", tile: "counter", capability: "counter", forget: true }, "verification-machine");
  if (!forgot || forgot.ok !== true || runtime.isAwake(ws.live, "counter", "counter")) {
    errors.push(failure("FORGET_SLEEP_FAILED", "Explicit forget sleep did not make the capability dormant."));
  }
  const wokeAfterForget = runtime.act(ws, { do: "wake", tile: "counter", capability: "counter" }, "verification-machine");
  if (!wokeAfterForget || wokeAfterForget.ok !== true) errors.push(failure("REWAKE_AFTER_FORGET_FAILED", "Capability did not wake after explicit forget."));
  const afterForget = runtime.getVar(ws.live, "counter", "count", ws.live.time);
  if (afterForget !== initial) {
    errors.push(failure("FORGET_DID_NOT_RESTORE_AUTHORED_DEFAULT", "After forgetting sparse state, the capability must fall back to its authored initial value.", { expected: initial, observed: afterForget }));
  }
  if (hasOwn(ws.live.vars && ws.live.vars.counter, "count")) {
    errors.push(failure("FORGET_LEFT_SPARSE_STATE", "Explicit forget left count in sparse runtime state."));
  }
  if (runtime.hashOf(ws.live.tiles.counter) !== originalMatterHash) {
    errors.push(failure("FORGET_REWROTE_MATTER", "Sleep/forget/re-wake changed canonical tile matter."));
  }
  checked.push("forget-restores-authored-default");

  runtime.act(ws, { do: "signal", tile: "counter", name: "increment" }, "verification-machine");
  const replay = runtime.reconstruct(ws.ledger);
  if (!replay || replay.hash !== runtime.hashOf(ws.live) || JSON.stringify(replay.world) !== JSON.stringify(ws.live)) {
    errors.push(failure("LEDGER_REPLAY_DIVERGED", "Ledger reconstruction did not reproduce the exact live world."));
  }
  checked.push("ledger-replay");

  const exported = runtime.exportWorkspace(ws);
  const imported = runtime.importWorkspace(JSON.parse(JSON.stringify(exported)));
  if (!imported || !imported.import_check || imported.import_check.status !== "VERIFIED") {
    errors.push(failure("WORKSPACE_IMPORT_NOT_VERIFIED", "Exported workspace did not import with VERIFIED evidence.", { actual: imported && imported.import_check && imported.import_check.status || null }));
  }
  if (!imported || runtime.hashOf(imported.live) !== runtime.hashOf(ws.live)) {
    errors.push(failure("WORKSPACE_IMPORT_LIVE_HASH_MISMATCH", "Workspace round trip did not preserve the exact live world hash."));
  }
  checked.push("workspace-roundtrip");

  const invalid = machine.run({ ...clone(request), request_id: "verification-capability-invalid-initial", intent: { kind: "sleeping-counter", wake: { on: "manual" }, initial: 1.5 } });
  const invalidCode = invalid && Array.isArray(invalid.holds) && invalid.holds[0] && invalid.holds[0].code;
  if (!invalid || invalid.status !== "HOLD" || invalidCode !== "HOLD_COUNTER_INITIAL_INVALID") {
    errors.push(failure("INVALID_INITIAL_NOT_HELD", "Non-safe-integer initial state must HOLD without coercion.", { status: invalid && invalid.status || null, code: invalidCode || null }));
  }
  checked.push("invalid-initial-fail-closed");

  const receipt = {
    schema: "axm.morphtile.capability-runtime-conformance-receipt/v0.1",
    initial,
    candidate_sha256: runtime.hashOf(built.candidate),
    authored_initial: authoredInitial,
    matter_sha256_before: originalMatterHash,
    matter_sha256_after: runtime.hashOf(ws.live.tiles.counter),
    live_sha256: runtime.hashOf(ws.live),
    replay_sha256: replay && replay.hash || null,
    imported_live_sha256: imported && imported.live ? runtime.hashOf(imported.live) : null,
    invalid_initial_status: invalid && invalid.status || null,
    invalid_initial_code: invalidCode || null
  };

  return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
}

module.exports = { verifySleepingCounterLifecycle };
