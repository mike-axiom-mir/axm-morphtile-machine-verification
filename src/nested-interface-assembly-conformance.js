"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function req(id, goal, intent) {
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

function interfaceCandidate(Interface, pathValue) {
  return Interface.run(req(
    `verification-interface-${pathValue.replaceAll("/", "-")}`,
    "Author identical view matter at an explicitly different canonical target path",
    {
      tile_path: pathValue,
      title: "Nested transport verification",
      text: "Target context must stay separate from portable matter identity"
    }
  ));
}

function assembleBound(assemble, interfaceOut, pathValue, requestId) {
  return assemble({
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Bind nested Interface matter only to the exact caller-owned canonical path",
    intent: { id: "mt_inner", tile_path: pathValue, name: "Nested target" },
    inputs: [uiEligibility(), interfaceOut],
    provenance: { caller: "axm.morphtile.machine.verification" }
  });
}

function holdCodes(output) {
  return Array.isArray(output && output.holds) ? output.holds.map((hold) => hold && hold.code).filter(Boolean) : [];
}

function verifyNestedInterfaceAssemblyTransport(Interface, Assembly, materializeKit, MorphTile, options = {}) {
  const errors = [];
  const checked = [];
  const interfaceCommit = options.interfaceCommit || null;
  const assemblyCommit = options.assemblyCommit || null;
  const morphTileCommit = options.morphTileCommit || null;

  if (!Interface || typeof Interface.run !== "function" || !Assembly || typeof Assembly.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("NESTED_TRANSPORT_MACHINE_CONTRACT_MISSING", "Interface.run and Assembly.run are required.")], receipt: null };
  }
  if (typeof materializeKit !== "function" || !MorphTile || typeof MorphTile.importKit !== "function" || typeof MorphTile.createWorld !== "function") {
    return { status: "FAIL", checked, errors: [failure("NESTED_TRANSPORT_RUNTIME_CONTRACT_MISSING", "Kit materialization and MorphTile import contracts are required.")], receipt: null };
  }

  const pathA = "mt_shell/mt_inner";
  const pathB = "mt_other_shell/mt_inner";
  const first = interfaceCandidate(Interface, pathA);
  const second = interfaceCandidate(Interface, pathB);
  if (first.status !== "CANDIDATE" || second.status !== "CANDIDATE") {
    errors.push(failure("INTERFACE_NESTED_CANDIDATE_MISSING", "Exact Interface head did not produce both nested view candidates.", { first_status: first.status, second_status: second.status }));
  }
  if (first.candidate && first.candidate.schema !== "morphtile.view-operation/v0.5") {
    errors.push(failure("INTERFACE_NESTED_SCHEMA_DRIFT", "Expected the tested Interface v0.5 nested view-operation contract.", { observed_schema: first.candidate.schema || null }));
  }
  checked.push("interface-nested-candidate-generation");

  const unbound = Assembly.run({
    envelope_version: "0.1",
    request_id: "verification-nested-unbound",
    goal: "Do not infer a nested parent from leaf equality",
    intent: { id: "mt_inner", name: "Nested target" },
    inputs: [uiEligibility(), first],
    provenance: { caller: "axm.morphtile.machine.verification" }
  });
  if (unbound.status !== "HOLD" || !holdCodes(unbound).includes("HOLD_VIEW_OPERATION_TARGET_PATH_UNBOUND")) {
    errors.push(failure("ASSEMBLY_NESTED_PARENT_INFERRED", "Assembly did not fail closed when nested Interface matter lacked explicit parent-path binding.", { observed_status: unbound.status || null, observed_holds: holdCodes(unbound) }));
  }
  checked.push("nested-parent-no-inference");

  const boundA = assembleBound(Assembly.run, first, pathA, "verification-nested-bound-a");
  const boundB = assembleBound(Assembly.run, second, pathB, "verification-nested-bound-b");
  for (const [label, out, expectedPath] of [["a", boundA, pathA], ["b", boundB, pathB]]) {
    if (out.status !== "CANDIDATE") {
      errors.push(failure("ASSEMBLY_NESTED_BOUND_REJECTED", "Assembly rejected an exactly bound nested Interface candidate.", { label, expected_path: expectedPath, observed_status: out.status || null, observed_holds: holdCodes(out) }));
      continue;
    }
    const binding = out.target_binding;
    if (!binding || binding.id !== "mt_inner" || binding.path !== expectedPath) {
      errors.push(failure("ASSEMBLY_TARGET_BINDING_PROVENANCE_LOST", "Assembly did not preserve exact local-id/canonical-path target provenance.", { label, expected_path: expectedPath, observed_binding: binding || null }));
    }
  }
  checked.push("exact-nested-path-binding");

  const mismatch = assembleBound(Assembly.run, first, pathB, "verification-nested-cross-parent-mismatch");
  if (mismatch.status !== "HOLD" || !holdCodes(mismatch).includes("HOLD_VIEW_OPERATION_TARGET_MISMATCH")) {
    errors.push(failure("ASSEMBLY_CROSS_PARENT_LEAF_COLLISION_ACCEPTED", "Assembly accepted same-leaf Interface matter from a different parent path.", { observed_status: mismatch.status || null, observed_holds: holdCodes(mismatch) }));
  }
  checked.push("same-leaf-different-parent-rejection");

  if (boundA.status === "CANDIDATE" && boundB.status === "CANDIDATE") {
    const hashA = boundA.closure_hash && boundA.closure_hash.value || null;
    const hashB = boundB.closure_hash && boundB.closure_hash.value || null;
    if (!hashA || hashA !== hashB) {
      errors.push(failure("ASSEMBLY_PORTABLE_IDENTITY_SCOPE_DRIFT", "Identical portable tile matter at different source paths should keep portable closure identity path-neutral while target_binding preserves addressing provenance separately.", { hash_a: hashA, hash_b: hashB }));
    }
    if (JSON.stringify(boundA.target_binding) === JSON.stringify(boundB.target_binding)) {
      errors.push(failure("ASSEMBLY_TARGET_PROVENANCE_COLLAPSED", "Distinct canonical source paths collapsed to the same target_binding metadata."));
    }
  }
  checked.push("portable-identity-vs-address-provenance-separation");

  let importStatus = null;
  if (boundA.status === "CANDIDATE") {
    const kitResult = materializeKit(boundA, MorphTile, { name: "Verification nested Interface transport" });
    if (!kitResult || kitResult.status !== "CANDIDATE" || !kitResult.kit) {
      errors.push(failure("ASSEMBLY_NESTED_KIT_MATERIALIZATION_FAILED", "Exactly bound nested Interface matter did not materialize to a portable kit.", { observed_status: kitResult && kitResult.status || null }));
    } else {
      const receiver = MorphTile.createWorld("Verification nested Interface receiver");
      const imported = MorphTile.importKit(receiver, JSON.parse(JSON.stringify(kitResult.kit)));
      importStatus = imported && imported.status || null;
      if (importStatus !== "READY") {
        errors.push(failure("ASSEMBLY_NESTED_KIT_IMPORT_FAILED", "Fresh MorphTile receiver did not accept the materialized nested Interface kit.", { observed_status: importStatus }));
      }
    }
  }
  checked.push("fresh-receiver-kit-transport");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.nested-interface-assembly-conformance/v0.1",
      interface_commit: interfaceCommit,
      assembly_commit: assemblyCommit,
      morphtile_commit: morphTileCommit,
      unbound_status: unbound.status || null,
      mismatch_status: mismatch.status || null,
      bound_a_status: boundA.status || null,
      bound_b_status: boundB.status || null,
      bound_a_target: boundA.target_binding || null,
      bound_b_target: boundB.target_binding || null,
      closure_hash_equal: Boolean(boundA.closure_hash && boundB.closure_hash && boundA.closure_hash.value === boundB.closure_hash.value),
      fresh_import_status: importStatus
    }
  };
}

module.exports = { verifyNestedInterfaceAssemblyTransport };
