"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "7fa4f48f120947112917e36797c7d7437fdcb0a7";
const FORM_PR28 = "239654a4867b55d35f0e57a70939fb7ad88c8862";
const SURFACE_PR27 = "095338af0f244254e5a583d957cf7e089df23dfa";
const INTERFACE_PR24 = "0a5aac9d96d97486a4086aaea6fa0a9287d8801e";
const ASSEMBLY_PR29 = "16b96453bfd651579909da11a0deba8fa7d1a660";

function request(id, intent, provenance = { caller: "axm.morphtile.machine.verification" }) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 16 replay",
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

function formRequest(id, grid) {
  return request(id, { grid });
}

const hasForm = !!process.env.R16_FORM_BASE_ROOT && !!process.env.R16_FORM_HEAD_ROOT && !!process.env.R16_CORE_PATH;
test("Form PR #28: shared grid-progression kernel is semantics-equivalent to integrated predecessor across positive and fail-closed corpus", { skip: !hasForm }, () => {
  assert.equal(process.env.R16_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R16_FORM_HEAD_COMMIT, FORM_PR28);
  assert.equal(process.env.R16_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R16_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R16_FORM_HEAD_ROOT, "src"));
  const MT = require(path.resolve(process.env.R16_CORE_PATH));

  const corpus = [
    formRequest("r16-form-rotation", {
      counts: [2, 2, 1], step: [0, 0, 0],
      rot_step: { x: [0.1, 0, 0], y: [0, 0.2, 0] },
      part: { shape: "box", size: [1, 1, 1], rot: [0, 0, 0] }
    }),
    formRequest("r16-form-size", {
      counts: [2, 2, 1], step: [0, 0, 0],
      size_step: { x: [0.25, 0, 0], y: [0, 0.5, 0] },
      rot_step: { y: [0, 0, 0.1] },
      part: { shape: "box", size: [1, 1, 1] }
    }),
    formRequest("r16-form-scale", {
      counts: [2, 2, 1], step: [0, 0, 0],
      scale_step: { x: 0.2, y: 0.35 },
      rot_step: { y: [0, 0.1, 0] },
      instance: { use: "panel", scale: 0.6 }
    }),
    formRequest("r16-form-size-nonpositive", {
      counts: [3, 1, 1], step: [0, 0, 0],
      size_step: { x: [-0.6, 0, 0] },
      part: { shape: "box", size: [1, 1, 1] }
    }),
    formRequest("r16-form-scale-collision", {
      counts: [2, 3, 1], step: [0, 0, 0],
      scale_step: { x: 1, y: -0.5 },
      instance: { use: "panel", scale: 5 }
    }),
    formRequest("r16-form-rotation-overflow", {
      counts: [3, 1, 1], step: [0, 0, 0],
      rot_step: { x: [Number.MAX_VALUE, 0, 0] },
      part: { shape: "box", size: [1, 1, 1], rot: [Number.MAX_VALUE, 0, 0] }
    })
  ];

  for (const authored of corpus) {
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.deepEqual(candidate, baseline, `${authored.request_id}: internal refactor must preserve exact public result semantics`);
    assert.equal(JSON.stringify(authored), before, `${authored.request_id}: refactor must not mutate caller input`);
    assert.deepEqual(Head.run(authored), candidate, `${authored.request_id}: replay must be deterministic`);
  }

  const runtimeOut = Head.run(corpus[2]);
  assert.equal(runtimeOut.status, "CANDIDATE", JSON.stringify(runtimeOut.holds));
  const world = MT.createWorld("Verification round 16 Form refactor receiver proof");
  world.defs = {
    panel: {
      id: "panel",
      name: "Panel",
      body: { facets: { mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 2, 1] } } } }
    }
  };
  const tile = MT.createTile(runtimeOut.candidate);
  world.tiles[tile.id] = tile;
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-kernel-equivalence-round16/v0.1",
    target_commit: FORM_PR28,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "rotation-positive-equivalence",
      "size-positive-equivalence",
      "scale-positive-equivalence",
      "nonpositive-domain-hold-equivalence",
      "cartesian-collision-hold-equivalence",
      "overflow-hold-equivalence",
      "source-preserving-deterministic-replay",
      "real-core-finite-receiver-effect"
    ],
    placement: "FORM_MACHINE_INTERNAL_REFACTOR"
  }));
});

