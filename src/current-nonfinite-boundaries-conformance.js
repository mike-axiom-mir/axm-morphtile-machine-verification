"use strict";

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function allFinite(values) {
  return Array.isArray(values) && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function verifyCoreMeshFiniteBoundary(MorphTile, options = {}) {
  const coreCommit = options.coreCommit || null;
  const errors = [];
  const checked = [];
  const probes = [];

  if (!coreCommit) {
    return { status: "FAIL", checked, errors: [failure("CORE_REVISION_PIN_MISSING", "Exact MorphTile core revision is required.")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.createTile !== "function" || typeof MorphTile.validateTile !== "function" || typeof MorphTile.compileMesh !== "function") {
    return { status: "FAIL", checked, errors: [failure("CORE_MESH_CONTRACT_MISSING", "Mesh verification requires createTile(), validateTile(), and compileMesh().")], receipt: null };
  }

  function primitiveTile(id, data) {
    return MorphTile.createTile({
      id,
      name: id,
      facets: { mesh: { type: "primitive", source: null, data } }
    });
  }

  function expectFailClosed(name, tile, expectedHold = "HOLD_MESH_NONFINITE_VALUE") {
    let valid = null;
    let mesh = null;
    let threw = null;
    try {
      valid = MorphTile.validateTile(tile);
      mesh = MorphTile.compileMesh(tile);
    } catch (error) {
      threw = error && error.message || String(error);
    }
    const observed = {
      name,
      authored_valid: !!(valid && valid.ok),
      hold: mesh && mesh.hold || null,
      positions: mesh && Array.isArray(mesh.P) ? mesh.P.length : null,
      triangles: mesh && Array.isArray(mesh.T) ? mesh.T.length : null,
      colors: mesh && Array.isArray(mesh.K) ? mesh.K.length : null,
      threw
    };
    probes.push(observed);

    if (threw) {
      errors.push(failure("CORE_MESH_NONFINITE_THREW", `${name} threw instead of exposing a deterministic HOLD.`, { probe: observed }));
      return;
    }
    if (!observed.authored_valid) {
      errors.push(failure("CORE_MESH_AUTHORED_CONTROL_REJECTED", `${name} no longer reaches the derived-geometry boundary with finite authored inputs.`, { probe: observed }));
    }
    if (observed.hold !== expectedHold) {
      errors.push(failure("CORE_MESH_NONFINITE_HOLD_MISSING", `${name} did not fail closed with the expected derived-geometry HOLD.`, { expected_hold: expectedHold, probe: observed }));
    }
    if (observed.positions !== 0 || observed.triangles !== 0 || observed.colors !== 0) {
      errors.push(failure("CORE_MESH_NONFINITE_PARTIAL_LEAK", `${name} exposed partial mesh arrays after derived geometry became non-finite.`, { probe: observed }));
    }
  }

  expectFailClosed(
    "direct-box-overflow",
    primitiveTile("mt_verify_mesh_direct", { shape: "box", size: [Number.MAX_VALUE, 1, 1], pos: [Number.MAX_VALUE, 0, 0] })
  );
  checked.push("direct-primitive-derived-overflow-fails-closed");

  expectFailClosed(
    "multi-part-no-partial-leak",
    primitiveTile("mt_verify_mesh_parts", {
      parts: [
        { shape: "plane", size: [1, 1, 1], pos: [0, 0, 0] },
        { shape: "box", size: [Number.MAX_VALUE, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
      ]
    })
  );
  checked.push("multi-part-derived-overflow-clears-earlier-geometry");

  const generated = MorphTile.createTile({
    id: "mt_verify_mesh_generated",
    name: "generated tower overflow",
    facets: {
      mesh: {
        type: "generated",
        source: null,
        data: { generator: "tower", levels: 2, radius: Number.MAX_VALUE, level_height: 1, roof_height: 1 }
      }
    }
  });
  expectFailClosed("generated-tower-overflow", generated);
  checked.push("shared-boundary-covers-generated-geometry");

  let finiteValid = null;
  let finiteMesh = null;
  let finiteThrew = null;
  try {
    const finiteTile = primitiveTile("mt_verify_mesh_finite", {
      shape: "box",
      size: [1e150, 2e150, 3e150],
      pos: [1e150, -1e150, 1e150]
    });
    finiteValid = MorphTile.validateTile(finiteTile);
    finiteMesh = MorphTile.compileMesh(finiteTile);
  } catch (error) {
    finiteThrew = error && error.message || String(error);
  }
  const finiteControl = {
    authored_valid: !!(finiteValid && finiteValid.ok),
    hold: finiteMesh && finiteMesh.hold || null,
    positions: finiteMesh && Array.isArray(finiteMesh.P) ? finiteMesh.P.length : null,
    all_positions_finite: !!(finiteMesh && allFinite(finiteMesh.P)),
    threw: finiteThrew
  };
  if (finiteThrew || !finiteControl.authored_valid || finiteControl.hold !== null || !finiteControl.positions || !finiteControl.all_positions_finite) {
    errors.push(failure("CORE_MESH_LARGE_FINITE_CONTROL_REJECTED", "The derived-finiteness repair widened into rejection of a large but representable finite control.", { control: finiteControl }));
  }
  checked.push("large-finite-control-remains-representable");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.core-mesh-finite-conformance/v0.1",
      core_commit: coreCommit,
      probes,
      finite_control: finiteControl
    }
  };
}

function collectNonFiniteNumbers(value, path = "$") {
  const found = [];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) found.push(path);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...collectNonFiniteNumbers(item, `${path}[${index}]`)));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) found.push(...collectNonFiniteNumbers(item, `${path}.${key}`));
  }
  return found;
}

