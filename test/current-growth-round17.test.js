"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "fd0098928b39fc34f1c16e6d922fc72b7faa1961";
const FORM_PR29 = "8deaa6cd9c5f9125ea501285e2a2eb95511efefc";
const FORM_PR30 = "91a2338e279c11547d0efa55a6c663010997467d";
const SURFACE_BASE = "895c0330422e9639cac2308da38821ac44942ad9";
const SURFACE_PR29 = "be45f09a3f97729787a48270c3e26eeb6c63c18e";
const INTERFACE_PR25 = "dd93d83f1fc93536851a9cb0025255241172104f";
const ASSEMBLY_PR30 = "b5d4ff78d2f0a4f1b695aff128bdaa4aa420133c";

function request(id, intent, provenance = { caller: "axm.morphtile.machine.verification" }) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 17 replay",
    intent,
    provenance
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function commitOperations(MT, ws, output, label) {
  const candidate = MT.cloneBody(ws, "verification", label);
  const operations = output.candidate.operations || [output.candidate.operation];
  for (const operation of operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

function formDefinitionWorld() {
  return {
    defs: {
      panel: {
        id: "panel",
        name: "Parametric panel",
        body: {
          facets: {
            mesh: {
              type: "generated",
              source: null,
              data: {
                generator: "recipe",
                vars: { width: 1, depth: 1 },
                parts: [{ shape: "plane", size: [["var", "width"], 1, ["var", "depth"]] }]
              }
            }
          }
        }
      }
    }
  };
}

const hasForm29 = !!process.env.R17_FORM_BASE_ROOT && !!process.env.R17_FORM29_ROOT && !!process.env.R17_CORE_PATH;
test("Form PR #29: grid-setting shared-kernel refactor is exact-result equivalent to integrated baseline across hostile own keys, collision, overflow and real receiver effect", { skip: !hasForm29 }, () => {
  assert.equal(process.env.R17_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R17_FORM29_COMMIT, FORM_PR29);
  assert.equal(process.env.R17_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R17_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R17_FORM29_ROOT, "src"));
  const MT = require(path.resolve(process.env.R17_CORE_PATH));

  const specialBase = JSON.parse('{"__proto__":2,"constructor":3,"toString":4}');
  const specialStep = JSON.parse('{"__proto__":0.5,"constructor":1,"toString":-0.25}');
  const corpus = [
    request("r17-form29-own-keys", {
      grid: {
        counts: [2, 1, 1], step: [0, 0, 0],
        with_step: { x: specialStep },
        instance: { use: "panel", with: specialBase }
      }
    }),
    request("r17-form29-collision", {
      grid: {
        counts: [2, 3, 1], step: [0, 0, 0],
        with_step: { x: { width: 1 }, y: { width: -0.5 } },
        instance: { use: "panel", with: { width: 5 } }
      }
    }),
    request("r17-form29-overflow", {
      grid: {
        counts: [3, 1, 1], step: [0, 0, 0],
        with_step: { x: { width: Number.MAX_VALUE } },
        instance: { use: "panel", with: { width: Number.MAX_VALUE } }
      }
    }),
    request("r17-form29-runtime", {
      grid: {
        counts: [2, 2, 1], step: [0, 0, 0],
        with_step: { x: { width: 1 }, y: { depth: 0.5 } },
        rot_step: { y: [0, 0.1, 0] },
        instance: { use: "panel", with: { width: 1, depth: 1 } }
      }
    })
  ];

  for (const authored of corpus) {
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.deepEqual(candidate, baseline, `${authored.request_id}: refactor must preserve exact public result`);
    assert.equal(JSON.stringify(authored), before, `${authored.request_id}: caller input must remain unchanged`);
    assert.deepEqual(Head.run(authored), candidate, `${authored.request_id}: replay must be deterministic`);
  }

  const ownOut = Head.run(corpus[0]);
  assert.equal(ownOut.status, "CANDIDATE");
  let ownLeaf = ownOut.candidate.facets.mesh.data.parts[0];
  while (ownLeaf && Number.isInteger(ownLeaf.repeat) && Array.isArray(ownLeaf.body)) ownLeaf = ownLeaf.body[0];
  for (const key of ["__proto__", "constructor", "toString"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(ownLeaf.with, key), true, `${key} must remain authored own data`);
  }
  assert.equal(Head.run(corpus[1]).status, "HOLD");
  assert.equal(Head.run(corpus[2]).status, "HOLD");

  const runtimeOut = Head.run(corpus[3]);
  assert.equal(runtimeOut.status, "CANDIDATE", JSON.stringify(runtimeOut.holds));
  const world = formDefinitionWorld();
  const tile = MT.createTile(runtimeOut.candidate);
  world.tiles = { [tile.id]: tile };
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixed = clone(runtimeOut.candidate);
  let fixedLeaf = fixed.facets.mesh.data.parts[0];
  while (fixedLeaf && Number.isInteger(fixedLeaf.repeat) && Array.isArray(fixedLeaf.body)) fixedLeaf = fixedLeaf.body[0];
  fixedLeaf.with = { width: 1, depth: 1 };
  const fixedTile = MT.createTile(fixed);
  world.tiles[fixedTile.id] = fixedTile;
  const fixedCompiled = MT.compileMesh(fixedTile, world);
  assert.equal(fixedCompiled.hold, null);
  assert.notDeepEqual(compiled.P, fixedCompiled.P, "real receiver must consume per-cell setting expressions");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-setting-kernel-equivalence-round17/v0.1",
    target_commit: FORM_PR29,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: ["exact-public-equivalence", "hostile-own-key-identity", "collision-hold-equivalence", "overflow-hold-equivalence", "deterministic-source-preserving-replay", "real-core-setting-effect"],
    placement: "FORM_MACHINE_INTERNAL_REFACTOR"
  }));
});