const hasSurface = !!process.env.R16_SURFACE_ROOT;
test("Surface PR #27: falsey authored provenance survives semantic HOLD paths and only genuine absence defaults", { skip: !hasSurface }, () => {
  assert.equal(process.env.R16_SURFACE_COMMIT, SURFACE_PR27);
  const Surface = require(path.join(process.env.R16_SURFACE_ROOT, "src"));
  const fixture = require(path.join(process.env.R16_SURFACE_ROOT, "fixtures", "request.facing-up.json"));

  for (const provenance of [null, false, 0, ""]) {
    const authored = clone(fixture);
    authored.request_id = `r16-surface-hold-provenance-${String(provenance)}`;
    authored.provenance = provenance;
    authored.intent.surface_rule.direction = "constructor";
    const before = JSON.stringify(authored);
    const first = Surface.run(authored);
    const second = Surface.run(authored);
    assert.equal(first.status, "HOLD", JSON.stringify(first));
    assert.equal(first.holds[0].code, "HOLD_SURFACE_RULE_DIRECTION_UNKNOWN");
    assert.deepEqual(first.provenance, provenance, "authored falsey provenance must survive the HOLD result unchanged");
    assert.deepEqual(first, second, "HOLD result must replay deterministically");
    assert.equal(JSON.stringify(authored), before, "Surface must not mutate caller-owned request/provenance");
  }

  const absent = clone(fixture);
  absent.request_id = "r16-surface-absent-provenance";
  delete absent.provenance;
  absent.intent.surface_rule.direction = "constructor";
  const absentOut = Surface.run(absent);
  assert.equal(absentOut.status, "HOLD");
  assert.deepEqual(absentOut.provenance, {}, "only genuine provenance absence may select the default object");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-provenance-hold-presence-round16/v0.1",
    target_commit: SURFACE_PR27,
    status: "PASS",
    checked: [
      "null-provenance-survives-hold",
      "false-provenance-survives-hold",
      "zero-provenance-survives-hold",
      "empty-string-provenance-survives-hold",
      "genuine-absence-defaults-only",
      "deterministic-source-preserving-hold"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE_RESULT_ENVELOPE"
  }));
});

const hasInterface = !!process.env.R16_INTERFACE_ROOT && !!process.env.R16_CORE_PATH;
test("Interface PR #24: nested repeat-local selectors bind nearest lexical scope in the real MorphTile runtime and restore outer scope for siblings", { skip: !hasInterface }, () => {
  assert.equal(process.env.R16_INTERFACE_COMMIT, INTERFACE_PR24);
  assert.equal(process.env.R16_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R16_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R16_CORE_PATH));

  const authored = request("r16-interface-nested-repeat-scope", {
    tile_path: "mt_tower",
    title: "Nested lexical selectors",
    elements: [{
      kind: "repeat",
      binding: "beacon",
      step: 0.25,
      max: 3,
      children: [
        {
          kind: "repeat",
          binding: "beacon",
          step: 0.5,
          max: 2,
          children: [
            { kind: "repeat_when", source: "index", equals: 1, children: [{ kind: "text", text: "INNER_SECOND" }] },
            { kind: "repeat_when", source: "count", equals: 2, children: [{ kind: "text", text: "INNER_FULL" }] }
          ]
        },
        { kind: "repeat_when", source: "index", equals: 2, children: [{ kind: "text", text: "OUTER_THIRD" }] },
        { kind: "repeat_when", source: "count", equals: 3, children: [{ kind: "text", text: "OUTER_FULL" }] }
      ]
    }],
    bindings: { readouts: ["beacon"] }
  });
  const beforeRequest = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "nested lexical selector authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeRequest, "Interface must not mutate nested authored intent");
  assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"], "lexical i/i_of must not become canonical-state proof obligations");

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeWorld = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "verification:round16-interface-nested-repeat-scope");
  const committedHash = MT.structHash(ws.live);

  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const offHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  for (const marker of ["INNER_SECOND", "INNER_FULL", "OUTER_THIRD", "OUTER_FULL"]) assert.doesNotMatch(offHtml, new RegExp(marker));
  assert.equal(MT.structHash(ws.live), committedHash, "off-state render must remain read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const onHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal((onHtml.match(/INNER_SECOND/g) || []).length, 3, "inner index=1 must match once inside each of three outer repetitions");
  assert.equal((onHtml.match(/INNER_FULL/g) || []).length, 6, "inner count=2 must match both inner bodies inside each outer repetition");
  assert.equal((onHtml.match(/OUTER_THIRD/g) || []).length, 1, "sibling after nested repeat must restore outer index scope");
  assert.equal((onHtml.match(/OUTER_FULL/g) || []).length, 3, "sibling after nested repeat must restore outer count scope");
  assert.equal(MT.structHash(ws.live), committedHash, "nested lexical rendering must remain structurally read-only");

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeWorld, "rollback must restore exact pre-commit structure");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-nested-repeat-scope-round16/v0.1",
    target_commit: INTERFACE_PR24,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "nearest-inner-index-scope",
      "nearest-inner-count-scope",
      "outer-scope-restored-for-sibling",
      "locals-not-canonical-readout-proof",
      "deterministic-source-preserving-authoring",
      "real-runtime-read-only-render",
      "exact-rollback"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_NATIVE_LEXICAL_RUNTIME"
  }));
});

