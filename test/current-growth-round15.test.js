"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR27 = "e2c89b87ddf7b2b4c9b0db2239e8880a3a873553";
const SURFACE_PR26 = "184ee30b9045dc76d7307fba078c37f5f44999fd";
const INTERFACE_PR22 = "78754081fa84fd995610175ba13e3d78bb886da4";
const ASSEMBLY_PR28 = "05e4336c3ba98f6bb581541d306ffa60d17439ff";

function request(id, intent, goal = "independent Verification Machine round 15 replay") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstHold(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0];
  if (value && value.hold && typeof value.hold === "object") return value.hold;
  return value || null;
}

function leafOf(candidate) {
  let node = candidate.facets.mesh.data.parts[0];
  while (node && Number.isInteger(node.repeat) && Array.isArray(node.body)) node = node.body[0];
  return node;
}

function ownDataObject(entries) {
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

const hasForm = !!process.env.R15_FORM_ROOT && !!process.env.R15_CORE_PATH;
test("Form PR #27: grid setting progression preserves special own setting names through real MorphTile expression evaluation", { skip: !hasForm }, () => {
  assert.equal(process.env.R15_FORM_COMMIT, FORM_PR27);
  assert.equal(process.env.R15_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R15_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R15_CORE_PATH));

  const bases = ownDataObject([
    ["__proto__", 1],
    ["constructor", 2],
    ["toString", 3]
  ]);
  const deltas = ownDataObject([
    ["__proto__", 0.5],
    ["constructor", 0.25],
    ["toString", 0.125]
  ]);
  const authored = request("r15-form-setting-own-keys", {
    grid: {
      counts: [2, 1, 1],
      step: [0, 0, 0],
      with_step: { x: deltas },
      instance: { use: "panel", with: bases, pos: [1, 2, 3] }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "special-name setting progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller-owned setting maps");

  const leaf = leafOf(first.candidate);
  for (const [name, base, delta] of [["__proto__", 1, 0.5], ["constructor", 2, 0.25], ["toString", 3, 0.125]]) {
    assert.equal(Object.prototype.hasOwnProperty.call(leaf.with, name), true, `${name} must remain an authored own setting`);
    assert.deepEqual(leaf.with[name], ["+", base, ["*", ["var", "gx"], delta]]);
  }
  assert.deepEqual(leaf.pos, [1, 2, 3], "validation-only stationary-axis movement must not escape");

  const vars = ownDataObject([
    ["__proto__", 1],
    ["constructor", 2],
    ["toString", 3]
  ]);
  const world = MT.createWorld("Verification round 15 Form own-key setting proof");
  world.defs = {
    panel: {
      id: "panel",
      name: "Special-name parametric panel",
      body: {
        facets: {
          mesh: {
            type: "generated",
            source: null,
            data: {
              generator: "recipe",
              vars,
              parts: [{ shape: "box", size: [["var", "__proto__"], ["var", "constructor"], ["var", "toString"]] }]
            }
          }
        }
      }
    }
  };
  const tile = MT.createTile(first.candidate);
  world.tiles[tile.id] = tile;
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 2);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixedCandidate = clone(first.candidate);
  const fixedWith = ownDataObject([["__proto__", 1], ["constructor", 2], ["toString", 3]]);
  leafOf(fixedCandidate).with = fixedWith;
  const fixedTile = MT.createTile(fixedCandidate);
  world.tiles[fixedTile.id] = fixedTile;
  const fixed = MT.compileMesh(fixedTile, world);
  assert.equal(fixed.hold, null, JSON.stringify(fixed));
  assert.notDeepEqual(compiled.P, fixed.P, "real MorphTile must consume the progressed special-name settings");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-setting-own-keys-round15/v0.1",
    target_commit: FORM_PR27,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "special-own-setting-names-preserved",
      "exact-setting-expression-identity",
      "deterministic-source-preserving-replay",
      "stationary-axis-validation-does-not-leak",
      "real-core-special-name-expression-evaluation",
      "receiver-geometry-changes-from-progressed-settings"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

const hasSurface = !!process.env.R15_SURFACE_ROOT;
test("Surface PR #26: every Object.prototype own name is excluded from the declared facing-direction registry", { skip: !hasSurface }, () => {
  assert.equal(process.env.R15_SURFACE_COMMIT, SURFACE_PR26);
  const Surface = require(path.join(process.env.R15_SURFACE_ROOT, "src"));
  const fixture = require(path.join(process.env.R15_SURFACE_ROOT, "fixtures", "request.facing-up.json"));

  const hostNames = Object.getOwnPropertyNames(Object.prototype).sort();
  assert.ok(hostNames.length > 3, "host-language registry attack set must be broader than the producer's three examples");
  for (const direction of hostNames) {
    const authored = clone(fixture);
    authored.request_id = `r15-surface-direction-${direction}`;
    authored.intent.surface_rule.direction = direction;
    const before = JSON.stringify(authored);
    const out = Surface.run(authored);
    assert.equal(out.status, "HOLD", direction);
    assert.equal(out.candidate, null, direction);
    assert.equal(firstHold(out).code, "HOLD_SURFACE_RULE_DIRECTION_UNKNOWN", direction);
    assert.equal(JSON.stringify(authored), before, `Surface must not mutate the request for ${direction}`);
  }

  const control = clone(fixture);
  control.request_id = "r15-surface-direction-control";
  control.intent.surface_rule.direction = "up";
  const first = Surface.run(control);
  const second = Surface.run(control);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "declared own direction control must replay deterministically");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-direction-registry-own-membership-round15/v0.1",
    target_commit: SURFACE_PR26,
    status: "PASS",
    checked: [
      "all-object-prototype-own-names-rejected-as-directions",
      "precise-direction-unknown-hold",
      "no-candidate-on-host-name",
      "source-preserving-rejection",
      "declared-own-direction-positive-control"
    ],
    host_names_checked: hostNames.length,
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

const hasInterface = !!process.env.R15_INTERFACE_ROOT && !!process.env.R15_CORE_PATH;
test("Interface PR #22: equality remains strict across scalar types in the real canonical-state runtime and rollback stays exact", { skip: !hasInterface }, () => {
  assert.equal(process.env.R15_INTERFACE_COMMIT, INTERFACE_PR22);
  assert.equal(process.env.R15_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R15_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R15_CORE_PATH));

  const authored = request("r15-interface-strict-equality-types", {
    tile_path: "mt_tower",
    title: "Strict equality type proof",
    elements: [
      { kind: "action", binding: "toggle", label: "Toggle" },
      { kind: "when", binding: "beacon", comparison: "equals", expected: "1", children: [{ kind: "text", text: "String one matched" }] },
      { kind: "when", binding: "beacon", comparison: "equals", expected: 1, children: [{ kind: "text", text: "Numeric one matched" }] },
      { kind: "when", binding: "beacon", comparison: "not_equals", expected: "1", children: [{ kind: "text", text: "Strict type mismatch" }] }
    ],
    bindings: { readouts: ["beacon"], actions: ["toggle"] }
  });
  const beforeRequest = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "equality authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeRequest, "Interface must not mutate caller-owned equality intent");

  const conditions = first.candidate.operation.view.body.filter((node) => Array.isArray(node.when)).map((node) => node.when);
  assert.deepEqual(conditions, [
    ["==", ["var", "beacon"], "1"],
    ["==", ["var", "beacon"], 1],
    ["!=", ["var", "beacon"], "1"]
  ]);
  assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"]);
  assert.deepEqual(first.dependencies[0].requires.action_input_signal_socket_ids, ["toggle"]);

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeWorld = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "verification:round15-interface-equality");
  const committedHash = MT.structHash(ws.live);

  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const zeroHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.doesNotMatch(zeroHtml, /String one matched/);
  assert.doesNotMatch(zeroHtml, /Numeric one matched/);
  assert.match(zeroHtml, /Strict type mismatch/);
  assert.equal(MT.structHash(ws.live), committedHash, "initial equality rendering must be read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const oneHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.doesNotMatch(oneHtml, /String one matched/, "number 1 must not equal authored string '1'");
  assert.match(oneHtml, /Numeric one matched/, "number 1 must equal authored number 1");
  assert.match(oneHtml, /Strict type mismatch/, "number 1 must remain not-equal to authored string '1'");
  assert.equal(MT.structHash(ws.live), committedHash, "post-transition equality rendering must be read-only");

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeWorld, "rollback must restore exact pre-commit structural identity");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-strict-equality-types-round15/v0.1",
    target_commit: INTERFACE_PR22,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "native-equality-operator-identity",
      "number-vs-string-strict-equality",
      "number-vs-number-positive-control",
      "strict-not-equals-cross-type",
      "canonical-state-transition-controls-visibility",
      "render-read-only",
      "exact-rollback"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function primitiveDefinition(id, size) {
  return {
    id,
    name: `Definition ${id}`,
    body: {
      facets: {
        mesh: { type: "primitive", source: null, data: { shape: "box", size } }
      }
    }
  };
}

function assemblyAliasRequest(specialDefinition) {
  const defsAlias = ownDataObject([["__proto__", specialDefinition]]);
  return {
    envelope_version: "0.1",
    request_id: "r15-assembly-alias-own-key",
    goal: "prove alias closure preserves authored own special-name definitions",
    intent: { id: "mt_alias", name: "Alias closure proof" },
    inputs: [{
      candidate: {
        schema: "morphtile.tile-spec/v0.4",
        id: "mt_alias",
        facets: {
          mesh: {
            type: "generated",
            source: null,
            data: {
              generator: "recipe",
              vars: {},
              parts: [{ use: "panel" }, { use: "__proto__" }]
            }
          }
        }
      }
    }],
    world_requirements: {
      definitions: { panel: primitiveDefinition("panel", [1, 1, 1]) },
      defs: defsAlias
    }
  };
}

const hasAssembly = !!process.env.R15_ASSEMBLY_ROOT && !!process.env.R15_CORE_PATH;
test("Assembly PR #28: definitions/defs alias merge preserves a special own definition through closure, hash, and real receiver use", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R15_ASSEMBLY_COMMIT, ASSEMBLY_PR28);
  assert.equal(process.env.R15_CORE_COMMIT, CORE);
  const Assembly = require(path.join(process.env.R15_ASSEMBLY_ROOT, "src"));
  const MT = require(path.resolve(process.env.R15_CORE_PATH));

  const authored = assemblyAliasRequest(primitiveDefinition("__proto__", [2, 1, 1]));
  const before = JSON.stringify(authored);
  const first = Assembly.run(authored);
  const second = Assembly.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "alias closure must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Assembly must not mutate caller-owned alias maps");
  assert.equal(Object.prototype.hasOwnProperty.call(first.world_requirements.definitions, "panel"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(first.world_requirements.definitions, "__proto__"), true, "special definition must remain an own merged definition");
  assert.deepEqual(first.required_definitions, ["__proto__", "panel"]);

  const changed = Assembly.run(assemblyAliasRequest(primitiveDefinition("__proto__", [3, 1, 1])));
  assert.equal(changed.status, "CANDIDATE", JSON.stringify(changed.holds));
  assert.notEqual(first.closure_hash.value, changed.closure_hash.value, "changing only special-name definition matter must change closure identity");

  const world = MT.createWorld("Verification round 15 Assembly alias closure proof");
  world.defs = first.world_requirements.definitions;
  const tile = MT.createTile(first.candidate);
  world.tiles[tile.id] = tile;
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 2);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const conflicting = assemblyAliasRequest(primitiveDefinition("__proto__", [2, 1, 1]));
  Object.defineProperty(conflicting.world_requirements.definitions, "__proto__", {
    value: primitiveDefinition("__proto__", [9, 1, 1]),
    enumerable: true,
    configurable: true,
    writable: true
  });
  const conflictOut = Assembly.run(conflicting);
  assert.equal(conflictOut.status, "HOLD");
  const conflict = conflictOut.holds.find((item) => item.code === "HOLD_DEFINITION_CONFLICT" && item.identity === "__proto__");
  assert.ok(conflict, JSON.stringify(conflictOut.holds));
  assert.equal(conflictOut.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-definition-alias-own-key-round15/v0.1",
    target_commit: ASSEMBLY_PR28,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "definitions-plus-defs-compatible-union",
      "special-own-definition-preserved",
      "complete-definition-closure",
      "closure-hash-covers-special-definition-matter",
      "real-core-consumes-merged-special-definition",
      "special-name-alias-conflict-remains-explicit"
    ],
    visual_quality: "NOT_TESTED",
    placement: "ASSEMBLY_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});
