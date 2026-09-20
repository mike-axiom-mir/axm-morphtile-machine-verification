"use strict";

const { verifySurfaceNestedAuthoring, verifyInterfaceMeter } = require("./current-growth-round5-conformance");
const { verifyNestedInterfaceAssemblyTransport } = require("./nested-interface-assembly-conformance");
const { verifyKitCandidate } = require("./kit-conformance");

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ownData(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return target;
}

function verifySurfaceSpecialKeyRepair(surface, options = {}) {
  const base = verifySurfaceNestedAuthoring(surface, options);
  const errors = [];
  const checked = [...(base.checked || [])];

  if (base.status !== "PASS") {
    errors.push(...(base.errors || []));
  }

  const special = base.receipt && base.receipt.special_key || null;
  if (!special || special.status !== "HOLD" || special.hold !== "HOLD_SURFACE_RULE_FIELD_UNKNOWN" || special.candidate_present || !special.source_preserved || !special.global_prototype_clean) {
    errors.push(failure(
      "SURFACE_SPECIAL_KEY_REPAIR_NOT_EXACT",
      "The repaired Surface snapshot did not preserve own __proto__ data through the exact semantic unknown-field HOLD boundary.",
      { observed: clone(special) }
    ));
  }
  checked.push("exact-special-key-semantic-hold");

  const rule = {
    kind: "facing",
    direction: "up",
    threshold: 0.6,
    match_color: [0.9, 0.8, 0.7],
    else_color: [0.1, 0.2, 0.3]
  };
  ownData(rule, "constructor", { verification_surface_constructor_key: true });
  const beforeDescriptor = Object.getOwnPropertyDescriptor(rule, "constructor");
  const beforePrototype = Object.getPrototypeOf(rule);
  const request = {
    envelope_version: "0.1",
    request_id: "verification-surface-constructor-key",
    goal: "verify alternate inherited-looking own keys remain authored data",
    intent: { surface_rule: rule },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  let out = null;
  let threw = null;
  try {
    out = surface.run(request);
  } catch (error) {
    threw = error && error.message || String(error);
  }
  const hold = out && Array.isArray(out.holds) && out.holds[0] || null;
  const afterDescriptor = Object.getOwnPropertyDescriptor(rule, "constructor");
  const sourcePreserved = Object.getPrototypeOf(rule) === beforePrototype
    && !!afterDescriptor
    && afterDescriptor.value === beforeDescriptor.value
    && afterDescriptor.enumerable === beforeDescriptor.enumerable;
  if (threw || !out || out.status !== "HOLD" || !hold || hold.code !== "HOLD_SURFACE_RULE_FIELD_UNKNOWN" || out.candidate !== null || !sourcePreserved) {
    errors.push(failure(
      "SURFACE_CONSTRUCTOR_KEY_IDENTITY_DRIFT",
      "An own constructor data key did not remain inert authored data through semantic validation.",
      { observed_error: threw, observed_status: out && out.status || null, observed_hold: hold && hold.code || null, source_preserved: sourcePreserved }
    ));
  }
  checked.push("alternate-inherited-looking-own-key-remains-data");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.surface-special-key-repair-conformance/v0.1",
      surface_commit: options.surfaceCommit || null,
      replayed_original_failure: special,
      constructor_key: {
        status: out && out.status || null,
        hold: hold && hold.code || null,
        threw,
        source_preserved: sourcePreserved
      },
      visual_quality: "NOT_TESTED"
    }
  };
}

function recipe(vars, parts) {
  return { type: "generated", source: null, data: { generator: "recipe", vars, parts } };
}

function tile(runtime, mesh, id) {
  return runtime.createTile({ id, name: "Verification recipe own-key proof", form_hints: ["game_asset"], facets: { mesh } });
}

