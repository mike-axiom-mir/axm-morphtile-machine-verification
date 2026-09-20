"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXPECTED_ACTION_CORE = "86328f7c773cc67a7ed14e07fbebcfc74957860b";
const EXPECTED_CORE_MAIN = "26b89a77f6a90715a6742dc4d084008ba63731b6";
const EXPECTED_SURFACE = "555f4eeedbb383c90776581fe1c5a32b412905c9";
const EXPECTED_FORM = "e3abd9e8e4fad755c741dd9fe42d6601fb5f2bfc";

const actionCorePath = process.env.ACTION_CORE_PATH;
const actionCoreCommit = process.env.ACTION_CORE_COMMIT;
const currentCorePath = process.env.CURRENT_CORE_PATH;
const currentCoreCommit = process.env.CURRENT_CORE_COMMIT;
const surfaceRoot = process.env.SURFACE_ROOT;
const surfaceCommit = process.env.SURFACE_COMMIT;
const formRoot = process.env.FORM_ROOT;
const formCommit = process.env.FORM_COMMIT;

const integrationTest = actionCorePath && currentCorePath && surfaceRoot && formRoot ? test : test.skip;

integrationTest("repaired core exposes custom-view action authority only through input signal socket IDs", () => {
  assert.equal(actionCoreCommit, EXPECTED_ACTION_CORE, "workflow must pin the exact repaired MorphTile PR head");
  const MT = require(path.resolve(actionCorePath));
  const world = MT.seedWorld();
  const tile = MT.createTile({ id: "mt_verify_actions", name: "Verification actions", form_hints: ["ui_panel"] });

  tile.facets.connect.sockets = [
    { id: "action_socket", kind: "signal", dir: "in", signal: "canonical_action" },
    { id: "output_socket", kind: "signal", dir: "out", signal: "canonical_output" },
    { id: "mount_socket", kind: "attach", pos: [0, 0, 0] }
  ];
  tile.view = {
    title: "Authority proof",
    body: [
      { button: "action_socket", label: "Allowed socket id" },
      { button: "canonical_action", label: "Signal alias is not authority" },
      { button: "output_socket", label: "Output is inert" },
      { button: "mount_socket", label: "Attach is inert" },
      { button: "missing_socket", label: "Missing is inert" }
    ]
  };
  tile.provenance.sha256 = MT.contentHash(tile);
  world.tiles[tile.id] = tile;

  const valid = MT.validateWorld(world);
  assert.equal(valid.ok, true, valid.errors.join("; "));
  const before = MT.structHash(world);
  const html = MT.vnodeToHTML(MT.compileView(world, tile.id, tile, 0));
  const bindings = [...html.matchAll(/data-signal="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(bindings, ["mt_verify_actions:canonical_action"], "only the named input signal socket may become actionable");
  assert.match(html, /no exposed action called canonical_action/, "a signal alias cannot substitute for the canonical socket id");
  assert.match(html, /no exposed action called output_socket/);
  assert.match(html, /no exposed action called mount_socket/);
  assert.match(html, /no exposed action called missing_socket/);
  assert.equal((html.match(/class="v-missing"/g) || []).length, 4);
  assert.equal(MT.structHash(world), before, "view compilation must remain read-only");
});

integrationTest("Surface effect-delta evidence is independently recomputable and fails closed on false controls", () => {
  assert.equal(currentCoreCommit, EXPECTED_CORE_MAIN, "Surface evidence must run against current integrated MorphTile main");
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin the exact Surface candidate head");

  const MT = require(path.resolve(currentCorePath));
  const surfaceEvidence = require(path.resolve(surfaceRoot, "tools", "render-evidence.js"));
  const producer = { repository: "mike-axiom-mir/axm-morphtile-machine-surface", commit: surfaceCommit };
  const first = surfaceEvidence.buildEvidence(MT, currentCoreCommit, producer);
  const second = surfaceEvidence.buildEvidence(MT, currentCoreCommit, producer);
  const baseline = surfaceEvidence.verifyBaseline(first, undefined, producer);

  assert.equal(first.schema, "axm.morphtile.surface-render-evidence/v0.4");
  assert.equal(first.visual_quality, "NOT_REVIEWED");
  assert.deepEqual(first.baseline_scope.slice().sort(), ["checker", "facing-up"]);
  assert.deepEqual(baseline.reviewed_case_ids, ["checker", "facing-up"]);
  assert.equal(baseline.status, "PASS");
  assert.deepEqual(first.controls.map((entry) => entry.receipt.id), ["base-control"]);
  assert.deepEqual(first.observations.map((entry) => entry.receipt.id), ["axis-gradient", "stripes"]);

  const control = first.controls[0];
  for (const observation of first.observations) {
    const recomputed = surfaceEvidence.measureTargetPixelDelta(observation.frame, control.frame);
    assert.equal(observation.receipt.deterministic_replay, "PASS");
    assert.equal(observation.receipt.pixel_baseline, "NOT_ESTABLISHED");
    assert.equal(observation.receipt.visual_judgement, "NOT_REVIEWED");
    assert.equal(observation.receipt.effect_delta.status, "PASS");
    assert.deepEqual(recomputed, {
      target_id: observation.receipt.effect_delta.target_id,
      target_pixels: observation.receipt.effect_delta.target_pixels,
      changed_target_pixels: observation.receipt.effect_delta.changed_target_pixels
    });
    assert.ok(recomputed.changed_target_pixels > 0, `${observation.receipt.id} must change at least one target pixel`);
  }

  assert.deepEqual(
    first.observations.map((entry) => [entry.receipt.id, entry.receipt.render_sha256, entry.receipt.effect_delta]),
    second.observations.map((entry) => [entry.receipt.id, entry.receipt.render_sha256, entry.receipt.effect_delta]),
    "effect receipts must replay deterministically"
  );

  assert.throws(
    () => surfaceEvidence.attachEffectDelta(control, control),
    (error) => error && error.code === "SURFACE_RENDER_EVIDENCE_FAILED" && /pixel-identical/.test(error.message),
    "a treatment cannot prove itself by comparing the control to itself"
  );

  let targetPixel = null;
  for (let y = 0; y < control.frame.height && !targetPixel; y += 1) {
    for (let x = 0; x < control.frame.width; x += 1) {
      if (control.frame.pick(x, y) === "mt_tower") { targetPixel = [x, y]; break; }
    }
  }
  assert.ok(targetPixel, "control must contain mt_tower coverage");
  const [driftX, driftY] = targetPixel;
  const observation = first.observations[0];
  const coverageDrift = {
    ...observation.frame,
    pick(x, y) {
      if (x === driftX && y === driftY) return null;
      return observation.frame.pick(x, y);
    }
  };
  assert.throws(
    () => surfaceEvidence.measureTargetPixelDelta(coverageDrift, control.frame),
    (error) => error && error.code === "SURFACE_RENDER_EVIDENCE_FAILED" && /target coverage drifted/.test(error.message),
    "effect comparison must fail closed when target ownership changes"
  );
});

integrationTest("Form caller-recipe escape hatch preserves authored recipe while current core owns finite-meaning rejection", () => {
  assert.equal(currentCoreCommit, EXPECTED_CORE_MAIN, "Form compatibility must run against current integrated MorphTile main");
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin the exact Form candidate head");

  const MT = require(path.resolve(currentCorePath));
  const manifest = require(path.resolve(formRoot, "machine.json"));
  const { run } = require(path.resolve(formRoot, "src"));
  const baseRequest = JSON.parse(fs.readFileSync(path.resolve(formRoot, "fixtures", "request.box.json"), "utf8"));

  assert.equal(manifest.version, "0.9.0");
  assert.equal(manifest.tested_against.commit, currentCoreCommit, "Form manifest pin must match the executed receiver");

  const overflow = {
    ...baseRequest,
    request_id: "verification-form-current-core-overflow",
    intent: {
      name: "caller recipe overflow",
      recipe: [{ shape: "plane", pos: [["*", Number.MAX_VALUE, 2], 0, 0] }]
    }
  };
  const overflowBefore = JSON.stringify(overflow);
  const overflowOut = run(overflow);

  assert.equal(JSON.stringify(overflow), overflowBefore, "Form must not rewrite the caller request while adapting it");
  assert.equal(overflowOut.status, "CANDIDATE");
  assert.ok(overflowOut.warnings.some((warning) => warning.code === "CALLER_RECIPE_RUNTIME_VALIDATION_REQUIRED"));
  assert.deepEqual(overflowOut.candidate.facets.mesh.data.parts, overflow.intent.recipe, "caller recipe must reach the receiver without semantic repair");
  const overflowTile = MT.createTile(overflowOut.candidate);
  assert.equal(MT.validateTile(overflowTile).ok, true);
  assert.equal(MT.compileMesh(overflowTile).hold, "HOLD_RECIPE_NONFINITE_VALUE");

  const finite = {
    ...baseRequest,
    request_id: "verification-form-current-core-finite-control",
    intent: {
      name: "caller recipe finite control",
      recipe: [{ shape: "plane", pos: [["*", 1e100, 2], 0, 0] }]
    }
  };
  const finiteOut = run(finite);
  assert.equal(finiteOut.status, "CANDIDATE");
  assert.deepEqual(finiteOut.candidate.facets.mesh.data.parts, finite.intent.recipe);
  const finiteCompiled = MT.compileMesh(MT.createTile(finiteOut.candidate));
  assert.equal(finiteCompiled.hold, null, "large but finite caller meaning must remain accepted");
  assert.ok(finiteCompiled.P.every(Number.isFinite), "accepted control geometry must remain finite");
});
