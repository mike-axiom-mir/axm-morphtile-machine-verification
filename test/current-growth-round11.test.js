"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR23 = "d3d6e459569dd29463afa6fd61f0b6b5cd3afef3";
const SURFACE_PR21 = "3e43c003a0dc54f7ae877767fd2c3dff9daaa39d";
const INTERFACE_PR18 = "3ed535f9b90c29d4c9e3f5f5559db274b95e8f01";
const ASSEMBLY_PR25 = "99577f2851cf5a7146871a49cc208d582aa3cb98";
const MERGED_SURFACE = "4349ba0d926aee1d36dde86fc7f69d04a58bf924";
const MERGED_INTERFACE = "1a941f8ff88ca590952571e3eeeeeeef6daefd77";

function request(id, intent, goal = "independent Verification Machine round 11 replay") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstHoldCode(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0].code || null;
  if (value && value.hold && typeof value.hold === "object") return value.hold.code || null;
  return value && value.code || null;
}

function compileFormCandidate(MT, candidate) {
  const world = MT.createWorld("Round 11 Form receiver");
  world.defs.panel = {
    id: "panel",
    name: "Panel",
    body: {
      facets: {
        mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 2, 3] } },
        material: { type: "primitive", source: null, data: { color: [0.6, 0.6, 0.8] } }
      }
    }
  };
  const tile = MT.createTile(candidate);
  world.tiles[tile.id] = tile;
  return MT.compileMesh(tile, world);
}