const hasForm30 = !!process.env.R17_FORM_BASE_ROOT && !!process.env.R17_FORM30_ROOT && !!process.env.R17_CORE_PATH;
test("Form PR #30: repeat-progression shared-kernel refactor is exact-result equivalent across rotation, size, scale and complete-domain failures", { skip: !hasForm30 }, () => {
  assert.equal(process.env.R17_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R17_FORM30_COMMIT, FORM_PR30);
  assert.equal(process.env.R17_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R17_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R17_FORM30_ROOT, "src"));
  const MT = require(path.resolve(process.env.R17_CORE_PATH));

  const corpus = [
    request("r17-form30-rotation", { repeat: { count: 4, step: [0.12, 0.45, 0], rot_step: [0, 0.5, 0], part: { shape: "box", size: [1.1, 0.12, 0.24], pos: [1, 0, 0], rot: [0, 0.1, 0] } } }),
    request("r17-form30-size", { repeat: { count: 3, step: [0, 0, 0], size_step: [0.25, -0.1, 0.5], part: { shape: "box", size: [1, 1, 1] } } }),
    request("r17-form30-scale-scalar", { repeat: { count: 3, step: [0, 0, 0], scale_step: 0.25, instance: { use: "panel", scale: 1 } } }),
    request("r17-form30-scale-vector", { repeat: { count: 3, step: [0, 0, 0], scale_step: [0.25, -0.1, 0.5], instance: { use: "panel", scale: [1, 1, 1] } } }),
    request("r17-form30-size-zero", { repeat: { count: 3, step: [0, 0, 0], size_step: [-0.5, 0, 0], part: { shape: "box", size: [1, 1, 1] } } }),
    request("r17-form30-rotation-overflow", { repeat: { count: 2, step: [0, 1, 0], rot_step: [Number.MAX_VALUE, 0, 0], part: { shape: "box", rot: [Number.MAX_VALUE, 0, 0] } } })
  ];

  for (const authored of corpus) {
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.deepEqual(candidate, baseline, `${authored.request_id}: repeat refactor must preserve exact public result`);
    assert.equal(JSON.stringify(authored), before, `${authored.request_id}: caller input must remain unchanged`);
    assert.deepEqual(Head.run(authored), candidate, `${authored.request_id}: replay must be deterministic`);
  }
  assert.equal(Head.run(corpus[4]).status, "HOLD");
  assert.equal(Head.run(corpus[5]).status, "HOLD");

  const runtimeOut = Head.run(corpus[0]);
  assert.equal(runtimeOut.status, "CANDIDATE");
  const tile = MT.createTile(runtimeOut.candidate);
  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4);
  assert.ok(mesh.P.every(Number.isFinite));

  const fixedRequest = clone(corpus[0]);
  delete fixedRequest.intent.repeat.rot_step;
  const fixedOut = Head.run(fixedRequest);
  assert.equal(fixedOut.status, "CANDIDATE");
  const fixedMesh = MT.compileMesh(MT.createTile(fixedOut.candidate));
  assert.equal(fixedMesh.hold, null);
  assert.notDeepEqual(mesh.P, fixedMesh.P, "real receiver must consume repeat rotation progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-repeat-kernel-equivalence-round17/v0.1",
    target_commit: FORM_PR30,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: ["rotation-equivalence", "size-equivalence", "scalar-scale-equivalence", "vector-scale-equivalence", "nonpositive-domain-hold-equivalence", "overflow-hold-equivalence", "real-core-repeat-effect"],
    placement: "FORM_MACHINE_INTERNAL_REFACTOR"
  }));
});

