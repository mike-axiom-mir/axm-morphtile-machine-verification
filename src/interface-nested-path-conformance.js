"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function firstHoldCode(result) {
  return result && Array.isArray(result.holds) && result.holds[0] ? result.holds[0].code || null : null;
}

function runWithoutMutation(machine, request) {
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

function nestedRequest(requestId, nestedPath) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Independently verify nested MorphTile interface path preservation",
    intent: {
      tile_path: nestedPath,
      title: "Nested verification panel",
      text: "Nested verification path proof",
      placement: {
        mode: "tile",
        anchor: nestedPath,
        user_adjustable: false
      }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function createNestedWorld(MorphTile) {
  const world = MorphTile.seedWorld();
  const inner = MorphTile.createTile({
    id: "mt_inner",
    name: "Nested verification target",
    form_hints: ["ui_panel"]
  });
  const shell = MorphTile.createTile({
    id: "mt_shell",
    name: "Nested verification shell",
    form_hints: ["ui_panel"]
  });
  shell.facets.mesh = { type: "interior", source: null, data: {} };
  shell.interior = { tiles: { mt_inner: inner }, edges: {}, ports: [] };
  shell.provenance.sha256 = MorphTile.contentHash(shell);
  world.tiles.mt_shell = shell;
  return world;
}

function verifyInterfaceNestedPaths(interfaceMachine, MorphTile, options = {}) {
  const expectedVersion = options.expectedVersion || "0.5.1";
  const revisions = options.revisions || {};
  const nestedPath = "mt_shell/mt_inner";
  const checked = [];
  const errors = [];

  if (!interfaceMachine || typeof interfaceMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("INTERFACE_MACHINE_CONTRACT_MISSING", "Interface verification requires machine.run.")], receipt: null };
  }
  const coreFns = ["seedWorld", "createTile", "contentHash", "validateWorld", "createWorkspace", "structHash", "cloneBody", "editCandidate", "planMerge", "commitPlan", "resolveTile", "resolvePresentation", "compilePanel", "vnodeToHTML", "rollback"];
  if (!MorphTile || coreFns.some((name) => typeof MorphTile[name] !== "function")) {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_RUNTIME_CONTRACT_MISSING", "Nested-path verification requires the real MorphTile world/workspace/presentation runtime.")], receipt: null };
  }

  const observedVersion = interfaceMachine.MACHINE && interfaceMachine.MACHINE.version || null;
  if (observedVersion !== expectedVersion) {
    errors.push(failure("INTERFACE_MACHINE_VERSION_MISMATCH", "Pinned Interface version differs from the verification target.", { expected: expectedVersion, observed: observedVersion }));
  }
  checked.push("machine-version");

  const request = nestedRequest("verification-interface-nested-path", nestedPath);
  const observed = runWithoutMutation(interfaceMachine, clone(request));
  if (observed.threw || !observed.output || observed.output.status !== "CANDIDATE") {
    errors.push(failure("VALID_NESTED_INTERFACE_PATH_REJECTED", "Known-good nested target + anchor did not produce an Interface candidate.", {
      threw: observed.threw,
      observed_status: observed.output && observed.output.status || null,
      observed_code: firstHoldCode(observed.output)
    }));
  }
  if (observed.mutated) errors.push(failure("NESTED_INTERFACE_REQUEST_MUTATED", "Interface Machine mutated the caller nested-path request."));

  const candidate = observed.output && observed.output.candidate || null;
  const operations = candidate && Array.isArray(candidate.operations) ? candidate.operations : [];
  if (!candidate || candidate.schema !== "morphtile.interface-operations/v0.5" || operations.length !== 2) {
    errors.push(failure("NESTED_INTERFACE_CANDIDATE_SHAPE_INVALID", "Nested target + placement must remain the existing two-operation v0.5 Interface contract.", {
      observed_schema: candidate && candidate.schema || null,
      operation_count: operations.length
    }));
  } else {
    const view = operations[0];
    const presentation = operations[1];
    if (!view || view.op !== "view.set" || view.id !== nestedPath) {
      errors.push(failure("NESTED_VIEW_PATH_REWRITTEN", "view.set must preserve the exact authored canonical nested path.", { observed: view && view.id || null }));
    }
    if (!presentation || presentation.op !== "presentation.set" || presentation.id !== nestedPath || !presentation.presentation || presentation.presentation.anchor !== nestedPath) {
      errors.push(failure("NESTED_PRESENTATION_PATH_REWRITTEN", "presentation.set target and tile anchor must preserve the exact authored canonical nested path.", {
        observed_id: presentation && presentation.id || null,
        observed_anchor: presentation && presentation.presentation && presentation.presentation.anchor || null
      }));
    }
  }
  checked.push("candidate-path-identity-and-request-immutability");

  let commitReceipt = null;
  let rollbackExact = false;
  let resolvedAnchor = null;
  let panelContainsProof = false;
  if (operations.length === 2) {
    try {
      const world = createNestedWorld(MorphTile);
      const valid = MorphTile.validateWorld(world);
      if (!valid || valid.ok !== true) {
        errors.push(failure("NESTED_WORLD_INVALID", "Verification fixture itself was rejected by MorphTile.", { errors: valid && valid.errors || null }));
      } else {
        const ws = MorphTile.createWorkspace(world);
        const before = MorphTile.structHash(ws.live);
        const draft = MorphTile.cloneBody(ws, "verification nested interface", "ai:verification-machine");
        for (const operation of operations) {
          const edited = MorphTile.editCandidate(ws, draft, operation);
          if (!edited || edited.ok !== true) {
            errors.push(failure("NESTED_INTERFACE_EDIT_REJECTED", "MorphTile rejected an untouched Interface nested-path operation.", { operation: operation.op, error: edited && edited.error || null }));
            break;
          }
        }
        if (!errors.some((item) => item.code === "NESTED_INTERFACE_EDIT_REJECTED")) {
          const plan = MorphTile.planMerge(ws, [draft]);
          if (!plan || plan.status !== "READY") {
            errors.push(failure("NESTED_INTERFACE_PLAN_NOT_READY", "Untouched nested-path candidate did not reach READY merge state.", { observed_status: plan && plan.status || null }));
          } else {
            const committed = MorphTile.commitPlan(ws, plan.id, "ai:verification-machine");
            if (!committed || committed.ok !== true) {
              errors.push(failure("NESTED_INTERFACE_COMMIT_FAILED", "Untouched nested-path candidate failed real MorphTile commit."));
            } else {
              commitReceipt = committed.receipt;
              const target = MorphTile.resolveTile(ws.live, nestedPath);
              if (!target || !target.view || target.view.title !== "Nested verification panel" || !target.presentation || target.presentation.anchor !== nestedPath) {
                errors.push(failure("NESTED_INTERFACE_STATE_NOT_RETAINED", "Committed nested tile did not retain the authored view/presentation path semantics."));
              }
              const resolved = MorphTile.resolvePresentation(ws.live, nestedPath);
              resolvedAnchor = resolved && resolved.anchor_frame && resolved.anchor_frame.anchor || null;
              if (!resolved || resolved.status !== "READY" || resolvedAnchor !== nestedPath) {
                errors.push(failure("NESTED_PRESENTATION_NOT_RESOLVED", "Real MorphTile presentation resolution did not retain the nested anchor.", { observed_status: resolved && resolved.status || null, observed_anchor: resolvedAnchor }));
              }
              const html = MorphTile.vnodeToHTML(MorphTile.compilePanel(ws.live, { open: { mt_shell: true } }).root);
              panelContainsProof = typeof html === "string" && html.includes("Nested verification path proof") && html.includes("tile anchor " + nestedPath);
              if (!panelContainsProof) {
                errors.push(failure("NESTED_INTERFACE_PANEL_NOT_COMPILED", "Real panel compilation did not expose both nested interface text and anchor identity."));
              }
              const rolled = MorphTile.rollback(ws, committed.receipt.rollback_token);
              rollbackExact = !!(rolled && rolled.ok && rolled.exact && MorphTile.structHash(ws.live) === before);
              if (!rollbackExact) errors.push(failure("NESTED_INTERFACE_ROLLBACK_NOT_EXACT", "Nested Interface commit failed exact rollback to the pre-commit world."));
            }
          }
        }
      }
    } catch (error) {
      errors.push(failure("NESTED_INTERFACE_RUNTIME_EXCEPTION", "Real MorphTile nested-path verification threw.", { name: error && error.name || "Error", message: error && error.message || String(error) }));
    }
  }
  checked.push("real-runtime-commit-resolve-panel-rollback");

  const invalidCases = [
    { id: "leading-slash", path: "/mt_shell/mt_inner", expected: "HOLD_INTERFACE_TILE_PATH_INVALID" },
    { id: "trailing-slash", path: "mt_shell/mt_inner/", expected: "HOLD_INTERFACE_TILE_PATH_INVALID" },
    { id: "empty-segment", path: "mt_shell//mt_inner", expected: "HOLD_INTERFACE_TILE_PATH_INVALID" },
    { id: "traversal-segment", path: "mt_shell/../mt_inner", expected: "HOLD_INTERFACE_TILE_PATH_INVALID" },
    { id: "whitespace", path: "mt_shell/mt inner", expected: "HOLD_INTERFACE_TILE_PATH_INVALID" }
  ];
  const invalidObserved = [];
  for (const item of invalidCases) {
    const bad = nestedRequest("verification-interface-path-" + item.id, nestedPath);
    bad.intent.tile_path = item.path;
    const result = runWithoutMutation(interfaceMachine, bad);
    const status = result.output && result.output.status || null;
    const code = firstHoldCode(result.output);
    invalidObserved.push({ id: item.id, status, code, mutated: result.mutated });
    if (result.threw || status !== "HOLD" || code !== item.expected) {
      errors.push(failure("INTERFACE_PATH_FAIL_CLOSED_BROKEN", "Malformed nested target path did not fail closed with the expected identity.", {
        case: item.id,
        expected_code: item.expected,
        observed_status: status,
        observed_code: code,
        threw: result.threw
      }));
    }
    if (result.mutated) errors.push(failure("INTERFACE_INVALID_PATH_REQUEST_MUTATED", "Malformed nested-path case mutated the caller request.", { case: item.id }));
  }

  const badAnchor = nestedRequest("verification-interface-anchor-empty-segment", nestedPath);
  badAnchor.intent.placement.anchor = "mt_shell//mt_inner";
  const anchorObserved = runWithoutMutation(interfaceMachine, badAnchor);
  const anchorStatus = anchorObserved.output && anchorObserved.output.status || null;
  const anchorCode = firstHoldCode(anchorObserved.output);
  if (anchorObserved.threw || anchorStatus !== "HOLD" || anchorCode !== "HOLD_INVALID_PRESENTATION_PLACEMENT") {
    errors.push(failure("INTERFACE_ANCHOR_FAIL_CLOSED_BROKEN", "Malformed nested presentation anchor did not fail closed at the placement boundary.", {
      observed_status: anchorStatus,
      observed_code: anchorCode,
      threw: anchorObserved.threw
    }));
  }
  if (anchorObserved.mutated) errors.push(failure("INTERFACE_INVALID_ANCHOR_REQUEST_MUTATED", "Malformed presentation-anchor case mutated the caller request."));
  checked.push("nested-path-and-anchor-fail-closed-boundary");

  const visualClaims = observed.output && Array.isArray(observed.output.evidence)
    ? observed.output.evidence.filter((entry) => entry && entry.kind === "VISUAL" && entry.status === "PASS")
    : [];
  if (visualClaims.length) errors.push(failure("INTERFACE_VISUAL_BOUNDARY_WIDENED", "Structural/runtime nested-path evidence must not silently become visual-quality acceptance."));
  checked.push("visual-evidence-boundary");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-nested-path-conformance-receipt/v0.1",
      revisions,
      expected_machine_version: expectedVersion,
      observed_machine_version: observedVersion,
      candidate_status: observed.output && observed.output.status || null,
      nested_path: nestedPath,
      commit_units: commitReceipt && Array.isArray(commitReceipt.units) ? commitReceipt.units.map((unit) => unit.key).sort() : [],
      resolved_anchor: resolvedAnchor,
      panel_contains_nested_proof: panelContainsProof,
      rollback_exact: rollbackExact,
      invalid_cases: invalidObserved,
      invalid_anchor: { status: anchorStatus, code: anchorCode, mutated: anchorObserved.mutated },
      visual_quality: "NOT_TESTED"
    }
  };
}

module.exports = { verifyInterfaceNestedPaths };