const hasForm = !!process.env.R11_FORM_ROOT && !!process.env.R11_CORE_PATH;
test("Form PR #23: in-place progression emits no hidden translation and still requires genuine progression", { skip: !hasForm }, () => {
  assert.equal(process.env.R11_FORM_COMMIT, FORM_PR23);
  assert.equal(process.env.R11_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R11_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R11_CORE_PATH));

  const authored = request("r11-form-in-place", {
    repeat: {
      count: 3,
      step: [0, 0, 0],
      rot_step: [0, 0.35, 0],
      instance: { use: "panel", pos: [4, -2, 1], rot: [0, 0.1, 0] }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.deepEqual(first, second, "in-place progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));

  const body = first.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(body.pos, [4, -2, 1], "validation-only movement must never leak into emitted matter");
  assert.deepEqual(body.rot[1], ["+", 0.1, ["*", ["var", "i"], 0.35]]);

  const mesh = compileFormCandidate(MT, first.candidate);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));

  const pureDuplicate = Form.run(request("r11-form-zero-step-no-progression", {
    repeat: { count: 3, step: [0, 0, 0], instance: { use: "panel", pos: [4, -2, 1] } }
  }));
  assert.equal(pureDuplicate.status, "HOLD");
  assert.equal(firstHoldCode(pureDuplicate), "HOLD_FORM_REPEAT_INVALID");

  const singleton = Form.run(request("r11-form-singleton-with-step", {
    repeat: { count: 1, step: [0, 0, 0], with_step: { width: 1 }, instance: { use: "panel", with: { width: 2 } } }
  }));
  assert.equal(singleton.status, "HOLD");
  assert.equal(firstHoldCode(singleton), "HOLD_FORM_REPEAT_INVALID");
  assert.equal(singleton.candidate, null);

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/form-in-place-round11/v0.1", target_commit: FORM_PR23, receiver_commit: CORE, status: "PASS", checked: ["zero-step-with-real-progression-candidate", "no-private-validation-translation-leak", "real-core-finite-runtime", "pure-zero-step-duplicates-held", "singleton-setting-progression-held"], visual_quality: "NOT_TESTED", placement: "FORM_MACHINE" }));
});

const hasSurface = !!process.env.R11_SURFACE_ROOT;
test("Surface PR #21: compiled signed-zero normalization is explicit before transport while pass-through paint stays strict", { skip: !hasSurface }, () => {
  assert.equal(process.env.R11_SURFACE_COMMIT, SURFACE_PR21);
  const Surface = require(path.join(process.env.R11_SURFACE_ROOT, "src"));
  const { normalizeSurfaceIntent } = require(path.join(process.env.R11_SURFACE_ROOT, "src", "surface-intent"));
  const { compileSurfaceRule } = require(path.join(process.env.R11_SURFACE_ROOT, "src", "surface-rules"));
  const { compileSurfacePattern } = require(path.join(process.env.R11_SURFACE_ROOT, "src", "surface-patterns"));

  const base = [-0, 0.25, -0];
  const normalized = normalizeSurfaceIntent({ base_color: base });
  assert.equal(Object.is(normalized.base_color[0], -0), false);
  assert.equal(Object.is(normalized.base_color[2], -0), false);
  assert.equal(Object.is(base[0], -0), true, "compiled normalization must not mutate caller-owned source");

  const authoredRule = {
    kind: "axis_gradient",
    axis: "x",
    from: -0,
    to: 1,
    start_color: [-0, 0.2, 0.3],
    end_color: [0.8, 0.9, -0]
  };
  const compiled = compileSurfaceRule(authoredRule);
  assert.equal(Object.is(compiled.normalized.from, -0), false);
  assert.equal(Object.is(compiled.normalized.start_color[0], -0), false);
  assert.equal(Object.is(compiled.normalized.end_color[2], -0), false);
  assert.equal(Object.is(authoredRule.from, -0), true);
  assert.equal(Object.is(authoredRule.start_color[0], -0), true);

  const runRequest = request("r11-surface-axis-gradient-zero", { surface_rule: authoredRule });
  const beforeSign = Object.is(runRequest.intent.surface_rule.from, -0);
  const outA = Surface.run(runRequest);
  const outB = Surface.run(runRequest);
  assert.deepEqual(outA, outB, "compiled normalization must replay deterministically");
  assert.equal(outA.status, "CANDIDATE", JSON.stringify(outA.holds));
  assert.equal(beforeSign, true);
  assert.equal(Object.is(runRequest.intent.surface_rule.from, -0), true, "Surface must preserve source sign even when compiled grammar canonicalizes it");

  const raw = Surface.run(request("r11-surface-raw-zero", { paint: { color: [["/", 1, -0], 0.5, 0.25] } }));
  assert.equal(raw.status, "HOLD");
  assert.equal(firstHoldCode(raw), "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");

  assert.throws(() => compileSurfacePattern({ kind: "checker", scale: -0 }), (error) => error && error.code === "HOLD_SURFACE_PATTERN_SCALE_INVALID");

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/surface-compiled-zero-round11/v0.1", target_commit: SURFACE_PR21, status: "PASS", checked: ["compiled-zero-canonicalized-before-envelope", "caller-sign-preserved", "axis-gradient-normalized-explicitly", "raw-paint-remains-strict", "positive-only-pattern-zero-boundary-retained"], visual_quality: "NOT_TESTED", placement: "SURFACE_MACHINE" }));
});

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

const hasInterface = !!process.env.R11_INTERFACE_ROOT && !!process.env.R11_CORE_PATH;
test("Interface PR #18: anchors exist only in tile presentation semantics and exact runtime rollback remains intact", { skip: !hasInterface }, () => {
  assert.equal(process.env.R11_INTERFACE_COMMIT, INTERFACE_PR18);
  assert.equal(process.env.R11_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R11_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R11_CORE_PATH));

  for (const mode of ["screen", "docked", "floating", "fullscreen", "embedded", "world"]) {
    const authored = request("r11-interface-inert-anchor-" + mode, { tile_path: "mt_tower", title: "Anchor boundary", placement: { mode, anchor: "mt_core", user_adjustable: false } });
    const before = JSON.stringify(authored);
    const out = Interface.run(authored);
    assert.equal(out.status, "HOLD", mode);
    assert.equal(firstHoldCode(out), "HOLD_INVALID_PRESENTATION_PLACEMENT");
    assert.equal(out.candidate, null);
    assert.deepEqual(out.dependencies, []);
    assert.equal(JSON.stringify(authored), before, "rejected placement must remain source-preserving");
  }

  const explicit = Interface.run(request("r11-interface-tile-anchor", { tile_path: "mt_tower", title: "Anchored", placement: { mode: "tile", anchor: "mt_core", user_adjustable: false } }));
  assert.equal(explicit.status, "CANDIDATE", JSON.stringify(explicit.holds));
  assert.deepEqual(explicit.candidate.operations[1].presentation, { mode: "tile", anchor: "mt_core", user_adjustable: false });
  assert.deepEqual(explicit.dependencies.map((item) => item.id), ["morphtile.interface-target-proof:mt_tower", "morphtile.presentation-anchor-proof:mt_core"]);

  const implicit = Interface.run(request("r11-interface-tile-self-anchor", { tile_path: "mt_tower", title: "Self anchored", placement: { mode: "tile", user_adjustable: false } }));
  assert.equal(implicit.status, "CANDIDATE", JSON.stringify(implicit.holds));
  assert.deepEqual(implicit.dependencies.map((item) => item.id), ["morphtile.interface-target-proof:mt_tower"]);

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, explicit, "round11-interface-anchor");
  const committedHash = MT.structHash(ws.live);
  const resolved = MT.resolvePresentation(ws.live, "mt_tower");
  assert.equal(resolved.status, "READY", JSON.stringify(resolved));
  assert.equal(resolved.resolved.mode, "tile");
  assert.equal(resolved.anchor_frame.anchor, "mt_core");
  assert.equal(MT.structHash(ws.live), committedHash, "presentation resolution must remain read-only");
  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash);

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/interface-anchor-consumption-round11/v0.1", target_commit: INTERFACE_PR18, receiver_commit: CORE, status: "PASS", checked: ["all-nontile-anchor-modes-held", "tile-anchor-dependency-explicit", "native-self-anchor-default-preserved", "real-core-anchor-resolution", "render-resolution-readonly", "exact-rollback"], visual_quality: "NOT_TESTED", placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY" }));
});