const hasSurface = !!process.env.R17_SURFACE_BASE_ROOT && !!process.env.R17_SURFACE_ROOT;
test("Surface PR #29: authored base-only material is structurally base-only while genuine absence keeps fallback and named pattern semantics remain unchanged", { skip: !hasSurface }, () => {
  assert.equal(process.env.R17_SURFACE_BASE_COMMIT, SURFACE_BASE);
  assert.equal(process.env.R17_SURFACE_COMMIT, SURFACE_PR29);
  const Base = require(path.join(process.env.R17_SURFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R17_SURFACE_ROOT, "src"));

  const baseOnly = request("r17-surface-base-only", { base_color: [0.2, 0.25, 0.3] });
  const before = JSON.stringify(baseOnly);
  const baselineBaseOnly = Base.run(baseOnly);
  const headBaseOnly = Head.run(baseOnly);
  assert.equal(headBaseOnly.status, "CANDIDATE", JSON.stringify(headBaseOnly.holds));
  assert.equal(JSON.stringify(baseOnly), before, "Surface must not mutate base-only caller intent");
  assert.deepEqual(Head.run(baseOnly), headBaseOnly, "base-only replay must be deterministic");
  assert.deepEqual(headBaseOnly.candidate.value.data.color, [0.2, 0.25, 0.3]);
  assert.equal(Object.prototype.hasOwnProperty.call(headBaseOnly.candidate.value.data, "paint"), false, "authored base-only material must not acquire invented paint");
  assert.equal(Object.prototype.hasOwnProperty.call(baselineBaseOnly.candidate.value.data, "paint"), true, "baseline must demonstrate the repaired semantic delta rather than coincidentally matching");

  const empty = request("r17-surface-empty", {});
  const headEmpty = Head.run(empty);
  const baseEmpty = Base.run(empty);
  assert.equal(headEmpty.status, "CANDIDATE");
  assert.equal(Object.prototype.hasOwnProperty.call(headEmpty.candidate.value.data, "paint"), true, "genuine no-authorship path must retain bounded fallback");
  assert.deepEqual(headEmpty.candidate, baseEmpty.candidate, "fallback candidate meaning must remain exact for genuine absence");

  const pattern = request("r17-surface-checker", { base_color: [0.2, 0.25, 0.3], pattern: { kind: "checker", scale: 0.4 } });
  const headPattern = Head.run(pattern);
  const basePattern = Base.run(pattern);
  assert.equal(headPattern.status, "CANDIDATE");
  assert.deepEqual(headPattern.candidate, basePattern.candidate, "reviewed named-pattern candidate meaning must not be silently rewritten by this technical repair");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-base-only-authorship-round17/v0.1",
    target_commit: SURFACE_PR29,
    predecessor_commit: SURFACE_BASE,
    status: "PASS",
    checked: ["base-only-no-invented-paint", "genuine-absence-retains-fallback", "named-pattern-candidate-unchanged", "deterministic-source-preserving-replay"],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE_DEFAULT_AUTHORSHIP"
  }));
});

