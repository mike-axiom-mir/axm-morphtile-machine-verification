"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifyCoreMeshFiniteBoundary,
  verifySurfacePortableFiniteBoundary
} = require("../src/current-nonfinite-boundaries-conformance");
const { resolveInterfaceTargetProof } = require("../src/interface-target-proof-conformance");

const EXPECTED_CORE = "8ca51aedbc7c82cdd5969aa44490912609227405";
const EXPECTED_SURFACE = "c2c4d0a6e77945c0828abd76d4805049c4bde982";
const EXPECTED_INTERFACE = "51f5053e78404be0b5b2cd40a92a7f6ac2690542";
const EXPECTED_INTERFACE_CORE = "d2d2df0e4ad88f1cda885e3eb1394151515e7946";

const corePath = process.env.CURRENT_NONFINITE_CORE_PATH;
const coreCommit = process.env.CURRENT_NONFINITE_CORE_COMMIT;
const surfaceRoot = process.env.CURRENT_NONFINITE_SURFACE_ROOT;
const surfaceCommit = process.env.CURRENT_NONFINITE_SURFACE_COMMIT;
const interfaceRoot = process.env.CURRENT_INTERFACE_ROOT;
const interfaceCommit = process.env.CURRENT_INTERFACE_COMMIT;
const interfaceCorePath = process.env.CURRENT_INTERFACE_CORE_PATH;
const interfaceCoreCommit = process.env.CURRENT_INTERFACE_CORE_COMMIT;

const integrationTest = corePath && surfaceRoot ? test : test.skip;
const interfaceIntegrationTest = interfaceRoot && interfaceCorePath ? test : test.skip;

integrationTest("MorphTile PR #14 fails closed on derived non-finite geometry without rejecting a large finite control", () => {
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin the exact MorphTile PR #14 head");
  const MorphTile = require(path.resolve(corePath));
  const result = verifyCoreMeshFiniteBoundary(MorphTile, { coreCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.deepEqual(
    result.receipt.probes.map((probe) => [probe.name, probe.hold, probe.positions, probe.triangles, probe.colors, probe.threw]),
    [
      ["direct-box-overflow", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null],
      ["multi-part-no-partial-leak", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null],
      ["generated-tower-overflow", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, null]
    ]
  );
  assert.equal(result.receipt.finite_control.hold, null);
  assert.equal(result.receipt.finite_control.all_positions_finite, true);
});

integrationTest("Surface PR #14 rejects non-finite portable meaning before JSON rewriting and preserves finite controls", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin the exact Surface PR #14 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfacePortableFiniteBoundary(surface, { surfaceCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
  assert.deepEqual(
    result.receipt.outcomes.map((outcome) => [outcome.name, outcome.status, outcome.hold || null]),
    [
      ["gradient-derived-overflow", "HOLD", "HOLD_SURFACE_RULE_RANGE_INVALID"],
      ["gradient-large-finite-control", "CANDIDATE", null],
      ["paint-nested-infinity", "HOLD", "HOLD_SURFACE_PAINT_NONFINITE_VALUE"],
      ["paint-nested-nan", "HOLD", "HOLD_SURFACE_PAINT_NONFINITE_VALUE"],
      ["paint-var-infinity", "HOLD", "HOLD_SURFACE_PAINT_VARS_INVALID"],
      ["paint-finite-control", "CANDIDATE", null]
    ]
  );
});

interfaceIntegrationTest("Interface PR #9 keeps symbolic output-signal intent as an unresolved obligation while merged core keeps it inert", () => {
  assert.equal(interfaceCommit, EXPECTED_INTERFACE, "workflow must pin the exact Interface PR #9 head");
  assert.equal(interfaceCoreCommit, EXPECTED_INTERFACE_CORE, "workflow must pin Interface's exact merged MorphTile receiver");

  const MorphTile = require(path.resolve(interfaceCorePath));
  const interfaceMachine = require(path.resolve(interfaceRoot, "src"));
  const manifest = require(path.resolve(interfaceRoot, "machine.json"));
  assert.equal(manifest.tested_against.commit, interfaceCoreCommit, "Interface manifest pin must match the independently executed receiver");

  const request = {
    envelope_version: "0.1",
    request_id: "verification-interface-unproved-output-action",
    goal: "Keep symbolic output-signal intent separate from target authority",
    intent: {
      tile_path: "mt_tower",
      title: "Authority proof",
      action: "lit",
      action_label: "Output is not an input action",
      bindings: { actions: ["lit"] }
    },
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
  const beforeRequest = JSON.stringify(request);
  const output = interfaceMachine.run(request);
  assert.equal(JSON.stringify(request), beforeRequest, "Interface Machine must not mutate the caller request");
  assert.equal(output.status, "CANDIDATE");

  const dependency = output.dependencies.find((entry) => entry && entry.kind === "morphtile.interface-target-proof/v0.1");
  assert.ok(dependency, "symbolic action candidate must carry a target-local proof obligation");
  assert.deepEqual(dependency.requires.action_input_signal_socket_ids, ["lit"]);

  const world = MorphTile.seedWorld();
  const beforeResolve = MorphTile.hashOf(world);
  const resolution = resolveInterfaceTargetProof(MorphTile, world, dependency);
  assert.equal(resolution.status, "HOLD", JSON.stringify(resolution, null, 2));
  assert.ok(resolution.errors.some((entry) => entry.code === "INTERFACE_TARGET_ACTION_INPUT_SIGNAL_MISSING"));
  assert.equal(MorphTile.hashOf(world), beforeResolve, "proof resolution must remain read-only");

  const workspace = MorphTile.createWorkspace(MorphTile.seedWorld());
  const beforeCommit = MorphTile.structHash(workspace.live);
  const candidate = MorphTile.cloneBody(workspace, "ai", "verification:interface-pr9");
  const edited = MorphTile.editCandidate(workspace, candidate, output.candidate.operation);
  assert.ok(edited.ok, edited.error);
  const plan = MorphTile.planMerge(workspace, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MorphTile.commitPlan(workspace, plan.id);
  assert.ok(committed.ok);

  const html = MorphTile.vnodeToHTML(MorphTile.compilePanel(workspace.live).root);
  assert.doesNotMatch(html, /data-signal="mt_tower:lit"/, "an output signal name must never acquire input action authority");
  assert.match(html, /no exposed action called lit/, "unproved symbolic action must remain visibly inert even if a caller bypasses dependency discharge");

  const rollback = MorphTile.rollback(workspace, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MorphTile.structHash(workspace.live), beforeCommit, "direct runtime fallback proof must roll back exactly");

  const positive = interfaceMachine.run({
    ...request,
    request_id: "verification-interface-proved-input-action",
    intent: {
      ...request.intent,
      action: "toggle",
      action_label: "Real input action",
      bindings: { actions: ["toggle"] }
    }
  });
  assert.equal(positive.status, "CANDIDATE");
  const positiveDependency = positive.dependencies.find((entry) => entry && entry.kind === "morphtile.interface-target-proof/v0.1");
  const positiveResolution = resolveInterfaceTargetProof(MorphTile, MorphTile.seedWorld(), positiveDependency);
  assert.equal(positiveResolution.status, "PASS", JSON.stringify(positiveResolution, null, 2));
});
