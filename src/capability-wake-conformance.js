"use strict";

const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function firstHoldCode(result) {
  return result && Array.isArray(result.holds) && result.holds[0] ? result.holds[0].code || null : null;
}

function runMachine(machine, request) {
  const before = JSON.stringify(request);
  let output;
  let threw = null;
  try {
    output = machine.run(request);
  } catch (error) {
    threw = { name: error && error.name || "Error", message: error && error.message || String(error) };
    output = null;
  }
  return { output, threw, mutated: JSON.stringify(request) !== before };
}

function requestFor(id, wake, initial) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Independently verify Capability wake compilation and runtime semantics",
    intent: { kind: "sleeping-counter", wake, initial },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function candidateCapability(output) {
  return output && output.candidate && Array.isArray(output.candidate.capabilities)
    ? output.candidate.capabilities[0] || null
    : null;
}

function makeWorld(runtime, id, name, capability, facets) {
  const tile = runtime.createTile({ id, name, capabilities: [clone(capability)], facets: clone(facets || {}) });
  const world = runtime.createWorld(name + " world");
  world.tiles[id] = tile;
  return { tile, world };
}

function replayMatches(runtime, ws) {
  const replay = runtime.reconstruct(ws.ledger);
  return {
    replay,
    matches: !!replay && replay.hash === runtime.hashOf(ws.live) && JSON.stringify(replay.world) === JSON.stringify(ws.live)
  };
}

