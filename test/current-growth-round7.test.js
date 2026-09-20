"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE_PR16 = "f583deaf880b41b26f69f0c5c44236dbb8869c63";
const CORE_MAIN = "63a65c70bb702cb9ac979ec04233ffaa7ed5d179";
const SURFACE_PR17 = "9ea5205381ad570fe23cf518886ef2f233c0b626";
const FORM_PR19 = "fc1cb264235e0a5df02e07618dffbec6dc509a7b";
const INTERFACE_PR14 = "246f36d270c2b82f0ea89817f054bd1701ce9eeb";

function ownData(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return target;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applyOperation(MT, ws, op, label) {
  const candidate = MT.cloneBody(ws, "verification", label || "round7");
  const edited = MT.editCandidate(ws, candidate, op);
  assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

function requestEnvelope(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "independent Verification Machine boundary replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

const hasCorePr16 = !!process.env.R7_CORE_PR16_PATH;
test("MorphTile PR #16: own-key kit repair still accepts removal of a missing inherited-looking word", { skip: !hasCorePr16 }, () => {
  assert.equal(process.env.R7_CORE_PR16_COMMIT, CORE_PR16);
  const MT = require(path.resolve(process.env.R7_CORE_PR16_PATH));
  const ws = MT.createWorkspace(MT.createWorld("Verification own-key registry"));

  applyOperation(MT, ws, { op: "word.define", name: "alpha", args: [], body: 1 }, "seed-alpha");
  assert.equal(hasOwn(ws.live.words, "alpha"), true);
  assert.equal(hasOwn(ws.live.words, "constructor"), false);

  const canonicalBefore = MT.structHash(ws.live);
  const candidate = MT.cloneBody(ws, "verification", "missing-constructor-remove");
  const edited = MT.editCandidate(ws, candidate, { op: "word.remove", name: "constructor" });

  // The safe contract is to reject a removal for a name that is not an own
  // authored word. This exact candidate instead treats Object.prototype's
  // inherited constructor as if it established word existence, then succeeds
  // after deleting nothing. Verification records that producer/core FAIL/HOLD
  // explicitly rather than repairing the candidate here.
  const acceptedMissingInheritedName = edited.ok === true;
  assert.equal(acceptedMissingInheritedName, true, "exact PR #16 head no longer reproduces the expected registry existence gap");
  assert.equal(MT.structHash(ws.live), canonicalBefore, "candidate verification must not mutate canonical world matter");
  assert.equal(hasOwn(ws.live.words, "constructor"), false);

  // Positive control: an actually authored own `constructor` word is legitimate
  // registry data and can be defined and removed through the same public path.
  applyOperation(MT, ws, { op: "word.define", name: "constructor", args: [], body: 22 }, "define-own-constructor");
  assert.equal(hasOwn(ws.live.words, "constructor"), true);
  applyOperation(MT, ws, { op: "word.remove", name: "constructor" }, "remove-own-constructor");
  assert.equal(hasOwn(ws.live.words, "constructor"), false);
  assert.equal(hasOwn(ws.live.words, "alpha"), true);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/core-kit-own-key-round7/v0.1",
    target_commit: CORE_PR16,
    status: "FAIL",
    failure: "CORE_WORD_REMOVE_INHERITED_NAME_ACCEPTED",
    observed: {
      missing_constructor_is_own_word: false,
      removal_candidate_accepted: acceptedMissingInheritedName,
      canonical_unchanged_during_attack: MT.structHash(ws.live) !== null,
      positive_own_constructor_define_remove: true
    },
    placement: "MORPHTILE_CORE_PR16"
  }));
});