const hasInterface = !!process.env.R17_INTERFACE_ROOT && !!process.env.R17_CORE_PATH;
test("Interface PR #25: bounded relational repeat selectors use nearest lexical i/i_of in real MorphTile, preserve proof scope, read-only rendering and exact rollback", { skip: !hasInterface }, () => {
  assert.equal(process.env.R17_INTERFACE_COMMIT, INTERFACE_PR25);
  assert.equal(process.env.R17_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R17_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R17_CORE_PATH));

  const authored = request("r17-interface-repeat-relations", {
    tile_path: "mt_tower",
    title: "Relational lexical selectors",
    elements: [{
      kind: "repeat",
      binding: "beacon",
      step: 0.25,
      max: 4,
      children: [
        {
          kind: "repeat",
          binding: "beacon",
          step: 0.5,
          max: 2,
          children: [
            { kind: "repeat_when", source: "index", comparison: "at_least", value: 1, children: [{ kind: "text", text: "INNER_AFTER_FIRST" }] },
            { kind: "repeat_when", source: "count", comparison: "at_least", value: 2, children: [{ kind: "text", text: "INNER_FULL" }] }
          ]
        },
        { kind: "repeat_when", source: "index", comparison: "below", value: 2, children: [{ kind: "text", text: "OUTER_FIRST_TWO" }] },
        { kind: "repeat_when", source: "count", comparison: "at_least", value: 4, children: [{ kind: "text", text: "OUTER_FULL" }] },
        { kind: "repeat_when", source: "index", equals: 3, children: [{ kind: "text", text: "OLD_SHORTHAND_LAST" }] }
      ]
    }],
    bindings: { readouts: ["beacon"] }
  });

  const beforeRequest = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "relational lexical authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeRequest, "Interface must not mutate authored intent");
  assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"], "lexical i/i_of must not become canonical-state proof obligations");

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeWorld = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "verification:round17-interface-repeat-relations");
  const committedHash = MT.structHash(ws.live);

  const offHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  for (const marker of ["INNER_AFTER_FIRST", "INNER_FULL", "OUTER_FIRST_TWO", "OUTER_FULL", "OLD_SHORTHAND_LAST"]) assert.doesNotMatch(offHtml, new RegExp(marker));
  assert.equal(MT.structHash(ws.live), committedHash, "off-state render must remain read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const onHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal((onHtml.match(/INNER_AFTER_FIRST/g) || []).length, 4, "inner index >= 1 must match one inner body inside each of four outer repetitions");
  assert.equal((onHtml.match(/INNER_FULL/g) || []).length, 8, "inner count >= 2 must render both inner bodies inside every outer repetition");
  assert.equal((onHtml.match(/OUTER_FIRST_TWO/g) || []).length, 2, "sibling after nested repeat must restore outer index scope");
  assert.equal((onHtml.match(/OUTER_FULL/g) || []).length, 4, "outer count >= 4 must evaluate against outer i_of");
  assert.equal((onHtml.match(/OLD_SHORTHAND_LAST/g) || []).length, 1, "integrated equals shorthand must remain compatible beside new comparisons");
  assert.equal(MT.structHash(ws.live), committedHash, "relational lexical render must remain structurally read-only");

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeWorld, "rollback must restore exact pre-commit structure");

  const invalid = clone(authored);
  invalid.request_id = "r17-interface-mixed-operands";
  invalid.intent.elements[0].children = [{ kind: "repeat_when", source: "index", equals: 0, comparison: "at_least", value: 0, children: [{ kind: "text", text: "INVALID" }] }];
  const invalidOut = Interface.run(invalid);
  assert.equal(invalidOut.status, "HOLD");
  assert.equal(invalidOut.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-repeat-relations-round17/v0.1",
    target_commit: INTERFACE_PR25,
    receiver_commit: CORE,
    status: "PASS",
    checked: ["nearest-inner-index-relation", "nearest-inner-count-relation", "outer-scope-restoration", "equals-shorthand-compatibility", "lexical-locals-not-canonical-proof", "mixed-form-fails-closed", "read-only-render", "exact-rollback"],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_NATIVE_LEXICAL_COMPARISON_RUNTIME"
  }));
});