function verifyCapabilityWakeModes(machine, runtime, options = {}) {
  const errors = [];
  const checked = [];
  const expectedMachineVersion = options.expectedMachineVersion || "0.1.0";
  const machineFns = ["run"];
  const runtimeFns = [
    "createTile", "createWorld", "validateWorld", "createWorkspace", "act", "isAwake",
    "getVar", "hashOf", "reconstruct"
  ];

  const missingMachine = machineFns.filter((name) => !machine || typeof machine[name] !== "function");
  const missingRuntime = runtimeFns.filter((name) => !runtime || typeof runtime[name] !== "function");
  if (missingMachine.length || missingRuntime.length) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("WAKE_RUNTIME_CONTRACT_MISSING", "Wake verification requires the Capability Machine entry point and public MorphTile runtime functions.", {
        missing_machine_functions: missingMachine,
        missing_runtime_functions: missingRuntime
      })],
      receipt: null
    };
  }

  if (machine.MACHINE && machine.MACHINE.version !== expectedMachineVersion) {
    errors.push(failure("CAPABILITY_MACHINE_VERSION_MISMATCH", "Pinned Capability Machine version differs from the verification target.", {
      expected: expectedMachineVersion,
      observed: machine.MACHINE.version || null
    }));
  }
  checked.push("machine-version");

  const defaultNearRequest = requestFor("verification-near-defaults", { on: "near" }, 2);
  const defaultNear = runMachine(machine, clone(defaultNearRequest));
  const defaultNearCapability = candidateCapability(defaultNear.output);
  if (defaultNear.threw || defaultNear.mutated || !defaultNear.output || defaultNear.output.status !== "CANDIDATE" ||
      !defaultNearCapability || JSON.stringify(defaultNearCapability.wake) !== JSON.stringify({ on: "near", within: 8, hysteresis: 1.25 })) {
    errors.push(failure("NEAR_DEFAULTS_NOT_EXPLICIT", "Near wake defaults must compile to explicit deterministic runtime matter without mutating the request.", {
      threw: defaultNear.threw,
      mutated: defaultNear.mutated,
      observed_status: defaultNear.output && defaultNear.output.status || null,
      observed_wake: defaultNearCapability && defaultNearCapability.wake || null
    }));
  }
  checked.push("near-defaults-explicit");

  const nearRequest = requestFor("verification-near-boundaries", { on: "near", within: 4, hysteresis: 1.5 }, 2);
  const nearBuilt = runMachine(machine, clone(nearRequest));
  const nearCapability = candidateCapability(nearBuilt.output);
  let nearReceipt = null;
  if (nearBuilt.threw || nearBuilt.mutated || !nearBuilt.output || nearBuilt.output.status !== "CANDIDATE" || !nearCapability) {
    errors.push(failure("NEAR_CANDIDATE_MISSING", "Known-good near wake request did not produce an immutable candidate.", {
      threw: nearBuilt.threw,
      mutated: nearBuilt.mutated,
      observed_status: nearBuilt.output && nearBuilt.output.status || null
    }));
  } else {
    const nearFixture = makeWorld(runtime, "near_counter", "Verification near counter", nearCapability);
    const nearValidation = runtime.validateWorld(nearFixture.world);
    if (!nearValidation || !nearValidation.ok) {
      errors.push(failure("NEAR_WORLD_INVALID", "Near wake candidate did not form a valid MorphTile world.", { observed_errors: clone(nearValidation && nearValidation.errors || []) }));
    }
    const matterHash = runtime.hashOf(nearFixture.tile);
    const ws = runtime.createWorkspace(nearFixture.world);

    const wakeAtRadius = runtime.act(ws, { do: "settle", from: [4, 0, 0] }, "verification-machine");
    const wokeAtRadius = !!wakeAtRadius && wakeAtRadius.ok === true && runtime.isAwake(ws.live, "near_counter", "counter");
    const initialVisible = runtime.getVar(ws.live, "near_counter", "count", ws.live.time);
    const sparseBeforeIncrement = hasOwn(ws.live.vars && ws.live.vars.near_counter, "count");
    if (!wokeAtRadius || initialVisible !== 2 || sparseBeforeIncrement) {
      errors.push(failure("NEAR_RADIUS_WAKE_SEMANTICS", "Near wake must activate at the authored radius and expose authored state without materializing sparse state.", {
        woke_at_radius: wokeAtRadius,
        observed_count: initialVisible,
        sparse_count_present: sparseBeforeIncrement
      }));
    }

    const incremented = runtime.act(ws, { do: "signal", tile: "near_counter", name: "increment" }, "verification-machine");
    if (!incremented || incremented.ok !== true || runtime.getVar(ws.live, "near_counter", "count", ws.live.time) !== 3) {
      errors.push(failure("NEAR_INCREMENT_FAILED", "Near-woken capability did not execute its granted counter action."));
    }

    const exactBand = runtime.act(ws, { do: "settle", from: [6, 0, 0] }, "verification-machine");
    const awakeAtExactBand = !!exactBand && exactBand.ok === true && runtime.isAwake(ws.live, "near_counter", "counter");
    if (!awakeAtExactBand) {
      errors.push(failure("NEAR_HYSTERESIS_BOUNDARY", "At exactly within*hysteresis, existing wake state should remain stable rather than sleep early."));
    }

    const outsideBand = runtime.act(ws, { do: "settle", from: [6.01, 0, 0] }, "verification-machine");
    const sleptOutsideBand = !!outsideBand && outsideBand.ok === true && !runtime.isAwake(ws.live, "near_counter", "counter");
    const preservedSparse = runtime.getVar(ws.live, "near_counter", "count", ws.live.time);
    if (!sleptOutsideBand || preservedSparse !== 3) {
      errors.push(failure("NEAR_AUTO_SLEEP_STATE_LOSS", "Outside the hysteresis band the capability must sleep without losing sparse state.", {
        slept: sleptOutsideBand,
        observed_count: preservedSparse
      }));
    }

    const reenter = runtime.act(ws, { do: "settle", from: [4, 0, 0] }, "verification-machine");
    const rewoke = !!reenter && reenter.ok === true && runtime.isAwake(ws.live, "near_counter", "counter");
    if (!rewoke || runtime.getVar(ws.live, "near_counter", "count", ws.live.time) !== 3) {
      errors.push(failure("NEAR_REWAKE_STATE_MISMATCH", "Re-entering the wake radius must restore the preserved sparse state."));
    }
    if (runtime.hashOf(ws.live.tiles.near_counter) !== matterHash) {
      errors.push(failure("NEAR_REWROTE_CANONICAL_MATTER", "Near wake/sleep transitions changed canonical tile matter."));
    }
    const nearReplay = replayMatches(runtime, ws);
    if (!nearReplay.matches) errors.push(failure("NEAR_REPLAY_DIVERGED", "Near wake lifecycle did not replay to the exact live world."));

    nearReceipt = {
      candidate_sha256: runtime.hashOf(nearBuilt.output.candidate),
      matter_sha256_before: matterHash,
      matter_sha256_after: runtime.hashOf(ws.live.tiles.near_counter),
      live_sha256: runtime.hashOf(ws.live),
      replay_sha256: nearReplay.replay && nearReplay.replay.hash || null,
      awake_at_radius: wokeAtRadius,
      awake_at_exact_hysteresis_boundary: awakeAtExactBand,
      asleep_outside_hysteresis_boundary: sleptOutsideBand,
      preserved_count_after_sleep: preservedSparse
    };
  }
  checked.push("near-runtime-boundaries-replay");

  const valueRequest = requestFor("verification-value-under", { on: "value", var: "trigger", under: 3 }, 5);
  const valueBuilt = runMachine(machine, clone(valueRequest));
  const valueCapability = candidateCapability(valueBuilt.output);
  let valueReceipt = null;
  if (valueBuilt.threw || valueBuilt.mutated || !valueBuilt.output || valueBuilt.output.status !== "CANDIDATE" || !valueCapability) {
    errors.push(failure("VALUE_UNDER_CANDIDATE_MISSING", "Known-good value-under request did not produce an immutable candidate.", {
      threw: valueBuilt.threw,
      mutated: valueBuilt.mutated,
      observed_status: valueBuilt.output && valueBuilt.output.status || null
    }));
  } else {
    const baseLogic = {
      logic: {
        type: "rule",
        data: {
          vars: { trigger: 10 },
          rules: [{ on: "cool", do: [{ set: ["trigger", 2] }] }]
        }
      }
    };
    const valueFixture = makeWorld(runtime, "value_counter", "Verification value counter", valueCapability, baseLogic);
    const valueValidation = runtime.validateWorld(valueFixture.world);
    if (!valueValidation || !valueValidation.ok) {
      errors.push(failure("VALUE_WORLD_INVALID", "Value wake candidate did not form a valid MorphTile world.", { observed_errors: clone(valueValidation && valueValidation.errors || []) }));
    }
    const matterHash = runtime.hashOf(valueFixture.tile);
    const ws = runtime.createWorkspace(valueFixture.world);
    const before = runtime.act(ws, { do: "settle" }, "verification-machine");
    const asleepBefore = !!before && before.ok === true && !runtime.isAwake(ws.live, "value_counter", "counter");
    const cool = runtime.act(ws, { do: "signal", tile: "value_counter", name: "cool" }, "verification-machine");
    const stillAsleepAfterMutation = !!cool && cool.ok === true && !runtime.isAwake(ws.live, "value_counter", "counter");
    const triggerAfterCool = runtime.getVar(ws.live, "value_counter", "trigger", ws.live.time);
    const after = runtime.act(ws, { do: "settle" }, "verification-machine");
    const awakeAfterSettle = !!after && after.ok === true && runtime.isAwake(ws.live, "value_counter", "counter");
    const initialVisible = runtime.getVar(ws.live, "value_counter", "count", ws.live.time);
    if (!asleepBefore || !stillAsleepAfterMutation || triggerAfterCool !== 2 || !awakeAfterSettle || initialVisible !== 5) {
      errors.push(failure("VALUE_UNDER_RUNTIME_SEMANTICS", "Value-under wake must observe authored logic state, avoid hidden wake authority, and wake on explicit settle after crossing the threshold.", {
        asleep_before: asleepBefore,
        still_asleep_after_mutation: stillAsleepAfterMutation,
        trigger_after_cool: triggerAfterCool,
        awake_after_settle: awakeAfterSettle,
        observed_count: initialVisible
      }));
    }
    if (runtime.hashOf(ws.live.tiles.value_counter) !== matterHash) {
      errors.push(failure("VALUE_REWROTE_CANONICAL_MATTER", "Value wake changed canonical tile matter."));
    }
    const valueReplay = replayMatches(runtime, ws);
    if (!valueReplay.matches) errors.push(failure("VALUE_REPLAY_DIVERGED", "Value-under wake lifecycle did not replay to the exact live world."));
    valueReceipt = {
      candidate_sha256: runtime.hashOf(valueBuilt.output.candidate),
      matter_sha256_before: matterHash,
      matter_sha256_after: runtime.hashOf(ws.live.tiles.value_counter),
      trigger_after_cool: triggerAfterCool,
      awake_after_settle: awakeAfterSettle,
      live_sha256: runtime.hashOf(ws.live),
      replay_sha256: valueReplay.replay && valueReplay.replay.hash || null
    };
  }
  checked.push("value-under-explicit-settle-replay");

  const timeRequest = requestFor("verification-time-zero", { on: "time", after: 0 }, 4);
  const timeBuilt = runMachine(machine, clone(timeRequest));
  const timeCapability = candidateCapability(timeBuilt.output);
  let timeReceipt = null;
  if (timeBuilt.threw || timeBuilt.mutated || !timeBuilt.output || timeBuilt.output.status !== "CANDIDATE" || !timeCapability) {
    errors.push(failure("TIME_ZERO_CANDIDATE_MISSING", "Known-good time-after-zero request did not produce an immutable candidate.", {
      threw: timeBuilt.threw,
      mutated: timeBuilt.mutated,
      observed_status: timeBuilt.output && timeBuilt.output.status || null
    }));
  } else {
    const timeFixture = makeWorld(runtime, "time_counter", "Verification time counter", timeCapability);
    const timeValidation = runtime.validateWorld(timeFixture.world);
    if (!timeValidation || !timeValidation.ok) {
      errors.push(failure("TIME_WORLD_INVALID", "Time wake candidate did not form a valid MorphTile world.", { observed_errors: clone(timeValidation && timeValidation.errors || []) }));
    }
    const matterHash = runtime.hashOf(timeFixture.tile);
    const ws = runtime.createWorkspace(timeFixture.world);
    const settled = runtime.act(ws, { do: "settle" }, "verification-machine");
    const awakeAtZero = !!settled && settled.ok === true && runtime.isAwake(ws.live, "time_counter", "counter");
    const initialVisible = runtime.getVar(ws.live, "time_counter", "count", ws.live.time);
    const sparsePresent = hasOwn(ws.live.vars && ws.live.vars.time_counter, "count");
    if (!awakeAtZero || initialVisible !== 4 || sparsePresent) {
      errors.push(failure("TIME_ZERO_RUNTIME_SEMANTICS", "A time wake authored at zero must wake on explicit settle at time zero and expose authored state without sparse mutation.", {
        awake_at_zero: awakeAtZero,
        observed_count: initialVisible,
        sparse_count_present: sparsePresent,
        observed_time: ws.live.time
      }));
    }
    if (runtime.hashOf(ws.live.tiles.time_counter) !== matterHash) {
      errors.push(failure("TIME_REWROTE_CANONICAL_MATTER", "Time wake changed canonical tile matter."));
    }
    const timeReplay = replayMatches(runtime, ws);
    if (!timeReplay.matches) errors.push(failure("TIME_REPLAY_DIVERGED", "Time-zero wake lifecycle did not replay to the exact live world."));
    timeReceipt = {
      candidate_sha256: runtime.hashOf(timeBuilt.output.candidate),
      matter_sha256_before: matterHash,
      matter_sha256_after: runtime.hashOf(ws.live.tiles.time_counter),
      awake_at_zero: awakeAtZero,
      live_sha256: runtime.hashOf(ws.live),
      replay_sha256: timeReplay.replay && timeReplay.replay.hash || null
    };
  }
  checked.push("time-zero-explicit-settle-replay");

  const malformed = [
    { id: "near-string-radius", wake: { on: "near", within: "4", hysteresis: 1.5 }, code: "HOLD_WAKE_RULE_INVALID" },
    { id: "near-inverted-band", wake: { on: "near", within: 4, hysteresis: 0.5 }, code: "HOLD_WAKE_RULE_INVALID" },
    { id: "value-two-thresholds", wake: { on: "value", var: "trigger", over: 3, under: 1 }, code: "HOLD_WAKE_RULE_INVALID" },
    { id: "time-negative", wake: { on: "time", after: -1 }, code: "HOLD_WAKE_RULE_INVALID" },
    { id: "unproven-near-field", wake: { on: "near", within: 4, hysteresis: 1.5, sleeps: false }, code: "HOLD_WAKE_RULE_FIELD_UNKNOWN" }
  ];
  const malformedReceipt = [];
  for (const item of malformed) {
    const request = requestFor("verification-" + item.id, clone(item.wake), 0);
    const observed = runMachine(machine, request);
    const status = observed.output && observed.output.status || null;
    const holdCode = firstHoldCode(observed.output);
    malformedReceipt.push({ id: item.id, status, hold_code: holdCode, mutated: observed.mutated, threw: observed.threw });
    if (observed.threw || observed.mutated || status !== "HOLD" || holdCode !== item.code) {
      errors.push(failure("MALFORMED_WAKE_NOT_HELD", "Malformed or outside-vocabulary wake intent must fail closed without mutating the request.", {
        case: item.id,
        expected_code: item.code,
        observed_status: status,
        observed_code: holdCode,
        mutated: observed.mutated,
        threw: observed.threw
      }));
    }
  }
  checked.push("wake-intent-fail-closed");

  const receipt = {
    schema: "axm.morphtile.capability-wake-conformance-receipt/v0.1",
    expected_machine_version: expectedMachineVersion,
    observed_machine_version: machine.MACHINE && machine.MACHINE.version || null,
    default_near_wake: defaultNearCapability && clone(defaultNearCapability.wake) || null,
    near: nearReceipt,
    value_under: valueReceipt,
    time_zero: timeReceipt,
    malformed: malformedReceipt
  };

  return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
}

module.exports = { verifyCapabilityWakeModes };