const hasSurface = !!process.env.R7_SURFACE_ROOT;
test("Surface PR #17: inert writes preserve special-key identity across outer intent and raw paint", { skip: !hasSurface }, () => {
  assert.equal(process.env.R7_SURFACE_COMMIT, SURFACE_PR17);
  const surface = require(path.join(process.env.R7_SURFACE_ROOT, "src"));
  const { clonePortablePaintValue } = require(path.join(process.env.R7_SURFACE_ROOT, "src", "surface-intent.js"));

  const intent = {};
  ownData(intent, "constructor", { authored: true });
  const intentDescriptor = Object.getOwnPropertyDescriptor(intent, "constructor");
  const intentPrototype = Object.getPrototypeOf(intent);
  const intentOut = surface.run(requestEnvelope("r7-surface-intent-constructor", intent));
  assert.equal(intentOut.status, "HOLD");
  assert.equal(intentOut.holds[0].code, "HOLD_SURFACE_INTENT_FIELD_UNKNOWN");
  assert.equal(intentOut.candidate, null);
  assert.equal(Object.getPrototypeOf(intent), intentPrototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(intent, "constructor"), intentDescriptor);

  const paint = { color: [0.2, 0.4, 0.6] };
  ownData(paint, "toString", { authored: true });
  const paintDescriptor = Object.getOwnPropertyDescriptor(paint, "toString");
  const paintOut = surface.run(requestEnvelope("r7-surface-paint-tostring", { paint }));
  assert.equal(paintOut.status, "HOLD");
  assert.equal(paintOut.holds[0].code, "HOLD_SURFACE_PAINT_FIELD_UNKNOWN");
  assert.equal(paintOut.candidate, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(paint, "toString"), paintDescriptor);

  const nested = { ordinary: 7 };
  ownData(nested, "constructor", { nested: "data" });
  ownData(nested, "__proto__", { nested: "proto-data" });
  const cloned = clonePortablePaintValue(nested, "verification.paint.color[0]");
  assert.equal(Object.getPrototypeOf(cloned), Object.prototype);
  assert.equal(hasOwn(cloned, "constructor"), true);
  assert.deepEqual(cloned.constructor, { nested: "data" });
  assert.equal(hasOwn(cloned, "__proto__"), true);
  assert.deepEqual(cloned.__proto__, { nested: "proto-data" });
  assert.equal(cloned.ordinary, 7);

  const control = surface.run(requestEnvelope("r7-surface-portable-control", { paint: { color: [0.2, 0.4, 0.6] } }));
  assert.equal(control.status, "CANDIDATE");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-inert-write-round7/v0.1",
    target_commit: SURFACE_PR17,
    status: "PASS",
    checked: [
      "outer-constructor-key-reaches-semantic-hold",
      "paint-tostring-key-reaches-semantic-hold",
      "nested-constructor-and-__proto__-remain-own-data",
      "portable-paint-control-remains-candidate"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

const hasForm = !!process.env.R7_FORM_ROOT && !!process.env.R7_CORE_MAIN_PATH;
test("Form PR #19: definition settings preserve multiple inherited-looking own keys into current core", { skip: !hasForm }, () => {
  assert.equal(process.env.R7_FORM_COMMIT, FORM_PR19);
  assert.equal(process.env.R7_CORE_MAIN_COMMIT, CORE_MAIN);
  const form = require(path.join(process.env.R7_FORM_ROOT, "src"));
  const base = require(path.join(process.env.R7_FORM_ROOT, "fixtures", "request.box.json"));
  const MT = require(path.resolve(process.env.R7_CORE_MAIN_PATH));

  const settings = {};
  ownData(settings, "__proto__", 2);
  ownData(settings, "constructor", 3);
  ownData(settings, "toString", 4);
  const before = JSON.stringify(settings);

  const input = {
    ...clone(base),
    request_id: "r7-form-multi-own-key-settings",
    intent: {
      name: "round7 multiple own-key settings",
      instances: [{ use: "panel", with: settings }]
    }
  };
  const out = form.run(input);
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out));
  assert.equal(JSON.stringify(settings), before, "Form must not mutate caller-owned settings");
  const emitted = out.candidate.facets.mesh.data.parts[0].with;
  for (const [key, value] of [["__proto__", 2], ["constructor", 3], ["toString", 4]]) {
    assert.equal(hasOwn(emitted, key), true, `${key} must remain an own emitted setting`);
    assert.equal(emitted[key], value);
  }

  const vars = {};
  ownData(vars, "__proto__", 1);
  ownData(vars, "constructor", 1);
  ownData(vars, "toString", 1);
  const world = {
    defs: {
      panel: {
        id: "panel",
        name: "Round7 own-key definition",
        created_by: "verification",
        body: {
          facets: {
            mesh: {
              type: "generated",
              source: null,
              data: {
                generator: "recipe",
                vars,
                parts: [{
                  shape: "box",
                  size: [["var", "__proto__"], ["var", "constructor"], ["var", "toString"]]
                }]
              }
            }
          }
        }
      }
    }
  };
  const tile = MT.createTile(out.candidate);
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 1);
  assert.ok(compiled.P.length > 0);
  assert.ok(compiled.P.every(Number.isFinite));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-own-key-settings-round7/v0.1",
    target_commit: FORM_PR19,
    receiver_commit: CORE_MAIN,
    status: "PASS",
    checked: [
      "__proto__-constructor-toString-remain-own-settings",
      "caller-settings-not-mutated",
      "current-core-compiles-all-three-as-numeric-definition-overrides"
    ],
    placement: "FORM_MACHINE"
  }));
});