function axisExtent(mesh, axis) {
  const values = [];
  for (let i = axis; i < mesh.P.length; i += 3) values.push(mesh.P[i]);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function verifyCoreRecipeOwnKeyIdentity(runtime, options = {}) {
  const errors = [];
  const checked = [];
  if (!runtime || typeof runtime.compileMesh !== "function" || typeof runtime.createTile !== "function" || typeof runtime.createWorld !== "function") {
    return { status: "FAIL", checked, errors: [failure("CORE_RECIPE_VERIFY_CONTRACT_MISSING", "Recipe own-key verification requires MorphTile createTile(), createWorld(), and compileMesh().")], receipt: null };
  }

  const authored = [];
  for (const [index, key] of ["__proto__", "constructor", "toString"].entries()) {
    const width = index + 2;
    const vars = ownData({}, key, width);
    const compiled = runtime.compileMesh(tile(runtime, recipe(vars, [
      { shape: "box", size: [["var", key], 1, 1] }
    ]), `mt_recipe_key_${index}`));
    const extent = axisExtent(compiled, 0);
    const pass = compiled.hold === null && compiled.recipe_parts === 1 && extent === width;
    authored.push({ key, hold: compiled.hold || null, recipe_parts: compiled.recipe_parts, extent, expected_extent: width, pass });
    if (!pass) {
      errors.push(failure("CORE_RECIPE_OWN_KEY_VALUE_DRIFT", "An authored own recipe key did not resolve as exact data.", { key, hold: compiled.hold || null, recipe_parts: compiled.recipe_parts, extent, expected_extent: width }));
    }
  }
  checked.push("authored-prototype-looking-vars-remain-exact-data");

  const absent = [];
  for (const key of ["constructor", "toString", "hasOwnProperty"]) {
    const compiled = runtime.compileMesh(tile(runtime, recipe({}, [
      { when: ["var", key], shape: "box", size: [1, 1, 1] }
    ]), `mt_recipe_absent_${key}`));
    const pass = compiled.hold === null && compiled.recipe_parts === 0;
    absent.push({ key, hold: compiled.hold || null, recipe_parts: compiled.recipe_parts, pass });
    if (!pass) {
      errors.push(failure("CORE_RECIPE_INHERITED_KEY_LEAK", "A missing inherited-looking recipe name became ambient host-object authority in a when expression.", { key, hold: compiled.hold || null, recipe_parts: compiled.recipe_parts }));
    }
  }
  checked.push("missing-inherited-looking-vars-do-not-leak-from-prototype");

  const loop = runtime.compileMesh(tile(runtime, recipe({}, [
    {
      repeat: 2,
      as: "constructor",
      body: [{ shape: "box", size: [1, 1, 1], pos: [["var", "constructor"], 0, 0] }]
    }
  ]), "mt_recipe_loop_constructor"));
  const loopPass = loop.hold === null && loop.recipe_parts === 2 && axisExtent(loop, 0) === 2;
  if (!loopPass) {
    errors.push(failure("CORE_RECIPE_LOOP_KEY_DRIFT", "An inherited-looking repeat alias did not remain exact loop-scope data.", { hold: loop.hold || null, recipe_parts: loop.recipe_parts, extent: axisExtent(loop, 0) }));
  }
  checked.push("repeat-alias-prototype-independence");

  const defVars = ownData({}, "constructor", 1);
  const overrides = ownData({}, "constructor", 3);
  const world = runtime.createWorld("Verification own-key definition world");
  world.defs = {
    def_part: {
      id: "def_part",
      name: "Verification own-key definition",
      body: {
        facets: {
          mesh: recipe(defVars, [{ shape: "box", size: [["var", "constructor"], 1, 1] }])
        }
      }
    }
  };
  world.tiles.mt_recipe_definition_key = tile(runtime, recipe({}, [{ use: "def_part", with: overrides }]), "mt_recipe_definition_key");
  const definitionCompiled = runtime.compileMesh(world.tiles.mt_recipe_definition_key, world);
  const definitionSourcePreserved = Object.prototype.hasOwnProperty.call(world.defs.def_part.body.facets.mesh.data.vars, "constructor")
    && world.defs.def_part.body.facets.mesh.data.vars.constructor === 1;
  const definitionPass = definitionCompiled.hold === null && axisExtent(definitionCompiled, 0) === 3 && definitionSourcePreserved;
  if (!definitionPass) {
    errors.push(failure("CORE_RECIPE_DEFINITION_OWN_KEY_DRIFT", "Definition overrides did not preserve exact own-key identity without rewriting source definition state.", {
      hold: definitionCompiled.hold || null,
      extent: axisExtent(definitionCompiled, 0),
      source_preserved: definitionSourcePreserved
    }));
  }
  checked.push("definition-override-prototype-independence");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.core-recipe-own-key-conformance/v0.1",
      core_commit: options.coreCommit || null,
      authored,
      absent,
      loop: { hold: loop.hold || null, recipe_parts: loop.recipe_parts, extent: axisExtent(loop, 0), pass: loopPass },
      definition: { hold: definitionCompiled.hold || null, extent: axisExtent(definitionCompiled, 0), source_preserved: definitionSourcePreserved, pass: definitionPass }
    }
  };
}

