"use strict";

const { verifyKitCandidate } = require("./kit-conformance");
const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify bounded Form composition and recursive Assembly definition closure",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstHold(result, code) {
  return result && Array.isArray(result.holds)
    ? result.holds.find((item) => item && (!code || item.code === code)) || null
    : null;
}

function planeDefinition(id, createdBy = "verification") {
  return {
    id,
    name: id,
    created_by: createdBy,
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: {
            generator: "recipe",
            vars: {},
            parts: [{ shape: "plane", size: [1, 1, 1] }]
          }
        }
      }
    }
  };
}

function transitivePanelDefinition() {
  return {
    id: "panel",
    name: "Panel using beam",
    created_by: "verification",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: {
            generator: "recipe",
            vars: {},
            parts: [{ use: "beam" }]
          }
        }
      }
    }
  };
}

function verifyFormAssemblyClosure(options = {}) {
  const { form, assembly, materializeKit, runtime, revisions = {} } = options;
  const errors = [];
  const checked = [];

  const missing = [];
  if (!form || typeof form.run !== "function") missing.push("form.run");
  if (!assembly || typeof assembly.run !== "function") missing.push("assembly.run");
  if (typeof materializeKit !== "function") missing.push("assembly.materializeKit");
  for (const name of ["hashOf", "createTile", "validateTile", "compileMesh", "createWorld", "importKit"]) {
    if (!runtime || typeof runtime[name] !== "function") missing.push("runtime." + name);
  }
  if (missing.length) {
    return {
      status: "FAIL",
      checked,
      errors: [failure("FORM_ASSEMBLY_CLOSURE_CONTRACT_MISSING", "Pinned Form/Assembly/MorphTile entry points are required.", { missing })],
      receipt: null
    };
  }

  try {
    const composedRequest = request("verification-form-v08-compose", {
      name: "Verification nested closure form",
      compose: [
        { part: { shape: "plane", pos: [-4, 0, 0] } },
        { repeat: { count: 2, step: [2, 0, 0], instance: { use: "panel", pos: [-1, 0, 0] } } },
        { grid: { counts: [2, 1, 1], step: [3, 0, 0], instance: { use: "frame", pos: [3, 0, 0] } } }
      ]
    });
    const composedSnapshot = JSON.stringify(composedRequest);
    const first = form.run(composedRequest);
    const second = form.run(clone(composedRequest));

    if (JSON.stringify(composedRequest) !== composedSnapshot) {
      errors.push(failure("FORM_COMPOSE_REQUEST_MUTATED", "Form v0.8 mutated caller-owned compose intent."));
    }
    if (!first || first.status !== "CANDIDATE") {
      errors.push(failure("FORM_COMPOSE_NOT_CANDIDATE", "Pinned Form v0.8 did not produce the expected mixed direct/repeat/grid candidate.", {
        observed_status: first && first.status || null,
        observed_code: firstHold(first) && firstHold(first).code || null
      }));
    }
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      errors.push(failure("FORM_COMPOSE_NONDETERMINISTIC", "Repeated identical Form requests produced different envelopes."));
    }

    const parts = first && first.candidate && first.candidate.facets && first.candidate.facets.mesh && first.candidate.facets.mesh.data
      ? first.candidate.facets.mesh.data.parts
      : null;
    if (!Array.isArray(parts) || parts.length !== 3) {
      errors.push(failure("FORM_COMPOSE_COMPACTNESS_LOST", "Direct + repeat + grid composition must remain three compact recipe blocks.", { observed_parts: clone(parts) }));
    } else {
      const repeatRef = parts[1] && Array.isArray(parts[1].body) && parts[1].body[0] ? parts[1].body[0].use : null;
      const gridRef = parts[2] && Array.isArray(parts[2].body) && parts[2].body[0] && Array.isArray(parts[2].body[0].body)
        ? parts[2].body[0].body[0] && parts[2].body[0].body[0].use
        : null;
      if (repeatRef !== "panel" || gridRef !== "frame") {
        errors.push(failure("FORM_NESTED_DEFINITION_REFS_LOST", "Definition references inside repeat/grid bodies were not preserved exactly.", { repeat_ref: repeatRef, grid_ref: gridRef }));
      }
    }
    const definitionWarning = first && Array.isArray(first.warnings)
      ? first.warnings.filter((item) => item && item.code === "DEFINITION_RUNTIME_RESOLUTION_REQUIRED")
      : [];
    if (definitionWarning.length !== 1) {
      errors.push(failure("FORM_DEFINITION_WARNING_NOT_EXACT", "A definition-backed composed candidate must expose one deterministic runtime-resolution warning.", { observed_count: definitionWarning.length }));
    }
    checked.push("form-v08-deterministic-compact-composition");

    const edge64 = form.run(request("verification-form-v08-budget-64", {
      compose: [
        { repeat: { count: 32, step: [1, 0, 0], part: { shape: "plane" } } },
        { grid: { counts: [32, 1, 1], step: [1, 0, 0], part: { shape: "plane" } } }
      ]
    }));
    const over65 = form.run(request("verification-form-v08-budget-65", {
      compose: [
        { repeat: { count: 33, step: [1, 0, 0], part: { shape: "plane" } } },
        { grid: { counts: [32, 1, 1], step: [1, 0, 0], part: { shape: "plane" } } }
      ]
    }));
    if (!edge64 || edge64.status !== "CANDIDATE") {
      errors.push(failure("FORM_BUDGET_EXACT_EDGE_REJECTED", "Exactly 64 requested placements should remain inside the documented bounded composition budget.", { observed_status: edge64 && edge64.status || null, observed_code: firstHold(edge64) && firstHold(edge64).code || null }));
    }
    const overHold = firstHold(over65);
    if (!over65 || over65.status !== "HOLD" || !overHold || overHold.code !== "HOLD_FORM_COMPOSITION_INVALID") {
      errors.push(failure("FORM_BUDGET_OVERFLOW_NOT_HELD", "65 requested placements must fail closed with HOLD_FORM_COMPOSITION_INVALID.", { observed_status: over65 && over65.status || null, observed_code: overHold && overHold.code || null }));
    }
    checked.push("form-v08-exact-placement-budget-edge");

    const assemblyBase = {
      envelope_version: "0.1",
      goal: "independently verify recursive definition closure from current Form v0.8 nested recipe output",
      intent: { id: "mt_form_v08_closure", name: "Form v0.8 closure proof" },
      inputs: [clone(first)],
      provenance: { caller: "axm.morphtile.machine.verification" }
    };

    const directMissing = assembly.run({ ...clone(assemblyBase), request_id: "verification-assembly-direct-missing" });
    const directHold = firstHold(directMissing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE");
    const directMissingList = directHold && Array.isArray(directHold.missing) ? directHold.missing : [];
    if (!directMissing || directMissing.status !== "HOLD" || JSON.stringify(directMissingList) !== JSON.stringify(["frame", "panel"])) {
      errors.push(failure("ASSEMBLY_NESTED_DIRECT_REFS_NOT_CLOSED", "Assembly must discover definition refs nested inside Form repeat/grid bodies and HOLD both when absent.", {
        observed_status: directMissing && directMissing.status || null,
        observed_missing: clone(directMissingList),
        observed_required: clone(directMissing && directMissing.required_definitions || [])
      }));
    }

    const partialRequirements = {
      definitions: {
        frame: planeDefinition("frame"),
        panel: transitivePanelDefinition()
      }
    };
    const transitiveMissing = assembly.run({
      ...clone(assemblyBase),
      request_id: "verification-assembly-transitive-missing",
      world_requirements: clone(partialRequirements)
    });
    const transitiveHold = firstHold(transitiveMissing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE");
    const transitiveMissingList = transitiveHold && Array.isArray(transitiveHold.missing) ? transitiveHold.missing : [];
    const transitiveRequired = transitiveMissing && Array.isArray(transitiveMissing.required_definitions) ? transitiveMissing.required_definitions : [];
    if (!transitiveMissing || transitiveMissing.status !== "HOLD" || JSON.stringify(transitiveMissingList) !== JSON.stringify(["beam"])) {
      errors.push(failure("ASSEMBLY_TRANSITIVE_DEFINITION_NOT_CLOSED", "Assembly must continue through supplied definitions and HOLD a missing transitive definition.", {
        observed_status: transitiveMissing && transitiveMissing.status || null,
        observed_missing: clone(transitiveMissingList),
        observed_required: clone(transitiveRequired)
      }));
    }
    if (JSON.stringify(transitiveRequired) !== JSON.stringify(["beam", "frame", "panel"])) {
      errors.push(failure("ASSEMBLY_TRANSITIVE_REQUIRED_SET_INCOMPLETE", "Assembly required_definitions must expose the full sorted direct + transitive set.", { observed_required: clone(transitiveRequired) }));
    }
    checked.push("assembly-recursive-definition-closure-holds");

    const completeDefinitions = {
      beam: planeDefinition("beam"),
      frame: planeDefinition("frame"),
      panel: transitivePanelDefinition()
    };
    const completeRequest = {
      ...clone(assemblyBase),
      request_id: "verification-assembly-complete-closure",
      world_requirements: { definitions: clone(completeDefinitions) }
    };
    const completeSnapshot = JSON.stringify(completeRequest);
    const complete = assembly.run(completeRequest);
    if (JSON.stringify(completeRequest) !== completeSnapshot) {
      errors.push(failure("ASSEMBLY_COMPLETE_REQUEST_MUTATED", "Assembly mutated the caller-owned complete closure request."));
    }
    if (!complete || complete.status !== "CANDIDATE") {
      errors.push(failure("ASSEMBLY_COMPLETE_CLOSURE_NOT_CANDIDATE", "Complete recursive definition closure did not produce an Assembly candidate.", {
        observed_status: complete && complete.status || null,
        holds: clone(complete && complete.holds || [])
      }));
    }
    const required = complete && Array.isArray(complete.required_definitions) ? complete.required_definitions : [];
    if (JSON.stringify(required) !== JSON.stringify(["beam", "frame", "panel"])) {
      errors.push(failure("ASSEMBLY_COMPLETE_REQUIRED_SET_CHANGED", "Complete candidate must retain the exact sorted recursive definition set.", { observed_required: clone(required) }));
    }
    checked.push("assembly-complete-recursive-closure-candidate");

    let runtimeReceipt = null;
    if (complete && complete.status === "CANDIDATE") {
      const tile = runtime.createTile(clone(complete.candidate));
      const validation = runtime.validateTile(tile);
      if (!validation || !validation.ok) {
        errors.push(failure("FORM_ASSEMBLY_RUNTIME_TILE_INVALID", "Complete assembled Form candidate failed MorphTile validation.", { validation_errors: clone(validation && validation.errors || []) }));
      }
      const world = { defs: clone(completeDefinitions) };
      const mesh1 = runtime.compileMesh(tile, world);
      const mesh2 = runtime.compileMesh(tile, clone(world));
      if (JSON.stringify(mesh1) !== JSON.stringify(mesh2)) {
        errors.push(failure("FORM_ASSEMBLY_RUNTIME_NONDETERMINISTIC", "The same complete nested-definition matter compiled to different mesh receipts."));
      }
      if (!mesh1 || mesh1.hold) {
        errors.push(failure("FORM_ASSEMBLY_RUNTIME_HELD", "Complete nested-definition matter unexpectedly held during real MorphTile mesh compilation.", { observed_hold: mesh1 && mesh1.hold || null }));
      }
      if (!mesh1 || !Array.isArray(mesh1.T) || mesh1.T.length !== 10) {
        errors.push(failure("FORM_ASSEMBLY_RUNTIME_PLACEMENT_COUNT_DRIFT", "Five requested plane placements should compile to exactly ten triangles.", { observed_triangles: mesh1 && Array.isArray(mesh1.T) ? mesh1.T.length : null }));
      }
      runtimeReceipt = {
        tile_sha256: runtime.hashOf(tile),
        mesh_sha256: runtime.hashOf(mesh1),
        triangles: mesh1 && Array.isArray(mesh1.T) ? mesh1.T.length : null,
        hold: mesh1 && mesh1.hold || null
      };
    }
    checked.push("morphtile-runtime-nested-definition-determinism");

    let kitVerification = null;
    let kitStatus = null;
    let kitDefs = null;
    if (complete && complete.status === "CANDIDATE") {
      const kitResult = materializeKit(complete, runtime, { name: "Form v0.8 recursive closure kit" });
      kitStatus = kitResult && kitResult.status || null;
      if (!kitResult || kitResult.status !== "CANDIDATE") {
        errors.push(failure("FORM_ASSEMBLY_KIT_NOT_CANDIDATE", "Complete recursive closure did not materialize a portable kit.", { observed_status: kitStatus, holds: clone(kitResult && kitResult.holds || []) }));
      } else {
        kitDefs = Object.keys(kitResult.kit && kitResult.kit.defs || {}).sort();
        if (JSON.stringify(kitDefs) !== JSON.stringify(["beam", "frame", "panel"])) {
          errors.push(failure("FORM_ASSEMBLY_KIT_DEFINITION_CLOSURE_LOST", "Portable kit did not carry the exact recursive definition closure.", { observed_defs: clone(kitDefs) }));
        }
        kitVerification = verifyKitCandidate(kitResult, runtime);
        if (!kitVerification || kitVerification.status !== "PASS") {
          errors.push(failure("FORM_ASSEMBLY_KIT_CONFORMANCE_FAIL", "Portable kit failed independent hash/count/import/tamper verification.", { verifier_errors: clone(kitVerification && kitVerification.errors || []) }));
        }
      }
    }
    checked.push("portable-kit-recursive-definition-closure");

    const receipt = {
      schema: "axm.morphtile.form-assembly-closure-conformance-receipt/v0.1",
      revisions: clone(revisions),
      form_candidate_sha256: first && first.candidate ? runtime.hashOf(first.candidate) : null,
      exact_64_status: edge64 && edge64.status || null,
      over_65_status: over65 && over65.status || null,
      over_65_hold: overHold && overHold.code || null,
      direct_missing: clone(directMissingList),
      transitive_missing: clone(transitiveMissingList),
      complete_required_definitions: clone(required),
      assembly_status: complete && complete.status || null,
      assembly_closure_hash: complete && complete.closure_hash && complete.closure_hash.value || null,
      runtime: runtimeReceipt,
      kit_status: kitStatus,
      kit_defs: clone(kitDefs),
      kit_verification_status: kitVerification && kitVerification.status || null
    };

    return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
  } catch (error) {
    errors.push(failure("FORM_ASSEMBLY_CLOSURE_VERIFIER_EXCEPTION", "Independent Form/Assembly closure verifier threw before completing its receipt.", {
      observed_name: error && error.name || "Error",
      observed_message: error && error.message || String(error)
    }));
    return { status: "FAIL", checked, errors, receipt: null };
  }
}

module.exports = { verifyFormAssemblyClosure };
