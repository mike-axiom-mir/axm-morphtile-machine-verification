"use strict";

const {
  verifySurfaceSpecialKeyRepair,
  verifyCoreRecipeOwnKeyIdentity
} = require("./current-repairs-round6-conformance");
const { verifyInterfaceMeter } = require("./current-growth-round5-conformance");
const { verifyKitCandidate } = require("./kit-conformance");

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (value === null || value === undefined || typeof value !== "object") {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

function same(a, b) {
  return canonical(a) === canonical(b);
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

function uiEligibility() {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-explicit-ui-eligibility" }
  };
}

function textInterface(Interface, tilePath, suffix) {
  return Interface.run(request(
    `verification-r6-interface-${suffix}`,
    "Author path-bound text matter while keeping content and proof identity separately inspectable",
    {
      tile_path: tilePath,
      title: "Round 6 transport verification",
      text: "Portable matter is path-neutral; target proof obligations are not."
    }
  ));
}

function assembleBound(Assembly, interfaceOut, tilePath, suffix) {
  return Assembly.run({
    envelope_version: "0.1",
    request_id: `verification-r6-assembly-${suffix}`,
    goal: "Bind Interface matter to the exact caller-owned target path",
    intent: { id: "mt_inner", tile_path: tilePath, name: "Round 6 target" },
    inputs: [uiEligibility(), interfaceOut],
    provenance: { caller: "axm.morphtile.machine.verification" }
  });
}

function firstHoldCode(value) {
  return value && Array.isArray(value.holds) && value.holds[0] && value.holds[0].code || null;
}

function applyImported(runtime, world, imported) {
  for (const operation of imported && imported.ops || []) runtime.applyStructOp(world, operation);
}

function verifyInterfaceCurrentAssemblyCorrected(Interface, Assembly, materializeKit, runtime, integrationSources, options = {}) {
  const errors = [];
  const checked = [];
  const expectedAssembly = options.assemblyCommit || null;
  const pin = integrationSources && integrationSources.assembly || null;
  const pinExact = !!pin
    && pin.repository === "mike-axiom-mir/axm-morphtile-machine-assembly"
    && pin.commit === expectedAssembly;
  if (!pinExact) {
    errors.push(failure("INTERFACE_RECEIVER_PIN_STALE", "Interface receiver evidence does not name the exact independently tested Assembly revision.", { observed: clone(pin), expected_commit: expectedAssembly }));
  }
  checked.push("exact-current-assembly-receiver-pin");

  const meter = verifyInterfaceMeter(Interface, runtime, {
    interfaceCommit: options.interfaceCommit || null,
    morphTileCommit: options.coreCommit || null
  });
  if (meter.status !== "PASS") errors.push(...(meter.errors || []));
  checked.push("meter-canonical-state-readonly-rollback-replay");

  const pathA = "mt_shell/mt_inner";
  const pathB = "mt_other_shell/mt_inner";
  const interfaceA = textInterface(Interface, pathA, "nested-a");
  const interfaceB = textInterface(Interface, pathB, "nested-b");
  const boundA = assembleBound(Assembly, interfaceA, pathA, "nested-a");
  const boundB = assembleBound(Assembly, interfaceB, pathB, "nested-b");

  for (const [label, out, expectedPath] of [["a", boundA, pathA], ["b", boundB, pathB]]) {
    const binding = out && out.target_binding;
    if (!out || out.status !== "CANDIDATE" || !binding || binding.id !== "mt_inner" || binding.path !== expectedPath) {
      errors.push(failure("INTERFACE_CURRENT_ASSEMBLY_NESTED_BINDING_DRIFT", "Current Assembly did not preserve exact local-id/canonical-path target binding.", { label, observed_status: out && out.status || null, observed_binding: clone(binding) }));
    }
  }
  checked.push("nested-exact-target-binding");

  const mismatch = assembleBound(Assembly, interfaceA, pathB, "cross-parent-mismatch");
  const mismatchCodes = Array.isArray(mismatch && mismatch.holds) ? mismatch.holds.map((entry) => entry && entry.code).filter(Boolean) : [];
  if (!mismatch || mismatch.status !== "HOLD" || !mismatchCodes.includes("HOLD_VIEW_OPERATION_TARGET_MISMATCH")) {
    errors.push(failure("INTERFACE_CURRENT_ASSEMBLY_CROSS_PARENT_ACCEPTED", "Same-leaf Interface matter from a different canonical parent was not rejected.", { observed_status: mismatch && mismatch.status || null, observed_holds: mismatchCodes }));
  }
  checked.push("cross-parent-same-leaf-rejection");

  const portableMatterEqual = !!boundA && !!boundB && same(boundA.candidate, boundB.candidate);
  const depA = boundA && Array.isArray(boundA.dependencies) ? boundA.dependencies[0] : null;
  const depB = boundB && Array.isArray(boundB.dependencies) ? boundB.dependencies[0] : null;
  const targetProofsExact = !!depA && !!depB
    && depA.kind === "morphtile.interface-target-proof/v0.1"
    && depB.kind === "morphtile.interface-target-proof/v0.1"
    && depA.tile_path === pathA
    && depB.tile_path === pathB
    && depA.id === `morphtile.interface-target-proof:${pathA}`
    && depB.id === `morphtile.interface-target-proof:${pathB}`;
  const closureA = boundA && boundA.closure_hash && boundA.closure_hash.value || null;
  const closureB = boundB && boundB.closure_hash && boundB.closure_hash.value || null;
  const closureDiffers = !!closureA && !!closureB && closureA !== closureB;
  if (!portableMatterEqual) {
    errors.push(failure("INTERFACE_ASSEMBLY_PORTABLE_CANDIDATE_PATH_DRIFT", "The assembled tile candidate itself changed solely because the canonical source parent changed.", { candidate_a: clone(boundA && boundA.candidate), candidate_b: clone(boundB && boundB.candidate) }));
  }
  if (!targetProofsExact || !closureDiffers) {
    errors.push(failure("INTERFACE_ASSEMBLY_PROOF_CLOSURE_IDENTITY_DRIFT", "Target-local proof dependencies must preserve their exact path identity, so full closure hashes should differ even when portable tile candidates are equal.", { dependency_a: clone(depA), dependency_b: clone(depB), closure_a: closureA, closure_b: closureB }));
  }
  checked.push("portable-matter-vs-target-proof-closure-separation");

  const nestedKit = boundA && boundA.status === "CANDIDATE"
    ? materializeKit(boundA, runtime, { name: "Round 6 contextual nested target kit" })
    : null;
  const nestedProofReceipt = nestedKit && Array.isArray(nestedKit.dependency_resolution) ? nestedKit.dependency_resolution[0] : null;
  const nestedContextHold = !!nestedKit
    && nestedKit.status === "HOLD"
    && firstHoldCode(nestedKit) === "HOLD_KIT_DEPENDENCY_UNSATISFIED"
    && nestedProofReceipt
    && nestedProofReceipt.status === "UNSATISFIED";
  if (!nestedContextHold) {
    errors.push(failure("INTERFACE_NESTED_CONTEXT_KIT_DID_NOT_HOLD", "A nested target proof lacking its parent world context should remain an explicit unsatisfied kit dependency rather than being silently exported.", { observed_status: nestedKit && nestedKit.status || null, observed_hold: firstHoldCode(nestedKit), dependency_resolution: clone(nestedKit && nestedKit.dependency_resolution || []) }));
  }
  checked.push("nested-context-dependency-fails-closed-at-kit-boundary");

  const localInterface = textInterface(Interface, "mt_inner", "local-positive");
  const localBound = assembleBound(Assembly, localInterface, "mt_inner", "local-positive");
  const localKit = localBound && localBound.status === "CANDIDATE"
    ? materializeKit(localBound, runtime, { name: "Round 6 local target kit" })
    : null;
  let localImportStatus = null;
  if (!localKit || localKit.status !== "CANDIDATE" || !localKit.kit) {
    errors.push(failure("INTERFACE_LOCAL_TARGET_KIT_FALSE_HOLD", "A root-local target whose proof is satisfiable inside isolated staging did not materialize to a kit.", { assembly_status: localBound && localBound.status || null, kit_status: localKit && localKit.status || null, kit_hold: firstHoldCode(localKit) }));
  } else {
    const receiver = runtime.createWorld("Round 6 local target receiver");
    const imported = runtime.importKit(receiver, clone(localKit.kit));
    localImportStatus = imported && imported.status || null;
    if (localImportStatus !== "READY") {
      errors.push(failure("INTERFACE_LOCAL_TARGET_KIT_IMPORT_FAIL", "The satisfiable root-local Interface kit did not import READY into a fresh receiver.", { observed_status: localImportStatus }));
    }
  }
  checked.push("root-local-proof-positive-kit-control");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-current-assembly-conformance/v0.2",
      interface_commit: options.interfaceCommit || null,
      assembly_commit: expectedAssembly,
      core_commit: options.coreCommit || null,
      receiver_pin_exact: pinExact,
      meter_status: meter.status,
      meter: meter.receipt,
      nested: {
        bound_a_status: boundA && boundA.status || null,
        bound_b_status: boundB && boundB.status || null,
        target_a: clone(boundA && boundA.target_binding || null),
        target_b: clone(boundB && boundB.target_binding || null),
        portable_candidate_equal: portableMatterEqual,
        target_proofs_exact: targetProofsExact,
        closure_hashes_differ_due_to_target_local_dependencies: closureDiffers,
        kit_status: nestedKit && nestedKit.status || null,
        kit_hold: firstHoldCode(nestedKit),
        proof_status: nestedProofReceipt && nestedProofReceipt.status || null
      },
      local_positive: {
        assembly_status: localBound && localBound.status || null,
        kit_status: localKit && localKit.status || null,
        import_status: localImportStatus
      },
      corrected_verifier_rule: "portable candidate identity may be path-neutral while full closure identity legitimately differs because target-local proof dependencies are part of closure; nested context absent from an isolated kit must HOLD, not be invented",
      visual_quality: "NOT_TESTED"
    }
  };
}

