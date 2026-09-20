"use strict";

const { verifyKitCandidate } = require("./kit-conformance");
const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function request(id, goal, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstHoldCode(result) {
  return result && Array.isArray(result.holds) && result.holds[0] ? result.holds[0].code || null : null;
}

function importedTile(runtime, kit, worldName) {
  const receiver = runtime.createWorld(worldName);
  const before = runtime.hashOf(receiver);
  const imported = runtime.importKit(receiver, clone(kit));
  const after = runtime.hashOf(receiver);
  const add = imported && Array.isArray(imported.ops) ? imported.ops.find((op) => op && op.op === "tile.add") : null;
  return { imported, tile: add && add.tile ? add.tile : null, receiverBefore: before, receiverAfter: after };
}

function verifyAssemblyCurrentRetention(options = {}) {
  const {
    assembly,
    materializeKit,
    form,
    surface,
    capability,
    runtime,
    revisions = {}
  } = options;
  const errors = [];
  const checked = [];

  const missing = [];
  if (!assembly || typeof assembly.run !== "function") missing.push("assembly.run");
  if (typeof materializeKit !== "function") missing.push("assembly.materializeKit");
  if (!form || typeof form.run !== "function") missing.push("form.run");
  if (!surface || typeof surface.run !== "function") missing.push("surface.run");
  if (!capability || typeof capability.run !== "function") missing.push("capability.run");
  for (const name of ["createWorld", "hashOf", "importKit", "validateTile"]) {
    if (!runtime || typeof runtime[name] !== "function") missing.push("runtime." + name);
  }
  if (missing.length) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("CURRENT_ASSEMBLY_CONTRACT_MISSING", "Current Assembly retention verification requires all pinned sibling and MorphTile entry points.", { missing })],
      receipt: null
    };
  }

  try {
    const formRequest = request(
      "verification-current-form-retention",
      "Create a bounded form for independent current Assembly retention verification",
      { shape: "box", name: "Verification retention", size: [1, 1, 1] }
    );
    const surfaceRequest = request(
      "verification-current-surface-retention",
      "Create an explicitly patterned surface for independent Assembly transport verification",
      { base_color: [0.3, 0.4, 0.5], pattern: { kind: "checker", scale: 2.25 } }
    );
    const capabilityRequest = request(
      "verification-current-capability-retention",
      "Create a sleeping counter carrying explicit falsey wake semantics",
      { kind: "sleeping-counter", initial: 1, wake: { on: "value", tile: "", var: "count", over: 3, sleeps: false } }
    );
    const requestSnapshots = [formRequest, surfaceRequest, capabilityRequest].map((item) => JSON.stringify(item));

    const formOut = form.run(formRequest);
    const surfaceOut = surface.run(surfaceRequest);
    const capabilityOut = capability.run(capabilityRequest);
    if (!formOut || formOut.status !== "CANDIDATE") {
      errors.push(failure("CURRENT_FORM_NOT_CANDIDATE", "Pinned Form output did not produce the expected candidate.", { observed_status: formOut && formOut.status || null, observed_code: firstHoldCode(formOut) }));
    }
    if (!surfaceOut || surfaceOut.status !== "CANDIDATE") {
      errors.push(failure("CURRENT_SURFACE_NOT_CANDIDATE", "Pinned Surface output did not produce the expected candidate.", { observed_status: surfaceOut && surfaceOut.status || null, observed_code: firstHoldCode(surfaceOut) }));
    }
    if (!capabilityOut || capabilityOut.status !== "CANDIDATE") {
      errors.push(failure("CURRENT_CAPABILITY_NOT_CANDIDATE", "Pinned Capability output did not produce the expected candidate.", { observed_status: capabilityOut && capabilityOut.status || null, observed_code: firstHoldCode(capabilityOut) }));
    }
    [formRequest, surfaceRequest, capabilityRequest].forEach((item, index) => {
      if (JSON.stringify(item) !== requestSnapshots[index]) {
        errors.push(failure("UPSTREAM_REQUEST_MUTATED", "A pinned sibling machine mutated the caller-owned request during candidate creation.", { input_index: index }));
      }
    });
    checked.push("current-sibling-candidates-and-request-immutability");

    if (surfaceOut && surfaceOut.candidate && surfaceOut.candidate.value && surfaceOut.candidate.value.data) {
      if (surfaceOut.candidate.value.data.pattern !== "checker" || surfaceOut.candidate.value.data.scale !== 2.25) {
        errors.push(failure("SURFACE_SEMANTICS_CHANGED_BEFORE_ASSEMBLY", "Pinned Surface output did not carry the checker pattern and authored scale expected by this receipt.", {
          observed_pattern: surfaceOut.candidate.value.data.pattern || null,
          observed_scale: surfaceOut.candidate.value.data.scale
        }));
      }
    }
    const upstreamWake = capabilityOut && capabilityOut.candidate && Array.isArray(capabilityOut.candidate.capabilities)
      ? capabilityOut.candidate.capabilities[0] && capabilityOut.candidate.capabilities[0].wake
      : null;
    const expectedWake = { on: "value", tile: "", var: "count", over: 3, sleeps: false };
    if (JSON.stringify(upstreamWake) !== JSON.stringify(expectedWake)) {
      errors.push(failure("CAPABILITY_FALSEY_SEMANTICS_CHANGED_BEFORE_ASSEMBLY", "Pinned Capability output did not carry the exact explicit falsey wake semantics expected by this receipt.", { observed_wake: clone(upstreamWake) }));
    }
    checked.push("upstream-semantic-shape");

    const assemblyRequest = {
      envelope_version: "0.1",
      request_id: "verification-current-assembly-retention",
      goal: "Independently prove current Surface and Capability semantics survive one combined Assembly candidate",
      intent: { id: "mt_verification_retention", name: "Verification retention proof" },
      inputs: [formOut, surfaceOut, capabilityOut],
      provenance: { caller: "axm.morphtile.machine.verification" }
    };
    const assemblySnapshot = JSON.stringify(assemblyRequest);
    const assembled = assembly.run(assemblyRequest);
    if (JSON.stringify(assemblyRequest) !== assemblySnapshot) {
      errors.push(failure("ASSEMBLY_REQUEST_MUTATED", "Assembly mutated the caller-owned combined request."));
    }
    if (!assembled || assembled.status !== "CANDIDATE") {
      errors.push(failure("CURRENT_ASSEMBLY_NOT_CANDIDATE", "Current sibling outputs did not produce a complete Assembly candidate.", {
        observed_status: assembled && assembled.status || null,
        observed_code: firstHoldCode(assembled),
        holds: clone(assembled && assembled.holds || [])
      }));
    }
    const material = assembled && assembled.candidate && assembled.candidate.facets ? assembled.candidate.facets.material : null;
    if (!material || !material.data || material.data.pattern !== "checker" || material.data.scale !== 2.25) {
      errors.push(failure("ASSEMBLED_SURFACE_SEMANTICS_LOST", "Assembly did not retain checker pattern plus authored scale in the combined candidate.", { observed_material: clone(material) }));
    }
    const assembledWake = assembled && assembled.candidate && Array.isArray(assembled.candidate.capabilities)
      ? assembled.candidate.capabilities[0] && assembled.candidate.capabilities[0].wake
      : null;
    if (JSON.stringify(assembledWake) !== JSON.stringify(expectedWake)) {
      errors.push(failure("ASSEMBLED_CAPABILITY_FALSEY_SEMANTICS_LOST", "Assembly did not retain explicit empty-string and false wake fields exactly.", { observed_wake: clone(assembledWake) }));
    }
    checked.push("combined-assembly-semantic-retention");

    let kitResult = null;
    let genericKitVerification = null;
    let imported = null;
    if (assembled && assembled.status === "CANDIDATE") {
      kitResult = materializeKit(assembled, runtime, { name: "Independent current retention kit" });
      if (!kitResult || kitResult.status !== "CANDIDATE") {
        errors.push(failure("CURRENT_ASSEMBLY_KIT_NOT_CANDIDATE", "Combined Assembly candidate did not materialize a portable kit.", {
          observed_status: kitResult && kitResult.status || null,
          holds: clone(kitResult && kitResult.holds || [])
        }));
      } else {
        genericKitVerification = verifyKitCandidate(kitResult, runtime);
        if (!genericKitVerification || genericKitVerification.status !== "PASS") {
          errors.push(failure("CURRENT_ASSEMBLY_KIT_CONFORMANCE_FAIL", "The current combined kit failed the independent generic kit/hash/import/tamper verifier.", {
            verifier_errors: clone(genericKitVerification && genericKitVerification.errors || [])
          }));
        }
        imported = importedTile(runtime, kitResult.kit, "Independent current retention receiver");
        if (!imported.imported || imported.imported.status !== "READY" || !imported.tile) {
          errors.push(failure("CURRENT_ASSEMBLY_FRESH_IMPORT_FAIL", "Fresh MorphTile receiver did not stage the current combined kit as READY with tile.add matter.", {
            observed_status: imported.imported && imported.imported.status || null
          }));
        } else {
          const importedMaterial = imported.tile.facets && imported.tile.facets.material;
          if (!importedMaterial || !importedMaterial.data || importedMaterial.data.pattern !== "checker" || importedMaterial.data.scale !== 2.25) {
            errors.push(failure("IMPORTED_SURFACE_SEMANTICS_LOST", "Fresh verified import did not retain Surface checker pattern and scale.", { observed_material: clone(importedMaterial) }));
          }
          const importedWake = Array.isArray(imported.tile.capabilities) && imported.tile.capabilities[0]
            ? imported.tile.capabilities[0].wake
            : null;
          if (JSON.stringify(importedWake) !== JSON.stringify(expectedWake)) {
            errors.push(failure("IMPORTED_CAPABILITY_FALSEY_SEMANTICS_LOST", "Fresh verified import did not retain explicit falsey Capability wake fields.", { observed_wake: clone(importedWake) }));
          }
        }
        if (imported.receiverBefore !== imported.receiverAfter) {
          errors.push(failure("FRESH_IMPORT_ANALYSIS_MUTATED_RECEIVER", "Fresh import analysis mutated the receiver instead of returning staged operations.", { before: imported.receiverBefore, after: imported.receiverAfter }));
        }
      }
    }
    checked.push("portable-kit-generic-verification-and-fresh-import");

    const tamperResults = [];
    if (kitResult && kitResult.status === "CANDIDATE") {
      const tamperCases = [
        {
          id: "false-to-true",
          mutate(kit) { kit.tile.capabilities[0].wake.sleeps = true; }
        },
        {
          id: "empty-tile-omitted",
          mutate(kit) { delete kit.tile.capabilities[0].wake.tile; }
        }
      ];
      for (const item of tamperCases) {
        const tampered = clone(kitResult.kit);
        item.mutate(tampered);
        const receiver = runtime.createWorld("Targeted falsey tamper " + item.id);
        const before = runtime.hashOf(receiver);
        const result = runtime.importKit(receiver, tampered);
        const after = runtime.hashOf(receiver);
        const observedStatus = result && result.status || null;
        tamperResults.push({ id: item.id, status: observedStatus, receiver_mutated: before !== after });
        if (observedStatus !== "HOLD_HASH_MISMATCH") {
          errors.push(failure("FALSEY_SEMANTIC_TAMPER_NOT_HASH_BOUND", "Changing or omitting an explicit falsey wake field must invalidate the portable kit hash.", { case: item.id, observed_status: observedStatus }));
        }
        if (before !== after) {
          errors.push(failure("FALSEY_SEMANTIC_TAMPER_MUTATED_RECEIVER", "Rejected falsey-field tampering mutated the receiver.", { case: item.id, before, after }));
        }
      }
    }
    checked.push("falsey-semantic-targeted-tamper-rejection");

    let omissionHash = null;
    if (assembled && assembled.status === "CANDIDATE" && capabilityOut && capabilityOut.candidate && Array.isArray(capabilityOut.candidate.capabilities)) {
      const omittedCapability = clone(capabilityOut);
      delete omittedCapability.candidate.capabilities[0].wake.tile;
      delete omittedCapability.candidate.capabilities[0].wake.sleeps;
      const omission = assembly.run({
        envelope_version: "0.1",
        request_id: "verification-current-assembly-retention-omission-control",
        goal: "Prove explicit falsey fields remain content-bearing rather than collapsing to omission",
        intent: { id: "mt_verification_retention", name: "Verification retention proof" },
        inputs: [clone(formOut), clone(surfaceOut), omittedCapability],
        provenance: { caller: "axm.morphtile.machine.verification" }
      });
      omissionHash = omission && omission.closure_hash && omission.closure_hash.value || null;
      const originalHash = assembled.closure_hash && assembled.closure_hash.value || null;
      if (!originalHash || !omissionHash || originalHash === omissionHash) {
        errors.push(failure("FALSEY_FIELDS_COLLAPSED_TO_OMISSION", "Assembly closure identity must distinguish explicit false/empty-string wake fields from omission.", { original_hash: originalHash, omission_hash: omissionHash }));
      }
    }
    checked.push("falsey-vs-omission-closure-identity");

    const receipt = {
      schema: "axm.morphtile.assembly-current-retention-conformance-receipt/v0.1",
      revisions: clone(revisions),
      assembly_status: assembled && assembled.status || null,
      assembly_closure_hash: assembled && assembled.closure_hash && assembled.closure_hash.value || null,
      omission_closure_hash: omissionHash,
      kit_status: kitResult && kitResult.status || null,
      generic_kit_status: genericKitVerification && genericKitVerification.status || null,
      fresh_import_status: imported && imported.imported && imported.imported.status || null,
      falsey_tamper_cases: tamperResults,
      surface_pattern: material && material.data ? material.data.pattern || null : null,
      surface_scale: material && material.data ? material.data.scale : null,
      capability_wake: clone(assembledWake)
    };

    return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
  } catch (error) {
    errors.push(failure("CURRENT_ASSEMBLY_VERIFIER_EXCEPTION", "Independent current Assembly retention verifier threw before it could complete its receipt.", {
      observed_name: error && error.name || "Error",
      observed_message: error && error.message || String(error)
    }));
    return { status: "FAIL", checked, errors, receipt: null };
  }
}

module.exports = { verifyAssemblyCurrentRetention };