function verifyInterfaceCurrentAssembly(interfaceMachine, assembly, materializeKit, runtime, integrationSources, options = {}) {
  const errors = [];
  const checked = [];
  const expectedAssembly = options.assemblyCommit || null;
  const pin = integrationSources && integrationSources.assembly || null;
  const pinPass = !!pin
    && pin.repository === "mike-axiom-mir/axm-morphtile-machine-assembly"
    && pin.commit === expectedAssembly;
  if (!pinPass) {
    errors.push(failure("INTERFACE_RECEIVER_PIN_STALE", "Interface receiver evidence does not name the exact independently checked Assembly revision.", { observed: clone(pin), expected_commit: expectedAssembly }));
  }
  checked.push("exact-current-assembly-receiver-pin");

  const meter = verifyInterfaceMeter(interfaceMachine, runtime, {
    interfaceCommit: options.interfaceCommit || null,
    morphTileCommit: options.coreCommit || null
  });
  if (meter.status !== "PASS") errors.push(...(meter.errors || []));
  checked.push("meter-canonical-state-replay");

  const transport = verifyNestedInterfaceAssemblyTransport(interfaceMachine, assembly, materializeKit, runtime, {
    interfaceCommit: options.interfaceCommit || null,
    assemblyCommit: expectedAssembly,
    morphTileCommit: options.coreCommit || null
  });
  if (transport.status !== "PASS") errors.push(...(transport.errors || []));
  checked.push("current-assembly-independent-transport-replay");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.interface-current-assembly-conformance/v0.1",
      interface_commit: options.interfaceCommit || null,
      assembly_commit: expectedAssembly,
      core_commit: options.coreCommit || null,
      receiver_pin: clone(pin),
      receiver_pin_exact: pinPass,
      meter_status: meter.status,
      meter: meter.receipt,
      transport_status: transport.status,
      transport: transport.receipt,
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

function applyImported(runtime, world, imported) {
  for (const operation of imported && imported.ops || []) runtime.applyStructOp(world, operation);
}

function verifyAssemblyFormRotation(form, assembly, materializeKit, runtime, options = {}) {
  const errors = [];
  const checked = [];
  if (!form || typeof form.run !== "function" || !assembly || typeof assembly.run !== "function" || typeof materializeKit !== "function") {
    return { status: "FAIL", checked, errors: [failure("ASSEMBLY_ROTATION_VERIFY_CONTRACT_MISSING", "Form.run, Assembly.run, and materializeKit are required.")], receipt: null };
  }

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
  const request = formRequest("verification-form-rotation-closure", clone(intent));
  const before = JSON.stringify(request);
  const first = form.run(request);
  const second = form.run(request);
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
  const formPass = first && first.status === "CANDIDATE"
    && JSON.stringify(first) === JSON.stringify(second)
    && JSON.stringify(request) === before
    && JSON.stringify(emittedParts) === JSON.stringify(expectedParts);
  if (!formPass) {
    errors.push(failure("ASSEMBLY_ROTATION_FORM_INPUT_DRIFT", "Pinned merged Form did not emit the exact deterministic rotation/setting progression expected by this Assembly proof.", { observed_status: first && first.status || null, observed_parts: clone(emittedParts) }));
  }
  checked.push("exact-form-rotation-setting-progression");

  const base = {
    envelope_version: "0.1",
    goal: "verify portable rotation definition closure",
    intent: { id: "mt_verification_turning_panel", name: "Verification turning panels" },
    inputs: [first],
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const missing = assembly.run({ ...clone(base), request_id: "verification-assembly-rotation-missing" });
  const missingPass = missing && missing.status === "HOLD" && holdCode(missing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE") === "HOLD_DEFINITION_CLOSURE_INCOMPLETE"
    && JSON.stringify(missing.required_definitions || []) === JSON.stringify(["panel"]);
  if (!missingPass) {
    errors.push(failure("ASSEMBLY_ROTATION_MISSING_DEFINITION_NOT_HELD", "Assembly did not fail closed on missing reusable matter for the rotated Form candidate.", { observed_status: missing && missing.status || null, observed_holds: clone(missing && missing.holds || []), required: clone(missing && missing.required_definitions || []) }));
  }
  checked.push("missing-definition-fails-closed");

  const completeRequest = {
    ...clone(base),
    request_id: "verification-assembly-rotation-complete",
    world_requirements: { definitions: { panel: panelDefinition() } }
  };
  const completeBefore = JSON.stringify(completeRequest);
  const complete = assembly.run(completeRequest);
  const completePass = complete && complete.status === "CANDIDATE"
    && JSON.stringify(complete.candidate.facets.mesh.data.parts) === JSON.stringify(expectedParts)
    && JSON.stringify(completeRequest) === completeBefore;
  if (!completePass) {
    errors.push(failure("ASSEMBLY_ROTATION_CLOSURE_DRIFT", "Assembly did not preserve the exact rotated recipe through explicit definition closure without mutating caller input.", { observed_status: complete && complete.status || null, observed_parts: clone(complete && complete.candidate && complete.candidate.facets && complete.candidate.facets.mesh && complete.candidate.facets.mesh.data && complete.candidate.facets.mesh.data.parts) }));
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
      try {
        tampered.tile.facets.mesh.data.parts[0].body[0].rot[2][2][2] = 0.5;
      } catch (error) {
        errors.push(failure("ASSEMBLY_ROTATION_TAMPER_PATH_MISSING", "Expected transported rotation expression was not present at the deterministic kit path.", { observed_error: error && error.message || String(error) }));
      }
      const receiver = runtime.createWorld("Verification rotation tamper receiver");
      const receiverBefore = runtime.hashOf(receiver);
      const tamperedImport = runtime.importKit(receiver, tampered);
      const receiverAfter = runtime.hashOf(receiver);
      tamperStatus = tamperedImport && tamperedImport.status || null;
      tamperReadOnly = receiverBefore === receiverAfter;
      if (tamperStatus !== "HOLD_HASH_MISMATCH" || !tamperReadOnly) {
        errors.push(failure("ASSEMBLY_ROTATION_TAMPER_NOT_CLOSED", "Changing only the transported rotation expression under the stale kit hash was not rejected non-mutating as HOLD_HASH_MISMATCH.", { observed_status: tamperStatus, receiver_unchanged: tamperReadOnly }));
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
        const runtimePass = !!received && JSON.stringify(receivedParts) === JSON.stringify(expectedParts)
          && compiled && compiled.hold === null && compiled.recipe_parts === 3 && finite;
        runtimeReceipt = {
          import_status: imported.status,
          import_evidence: imported.evidence,
          exact_parts_preserved: JSON.stringify(receivedParts) === JSON.stringify(expectedParts),
          hold: compiled && compiled.hold || null,
          recipe_parts: compiled && compiled.recipe_parts || null,
          positions_finite: finite
        };
        if (!runtimePass) {
          errors.push(failure("ASSEMBLY_ROTATION_IMPORTED_RUNTIME_DRIFT", "Fresh imported matter did not retain and execute the exact rotation/setting progression as finite runtime geometry.", clone(runtimeReceipt)));
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
      schema: "axm.morphtile.assembly-form-rotation-conformance/v0.1",
      form_commit: options.formCommit || null,
      assembly_commit: options.assemblyCommit || null,
      core_commit: options.coreCommit || null,
      form_exact: formPass,
      missing_definition: { status: missing && missing.status || null, hold: holdCode(missing, "HOLD_DEFINITION_CLOSURE_INCOMPLETE") },
      complete_status: complete && complete.status || null,
      kit_verification_status: kitVerification && kitVerification.status || null,
      rotation_tamper: { status: tamperStatus, receiver_unchanged: tamperReadOnly },
      runtime: runtimeReceipt
    }
  };
}

module.exports = {
  verifySurfaceSpecialKeyRepair,
  verifyCoreRecipeOwnKeyIdentity,
  verifyInterfaceCurrentAssembly,
  verifyAssemblyFormRotation
};