const hasInterface = !!process.env.R7_INTERFACE_ROOT && !!process.env.R7_CORE_MAIN_PATH;
test("Interface PR #14: conditional visibility follows canonical state and cannot widen action authority", { skip: !hasInterface }, () => {
  assert.equal(process.env.R7_INTERFACE_COMMIT, INTERFACE_PR14);
  assert.equal(process.env.R7_CORE_MAIN_COMMIT, CORE_MAIN);
  const iface = require(path.join(process.env.R7_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R7_CORE_MAIN_PATH));

  const positive = iface.run(requestEnvelope("r7-interface-when-positive", {
    tile_path: "mt_tower",
    title: "Conditional canonical state",
    elements: [{
      kind: "when",
      binding: "beacon",
      children: [
        { kind: "text", text: "Verification beacon active" },
        { kind: "action", binding: "toggle", label: "Verification toggle" }
      ]
    }],
    bindings: { readouts: ["beacon"], actions: ["toggle"] }
  }));
  assert.equal(positive.status, "CANDIDATE", JSON.stringify(positive));
  assert.deepEqual(positive.dependencies[0].requires.readout_logic_vars, ["beacon"]);
  assert.deepEqual(positive.dependencies[0].requires.action_input_signal_socket_ids, ["toggle"]);
  assert.deepEqual(positive.candidate.operation.view.body, [{
    group: [
      { text: "Verification beacon active" },
      { button: "toggle", label: "Verification toggle" }
    ],
    when: ["var", "beacon"]
  }]);

  const ws = MT.createWorkspace(MT.seedWorld());
  const before = MT.structHash(ws.live);
  const candidate = MT.cloneBody(ws, "verification", "round7-conditional-positive");
  const edited = MT.editCandidate(ws, candidate, positive.candidate.operation);
  assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true);
  const committedHash = MT.structHash(ws.live);

  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const off = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.doesNotMatch(off, /Verification beacon active/);
  assert.equal(MT.structHash(ws.live), committedHash);

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const on = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(on, /Verification beacon active/);
  assert.match(on, /data-signal="mt_tower:toggle"/);
  assert.equal(MT.structHash(ws.live), committedHash, "conditional rendering must remain read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.exact, true);
  assert.equal(MT.structHash(ws.live), before);

  // Separate fail-safe attack: Interface may transport an explicitly declared
  // symbolic action name, but a conditional container must not grant runtime
  // authority when dependency discharge is bypassed. `lit` is output-only on
  // the canonical tower, so current core must keep it inert even while visible.
  const unsafe = iface.run(requestEnvelope("r7-interface-when-output-action", {
    tile_path: "mt_tower",
    title: "Conditional authority attack",
    elements: [{
      kind: "when",
      binding: "beacon",
      children: [{ kind: "action", binding: "lit", label: "Output-only action" }]
    }],
    bindings: { readouts: ["beacon"], actions: ["lit"] }
  }));
  assert.equal(unsafe.status, "CANDIDATE");
  assert.deepEqual(unsafe.dependencies[0].requires.action_input_signal_socket_ids, ["lit"]);

  const ws2 = MT.createWorkspace(MT.seedWorld());
  const bypass = MT.cloneBody(ws2, "verification", "round7-proof-bypass");
  const bypassEdit = MT.editCandidate(ws2, bypass, unsafe.candidate.operation);
  assert.equal(bypassEdit.ok, true);
  const bypassPlan = MT.planMerge(ws2, [bypass]);
  assert.equal(bypassPlan.status, "READY");
  const bypassCommit = MT.commitPlan(ws2, bypassPlan.id, "verification");
  assert.equal(bypassCommit.ok, true);
  MT.act(ws2, { do: "signal", tile: "mt_tower", name: "toggle" });
  const bypassHtml = MT.vnodeToHTML(MT.compilePanel(ws2.live).root);
  assert.match(bypassHtml, /Output-only action/);
  assert.doesNotMatch(bypassHtml, /data-signal="mt_tower:lit"/, "conditional visibility must not create action authority");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-conditional-round7/v0.1",
    target_commit: INTERFACE_PR14,
    receiver_commit: CORE_MAIN,
    status: "PASS",
    checked: [
      "exact-symbolic-when-compilation",
      "canonical-state-hidden-visible-hidden",
      "render-read-only",
      "exact-rollback",
      "output-only-action-remains-inert-under-proof-bypass"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_FAILSAFE"
  }));
});