function minimalTileCandidate(id) {
  return {
    schema: "morphtile.tile-spec/v0.4",
    id,
    name: "Verification tile",
    form_hints: ["game_asset"],
    facets: {
      mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } }
    }
  };
}

const hasAssembly = !!process.env.R16_ASSEMBLY_ROOT;
test("Assembly PR #29: result-envelope provenance preserves falsey authored values on HOLD while source trace loss remains an explicit separate HOLD", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R16_ASSEMBLY_COMMIT, ASSEMBLY_PR29);
  const Assembly = require(path.join(process.env.R16_ASSEMBLY_ROOT, "src"));

  for (const provenance of [null, false, 0, ""]) {
    const authored = {
      envelope_version: "0.1",
      request_id: `r16-assembly-result-provenance-${String(provenance)}`,
      goal: "prove authored result provenance survives a HOLD result",
      intent: { id: "mt_result_provenance" },
      inputs: [],
      provenance
    };
    const before = JSON.stringify(authored);
    const first = Assembly.run(authored);
    const second = Assembly.run(authored);
    assert.equal(first.status, "HOLD");
    assert.equal(first.holds[0].code, "HOLD_NO_CANDIDATES");
    assert.deepEqual(first.provenance, provenance, "falsey request provenance must survive result-envelope HOLD unchanged");
    assert.deepEqual(first, second, "Assembly HOLD must replay deterministically");
    assert.equal(JSON.stringify(authored), before, "Assembly must not mutate caller-owned provenance");
  }

  const absent = {
    envelope_version: "0.1",
    request_id: "r16-assembly-result-provenance-absent",
    goal: "prove genuine absence alone selects provenance default",
    intent: { id: "mt_result_provenance" },
    inputs: []
  };
  const absentOut = Assembly.run(absent);
  assert.equal(absentOut.status, "HOLD");
  assert.deepEqual(absentOut.provenance, {});

  const traceRequest = {
    envelope_version: "0.1",
    request_id: "r16-assembly-source-trace-separate-hold",
    goal: "separate repaired result provenance from still-held source provenance semantics",
    intent: { id: "mt_trace" },
    inputs: [{
      envelope_version: "0.1",
      request_id: "upstream-trace-source",
      machine: { id: "verification.upstream", version: "0" },
      status: "CANDIDATE",
      candidate: minimalTileCandidate("mt_trace"),
      dependencies: [],
      warnings: [],
      holds: [],
      provenance: false
    }],
    provenance: false
  };
  const traceOut = Assembly.run(traceRequest);
  assert.equal(traceOut.status, "CANDIDATE", JSON.stringify(traceOut.holds));
  assert.equal(traceOut.provenance, false, "repaired result provenance must preserve request false");
  assert.equal(traceOut.source_provenance[0].provenance, null, "known separate source trace truthiness gap must remain visible rather than being misreported as repaired");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-result-provenance-presence-round16/v0.1",
    target_commit: ASSEMBLY_PR29,
    status: "PASS_WITH_SEPARATE_HOLD",
    checked: [
      "null-result-provenance-survives-hold",
      "false-result-provenance-survives-hold",
      "zero-result-provenance-survives-hold",
      "empty-string-result-provenance-survives-hold",
      "genuine-absence-defaults-only",
      "deterministic-source-preserving-result",
      "known-source-provenance-falsey-loss-reproduced-separately"
    ],
    remaining_hold: "ASSEMBLY_SOURCE_PROVENANCE_PRESENCE_SEMANTICS",
    placement: "ASSEMBLY_MACHINE_RESULT_ENVELOPE_WITH_SEPARATE_TRACE_HOLD"
  }));
});
