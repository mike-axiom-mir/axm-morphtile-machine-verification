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

function sameColor(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
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

function compileCandidate(MorphTile, result, name) {
  if (!result || result.status !== "CANDIDATE" || !result.candidate || !result.candidate.value) {
    return { ok: false, reason: "NO_CANDIDATE", compiled: null, validity: null };
  }
  const tile = MorphTile.createTile({ name, facets: { material: result.candidate.value } });
  const validity = MorphTile.validateTile(tile);
  if (!validity || validity.ok !== true) {
    return { ok: false, reason: "INVALID_TILE", compiled: null, validity };
  }
  const compiled = MorphTile.compileMesh(tile);
  if (!compiled || compiled.hold) {
    return { ok: false, reason: "COMPILE_HOLD", compiled, validity };
  }
  return { ok: true, reason: null, compiled, validity };
}

function gradientRequest(id, withPattern = false) {
  const request = {
    envelope_version: "0.1",
    request_id: id,
    goal: "Independently verify mixed-direction axis gradient semantics and orthogonal pattern composition",
    intent: {
      base_color: [0.33, 0.44, 0.55],
      surface_rule: {
        kind: "axis_gradient",
        axis: "y",
        from: -0.25,
        to: 0.25,
        start_color: [0.9, 0.1, 0.8],
        end_color: [0.1, 0.8, 0.2]
      }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  if (withPattern) request.intent.pattern = { kind: "checker", scale: 0.4 };
  return request;
}

function verifySurfaceGradientComposition(surfaceMachine, MorphTile, options = {}) {
  const expectedVersion = options.expectedVersion || "0.5.0";
  const revisions = options.revisions || {};
  const errors = [];
  const checked = [];

  if (!surfaceMachine || typeof surfaceMachine.run !== "function") {
    return { status: "FAIL", checked, errors: [failure("SURFACE_MACHINE_CONTRACT_MISSING", "Surface verification requires machine.run.")], receipt: null };
  }
  if (!MorphTile || typeof MorphTile.createTile !== "function" || typeof MorphTile.validateTile !== "function" || typeof MorphTile.compileMesh !== "function") {
    return { status: "FAIL", checked, errors: [failure("MORPHTILE_RUNTIME_CONTRACT_MISSING", "Gradient verification requires createTile/validateTile/compileMesh.")], receipt: null };
  }

  const observedVersion = surfaceMachine.MACHINE && surfaceMachine.MACHINE.version || null;
  if (observedVersion !== expectedVersion) {
    errors.push(failure("SURFACE_MACHINE_VERSION_MISMATCH", "Pinned Surface version differs from the verification target.", { expected: expectedVersion, observed: observedVersion }));
  }
  checked.push("machine-version");

  const plainRequest = gradientRequest("verification-axis-gradient-mixed-channels", false);
  const plain = runWithoutMutation(surfaceMachine, clone(plainRequest));
  if (plain.threw || !plain.output || plain.output.status !== "CANDIDATE") {
    errors.push(failure("VALID_AXIS_GRADIENT_REJECTED", "Known-good mixed-direction axis gradient did not produce a candidate.", {
      threw: plain.threw,
      observed_status: plain.output && plain.output.status || null,
      observed_code: firstHoldCode(plain.output)
    }));
  }
  if (plain.mutated) errors.push(failure("GRADIENT_REQUEST_MUTATED", "Surface Machine mutated the caller gradient request."));

  const visualEvidence = plain.output && Array.isArray(plain.output.evidence)
    ? plain.output.evidence.find((entry) => entry && entry.kind === "VISUAL")
    : null;
  if (!visualEvidence || visualEvidence.status !== "NOT_TESTED") {
    errors.push(failure("VISUAL_BOUNDARY_WIDENED", "Structural/runtime gradient evidence must not silently become visual acceptance.", {
      observed_visual_status: visualEvidence && visualEvidence.status || null
    }));
  }
  checked.push("candidate-and-visual-evidence-boundary");

  const plainCompiled = compileCandidate(MorphTile, plain.output, "verification axis gradient plain");
  if (!plainCompiled.ok) {
    errors.push(failure("AXIS_GRADIENT_RUNTIME_REJECTED", "MorphTile did not accept/compile the Surface gradient candidate.", { reason: plainCompiled.reason }));
  }

  const start = plainRequest.intent.surface_rule.start_color;
  const end = plainRequest.intent.surface_rule.end_color;
  let uniqueColors = 0;
  let sawStart = false;
  let sawEnd = false;
  if (plainCompiled.ok) {
    const colors = plainCompiled.compiled.K;
    uniqueColors = new Set(colors.map((color) => JSON.stringify(color))).size;
    sawStart = colors.some((color) => sameColor(color, start));
    sawEnd = colors.some((color) => sameColor(color, end));
    if (uniqueColors < 3) errors.push(failure("GRADIENT_POSITION_VARIATION_MISSING", "Gradient did not produce multiple position-dependent colors.", { unique_colors: uniqueColors }));
    if (!sawStart || !sawEnd) errors.push(failure("GRADIENT_CLAMP_ENDPOINT_MISSING", "Narrow bounded gradient did not reach both exact clamp endpoints.", { saw_start: sawStart, saw_end: sawEnd }));
    for (let row = 0; row < colors.length; row++) {
      const color = colors[row];
      if (!Array.isArray(color) || color.length !== 3) {
        errors.push(failure("GRADIENT_RGB_SHAPE_INVALID", "Runtime gradient emitted a non-RGB paint value.", { index: row, value: color }));
        continue;
      }
      for (let channel = 0; channel < 3; channel++) {
        const low = Math.min(start[channel], end[channel]);
        const high = Math.max(start[channel], end[channel]);
        if (!Number.isFinite(color[channel]) || color[channel] < low || color[channel] > high) {
          errors.push(failure("GRADIENT_CHANNEL_ESCAPED_BOUNDS", "Mixed-direction interpolation escaped an authored per-channel interval.", {
            index: row,
            channel,
            value: color[channel],
            low,
            high
          }));
        }
      }
    }
  }
  checked.push("mixed-direction-interpolation-and-clamping");

  const patternedRequest = gradientRequest("verification-axis-gradient-checker-composition", true);
  const patterned = runWithoutMutation(surfaceMachine, clone(patternedRequest));
  if (patterned.threw || !patterned.output || patterned.output.status !== "CANDIDATE") {
    errors.push(failure("GRADIENT_PATTERN_COMPOSITION_REJECTED", "Axis gradient plus checker pattern did not produce a candidate.", {
      threw: patterned.threw,
      observed_status: patterned.output && patterned.output.status || null,
      observed_code: firstHoldCode(patterned.output)
    }));
  }
  if (patterned.mutated) errors.push(failure("GRADIENT_PATTERN_REQUEST_MUTATED", "Surface Machine mutated the caller gradient+pattern request."));

  const patternedCompiled = compileCandidate(MorphTile, patterned.output, "verification axis gradient checker");
  let attenuated = 0;
  let unchanged = 0;
  if (plainCompiled.ok && patternedCompiled.ok) {
    if (JSON.stringify(patternedCompiled.compiled.P) !== JSON.stringify(plainCompiled.compiled.P)) {
      errors.push(failure("PATTERN_REWROTE_GRADIENT_GEOMETRY", "Checker composition changed geometry positions."));
    }
    if (JSON.stringify(patternedCompiled.compiled.K) !== JSON.stringify(plainCompiled.compiled.K)) {
      errors.push(failure("PATTERN_REWROTE_GRADIENT_PAINT", "Checker composition changed gradient paint colors instead of remaining orthogonal."));
    }
    if (patternedCompiled.compiled.T.length !== plainCompiled.compiled.T.length) {
      errors.push(failure("PATTERN_TRIANGLE_RECEIPT_LENGTH_DRIFT", "Checker composition changed material triangle receipt length."));
    } else {
      for (let index = 0; index < plainCompiled.compiled.T.length; index++) {
        const base = plainCompiled.compiled.T[index];
        const observed = patternedCompiled.compiled.T[index];
        if (observed === base) unchanged += 1;
        else if (observed === base * 0.62) attenuated += 1;
        else errors.push(failure("PATTERN_UNDECLARED_ATTENUATION", "Checker composition altered a triangle by an undeclared factor.", { index, base, observed }));
      }
      if (attenuated === 0 || unchanged === 0) {
        errors.push(failure("PATTERN_COMPOSITION_NOT_EXERCISED", "Checker composition did not demonstrate both attenuated and unchanged cells.", { attenuated, unchanged }));
      }
    }
  } else if (!patternedCompiled.ok) {
    errors.push(failure("GRADIENT_PATTERN_RUNTIME_REJECTED", "MorphTile did not accept/compile the gradient+checker candidate.", { reason: patternedCompiled.reason }));
  }
  checked.push("gradient-pattern-orthogonal-composition");

  const strictCases = [
    { id: "from-string", mutate(rule) { rule.from = "-0.25"; }, expected: "HOLD_SURFACE_RULE_RANGE_INVALID" },
    { id: "to-null", mutate(rule) { rule.to = null; }, expected: "HOLD_SURFACE_RULE_RANGE_INVALID" },
    { id: "reverse-range", mutate(rule) { rule.from = 1; rule.to = -1; }, expected: "HOLD_SURFACE_RULE_RANGE_INVALID" },
    { id: "unknown-axis", mutate(rule) { rule.axis = "world_y"; }, expected: "HOLD_SURFACE_RULE_AXIS_UNKNOWN" },
    { id: "start-color-string", mutate(rule) { rule.start_color = ["0.9", 0.1, 0.8]; }, expected: "HOLD_SURFACE_RULE_COLOR_INVALID" },
    { id: "unknown-field", mutate(rule) { rule.coordinate_space = "local"; }, expected: "HOLD_SURFACE_RULE_FIELD_UNKNOWN" }
  ];
  const strictObserved = [];
  for (const item of strictCases) {
    const request = gradientRequest("verification-axis-gradient-" + item.id, false);
    item.mutate(request.intent.surface_rule);
    const observed = runWithoutMutation(surfaceMachine, request);
    const status = observed.output && observed.output.status || null;
    const code = firstHoldCode(observed.output);
    strictObserved.push({ id: item.id, status, code, mutated: observed.mutated });
    if (observed.threw || status !== "HOLD" || code !== item.expected) {
      errors.push(failure("GRADIENT_FAIL_CLOSED_BOUNDARY_BROKEN", "Malformed axis-gradient authoring did not fail closed with the expected identity.", {
        case: item.id,
        expected_code: item.expected,
        observed_status: status,
        observed_code: code,
        threw: observed.threw
      }));
    }
    if (observed.mutated) errors.push(failure("GRADIENT_STRICT_CASE_MUTATED", "Malformed gradient verification case mutated the caller request.", { case: item.id }));
  }
  checked.push("gradient-fail-closed-authoring-boundary");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-gradient-conformance-receipt/v0.1",
      revisions,
      expected_machine_version: expectedVersion,
      observed_machine_version: observedVersion,
      plain_status: plain.output && plain.output.status || null,
      visual_status: visualEvidence && visualEvidence.status || null,
      unique_gradient_colors: uniqueColors,
      saw_clamped_start: sawStart,
      saw_clamped_end: sawEnd,
      patterned_status: patterned.output && patterned.output.status || null,
      checker_attenuated_triangles: attenuated,
      checker_unchanged_triangles: unchanged,
      strict_cases: strictObserved
    }
  };
}

module.exports = { verifySurfaceGradientComposition };
