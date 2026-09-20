"use strict";

const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function run(machine, request) {
  const before = JSON.stringify(request);
  let output = null;
  let threw = null;
  try {
    output = machine.run(request);
  } catch (error) {
    threw = { name: error && error.name || "Error", message: error && error.message || String(error) };
  }
  return { output, threw, mutated: JSON.stringify(request) !== before };
}

function request(id, wakeMarker) {
  const intent = { kind: "sleeping-counter", initial: 3 };
  if (wakeMarker !== "OMIT") intent.wake = clone(wakeMarker);
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Independently verify visible omitted-wake compatibility semantics",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function capability(output) {
  return output && output.candidate && Array.isArray(output.candidate.capabilities)
    ? output.candidate.capabilities[0] || null
    : null;
}

function warningCodes(output) {
  return output && Array.isArray(output.warnings) ? output.warnings.map((item) => item && item.code || null) : [];
}

function replayMatches(MorphTile, ws) {
  const replay = MorphTile.reconstruct(ws.ledger);
  return !!replay && replay.hash === MorphTile.hashOf(ws.live) && JSON.stringify(replay.world) === JSON.stringify(ws.live);
}

function verifyCapabilityDefaultWakeVisibility(machine, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  const revisions = options.revisions || {};

  if (!machine || typeof machine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("CAPABILITY_MACHINE_CONTRACT_MISSING", "Capability Machine run() is required.")], receipt: null };
  }
  const runtimeFns = ["createTile", "createWorld", "validateWorld", "createWorkspace", "act", "isAwake", "getVar", "hashOf", "reconstruct"];
  const missing = runtimeFns.filter((name) => !MorphTile || typeof MorphTile[name] !== "function");
  if (missing.length) {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_WAKE_RUNTIME_CONTRACT_MISSING", "Pinned MorphTile runtime lacks functions required for independent wake proof.", { missing })], receipt: null };
  }

  const omittedReq = request("verification-default-wake-omitted", "OMIT");
  const explicitSignalReq = request("verification-default-wake-explicit-signal", { on: "signal", name: "increment" });
  const explicitManualReq = request("verification-default-wake-explicit-manual", { on: "manual" });
  const omitted = run(machine, clone(omittedReq));
  const explicitSignal = run(machine, clone(explicitSignalReq));
  const explicitManual = run(machine, clone(explicitManualReq));

  for (const [name, observed] of [["omitted", omitted], ["explicit-signal", explicitSignal], ["explicit-manual", explicitManual]]) {
    if (observed.threw || observed.mutated || !observed.output || observed.output.status !== "CANDIDATE") {
      errors.push(failure("DEFAULT_WAKE_CANDIDATE_BOUNDARY", "Known-good default-wake comparison request did not produce an immutable candidate.", {
        case: name,
        threw: observed.threw,
        mutated: observed.mutated,
        observed_status: observed.output && observed.output.status || null
      }));
    }
  }

  const omittedCap = capability(omitted.output);
  const signalCap = capability(explicitSignal.output);
  const manualCap = capability(explicitManual.output);
  if (!omittedCap || JSON.stringify(omittedCap.wake) !== JSON.stringify({ on: "signal", name: "increment" })) {
    errors.push(failure("DEFAULT_WAKE_NOT_EXPLICIT", "Omitted machine wake did not compile to the historical explicit signal/increment compatibility wake.", { observed: omittedCap && omittedCap.wake || null }));
  }
  if (JSON.stringify(warningCodes(omitted.output)) !== JSON.stringify(["WAKE_DEFAULT_COMPATIBILITY"])) {
    errors.push(failure("DEFAULT_WAKE_WARNING_MISSING", "Omitted wake must disclose exactly one compatibility warning.", { observed_codes: warningCodes(omitted.output) }));
  }
  if (warningCodes(explicitSignal.output).length !== 0 || warningCodes(explicitManual.output).length !== 0) {
    errors.push(failure("EXPLICIT_WAKE_WARNING_LEAK", "Explicit authored wake must not be mislabeled as compatibility defaulting.", {
      signal_codes: warningCodes(explicitSignal.output),
      manual_codes: warningCodes(explicitManual.output)
    }));
  }
  if (!signalCap || JSON.stringify(signalCap.wake) !== JSON.stringify({ on: "signal", name: "increment" })) {
    errors.push(failure("EXPLICIT_SIGNAL_WAKE_DRIFT", "Explicit signal/increment did not preserve its authored wake."));
  }
  if (!manualCap || JSON.stringify(manualCap.wake) !== JSON.stringify({ on: "manual" })) {
    errors.push(failure("EXPLICIT_MANUAL_WAKE_DRIFT", "Explicit manual wake did not preserve raw substrate semantics."));
  }
  checked.push("warning-only-on-omission");

  if (omitted.output && explicitSignal.output && MorphTile.hashOf(omitted.output.candidate) !== MorphTile.hashOf(explicitSignal.output.candidate)) {
    errors.push(failure("DEFAULT_WAKE_CANDIDATE_IDENTITY_DRIFT", "Omitted compatibility wake and the equivalent explicit signal wake should produce identical candidate matter; disclosure belongs in warnings, not hidden candidate differences.", {
      omitted_sha256: MorphTile.hashOf(omitted.output.candidate),
      explicit_sha256: MorphTile.hashOf(explicitSignal.output.candidate)
    }));
  }
  checked.push("warning-metadata-vs-candidate-identity");

  const nullWake = run(machine, request("verification-default-wake-null", null));
  const badWake = run(machine, request("verification-default-wake-empty", {}));
  for (const [name, observed] of [["null", nullWake], ["empty-object", badWake]]) {
    const code = observed.output && observed.output.holds && observed.output.holds[0] && observed.output.holds[0].code || null;
    if (observed.threw || observed.mutated || !observed.output || observed.output.status !== "HOLD" || code !== "HOLD_WAKE_RULE_INVALID") {
      errors.push(failure("DEFAULT_WAKE_FAIL_CLOSED_BOUNDARY", "Malformed authored wake was aliased to omission/defaulting instead of failing closed.", {
        case: name,
        threw: observed.threw,
        mutated: observed.mutated,
        observed_status: observed.output && observed.output.status || null,
        observed_code: code
      }));
    }
  }
  checked.push("null-and-malformed-not-omission");

  let runtimeReceipt = null;
  if (omittedCap) {
    const machineTile = MorphTile.createTile({ id: "machine-default", name: "Verification machine default", capabilities: [clone(omittedCap)] });
    const machineMatterHash = MorphTile.hashOf(machineTile);
    const machineWorld = MorphTile.createWorld("Verification machine default wake world");
    machineWorld.tiles[machineTile.id] = machineTile;
    const machineValidation = MorphTile.validateWorld(machineWorld);
    if (!machineValidation || machineValidation.ok !== true) {
      errors.push(failure("DEFAULT_WAKE_MACHINE_WORLD_INVALID", "Machine-default capability does not form a valid pinned MorphTile world.", { validation: clone(machineValidation) }));
    } else {
      const machineWs = MorphTile.createWorkspace(machineWorld);
      const signal = MorphTile.act(machineWs, { do: "signal", tile: machineTile.id, name: "increment" }, "verification-machine");
      const machineAwake = !!signal && signal.ok === true && MorphTile.isAwake(machineWs.live, machineTile.id, "counter");
      const machineCount = MorphTile.getVar(machineWs.live, machineTile.id, "count", machineWs.live.time);
      if (!machineAwake || machineCount !== 4) {
        errors.push(failure("DEFAULT_WAKE_MACHINE_RUNTIME_DRIFT", "Machine compatibility default did not wake and increment on the declared signal.", { awake: machineAwake, count: machineCount }));
      }
      if (MorphTile.hashOf(machineWs.live.tiles[machineTile.id]) !== machineMatterHash) {
        errors.push(failure("DEFAULT_WAKE_MACHINE_REWROTE_MATTER", "Machine compatibility wake rewrote canonical capability matter."));
      }
      const machineReplay = replayMatches(MorphTile, machineWs);
      if (!machineReplay) errors.push(failure("DEFAULT_WAKE_MACHINE_REPLAY_DIVERGED", "Machine compatibility default lifecycle did not replay exactly."));

      const rawCap = clone(omittedCap);
      delete rawCap.wake;
      const rawTile = MorphTile.createTile({ id: "raw-default", name: "Verification raw omission", capabilities: [rawCap] });
      const rawMatterHash = MorphTile.hashOf(rawTile);
      const rawWorld = MorphTile.createWorld("Verification raw omitted wake world");
      rawWorld.tiles[rawTile.id] = rawTile;
      const rawValidation = MorphTile.validateWorld(rawWorld);
      if (!rawValidation || rawValidation.ok !== true) {
        errors.push(failure("DEFAULT_WAKE_RAW_WORLD_INVALID", "Raw omitted-wake capability does not form a valid pinned MorphTile world.", { validation: clone(rawValidation) }));
      } else {
        const rawWs = MorphTile.createWorkspace(rawWorld);
        const ignoredSignal = MorphTile.act(rawWs, { do: "signal", tile: rawTile.id, name: "increment" }, "verification-machine");
        const rawAwakeAfterSignal = MorphTile.isAwake(rawWs.live, rawTile.id, "counter");
        const rawCountAfterSignal = MorphTile.getVar(rawWs.live, rawTile.id, "count", rawWs.live.time);
        if (!ignoredSignal || ignoredSignal.ok !== true || rawAwakeAfterSignal || rawCountAfterSignal !== undefined) {
          errors.push(failure("RAW_WAKE_OMISSION_NOT_MANUAL", "Raw MorphTile omitted wake did not remain asleep/manual under the same increment signal.", {
            signal_ok: ignoredSignal && ignoredSignal.ok || false,
            awake: rawAwakeAfterSignal,
            count: rawCountAfterSignal
          }));
        }
        const manual = MorphTile.act(rawWs, { do: "wake", tile: rawTile.id, capability: "counter" }, "verification-machine");
        const rawAwakeManual = !!manual && manual.ok === true && MorphTile.isAwake(rawWs.live, rawTile.id, "counter");
        const rawCountManual = MorphTile.getVar(rawWs.live, rawTile.id, "count", rawWs.live.time);
        if (!rawAwakeManual || rawCountManual !== 3) {
          errors.push(failure("RAW_WAKE_MANUAL_RUNTIME_DRIFT", "Raw omitted wake did not activate with authored initial state under explicit manual wake.", { awake: rawAwakeManual, count: rawCountManual }));
        }
        if (MorphTile.hashOf(rawWs.live.tiles[rawTile.id]) !== rawMatterHash) {
          errors.push(failure("RAW_WAKE_REWROTE_MATTER", "Raw omitted wake lifecycle rewrote canonical capability matter."));
        }
        const rawReplay = replayMatches(MorphTile, rawWs);
        if (!rawReplay) errors.push(failure("RAW_WAKE_REPLAY_DIVERGED", "Raw omitted-wake lifecycle did not replay exactly."));

        runtimeReceipt = {
          machine_awake_after_increment: machineAwake,
          machine_count_after_increment: machineCount,
          machine_matter_sha256_before: machineMatterHash,
          machine_matter_sha256_after: MorphTile.hashOf(machineWs.live.tiles[machineTile.id]),
          machine_replay_exact: machineReplay,
          raw_awake_after_increment: rawAwakeAfterSignal,
          raw_count_after_increment: rawCountAfterSignal === undefined ? null : rawCountAfterSignal,
          raw_awake_after_manual: rawAwakeManual,
          raw_count_after_manual: rawCountManual,
          raw_matter_sha256_before: rawMatterHash,
          raw_matter_sha256_after: MorphTile.hashOf(rawWs.live.tiles[rawTile.id]),
          raw_replay_exact: rawReplay
        };
      }
    }
  }
  checked.push("machine-default-vs-raw-omission-runtime-replay");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.capability-default-wake-conformance-receipt/v0.1",
      revisions,
      omitted_warning_codes: warningCodes(omitted.output),
      explicit_signal_warning_codes: warningCodes(explicitSignal.output),
      explicit_manual_warning_codes: warningCodes(explicitManual.output),
      omitted_candidate_sha256: omitted.output ? MorphTile.hashOf(omitted.output.candidate) : null,
      explicit_signal_candidate_sha256: explicitSignal.output ? MorphTile.hashOf(explicitSignal.output.candidate) : null,
      null_wake_status: nullWake.output && nullWake.output.status || null,
      empty_wake_status: badWake.output && badWake.output.status || null,
      runtime: runtimeReceipt
    }
  };
}

module.exports = { verifyCapabilityDefaultWakeVisibility };
