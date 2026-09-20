"use strict";

const { verifyKitCandidate } = require("./kit-conformance");
const { failure } = require("./verdict");

const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

function req(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify Form v0.8 nested composition and Assembly recursive definition closure",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function holdOf(out, code) {
  return out && Array.isArray(out.holds) ? out.holds.find((h) => h && (!code || h.code === code)) || null : null;
}

function collectUses(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectUses(item, out);
    return out;
  }
  if (typeof node.use === "string" && node.use) out.push(node.use);
  if (Array.isArray(node.body)) collectUses(node.body, out);
  return out;
}

function planeDef(id) {
  return {
    id,
    name: id,
    created_by: "verification",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: { generator: "recipe", vars: {}, parts: [{ shape: "plane", size: [1, 1, 1] }] }
        }
      }
    }
  };
}

function panelDef() {
  return {
    id: "panel",
    name: "panel",
    created_by: "verification",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: { generator: "recipe", vars: {}, parts: [{ use: "beam" }] }
        }
      }
    }
  };
}

function verifyFormV08AssemblyClosure({ form, assembly, materializeKit, runtime, revisions = {} } = {}) {
  const errors = [];
  const checked = [];
  const missing = [];
  if (!form || typeof form.run !== "function") missing.push("form.run");
  if (!assembly || typeof assembly.run !== "function") missing.push("assembly.run");
  if (typeof materializeKit !== "function") missing.push("assembly.materializeKit");
  for (const name of ["hashOf", "createTile", "validateTile", "compileMesh", "createWorld", "importKit"]) {
    if (!runtime || typeof runtime[name] !== "function") missing.push("runtime." + name);
  }
  if (missing.length) return { status: "FAIL", checked, errors: [failure("FORM_V08_VERIFY_CONTRACT_MISSING", "Pinned verification entry points are missing.", { missing })], receipt: null };

  try {
    const input = req("verify-form-v08-compose", {
      name: "Verification recursive closure form",
      compose: [
        { part: { shape: "plane", pos: [-4, 0, 0] } },
        { repeat: { count: 2, step: [2, 0, 0], instance: { use: "panel", pos: [-1, 0, 0] } } },
        { grid: { counts: [2, 1, 1], step: [3, 0, 0], instance: { use: "frame", pos: [3, 0, 0] } } }
      ]
    });
    const before = JSON.stringify(input);
    const formA = form.run(input);
    const formB = form.run(clone(input));
    if (JSON.stringify(input) !== before) errors.push(failure("FORM_V08_REQUEST_MUTATED", "Form mutated caller-owned input."));
    if (!formA || formA.status !== "CANDIDATE") errors.push(failure("FORM_V08_NOT_CANDIDATE", "Current Form v0.8 did not produce the expected candidate.", { observed_status: formA && formA.status || null, observed_code: holdOf(formA) && holdOf(formA).code || null }));
    if (JSON.stringify(formA) !== JSON.stringify(formB)) errors.push(failure("FORM_V08_NONDETERMINISTIC", "Identical Form requests produced different output envelopes."));

    const recipeParts = formA && formA.candidate && formA.candidate.facets && formA.candidate.facets.mesh && formA.candidate.facets.mesh.data && formA.candidate.facets.mesh.data.parts;
    const nestedUses = Array.isArray(recipeParts) ? collectUses(recipeParts).sort() : [];
    if (!Array.isArray(recipeParts) || recipeParts.length !== 3) errors.push(failure("FORM_V08_COMPACTNESS_LOST", "Direct + repeat + grid must remain three compact recipe blocks.", { observed_parts: clone(recipeParts) }));
    if (JSON.stringify(nestedUses) !== JSON.stringify(["frame", "panel"])) errors.push(failure("FORM_V08_NESTED_REFS_LOST", "Definition refs must survive inside compact repeat/grid bodies.", { observed_uses: clone(nestedUses) }));
    const defWarnings = formA && Array.isArray(formA.warnings) ? formA.warnings.filter((w) => w && w.code === "DEFINITION_RUNTIME_RESOLUTION_REQUIRED") : [];
    if (defWarnings.length !== 1) errors.push(failure("FORM_V08_DEFINITION_WARNING_DRIFT", "Definition-backed composition must expose exactly one runtime-resolution warning.", { observed_count: defWarnings.length }));
    checked.push("form-v08-determinism-compactness-nested-refs");

    const at64 = form.run(req("verify-form-v08-budget-64", { compose: [
      { repeat: { count: 32, step: [1, 0, 0], part: { shape: "plane" } } },
      { grid: { counts: [32, 1, 1], step: [1, 0, 0], part: { shape: "plane" } } }
    ] }));
    const at65 = form.run(req("verify-form-v08-budget-65", { compose: [
      { repeat: { count: 33, step: [1, 0, 0], part: { shape: "plane" } } },
      { grid: { counts: [32, 1, 1], step: [1, 0, 0], part: { shape: "plane" } } }
    ] }));
    const h65 = holdOf(at65);
    if (!at64 || at64.status !== "CANDIDATE") errors.push(failure("FORM_V08_BUDGET_64_REJECTED", "Exactly 64 placements should be accepted.", { observed_status: at64 && at64.status || null }));
    if (!at65 || at65.status !== "HOLD" || !h65 || h65.code !== "HOLD_FORM_COMPOSITION_INVALID") errors.push(failure("FORM_V08_BUDGET_65_NOT_HELD", "65 placements must fail closed.", { observed_status: at65 && at65.status || null, observed_code: h65 && h65.code || null }));
    checked.push("form-v08-exact-budget-edge");

    const base = {
      envelope_version: "0.1",
      goal: "verify nested Form refs through Assembly closure",
      intent: { id: "mt_form_v08_verify", name: "Form v0.8 verification" },
      inputs: [clone(formA)],
      provenance: { caller: "axm.morphtile.machine.verification" }
    };

    const noDefs = assembly.run({ ...clone(base), request_id: "verify-assembly-no-defs" });
    const noDefsHold = holdOf(noDefs, "HOLD_DEFINITION_CLOSURE_INCOMPLETE");
    const directMissing = noDefsHold && Array.isArray(noDefsHold.missing) ? noDefsHold.missing : [];
    if (!noDefs || noDefs.status !== "HOLD" || JSON.stringify(directMissing) !== JSON.stringify(["frame", "panel"])) errors.push(failure("ASSEMBLY_NESTED_REFS_NOT_FOUND", "Assembly must discover both direct refs nested inside Form loop bodies.", { observed_status: noDefs && noDefs.status || null, observed_missing: clone(directMissing), observed_required: clone(noDefs && noDefs.required_definitions || []) }));

    const partialDefs = { frame: planeDef("frame"), panel: panelDef() };
    const noBeam = assembly.run({ ...clone(base), request_id: "verify-assembly-no-beam", world_requirements: { definitions: clone(partialDefs) } });
    const noBeamHold = holdOf(noBeam, "HOLD_DEFINITION_CLOSURE_INCOMPLETE");
    const transitiveMissing = noBeamHold && Array.isArray(noBeamHold.missing) ? noBeamHold.missing : [];
    const transitiveRequired = noBeam && Array.isArray(noBeam.required_definitions) ? noBeam.required_definitions : [];
    if (!noBeam || noBeam.status !== "HOLD" || JSON.stringify(transitiveMissing) !== JSON.stringify(["beam"])) errors.push(failure("ASSEMBLY_TRANSITIVE_REF_NOT_HELD", "Assembly must recurse into supplied definition bodies and HOLD missing beam.", { observed_status: noBeam && noBeam.status || null, observed_missing: clone(transitiveMissing) }));
    if (JSON.stringify(transitiveRequired) !== JSON.stringify(["beam", "frame", "panel"])) errors.push(failure("ASSEMBLY_REQUIRED_SET_INCOMPLETE", "required_definitions must include direct and transitive refs in sorted order.", { observed_required: clone(transitiveRequired) }));
    checked.push("assembly-direct-and-transitive-closure-holds");

    const defs = { beam: planeDef("beam"), frame: planeDef("frame"), panel: panelDef() };
    const completeRequest = { ...clone(base), request_id: "verify-assembly-complete", world_requirements: { definitions: clone(defs) } };
    const completeBefore = JSON.stringify(completeRequest);
    const complete = assembly.run(completeRequest);
    if (JSON.stringify(completeRequest) !== completeBefore) errors.push(failure("ASSEMBLY_CLOSURE_REQUEST_MUTATED", "Assembly mutated caller-owned closure input."));
    const required = complete && Array.isArray(complete.required_definitions) ? complete.required_definitions : [];
    if (!complete || complete.status !== "CANDIDATE") errors.push(failure("ASSEMBLY_COMPLETE_NOT_CANDIDATE", "Complete direct + transitive closure did not become a candidate.", { observed_status: complete && complete.status || null, holds: clone(complete && complete.holds || []) }));
    if (JSON.stringify(required) !== JSON.stringify(["beam", "frame", "panel"])) errors.push(failure("ASSEMBLY_COMPLETE_REQUIRED_DRIFT", "Complete closure must retain exact required set.", { observed_required: clone(required) }));
    checked.push("assembly-complete-recursive-closure");

    let runtimeReceipt = null;
    let kitStatus = null;
    let kitDefs = null;
    let kitVerification = null;
    if (complete && complete.status === "CANDIDATE") {
      const tile = runtime.createTile(clone(complete.candidate));
      const valid = runtime.validateTile(tile);
      if (!valid || !valid.ok) errors.push(failure("FORM_V08_ASSEMBLED_TILE_INVALID", "Complete assembled candidate failed MorphTile validation.", { validation_errors: clone(valid && valid.errors || []) }));
      const world = { defs: clone(defs) };
      const meshA = runtime.compileMesh(tile, world);
      const meshB = runtime.compileMesh(tile, clone(world));
      if (JSON.stringify(meshA) !== JSON.stringify(meshB)) errors.push(failure("FORM_V08_ASSEMBLED_MESH_NONDETERMINISTIC", "Exact same nested-definition matter compiled differently."));
      if (!meshA || meshA.hold) errors.push(failure("FORM_V08_ASSEMBLED_MESH_HELD", "Complete closure unexpectedly held in real runtime.", { observed_hold: meshA && meshA.hold || null }));
      if (!meshA || !Array.isArray(meshA.T) || meshA.T.length !== 10) errors.push(failure("FORM_V08_ASSEMBLED_PLACEMENT_DRIFT", "Five plane placements should compile to ten triangles.", { observed_triangles: meshA && Array.isArray(meshA.T) ? meshA.T.length : null }));
      runtimeReceipt = { tile_sha256: runtime.hashOf(tile), mesh_sha256: runtime.hashOf(meshA), triangles: meshA && Array.isArray(meshA.T) ? meshA.T.length : null, hold: meshA && meshA.hold || null };

      const kitResult = materializeKit(complete, runtime, { name: "Form v0.8 recursive closure kit" });
      kitStatus = kitResult && kitResult.status || null;
      if (!kitResult || kitResult.status !== "CANDIDATE") {
        errors.push(failure("FORM_V08_CLOSURE_KIT_NOT_CANDIDATE", "Complete closure did not materialize a kit.", { observed_status: kitStatus, holds: clone(kitResult && kitResult.holds || []) }));
      } else {
        kitDefs = Object.keys(kitResult.kit && kitResult.kit.defs || {}).sort();
        if (JSON.stringify(kitDefs) !== JSON.stringify(["beam", "frame", "panel"])) errors.push(failure("FORM_V08_CLOSURE_KIT_DEFS_LOST", "Kit did not retain exact recursive definition closure.", { observed_defs: clone(kitDefs) }));
        kitVerification = verifyKitCandidate(kitResult, runtime);
        if (!kitVerification || kitVerification.status !== "PASS") errors.push(failure("FORM_V08_CLOSURE_KIT_VERIFY_FAIL", "Kit failed independent hash/count/fresh-import/tamper verification.", { verifier_errors: clone(kitVerification && kitVerification.errors || []) }));
      }
    }
    checked.push("runtime-determinism-and-portable-kit-closure");

    const receipt = {
      schema: "axm.morphtile.form-v08-assembly-closure-receipt/v0.1",
      revisions: clone(revisions),
      form_candidate_sha256: formA && formA.candidate ? runtime.hashOf(formA.candidate) : null,
      nested_uses: clone(nestedUses),
      exact_64_status: at64 && at64.status || null,
      over_65_status: at65 && at65.status || null,
      over_65_hold: h65 && h65.code || null,
      direct_missing: clone(directMissing),
      transitive_missing: clone(transitiveMissing),
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
    errors.push(failure("FORM_V08_VERIFY_EXCEPTION", "Independent Form v0.8 / Assembly closure verifier threw.", { observed_name: error && error.name || "Error", observed_message: error && error.message || String(error) }));
    return { status: "FAIL", checked, errors, receipt: null };
  }
}

module.exports = { verifyFormV08AssemblyClosure };
