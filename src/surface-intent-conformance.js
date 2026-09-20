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

function runCase(machine, request) {
  const before = JSON.stringify(request);
  let output;
  try {
    output = machine.run(request);
  } catch (error) {
    return {
      output: null,
      threw: { name: error && error.name || "Error", message: error && error.message || String(error) },
      mutated: JSON.stringify(request) !== before
    };
  }
  return { output, threw: null, mutated: JSON.stringify(request) !== before };
}

function verifySurfaceIntentBoundary(machine, options = {}) {
  const expectedVersion = options.expectedVersion || "0.3.0";
  const errors = [];
  const checked = [];

  if (!machine || typeof machine.run !== "function") {
    return {
      status: "FAIL",
      checked,
      errors: [failure("SURFACE_MACHINE_CONTRACT_MISSING", "Surface verification requires a machine.run entry point.")],
      receipt: null
    };
  }

  const base = {
    envelope_version: "0.1",
    request_id: "verification-surface-intent-base",
    goal: "Independently verify fail-closed Surface intent type handling",
    intent: {
      base_color: [0.2, 0.25, 0.3],
      paint: {
        color: [["if", [">", ["var", "ny"], 0.6], 0.9, 0.2], 0.5, 0.25]
      }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };

  if (machine.MACHINE && machine.MACHINE.version !== expectedVersion) {
    errors.push(failure("SURFACE_MACHINE_VERSION_MISMATCH", "Pinned Surface Machine version differs from the verification target.", {
      expected: expectedVersion,
      observed: machine.MACHINE.version || null
    }));
  }
  checked.push("machine-version");

  const valid = runCase(machine, clone(base));
  if (valid.threw || !valid.output || valid.output.status !== "CANDIDATE") {
    errors.push(failure("VALID_SURFACE_REQUEST_REJECTED", "Known-good bounded Surface intent did not produce a candidate.", {
      threw: valid.threw,
      status: valid.output && valid.output.status || null
    }));
  }
  if (valid.mutated) errors.push(failure("VALID_REQUEST_MUTATED", "Surface Machine mutated the caller request while validating it."));
  checked.push("valid-request-and-immutability");

  const unknown = clone(base);
  unknown.request_id = "verification-surface-unknown-field";
  unknown.intent.typo_color = [1, 0, 0];
  const unknownResult = runCase(machine, unknown);
  if (!unknownResult.output || unknownResult.output.status !== "HOLD" || firstHoldCode(unknownResult.output) !== "HOLD_SURFACE_INTENT_FIELD_UNKNOWN") {
    errors.push(failure("UNKNOWN_INTENT_FIELD_NOT_HELD", "Unknown top-level Surface intent must fail closed.", {
      status: unknownResult.output && unknownResult.output.status || null,
      code: firstHoldCode(unknownResult.output)
    }));
  }
  if (unknownResult.mutated) errors.push(failure("UNKNOWN_FIELD_REQUEST_MUTATED", "Unknown-field verification mutated the caller request."));
  checked.push("unknown-top-level-field-fail-closed");

  const badVar = clone(base);
  badVar.request_id = "verification-surface-paint-var-string";
  badVar.intent.paint.vars = { threshold: "0.6" };
  const badVarResult = runCase(machine, badVar);
  if (!badVarResult.output || badVarResult.output.status !== "HOLD" || firstHoldCode(badVarResult.output) !== "HOLD_SURFACE_PAINT_VARS_INVALID") {
    errors.push(failure("PAINT_VAR_TYPE_NOT_HELD", "String paint vars must not be coerced into numeric runtime data.", {
      status: badVarResult.output && badVarResult.output.status || null,
      code: firstHoldCode(badVarResult.output)
    }));
  }
  checked.push("paint-vars-strict-number-type");

  const coercionCases = [
    { id: "string", value: ["0.2", 0.25, 0.3] },
    { id: "boolean", value: [false, 0.25, 0.3] },
    { id: "null", value: [null, 0.25, 0.3] }
  ];
  const coercionObserved = [];
  for (const item of coercionCases) {
    const request = clone(base);
    request.request_id = "verification-surface-base-color-" + item.id;
    request.intent.base_color = item.value;
    const observed = runCase(machine, request);
    const status = observed.output && observed.output.status || null;
    const code = firstHoldCode(observed.output);
    const emittedColor = observed.output && observed.output.candidate && observed.output.candidate.value && observed.output.candidate.value.data
      ? observed.output.candidate.value.data.color
      : null;
    coercionObserved.push({ id: item.id, input: item.value, status, code, emitted_color: emittedColor, mutated: observed.mutated });
    if (!observed.output || status !== "HOLD" || code !== "HOLD_SURFACE_COLOR_INVALID") {
      errors.push(failure("BASE_COLOR_TYPE_COERCION", "Fail-closed base_color validation accepted a non-number channel and normalized it into candidate data.", {
        case: item.id,
        input: item.value,
        status,
        code,
        emitted_color: emittedColor
      }));
    }
    if (observed.mutated) errors.push(failure("COERCION_CASE_REQUEST_MUTATED", "Surface base_color type test mutated the caller request.", { case: item.id }));
  }
  checked.push("base-color-strict-number-type");

  const outOfRange = clone(base);
  outOfRange.request_id = "verification-surface-base-color-range";
  outOfRange.intent.base_color = [0.2, 1.2, 0.3];
  const outOfRangeResult = runCase(machine, outOfRange);
  if (!outOfRangeResult.output || outOfRangeResult.output.status !== "HOLD" || firstHoldCode(outOfRangeResult.output) !== "HOLD_SURFACE_COLOR_INVALID") {
    errors.push(failure("BASE_COLOR_RANGE_NOT_HELD", "Out-of-range numeric base_color must fail closed.", {
      status: outOfRangeResult.output && outOfRangeResult.output.status || null,
      code: firstHoldCode(outOfRangeResult.output)
    }));
  }
  checked.push("base-color-range");

  const receipt = {
    schema: "axm.morphtile.surface-intent-conformance-receipt/v0.1",
    expected_machine_version: expectedVersion,
    observed_machine_version: machine.MACHINE && machine.MACHINE.version || null,
    valid_status: valid.output && valid.output.status || null,
    unknown_field_status: unknownResult.output && unknownResult.output.status || null,
    unknown_field_code: firstHoldCode(unknownResult.output),
    paint_var_string_status: badVarResult.output && badVarResult.output.status || null,
    paint_var_string_code: firstHoldCode(badVarResult.output),
    base_color_type_cases: coercionObserved,
    out_of_range_status: outOfRangeResult.output && outOfRangeResult.output.status || null,
    out_of_range_code: firstHoldCode(outOfRangeResult.output)
  };

  return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
}

module.exports = { verifySurfaceIntentBoundary };