function verifySurfacePortableFiniteBoundary(surface, options = {}) {
  const surfaceCommit = options.surfaceCommit || null;
  const errors = [];
  const checked = [];
  const outcomes = [];

  if (!surfaceCommit) {
    return { status: "FAIL", checked, errors: [failure("SURFACE_REVISION_PIN_MISSING", "Exact Surface revision is required.")], receipt: null };
  }
  if (!surface || typeof surface.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_RUN_CONTRACT_MISSING", "Surface verification requires run().")], receipt: null };
  }

  function gradientRequest(from, to, requestId) {
    return {
      envelope_version: "0.1",
      request_id: requestId,
      goal: "Preserve finite portable surface meaning",
      intent: {
        base_color: [0.2, 0.25, 0.3],
        surface_rule: {
          kind: "axis_gradient",
          axis: "y",
          from,
          to,
          start_color: [0.1, 0.2, 0.3],
          end_color: [0.9, 0.8, 0.7]
        }
      },
      provenance: { caller: "verification-machine" }
    };
  }

  const overflowRequest = gradientRequest(-Number.MAX_VALUE, Number.MAX_VALUE, "verify-surface-gradient-derived-overflow");
  const overflowBefore = JSON.stringify(overflowRequest);
  const overflowOut = surface.run(overflowRequest);
  outcomes.push({ name: "gradient-derived-overflow", status: overflowOut.status, hold: overflowOut.holds && overflowOut.holds[0] && overflowOut.holds[0].code || null });
  if (JSON.stringify(overflowRequest) !== overflowBefore) {
    errors.push(failure("SURFACE_GRADIENT_OVERFLOW_MUTATED_REQUEST", "Rejecting non-representable gradient arithmetic mutated the caller request."));
  }
  if (overflowOut.status !== "HOLD" || !overflowOut.holds || overflowOut.holds[0].code !== "HOLD_SURFACE_RULE_RANGE_INVALID" || overflowOut.candidate !== null) {
    errors.push(failure("SURFACE_GRADIENT_DERIVED_OVERFLOW_ACCEPTED", "Finite authored gradient endpoints whose derived span is non-finite did not fail closed.", { observed: outcomes[outcomes.length - 1] }));
  }
  checked.push("gradient-derived-span-finite-before-portable-emission");

  const finiteRequest = gradientRequest(-Number.MAX_VALUE / 4, Number.MAX_VALUE / 4, "verify-surface-gradient-large-finite");
  const finiteOut = surface.run(finiteRequest);
  const finiteNonFinitePaths = collectNonFiniteNumbers(finiteOut);
  outcomes.push({ name: "gradient-large-finite-control", status: finiteOut.status, nonfinite_paths: finiteNonFinitePaths });
  if (finiteOut.status !== "CANDIDATE" || finiteNonFinitePaths.length) {
    errors.push(failure("SURFACE_GRADIENT_LARGE_FINITE_CONTROL_REJECTED", "A very large but representable gradient span did not remain a finite candidate.", { observed: outcomes[outcomes.length - 1] }));
  }
  if (!Array.isArray(finiteOut.evidence) || !finiteOut.evidence.some((entry) => entry.kind === "VISUAL" && entry.status === "NOT_TESTED")) {
    errors.push(failure("SURFACE_VISUAL_BOUNDARY_WIDENED", "Structural non-finite repair must not silently become visual-quality evidence."));
  }
  checked.push("large-finite-gradient-control-and-visual-boundary");

  function paintRequest(expression, requestId, vars = {}) {
    return {
      envelope_version: "0.1",
      request_id: requestId,
      goal: "Preserve caller paint without JSON numeric rewriting",
      intent: {
        base_color: [0.2, 0.25, 0.3],
        paint: { color: [expression, 0.55, 0.2], vars }
      },
      provenance: { caller: "verification-machine" }
    };
  }

  const infinityRequest = paintRequest(["+", 0.2, Infinity], "verify-surface-paint-infinity");
  const infinityOut = surface.run(infinityRequest);
  outcomes.push({ name: "paint-nested-infinity", status: infinityOut.status, hold: infinityOut.holds && infinityOut.holds[0] && infinityOut.holds[0].code || null });
  if (infinityOut.status !== "HOLD" || !infinityOut.holds || infinityOut.holds[0].code !== "HOLD_SURFACE_PAINT_NONFINITE_VALUE" || infinityOut.candidate !== null) {
    errors.push(failure("SURFACE_RAW_PAINT_INFINITY_ACCEPTED", "Nested Infinity in caller paint was accepted or rewritten instead of failing closed.", { observed: outcomes[outcomes.length - 1] }));
  }
  if (infinityRequest.intent.paint.color[0][2] !== Infinity) {
    errors.push(failure("SURFACE_RAW_PAINT_INFINITY_MUTATED", "Rejecting Infinity mutated the caller request."));
  }

  const nanRequest = paintRequest(["*", NaN, ["var", "ny"]], "verify-surface-paint-nan");
  const nanOut = surface.run(nanRequest);
  outcomes.push({ name: "paint-nested-nan", status: nanOut.status, hold: nanOut.holds && nanOut.holds[0] && nanOut.holds[0].code || null });
  if (nanOut.status !== "HOLD" || !nanOut.holds || nanOut.holds[0].code !== "HOLD_SURFACE_PAINT_NONFINITE_VALUE" || nanOut.candidate !== null) {
    errors.push(failure("SURFACE_RAW_PAINT_NAN_ACCEPTED", "Nested NaN in caller paint was accepted or rewritten instead of failing closed.", { observed: outcomes[outcomes.length - 1] }));
  }
  if (!Number.isNaN(nanRequest.intent.paint.color[0][1])) {
    errors.push(failure("SURFACE_RAW_PAINT_NAN_MUTATED", "Rejecting NaN mutated the caller request."));
  }
  checked.push("caller-paint-nonfinite-rejected-before-json-clone");

  const varsRequest = paintRequest(["var", "gain"], "verify-surface-paint-var-infinity", { gain: Infinity });
  const varsOut = surface.run(varsRequest);
  outcomes.push({ name: "paint-var-infinity", status: varsOut.status, hold: varsOut.holds && varsOut.holds[0] && varsOut.holds[0].code || null });
  if (varsOut.status !== "HOLD" || !varsOut.holds || varsOut.holds[0].code !== "HOLD_SURFACE_PAINT_VARS_INVALID" || varsRequest.intent.paint.vars.gain !== Infinity) {
    errors.push(failure("SURFACE_PAINT_VAR_NONFINITE_BOUNDARY_FAILED", "Non-finite paint vars must fail closed without rewriting caller state.", { observed: outcomes[outcomes.length - 1] }));
  }
  checked.push("paint-vars-retain-existing-finite-boundary");

  const finiteExpression = ["+", 0.2, ["*", 0.3, ["var", "ny"]]];
  const rawFiniteRequest = paintRequest(finiteExpression, "verify-surface-paint-finite");
  const rawFiniteBefore = JSON.stringify(rawFiniteRequest.intent.paint);
  const rawFiniteOut = surface.run(rawFiniteRequest);
  outcomes.push({ name: "paint-finite-control", status: rawFiniteOut.status });
  if (rawFiniteOut.status !== "CANDIDATE" || JSON.stringify(rawFiniteOut.candidate && rawFiniteOut.candidate.value && rawFiniteOut.candidate.value.data && rawFiniteOut.candidate.value.data.paint) !== rawFiniteBefore) {
    errors.push(failure("SURFACE_RAW_PAINT_FINITE_CONTROL_DRIFT", "Finite caller paint did not survive unchanged through the producer boundary.", { observed: outcomes[outcomes.length - 1] }));
  }
  if (!Array.isArray(rawFiniteOut.warnings) || !rawFiniteOut.warnings.some((warning) => warning.code === "CALLER_PAINT_RUNTIME_VALIDATION_REQUIRED")) {
    errors.push(failure("SURFACE_RAW_PAINT_RUNTIME_OWNERSHIP_WARNING_MISSING", "Finite raw paint must retain the warning that runtime semantics remain receiver-owned."));
  }
  checked.push("finite-caller-paint-preserved-runtime-owned");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-portable-finite-conformance/v0.1",
      surface_commit: surfaceCommit,
      outcomes,
      visual_quality: "NOT_TESTED"
    }
  };
}

module.exports = {
  verifyCoreMeshFiniteBoundary,
  verifySurfacePortableFiniteBoundary,
  collectNonFiniteNumbers
};