function candidateInput(provenance, includeProvenance = true) {
  const input = {
    envelope_version: "0.1",
    request_id: "upstream-source-provenance",
    machine: { id: "axm.test.producer", version: "1" },
    status: "CANDIDATE",
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      id: "source_provenance_tile",
      facets: { mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } } }
    }
  };
  if (includeProvenance) input.provenance = provenance;
  return input;
}

function assemblyRequest(input, id) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent source-trace presence verification",
    intent: { id: "source_provenance_tile", name: "Source provenance proof" },
    inputs: [input],
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

const hasAssembly = !!process.env.R17_ASSEMBLY_ROOT;
test("Assembly PR #30: source trace preserves authored falsey provenance/schema by presence without guessing adjacent machine/request_id policy", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R17_ASSEMBLY_COMMIT, ASSEMBLY_PR30);
  const Assembly = require(path.join(process.env.R17_ASSEMBLY_ROOT, "src"));

  for (const provenance of [null, false, 0, ""]) {
    const authored = assemblyRequest(candidateInput(provenance), `r17-assembly-provenance-${String(provenance)}`);
    const before = JSON.stringify(authored);
    const first = Assembly.run(authored);
    const second = Assembly.run(authored);
    assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
    assert.deepEqual(first.source_provenance[0].provenance, provenance, `provenance=${JSON.stringify(provenance)}`);
    assert.deepEqual(first, second, "source-trace replay must be deterministic");
    assert.equal(JSON.stringify(authored), before, "Assembly must not mutate upstream source trace input");
  }

  const absent = assemblyRequest(candidateInput(undefined, false), "r17-assembly-provenance-absent");
  const absentOut = Assembly.run(absent);
  assert.equal(absentOut.status, "CANDIDATE");
  assert.equal(absentOut.source_provenance[0].provenance, null, "only genuine upstream provenance absence may trace as null");

  for (const schema of [null, false, 0, ""]) {
    const input = candidateInput({ producer: "r17-schema-presence" });
    input.candidate.schema = schema;
    const authored = assemblyRequest(input, `r17-assembly-schema-${String(schema)}`);
    const out = Assembly.run(authored);
    assert.equal(out.status, "HOLD");
    assert.equal(out.holds.some((hold) => hold.code === "HOLD_CANDIDATE_SCHEMA_INVALID"), true, JSON.stringify(out.holds));
    assert.deepEqual(out.source_provenance[0].candidate_schema, schema, `schema=${JSON.stringify(schema)} must remain exact in trace`);
  }

  const adjacent = assemblyRequest(candidateInput(false), "r17-assembly-adjacent-control");
  const adjacentOut = Assembly.run(adjacent);
  assert.equal(adjacentOut.status, "CANDIDATE");
  assert.deepEqual(adjacentOut.source_provenance[0].machine, adjacent.inputs[0].machine);
  assert.equal(adjacentOut.source_provenance[0].request_id, adjacent.inputs[0].request_id);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-source-trace-presence-round17/v0.1",
    target_commit: ASSEMBLY_PR30,
    status: "PASS",
    checked: ["falsey-provenance-presence", "absent-provenance-default-only", "falsey-candidate-schema-presence-on-hold", "deterministic-source-preserving-replay", "adjacent-valid-identity-control"],
    remaining_hold: "MALFORMED_UPSTREAM_MACHINE_REQUEST_ID_TRACE_POLICY_NOT_PROVEN",
    placement: "ASSEMBLY_MACHINE_SOURCE_TRACE"
  }));
});
