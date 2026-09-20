"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const INTERFACE_PR15 = "a95267df9a42f35d32860e5f1bf99697e8ea9755";
const FORM_PR20 = "8ccabaac63308310155fc605644273e75f9cdf37";
const ASSEMBLY_PR22 = "d4483ae7d3f282e16903c76704e46ec4521e76d1";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine current-growth replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function ownMap(entries) {
  const out = Object.create(null);
  for (const [key, value] of entries) {
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return out;
}

function firstHoldCode(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0].code || null;
  if (value && value.hold && typeof value.hold === "object") return value.hold.code || null;
  return value && value.code || null;
}

function applyViewOperation(MT, ws, operation, label) {
  const candidate = MT.cloneBody(ws, "verification", label);
  const edited = MT.editCandidate(ws, candidate, operation);
  assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

const hasInterface = !!process.env.R8_INTERFACE_ROOT && !!process.env.R8_CORE_PATH;
test("Interface PR #15: repeat uses live canonical state, exact floor/clamp semantics, expansion boundary and rollback", { skip: !hasInterface }, () => {
  assert.equal(process.env.R8_INTERFACE_COMMIT, INTERFACE_PR15);
  assert.equal(process.env.R8_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R8_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R8_CORE_PATH));

  const authored = request("r8-interface-repeat-floor-clamp", {
    tile_path: "mt_tower",
    title: "Verification bounded repeat",
    elements: [{
      kind: "repeat",
      binding: "beacon",
      step: 0.25,
      max: 3,
      children: [{ kind: "text", text: "Verification pulse" }]
    }],
    bindings: { readouts: ["beacon"] }
  });
  const beforeRequest = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.deepEqual(first, second, "repeat authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeRequest, "Interface must not mutate caller intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first));
  assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"]);
  assert.deepEqual(first.candidate.operation.view.body, [{
    repeat: ["max", 0, ["min", 3, ["floor", ["/", ["var", "beacon"], 0.25]]]],
    as: "i",
    body: [{ text: "Verification pulse" }]
  }]);
  assert.equal(JSON.stringify(first.candidate).includes("state_value"), false);

  const ws = MT.createWorkspace(MT.seedWorld());
  const structuralBefore = MT.structHash(ws.live);
  const committed = applyViewOperation(MT, ws, first.candidate.operation, "round8-interface-repeat");
  const committedHash = MT.structHash(ws.live);

  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const off = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal((off.match(/Verification pulse/g) || []).length, 0);
  assert.equal(MT.structHash(ws.live), committedHash, "repeat rendering at zero must be structurally read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const on = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal((on.match(/Verification pulse/g) || []).length, 3, "floor(1 / .25)=4 must clamp to max=3");
  assert.equal(MT.structHash(ws.live), committedHash, "repeat rendering of live state must remain read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), structuralBefore);

  const withinBudgetChildren = Array.from({ length: 15 }, (_, i) => ({ kind: "text", text: `ok-${i}` }));
  const withinBudget = Interface.run(request("r8-repeat-budget-61", {
    tile_path: "mt_tower",
    elements: [{ kind: "repeat", binding: "beacon", step: 1, max: 4, children: withinBudgetChildren }],
    bindings: { readouts: ["beacon"] }
  }));
  assert.equal(withinBudget.status, "CANDIDATE", JSON.stringify(withinBudget.holds));

  const overBudgetChildren = Array.from({ length: 16 }, (_, i) => ({ kind: "text", text: `hold-${i}` }));
  const overBudget = Interface.run(request("r8-repeat-budget-65", {
    tile_path: "mt_tower",
    elements: [{ kind: "repeat", binding: "beacon", step: 1, max: 4, children: overBudgetChildren }],
    bindings: { readouts: ["beacon"] }
  }));
  assert.equal(overBudget.status, "HOLD");
  assert.equal(firstHoldCode(overBudget), "HOLD_INTERFACE_REPEAT_EXPANSION_TOO_LARGE");
  assert.equal(overBudget.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-repeat-round8/v0.1",
    target_commit: INTERFACE_PR15,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-repeat-authoring",
      "symbolic-readout-proof-only-no-copied-state",
      "live-zero-to-floor-clamped-three-runtime-markers",
      "render-readonly",
      "exact-structural-rollback",
      "expanded-node-boundary-61-pass-65-hold"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE"
  }));
});

const hasForm = !!process.env.R8_FORM_ROOT && !!process.env.R8_CORE_PATH;
test("Form PR #20: size progression preserves bounded meaning with rotation and rejects a zero-size endpoint", { skip: !hasForm }, () => {
  assert.equal(process.env.R8_FORM_COMMIT, FORM_PR20);
  assert.equal(process.env.R8_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R8_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R8_CORE_PATH));

  const validRequest = request("r8-form-size-rotation", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      size_step: [-0.75, 0.25, 0],
      rot_step: [0, 0, 0.2],
      part: { shape: "box", size: [2, 1, 1], rot: [0, 0, 0.1] }
    }
  });
  const before = JSON.stringify(validRequest);
  const first = Form.run(validRequest);
  const second = Form.run(validRequest);
  assert.deepEqual(first, second, "Form size progression must replay deterministically");
  assert.equal(JSON.stringify(validRequest), before, "Form must not mutate caller request");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first));

  const repeated = first.candidate.facets.mesh.data.parts[0];
  const target = repeated.body[0];
  assert.equal(repeated.repeat, 3);
  assert.deepEqual(target.size, [
    ["+", 2, ["*", ["var", "i"], -0.75]],
    ["+", 1, ["*", ["var", "i"], 0.25]],
    1
  ]);
  assert.deepEqual(target.rot[2], ["+", 0.1, ["*", ["var", "i"], 0.2]]);

  const compiled = MT.compileMesh(MT.createTile(first.candidate));
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 3);
  assert.ok(compiled.P.length > 0);
  assert.ok(compiled.P.every(Number.isFinite));

  const zeroEndpoint = Form.run(request("r8-form-size-zero-endpoint", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      size_step: [-1, 0, 0],
      part: { shape: "box", size: [2, 1, 1] }
    }
  }));
  assert.equal(zeroEndpoint.status, "HOLD");
  assert.equal(firstHoldCode(zeroEndpoint), "HOLD_FORM_REPEAT_INVALID");
  assert.match(zeroEndpoint.holds[0].detail, /greater than zero|index 2/i);
  assert.equal(zeroEndpoint.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-size-progression-round8/v0.1",
    target_commit: FORM_PR20,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-size-progression",
      "negative-and-positive-axis-size-deltas-preserved",
      "size-and-rotation-progressions-coexist",
      "real-core-finite-three-part-compilation",
      "zero-size-endpoint-fails-closed-before-emission"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE"
  }));
});

