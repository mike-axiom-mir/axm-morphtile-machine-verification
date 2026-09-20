"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(code, detail, extra = {}) {
  return { ...extra, code, detail };
}

function firstHold(result) {
  return result && Array.isArray(result.holds) && result.holds[0] ? result.holds[0] : null;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function verifyCapabilityKindAndSignal(machine, runtime, options = {}) {
  const errors = [];
  const checked = [];
  const expectedMachineVersion = options.expectedMachineVersion || "0.1.0";

  const missingMachine = ["run"].filter((name) => !machine || typeof machine[name] !== "function");
  const missingRuntime = ["createTile", "createWorld", "validateWorld", "createWorkspace", "act", "isAwake", "getVar", "hashOf", "reconstruct"]
    .filter((name) => !runtime || typeof runtime[name] !== "function");
  if (missingMachine.length || missingRuntime.length) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("CONTRACT_MISSING", "Current Capability verification requires the machine entry point and public MorphTile runtime functions.", {
        missing_machine_functions: missingMachine,
        missing_runtime_functions: missingRuntime
      })],
      receipt: null
    };
  }

  if (!machine.MACHINE || machine.MACHINE.version !== expectedMachineVersion) {
    errors.push(failure("CAPABILITY_MACHINE_VERSION_MISMATCH", "Pinned Capability Machine version differs from the expected verification target.", {
      expected: expectedMachineVersion,
      observed: machine.MACHINE && machine.MACHINE.version || null
    }));
  }
  checked.push("machine-version");

  const base = {
    envelope_version: "0.1",
    request_id: "verification-capability-kind-signal",
    goal: "Independently verify strict authored kind and custom signal wake semantics",
    provenance: { caller: "axm.morphtile.machine.verification" }
  };

  const omitted = machine.run({ ...clone(base), request_id: "verification-kind-omitted", intent: { initial: 4 } });
  if (!omitted || omitted.status !== "CANDIDATE" || omitted.candidate && omitted.candidate.capabilities !== undefined ||
      !omitted.candidate || omitted.candidate.facets?.logic?.data?.vars?.count !== 4) {
    errors.push(failure("OMITTED_KIND_DEFAULT_DRIFT", "Only an actually omitted kind may select the historical eager counter default.", {
      observed_status: omitted && omitted.status || null,
      observed_candidate: clone(omitted && omitted.candidate || null)
    }));
  }
  checked.push("omitted-kind-default");

  const malformedKinds = ["", "   ", 0, false, null, [], {}];
  const malformedObserved = [];
  for (let i = 0; i < malformedKinds.length; i += 1) {
    const authored = malformedKinds[i];
    const result = machine.run({ ...clone(base), request_id: `verification-kind-invalid-${i}`, intent: { kind: authored } });
    const hold = firstHold(result);
    malformedObserved.push({ authored: clone(authored), status: result && result.status || null, code: hold && hold.code || null });
    if (!result || result.status !== "HOLD" || !hold || hold.code !== "HOLD_CAPABILITY_KIND_INVALID" || result.candidate !== null) {
      errors.push(failure("MALFORMED_KIND_NOT_HELD", "A supplied malformed/falsey kind was not held as authored malformed meaning.", {
        case_index: i,
        authored: clone(authored),
        observed_status: result && result.status || null,
        observed_code: hold && hold.code || null,
        observed_candidate: clone(result && result.candidate || null)
      }));
    }
  }
  checked.push("malformed-kind-fail-closed");

  const unsupported = machine.run({ ...clone(base), request_id: "verification-kind-unsupported", intent: { kind: "telepathy" } });
  const unsupportedHold = firstHold(unsupported);
  if (!unsupported || unsupported.status !== "HOLD" || !unsupportedHold || unsupportedHold.code !== "HOLD_CAPABILITY_NOT_EXPRESSIBLE" ||
      unsupported.suggested_missing_capability !== "capability:telepathy") {
    errors.push(failure("UNSUPPORTED_KIND_CONTRACT_DRIFT", "A syntactically valid but unsupported capability kind must remain distinguishable from malformed authored kind.", {
      observed_status: unsupported && unsupported.status || null,
      observed_hold: clone(unsupportedHold),
      observed_suggestion: unsupported && unsupported.suggested_missing_capability || null
    }));
  }
  checked.push("unsupported-kind-distinction");

  const customRequest = {
    ...clone(base),
    request_id: "verification-custom-signal",
    intent: {
      kind: "sleeping-counter",
      initial: 2,
      wake: { on: "signal", name: "activate" }
    }
  };
  const builtA = machine.run(clone(customRequest));
  const builtB = machine.run(clone(customRequest));
  if (!builtA || builtA.status !== "CANDIDATE") {
    errors.push(failure("CUSTOM_SIGNAL_CANDIDATE_MISSING", "Valid sleeping counter with a custom named signal did not produce a candidate.", {
      observed_status: builtA && builtA.status || null
    }));
    return {
      status: "FAIL",
      checked,
      errors,
      receipt: {
        schema: "axm.morphtile.capability-kind-signal-conformance-receipt/v0.1",
        malformed_kind_cases: malformedObserved,
        custom_signal_status: builtA && builtA.status || null
      }
    };
  }
  if (JSON.stringify(builtA) !== JSON.stringify(builtB)) {
    errors.push(failure("CUSTOM_SIGNAL_NONDETERMINISTIC", "Identical validated custom-signal requests did not produce identical machine bytes."));
  }
  const capability = builtA.candidate && Array.isArray(builtA.candidate.capabilities) ? builtA.candidate.capabilities[0] : null;
  if (!capability || capability.id !== "counter" || JSON.stringify(capability.wake) !== JSON.stringify({ on: "signal", name: "activate" })) {
    errors.push(failure("CUSTOM_SIGNAL_SHAPE_DRIFT", "Candidate did not preserve the exact authored named wake signal.", {
      observed_capability: clone(capability)
    }));
  }
  checked.push("custom-signal-candidate-determinism");

  const tile = runtime.createTile({ id: "counter", name: "Verification custom signal counter", capabilities: clone(builtA.candidate.capabilities) });
  const matterHash = runtime.hashOf(tile);
  const world = runtime.createWorld("Verification current capability custom signal");
  world.tiles.counter = tile;
  const validation = runtime.validateWorld(world);
  if (!validation || !validation.ok) {
    errors.push(failure("CUSTOM_SIGNAL_WORLD_INVALID", "Current Capability candidate did not form a valid world on the pinned MorphTile substrate.", {
      observed_errors: clone(validation && validation.errors || [])
    }));
  }
  const ws = runtime.createWorkspace(world);
  if (runtime.isAwake(ws.live, "counter", "counter")) {
    errors.push(failure("CUSTOM_SIGNAL_NOT_DORMANT", "Sleeping custom-signal capability unexpectedly started awake."));
  }
  checked.push("custom-signal-world-validation");

  const wrong = runtime.act(ws, { do: "signal", tile: "counter", name: "increment" }, "verification-machine");
  if (!wrong || wrong.ok !== true || runtime.isAwake(ws.live, "counter", "counter") ||
      runtime.getVar(ws.live, "counter", "count", ws.live.time) !== undefined || hasOwn(ws.live.vars && ws.live.vars.counter, "count")) {
    errors.push(failure("WRONG_SIGNAL_CHANGED_DORMANT_STATE", "A signal other than the declared wake signal must not wake, expose default state, or create sparse mutation state.", {
      observed_action: clone(wrong),
      awake: runtime.isAwake(ws.live, "counter", "counter"),
      observed_count: runtime.getVar(ws.live, "counter", "count", ws.live.time),
      observed_vars: clone(ws.live.vars)
    }));
  }
  checked.push("wrong-signal-remains-dormant");

  const wake = runtime.act(ws, { do: "signal", tile: "counter", name: "activate" }, "verification-machine");
  const wakeCount = runtime.getVar(ws.live, "counter", "count", ws.live.time);
  if (!wake || wake.ok !== true || !runtime.isAwake(ws.live, "counter", "counter") || wakeCount !== 2 || hasOwn(ws.live.vars && ws.live.vars.counter, "count")) {
    errors.push(failure("CUSTOM_WAKE_SEMANTICS_DRIFT", "Declared wake signal must wake onto authored default without being reinterpreted as an increment or creating sparse state.", {
      observed_action: clone(wake),
      awake: runtime.isAwake(ws.live, "counter", "counter"),
      observed_count: wakeCount,
      observed_vars: clone(ws.live.vars)
    }));
  }
  if (runtime.hashOf(ws.live.tiles.counter) !== matterHash) {
    errors.push(failure("CUSTOM_WAKE_REWROTE_MATTER", "Wake trigger changed canonical tile matter."));
  }
  checked.push("custom-wake-separate-from-action");

  const increment = runtime.act(ws, { do: "signal", tile: "counter", name: "increment" }, "verification-machine");
  const incrementedCount = runtime.getVar(ws.live, "counter", "count", ws.live.time);
  if (!increment || increment.ok !== true || incrementedCount !== 3 || !hasOwn(ws.live.vars && ws.live.vars.counter, "count") || ws.live.vars.counter.count !== 3) {
    errors.push(failure("POST_WAKE_INCREMENT_DRIFT", "After wake, the normal increment signal must produce exactly one sparse-state divergence.", {
      observed_action: clone(increment),
      observed_count: incrementedCount,
      observed_vars: clone(ws.live.vars)
    }));
  }
  if (runtime.hashOf(ws.live.tiles.counter) !== matterHash) {
    errors.push(failure("POST_WAKE_INCREMENT_REWROTE_MATTER", "Runtime state mutation changed canonical tile matter."));
  }
  checked.push("post-wake-sparse-increment");

  const replay = runtime.reconstruct(ws.ledger);
  const liveHash = runtime.hashOf(ws.live);
  if (!replay || replay.hash !== liveHash || JSON.stringify(replay.world) !== JSON.stringify(ws.live)) {
    errors.push(failure("CUSTOM_SIGNAL_REPLAY_DIVERGED", "Ledger reconstruction did not reproduce the exact current live world after custom wake and increment.", {
      live_hash: liveHash,
      replay_hash: replay && replay.hash || null
    }));
  }
  checked.push("custom-signal-replay");

  const receipt = {
    schema: "axm.morphtile.capability-kind-signal-conformance-receipt/v0.1",
    expected_machine_version: expectedMachineVersion,
    observed_machine_version: machine.MACHINE && machine.MACHINE.version || null,
    malformed_kind_cases: malformedObserved,
    unsupported_kind_status: unsupported && unsupported.status || null,
    unsupported_kind_code: unsupportedHold && unsupportedHold.code || null,
    custom_signal_candidate_sha256: runtime.hashOf(builtA.candidate),
    canonical_matter_sha256_before: matterHash,
    canonical_matter_sha256_after: runtime.hashOf(ws.live.tiles.counter),
    wake_count: wakeCount,
    incremented_count: incrementedCount,
    live_sha256: liveHash,
    replay_sha256: replay && replay.hash || null
  };

  return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
}

module.exports = { verifyCapabilityKindAndSignal };
