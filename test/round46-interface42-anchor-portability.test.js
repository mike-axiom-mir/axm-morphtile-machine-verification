"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "9ea9dd6ca09813885aaaa7fc12c4e06f08fe42e9";
const INTERFACE42 = "8e5e0d8cc7af3d702106093afb839038c677ae93";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R46_INTERFACE42_ROOT && process.env.R46_MORPHTILE_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function commitOperations(MT, ws, operations, label) {
  const candidate = MT.cloneBody(ws, label, "ai:verification-round46");
  for (const operation of operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.ok(edited.ok, edited.error);
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok);
  return committed.receipt;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Interface 42 exact head is evidence-only and registers one structured semantic proof", { skip: !enabled }, () => {
  assert.equal(process.env.R46_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R46_INTERFACE42_COMMIT, INTERFACE42);
  assert.equal(process.env.R46_MORPHTILE_COMMIT, MORPHTILE);

  const changed = git(process.env.R46_INTERFACE42_ROOT, ["diff", "--name-only", INTERFACE_BASE, INTERFACE42])
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(changed, [
    "test/integration-proof-manifest.json",
    "test/presentation-anchor-portability.integration.test.js"
  ]);

  const manifestPath = path.join(process.env.R46_INTERFACE42_ROOT, "test/integration-proof-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const proofs = Array.isArray(manifest) ? manifest : manifest.proofs;
  assert.ok(Array.isArray(proofs), "integration proof manifest must expose a proof list");
  const matches = proofs.filter((proof) => proof.claim === "presentation-anchor-portability");
  assert.equal(matches.length, 1, "presentation-anchor-portability must have one semantic identity");
  assert.deepEqual(matches[0], {
    path: "test/presentation-anchor-portability.integration.test.js",
    claim: "presentation-anchor-portability",
    dependencies: ["morphtile"]
  });
});

test("Interface 42 preserves explicit anchor matter without acquiring anchor transport or target authority", { skip: !enabled }, () => {
  const { run } = require(path.join(process.env.R46_INTERFACE42_ROOT, "src"));
  const MT = require(path.join(process.env.R46_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = {
    envelope_version: "0.1",
    request_id: "verification-r46-anchor-portability",
    goal: "Verify explicit presentation anchors remain portable references, not transport authority",
    intent: {
      tile_path: "mt_tower",
      title: "Anchored tower controls",
      elements: [
        { kind: "readout", binding: "beacon", label: "Lit" },
        { kind: "control", binding: "levels", label: "Levels" },
        { kind: "action", binding: "toggle", label: "Toggle" }
      ],
      bindings: {
        readouts: ["beacon"],
        controls: ["levels"],
        actions: ["toggle"]
      },
      placement: {
        mode: "tile",
        anchor: "mt_island",
        preferred_size: [320, 240],
        preferred_position: [0, 0],
        user_adjustable: false
      }
    },
    provenance: { caller: "verification-round46" }
  };

  const beforeInput = JSON.stringify(input);
  const out = run(input);
  const replay = run(input);
  assert.deepEqual(replay, out, "Interface 42 replay drifted");
  assert.equal(JSON.stringify(input), beforeInput, "Interface 42 mutated caller input");
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.dependencies.map((dependency) => dependency.id), [
    "morphtile.interface-target-proof:mt_tower",
    "morphtile.presentation-anchor-proof:mt_island"
  ]);

  const expectedView = deepCopy(out.candidate.operations[0].view);
  const expectedPresentation = deepCopy(out.candidate.operations[1].presentation);
  assert.equal(expectedPresentation.anchor, "mt_island");

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeWorld = MT.structHash(ws.live);
  assert.ok(ws.live.tiles.mt_island, "source fixture must contain explicit anchor tile");
  const anchorBefore = deepCopy(ws.live.tiles.mt_island);
  const receipt = commitOperations(MT, ws, out.candidate.operations, "r46-anchor-source");

  assert.deepEqual(ws.live.tiles.mt_island, anchorBefore, "Interface commit rewrote external anchor authority");
  assert.deepEqual(ws.live.tiles.mt_tower.view, expectedView);
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, expectedPresentation);
  const resolved = MT.resolvePresentation(ws.live, "mt_tower");
  assert.equal(resolved.status, "READY");
  assert.equal(resolved.anchor_frame.anchor, "mt_island");
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(html, /data-param="mt_tower:levels"/);
  assert.match(html, /data-signal="mt_tower:toggle"/);
  assert.doesNotMatch(html, /data-param="mt_island:levels"/);
  assert.doesNotMatch(html, /data-signal="mt_island:toggle"/);

  const exportedWorkspace = deepCopy(MT.exportWorkspace(ws));
  const restored = MT.importWorkspace(exportedWorkspace);
  assert.equal(restored.import_check.status, "VERIFIED");
  assert.deepEqual(restored.live.tiles.mt_tower.view, expectedView);
  assert.deepEqual(restored.live.tiles.mt_tower.presentation, expectedPresentation);
  assert.deepEqual(restored.live.tiles.mt_island, anchorBefore, "workspace transport changed anchor tile while preserving anchored view");

  const portableKit = deepCopy(MT.exportKit(ws.live, "mt_tower"));
  assert.deepEqual(portableKit.tile.view, expectedView);
  assert.deepEqual(portableKit.tile.presentation, expectedPresentation);

  const destination = MT.createWorkspace(MT.createWorld("R46 destination"));
  assert.equal(destination.live.tiles.mt_island, undefined);
  const imported = MT.importKit(destination.live, portableKit);
  assert.equal(imported.status, "READY");
  commitOperations(MT, destination, imported.ops, "r46-anchor-destination");
  assert.ok(destination.live.tiles.mt_tower, "target interface tile did not arrive");
  assert.equal(destination.live.tiles.mt_island, undefined, "kit transport silently pulled external anchor authority");
  assert.deepEqual(destination.live.tiles.mt_tower.view, expectedView);
  assert.deepEqual(destination.live.tiles.mt_tower.presentation, expectedPresentation);

  const held = MT.resolvePresentation(destination.live, "mt_tower");
  assert.equal(held.status, "HOLD_MISSING_PRESENTATION_ANCHOR");
  assert.deepEqual(destination.live.tiles.mt_tower.presentation, expectedPresentation, "missing anchor rewrote canonical presentation matter");
  assert.match(MT.vnodeToHTML(MT.compilePanel(destination.live).root), /HOLD_MISSING_PRESENTATION_ANCHOR/);

  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MT.structHash(ws.live), beforeWorld);
});