function definition(id, parts) {
  return {
    id,
    name: `Verification definition ${id}`,
    created_by: "axm.morphtile.machine.verification",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: { generator: "recipe", vars: {}, parts }
        }
      }
    }
  };
}

const hasAssembly = !!process.env.R8_ASSEMBLY_ROOT && !!process.env.R8_CORE_PATH;
test("Assembly PR #22: transitive special-name closure survives fresh import and kit hash covers that closure", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R8_ASSEMBLY_COMMIT, ASSEMBLY_PR22);
  assert.equal(process.env.R8_CORE_COMMIT, CORE);
  const Assembly = require(path.join(process.env.R8_ASSEMBLY_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R8_ASSEMBLY_ROOT, "src", "kit"));
  const MT = require(path.resolve(process.env.R8_CORE_PATH));

  const assemblyRequest = {
    envelope_version: "0.1",
    request_id: "r8-assembly-own-key-closure",
    goal: "independently verify exact own-key dependency closure and portable hash coverage",
    intent: { id: "mt_r8_own_key", name: "Round 8 own-key closure" },
    inputs: [{
      envelope_version: "0.1",
      request_id: "r8-form-like-input",
      machine: { id: "axm.morphtile.machine.form", version: "verification-fixture" },
      status: "CANDIDATE",
      candidate: {
        schema: "morphtile.tile-spec/v0.4",
        name: "Round 8 own-key user",
        form_hints: ["game_asset"],
        facets: {
          mesh: {
            type: "generated",
            source: null,
            data: { generator: "recipe", vars: {}, parts: [{ use: "__proto__" }] }
          }
        }
      },
      warnings: [],
      holds: []
    }],
    world_requirements: {
      definitions: ownMap([
        ["__proto__", definition("__proto__", [{ use: "constructor" }])],
        ["constructor", definition("constructor", [{ use: "toString" }])],
        ["toString", definition("toString", [{ shape: "plane", size: [1, 1, 1] }])]
      ])
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };

  const assembledA = Assembly.run(assemblyRequest);
  const assembledB = Assembly.run(assemblyRequest);
  assert.deepEqual(assembledA, assembledB, "Assembly own-key closure must replay deterministically");
  assert.equal(assembledA.status, "CANDIDATE", JSON.stringify(assembledA.holds));
  assert.deepEqual(assembledA.required_definitions, ["__proto__", "constructor", "toString"]);
  for (const key of ["__proto__", "constructor", "toString"]) {
    assert.equal(hasOwn(assembledA.world_requirements.definitions, key), true, `${key} must remain own closure data`);
    assert.equal(assembledA.world_requirements.definitions[key].id, key);
  }

  const materialized = materializeKit(assembledA, MT, { name: "Round 8 own-key portable kit" });
  assert.equal(materialized.status, "CANDIDATE", JSON.stringify(materialized.holds));
  for (const key of ["__proto__", "constructor", "toString"]) {
    assert.equal(hasOwn(materialized.kit.defs, key), true, `${key} must remain own data in the kit`);
  }

  const receiver = MT.createWorld("Round 8 receiver");
  const imported = MT.importKit(receiver, clone(materialized.kit));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
  const tile = MT.resolveTile(receiver, "mt_r8_own_key");
  assert.ok(tile);
  const compiled = MT.compileMesh(tile, receiver);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.ok(compiled.P.length > 0);
  assert.ok(compiled.P.every(Number.isFinite));

  const tampered = clone(materialized.kit);
  tampered.defs.constructor.name = "tampered-after-hash";
  const rejectedReceiver = MT.createWorld("Round 8 rejected receiver");
  const beforeReject = MT.structHash(rejectedReceiver);
  const rejected = MT.importKit(rejectedReceiver, tampered);
  assert.equal(rejected.status, "HOLD", JSON.stringify(rejected));
  assert.equal(firstHoldCode(rejected), "HOLD_HASH_MISMATCH");
  assert.equal(MT.structHash(rejectedReceiver), beforeReject, "hash rejection must not mutate the receiving world");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-own-key-kit-round8/v0.1",
    target_commit: ASSEMBLY_PR22,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-transitive-__proto__-constructor-toString-closure",
      "portable-kit-preserves-special-name-own-identity",
      "fresh-world-import-apply-runtime-resolution",
      "finite-runtime-compilation",
      "definition-tamper-under-stale-hash-holds",
      "hash-rejection-is-non-mutating"
    ],
    placement: "ASSEMBLY_MACHINE"
  }));
});
