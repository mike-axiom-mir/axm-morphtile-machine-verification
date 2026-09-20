"use strict";

const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function firstHold(result, code) {
  return !!(result && Array.isArray(result.holds) && result.holds.find((item) => item && item.code === code));
}

function verifyInterfaceAssemblyCompatibility(options = {}) {
  const { interfaceMachine, assemblyMachine, revisions = {} } = options;
  const errors = [];
  const checked = [];

  if (!interfaceMachine || typeof interfaceMachine.run !== "function" || !assemblyMachine || typeof assemblyMachine.run !== "function") {
    return {
      status: "FAIL",
      checked,
      errors: [failure("INTERFACE_ASSEMBLY_CONTRACT_MISSING", "Compatibility verification requires both pinned Interface and Assembly run entry points.")],
      receipt: null
    };
  }

  try {
    const interfaceRequest = {
      envelope_version: "0.1",
      request_id: "verification-interface-v05-assembly-compatibility",
      goal: "Create bounded nested relative interface matter for Assembly compatibility verification",
      intent: {
        tile_path: "mt_interface_compat",
        title: "Nested compatibility proof",
        elements: [
          {
            kind: "group",
            children: [
              {
                kind: "row",
                children: [
                  { kind: "control", binding: "levels", label: "Levels" },
                  { kind: "action", binding: "toggle", label: "Toggle" }
                ]
              }
            ]
          }
        ],
        bindings: {
          readouts: [],
          controls: ["levels"],
          actions: ["toggle"]
        }
      },
      provenance: { caller: "axm.morphtile.machine.verification" }
    };
    const before = JSON.stringify(interfaceRequest);
    const interfaceOut = interfaceMachine.run(interfaceRequest);
    if (JSON.stringify(interfaceRequest) !== before) {
      errors.push(failure("INTERFACE_COMPAT_REQUEST_MUTATED", "Interface Machine mutated the caller-owned compatibility request."));
    }
    if (!interfaceOut || interfaceOut.status !== "CANDIDATE") {
      errors.push(failure("INTERFACE_V05_NOT_CANDIDATE", "Pinned Interface v0.5 candidate could not be produced for compatibility verification.", {
        observed_status: interfaceOut && interfaceOut.status || null,
        observed_holds: clone(interfaceOut && interfaceOut.holds || [])
      }));
    }
    const schema = interfaceOut && interfaceOut.candidate && interfaceOut.candidate.schema || null;
    if (schema !== "morphtile.view-operation/v0.5") {
      errors.push(failure("INTERFACE_SCHEMA_UNEXPECTED", "Pinned Interface output no longer matches the v0.5 view-operation contract under verification.", { observed_schema: schema }));
    }
    const body = interfaceOut && interfaceOut.candidate && interfaceOut.candidate.operation && interfaceOut.candidate.operation.view
      ? interfaceOut.candidate.operation.view.body
      : null;
    const nested = Array.isArray(body) && body[0] && Array.isArray(body[0].group) && body[0].group[0] && Array.isArray(body[0].group[0].row)
      ? body[0].group[0].row
      : null;
    if (!nested || nested.length !== 2 || nested[0].control !== "levels" || nested[1].button !== "toggle") {
      errors.push(failure("INTERFACE_NESTED_STRUCTURE_NOT_PRESERVED", "Pinned Interface output did not preserve the expected group -> row -> control/action structure before Assembly.", { observed_body: clone(body) }));
    }
    checked.push("interface-v05-candidate-and-nested-structure");

    const baseCandidate = {
      schema: "morphtile.tile-spec/v0.4",
      id: "mt_interface_compat",
      name: "Interface compatibility base",
      form_hints: ["ui_panel"],
      facets: {}
    };
    const assemblyRequest = {
      envelope_version: "0.1",
      request_id: "verification-interface-v05-through-current-assembly",
      goal: "Prove whether current Assembly accepts the exact current Interface candidate contract",
      intent: { id: "mt_interface_compat", name: "Interface compatibility base" },
      inputs: [baseCandidate, interfaceOut],
      provenance: { caller: "axm.morphtile.machine.verification" }
    };
    const assemblyBefore = JSON.stringify(assemblyRequest);
    const assemblyOut = assemblyMachine.run(assemblyRequest);
    if (JSON.stringify(assemblyRequest) !== assemblyBefore) {
      errors.push(failure("INTERFACE_COMPAT_ASSEMBLY_REQUEST_MUTATED", "Assembly mutated the caller-owned Interface compatibility request."));
    }
    checked.push("current-assembly-interface-v05-acceptance");

    const expectedHoldObserved = firstHold(assemblyOut, "HOLD_UNASSEMBLABLE_CANDIDATE_SCHEMA");
    if (!assemblyOut || assemblyOut.status !== "CANDIDATE") {
      const observedSchemaHold = expectedHoldObserved
        ? (assemblyOut.holds || []).find((item) => item && item.code === "HOLD_UNASSEMBLABLE_CANDIDATE_SCHEMA")
        : null;
      errors.push(failure("INTERFACE_ASSEMBLY_SCHEMA_DRIFT", "Current Interface v0.5 output is not accepted by current Assembly, so sibling integration is not yet compatible.", {
        observed_status: assemblyOut && assemblyOut.status || null,
        observed_hold: clone(observedSchemaHold),
        interface_schema: schema
      }));
    }

    const receipt = {
      schema: "axm.morphtile.interface-assembly-conformance-receipt/v0.1",
      revisions: clone(revisions),
      interface_status: interfaceOut && interfaceOut.status || null,
      interface_schema: schema,
      nested_structure_present: !!nested,
      assembly_status: assemblyOut && assemblyOut.status || null,
      assembly_holds: clone(assemblyOut && assemblyOut.holds || []),
      expected_schema_hold_observed: expectedHoldObserved,
      compatibility: assemblyOut && assemblyOut.status === "CANDIDATE" ? "PASS" : "HOLD"
    };

    return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
  } catch (error) {
    errors.push(failure("INTERFACE_ASSEMBLY_VERIFIER_EXCEPTION", "Interface/Assembly compatibility verifier threw before completing its receipt.", {
      observed_name: error && error.name || "Error",
      observed_message: error && error.message || String(error)
    }));
    return { status: "FAIL", checked, errors, receipt: null };
  }
}

module.exports = { verifyInterfaceAssemblyCompatibility };