function uiEligibility(id) {
  return {
    status: "CANDIDATE",
    machine: { id: "verification.eligibility", version: "0.1" },
    request_id: "eligibility-" + id,
    candidate: { schema: "morphtile.tile-spec/v0.4", id, name: "Verification panel", form_hints: ["ui_panel"], facets: {} },
    provenance: { caller: "verification-explicit-ui-eligibility" }
  };
}

const hasAssembly = !!process.env.R11_ASSEMBLY_ROOT && !!process.env.R11_MERGED_SURFACE_ROOT && !!process.env.R11_MERGED_INTERFACE_ROOT;
test("Assembly PR #25: current contextual path and upstream HOLD provenance stay explicit instead of being invented or promoted", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R11_ASSEMBLY_COMMIT, ASSEMBLY_PR25);
  assert.equal(process.env.R11_MERGED_SURFACE_COMMIT, MERGED_SURFACE);
  assert.equal(process.env.R11_MERGED_INTERFACE_COMMIT, MERGED_INTERFACE);
  const Assembly = require(path.join(process.env.R11_ASSEMBLY_ROOT, "src"));
  const Surface = require(path.join(process.env.R11_MERGED_SURFACE_ROOT, "src"));
  const Interface = require(path.join(process.env.R11_MERGED_INTERFACE_ROOT, "src"));

  const interfaceOut = Interface.run(request("r11-assembly-contextual-interface", { tile_path: "mt_shell/mt_panel", title: "Contextual", elements: [{ kind: "tile", tile_path: "mt_shell/mt_inner" }] }));
  assert.equal(interfaceOut.status, "CANDIDATE", JSON.stringify(interfaceOut.holds));
  const assembled = Assembly.run({ envelope_version: "0.1", request_id: "r11-assembly-contextual", goal: "Preserve exact contextual Interface path without inventing parent world", intent: { id: "mt_panel", tile_path: "mt_shell/mt_panel" }, inputs: [uiEligibility("mt_panel"), interfaceOut], provenance: { caller: "verification" } });
  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds));
  assert.deepEqual(assembled.target_binding, { id: "mt_panel", path: "mt_shell/mt_panel" });
  assert.deepEqual(assembled.candidate.view.body, [{ tile: "/mt_shell/mt_inner" }]);
  assert.equal(assembled.dependencies.some((item) => item.id === "morphtile.interface-target-proof:mt_shell/mt_panel"), true);

  const noParent = Assembly.run({ envelope_version: "0.1", request_id: "r11-assembly-no-parent", goal: "Do not infer missing parent context", intent: { id: "mt_panel" }, inputs: [uiEligibility("mt_panel"), interfaceOut], provenance: { caller: "verification" } });
  assert.equal(noParent.status, "HOLD");
  assert.equal(noParent.holds.some((hold) => hold.code === "HOLD_VIEW_OPERATION_TARGET_PATH_UNBOUND"), true);
  assert.equal(noParent.candidate, null);

  const rejectedSurface = Surface.run(request("r11-assembly-upstream-surface-hold", { paint: { color: [["/", 1, -0], 0.5, 0.25] } }));
  assert.equal(rejectedSurface.status, "HOLD");
  assert.equal(firstHoldCode(rejectedSurface), "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  const propagated = Assembly.run({ envelope_version: "0.1", request_id: "r11-assembly-upstream-hold", goal: "Preserve rejected upstream source as provenance", intent: { id: "mt_panel" }, inputs: [rejectedSurface], provenance: { caller: "verification" } });
  assert.equal(propagated.status, "HOLD");
  const inputHold = propagated.holds.find((hold) => hold.code === "HOLD_INPUT_NOT_CANDIDATE");
  assert.ok(inputHold, JSON.stringify(propagated.holds));
  assert.equal(inputHold.status, "HOLD");
  assert.equal(inputHold.upstream_holds[0].code, "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  assert.equal(propagated.source_provenance[0].status, "HOLD");

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/assembly-current-context-round11/v0.1", target_commit: ASSEMBLY_PR25, status: "PASS", checked: ["same-root-owner-binding-preserved", "embedded-path-preserved", "missing-parent-context-not-invented", "upstream-hold-not-promoted", "upstream-hold-provenance-preserved"], visual_quality: "NOT_TESTED", placement: "ASSEMBLY_MACHINE" }));
});