function formRequest(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify Form 0.11 rotation through Assembly portable closure",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function panelDefinition() {
  return {
    id: "panel",
    name: "Verification parametric panel",
    created_by: "axm.morphtile.machine.verification",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: {
            generator: "recipe",
            vars: { width: 1 },
            parts: [{ shape: "plane", size: [["var", "width"], 1, 1] }]
          }
        }
      }
    }
  };
}

function holdCode(output, code) {
  const hold = output && Array.isArray(output.holds) ? output.holds.find((entry) => entry && (!code || entry.code === code)) : null;
  return hold && hold.code || null;
}

function verifyAssemblyFormRotationCorrected(form, assembly, materializeKit, runtime, options = {}) {
  const errors = [];
  const checked = [];
  const intent = {
    name: "Verification turning progressive panels",
    repeat: {
      count: 3,
      step: [3, 0, 0],
      rot_step: [0, 0, 0.25],
      with_step: { width: 0.5 },
      instance: { use: "panel", with: { width: 1 }, rot: [0, 0, 0.1] }
    }
  };
  const req = formRequest("verification-r6-form-rotation-closure", clone(intent));
  const before = canonical(req);
  const first = form.run(req);
  const second = form.run(req);
  const expectedParts = [{
    repeat: 3,
    as: "i",
    body: [{
      use: "panel",
      with: { width: ["+", 1, ["*", ["var", "i"], 0.5]] },
      pos: [["+", 0, ["*", ["var", "i"], 3]], 0, 0],
      rot: [0, 0, ["+", 0.1, ["*", ["var", "i"], 0.25]]]
    }]
  }];
  const emittedParts = first && first.candidate && first.candidate.facets && first.candidate.facets.mesh && first.candidate.facets.mesh.data && first.candidate.facets.mesh.data.parts;
  const formExact = !!first
    && first.status === "CANDIDATE"
    && same(first, second)
    && canonical(req) === before
    && same(emittedParts, expectedParts);
  if (!formExact) {
    errors.push(failure("ASSEMBLY_ROTATION_FORM_SEMANTIC_DRIFT", "Pinned Form did not emit the exact deterministic rotation/setting progression under key-order-insensitive semantic comparison.", { observed_status: first && first.status || null, observed_parts: clone(emittedParts) }));
  }
  checked.push("form-rotation-setting-progression-semantic-identity");

  const base = {
    envelope_version: "0.1",
    goal: "verify portable rotation definition closure",
    intent: { id: "mt_verification_turning_panel", name: "Verification turning panels" },
    inputs: [first],
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const missing = assembly.run({ ...clone(base), request_id: "verification-r6-assembly-rotation-missing" });
  const missingExact = missing && missing.status === "HOLD"
    && holdCode(missing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE") === "HOLD_DEFINITION_CLOSURE_INCOMPLETE"
    && same(missing.required_definitions || [], ["panel"]);
  if (!missingExact) {
    errors.push(failure("ASSEMBLY_ROTATION_MISSING_DEFINITION_NOT_HELD", "Assembly did not fail closed on missing reusable matter for the rotated Form candidate.", { observed_status: missing && missing.status || null, observed_holds: clone(missing && missing.holds || []), required: clone(missing && missing.required_definitions || []) }));
  }
  checked.push("missing-definition-fails-closed");

  const completeRequest = {
    ...clone(base),
    request_id: "verification-r6-assembly-rotation-complete",
    world_requirements: { definitions: { panel: panelDefinition() } }
  };
  const completeBefore = canonical(completeRequest);
  const complete = assembly.run(completeRequest);
  const completeParts = complete && complete.candidate && complete.candidate.facets && complete.candidate.facets.mesh && complete.candidate.facets.mesh.data && complete.candidate.facets.mesh.data.parts;
  const completeExact = complete && complete.status === "CANDIDATE"
    && same(completeParts, expectedParts)
    && canonical(completeRequest) === completeBefore;
  if (!completeExact) {
    errors.push(failure("ASSEMBLY_ROTATION_CLOSURE_SEMANTIC_DRIFT", "Assembly did not preserve the exact rotated recipe through explicit definition closure under semantic comparison.", { observed_status: complete && complete.status || null, observed_parts: clone(completeParts) }));
  }
  checked.push("exact-rotation-definition-closure");

  let kitVerification = null;
  let tamperStatus = null;
  let tamperReadOnly = null;
  let runtimeReceipt = null;
  if (complete && complete.status === "CANDIDATE") {
    const materialized = materializeKit(complete, runtime, { name: "Verification turning progressive definition kit" });
    kitVerification = verifyKitCandidate(materialized, runtime);
    if (!kitVerification || kitVerification.status !== "PASS") {
      errors.push(failure("ASSEMBLY_ROTATION_KIT_VERIFY_FAIL", "Rotated portable kit failed independent payload/hash/fresh-import verification.", { verifier_errors: clone(kitVerification && kitVerification.errors || []) }));
    }

    if (materialized && materialized.status === "CANDIDATE" && materialized.kit) {
      const tampered = clone(materialized.kit);
      let tamperPathPresent = true;
      try {
        tampered.tile.facets.mesh.data.parts[0].body[0].rot[2][2][2] = 0.5;
      } catch (error) {
        tamperPathPresent = false;
        errors.push(failure("ASSEMBLY_ROTATION_TAMPER_PATH_MISSING", "Expected transported rotation expression was not present at the deterministic kit path.", { observed_error: error && error.message || String(error) }));
      }
      if (tamperPathPresent) {
        const receiver = runtime.createWorld("Verification rotation tamper receiver");
        const receiverBefore = runtime.hashOf(receiver);
        const tamperedImport = runtime.importKit(receiver, tampered);
        const receiverAfter = runtime.hashOf(receiver);
        tamperStatus = tamperedImport && tamperedImport.status || null;
        tamperReadOnly = receiverBefore === receiverAfter;
        if (tamperStatus !== "HOLD_HASH_MISMATCH" || !tamperReadOnly) {
          errors.push(failure("ASSEMBLY_ROTATION_TAMPER_NOT_CLOSED", "Changing only the transported rotation expression under the stale kit hash was not rejected non-mutating as HOLD_HASH_MISMATCH.", { observed_status: tamperStatus, receiver_unchanged: tamperReadOnly }));
        }
      }

      const fresh = runtime.createWorld("Verification rotation fresh receiver");
      const imported = runtime.importKit(fresh, clone(materialized.kit));
      if (!imported || imported.status !== "READY" || imported.evidence !== "verified_payload_sha256") {
        errors.push(failure("ASSEMBLY_ROTATION_FRESH_IMPORT_NOT_READY", "Untampered rotated kit did not enter a fresh runtime as verified READY matter.", { observed_status: imported && imported.status || null, observed_evidence: imported && imported.evidence || null }));
      } else {
        applyImported(runtime, fresh, imported);
        const received = runtime.resolveTile(fresh, "mt_verification_turning_panel");
        const receivedParts = received && received.facets && received.facets.mesh && received.facets.mesh.data && received.facets.mesh.data.parts;
        const compiled = received ? runtime.compileMesh(received, fresh) : null;
        const finite = !!compiled && Array.isArray(compiled.P) && compiled.P.length > 0 && compiled.P.every(Number.isFinite);
        const runtimeExact = !!received && same(receivedParts, expectedParts)
          && compiled && compiled.hold === null && compiled.recipe_parts === 3 && finite;
        runtimeReceipt = {
          import_status: imported.status,
          import_evidence: imported.evidence,
          exact_parts_preserved: same(receivedParts, expectedParts),
          hold: compiled && compiled.hold || null,
          recipe_parts: compiled && compiled.recipe_parts || null,
          positions_finite: finite
        };
        if (!runtimeExact) {
          errors.push(failure("ASSEMBLY_ROTATION_IMPORTED_RUNTIME_SEMANTIC_DRIFT", "Fresh imported matter did not retain and execute the exact rotation/setting progression as finite runtime geometry.", clone(runtimeReceipt)));
        }
      }
    }
  }
  checked.push("portable-kit-hash-and-rotation-tamper-boundary");
  checked.push("fresh-import-exact-runtime-meaning");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.assembly-form-rotation-conformance/v0.2",
      form_commit: options.formCommit || null,
      assembly_commit: options.assemblyCommit || null,
      core_commit: options.coreCommit || null,
      form_exact: formExact,
      missing_definition: { status: missing && missing.status || null, hold: holdCode(missing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE") },
      complete_status: complete && complete.status || null,
      kit_verification_status: kitVerification && kitVerification.status || null,
      rotation_tamper: { status: tamperStatus, receiver_unchanged: tamperReadOnly },
      runtime: runtimeReceipt,
      corrected_verifier_rule: "object member order is not semantic identity; exact deterministic evidence compares canonical structure while arrays remain ordered"
    }
  };
}

module.exports = {
  verifySurfaceSpecialKeyRepair,
  verifyCoreRecipeOwnKeyIdentity,
  verifyInterfaceCurrentAssemblyCorrected,
  verifyAssemblyFormRotationCorrected
};
