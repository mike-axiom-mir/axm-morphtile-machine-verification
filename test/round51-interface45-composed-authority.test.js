"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "fc918bcddf4e0dce9bbc649ec35887c98a2d2af3";
const INTERFACE45 = "948e6aeca7426a2f3b80cf5904640c943713ea17";
const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R51_INTERFACE45_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function collect(root, predicate) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) out.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return out;
}

function commit(MT, ws, operation, label) {
  const candidate = MT.cloneBody(ws, label, "verification:interface45");
  const edited = MT.editCandidate(ws, candidate, operation);
  assert.ok(edited.ok, edited.error);
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok, JSON.stringify(committed));
  return committed.receipt;
}

function localOwnedNodes(MT, ws) {
  const compiled = MT.compilePanel(ws.live);
  const parents = collect(compiled.root, (n) => n.tile === "mt_core" && String(n.cls || "").includes("mt-panel"));
  assert.equal(parents.length, 1);
  const embeds = collect(parents[0], (n) => n.tile === "mt_tower" && n.cls === "v-embed");
  assert.equal(embeds.length, 1);
  return {
    parent: parents[0],
    child: embeds[0],
    actions: collect(embeds[0], (n) => n.on && n.on.type === "signal"),
    controls: collect(embeds[0], (n) => n.param),
    readouts: collect(embeds[0], (n) => n.bind && n.bind.name === "beacon")
  };
}

function nestedWorld(MT) {
  const world = MT.seedWorld();
  const source = world.tiles.mt_tower;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const parent = MT.createTile({ id: "mt_panel", name: "Panel", form_hints: ["ui_panel"] });
  const child = MT.createTile({ id: "mt_inner", name: "Inner", form_hints: ["ui_panel"], params: clone(source.params), facets: clone(source.facets) });
  const shell = MT.createTile({ id: "mt_shell", name: "Shell", form_hints: ["ui_panel"] });
  shell.facets.mesh = { type: "interior", source: null, data: {} };
  shell.interior = { tiles: { mt_panel: parent, mt_inner: child }, edges: {}, ports: [] };
  shell.provenance.sha256 = MT.contentHash(shell);
  world.tiles.mt_shell = shell;
  assert.equal(MT.validateWorld(world).ok, true);
  return world;
}

function nestedOwnedNodes(MT, ws) {
  const compiled = MT.compilePanel(ws.live, { open: { mt_shell: true } });
  const parents = collect(compiled.root, (n) => n.tile === "mt_shell/mt_panel" && String(n.cls || "").includes("mt-panel"));
  assert.equal(parents.length, 1);
  const embeds = collect(parents[0], (n) => n.tile === "mt_shell/mt_inner" && n.cls === "v-embed");
  assert.equal(embeds.length, 1);
  return {
    actions: collect(embeds[0], (n) => n.on && n.on.type === "signal"),
    controls: collect(embeds[0], (n) => n.param),
    readouts: collect(embeds[0], (n) => n.bind && n.bind.name === "beacon")
  };
}

test("Interface 45 is evidence-only and registers both ownership claims exactly once", { skip: !enabled }, () => {
  assert.equal(process.env.R51_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R51_INTERFACE45_COMMIT, INTERFACE45);
  assert.equal(process.env.R51_MORPHTILE_COMMIT, CORE);
  const changed = git(process.env.R51_INTERFACE45_ROOT, ["diff", "--name-only", INTERFACE_BASE, INTERFACE45]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "test/integration-proof-manifest.json",
    "test/tile-owned-interaction-composition.integration.test.js",
    "test/tile-path-owned-interaction-composition.integration.test.js"
  ].sort());
  assert.equal(git(process.env.R51_INTERFACE45_ROOT, ["diff", "--name-only", INTERFACE_BASE, INTERFACE45, "--", "src", "machine.json", "package.json"]), "");

  const manifest = require(path.join(process.env.R51_INTERFACE45_ROOT, "test/integration-proof-manifest.json"));
  for (const [claim, proofPath] of [
    ["tile-owned-interaction-composition", "test/tile-owned-interaction-composition.integration.test.js"],
    ["same-root-path-owned-interaction-composition", "test/tile-path-owned-interaction-composition.integration.test.js"]
  ]) {
    const hits = manifest.proofs.filter((p) => p.claim === claim);
    assert.equal(hits.length, 1, `${claim}: claim must be registered exactly once`);
    assert.equal(hits[0].path, proofPath);
    assert.deepEqual(hits[0].dependencies, ["morphtile"]);
    assert.ok(fs.existsSync(path.join(process.env.R51_INTERFACE45_ROOT, proofPath)), `${claim}: registered proof missing`);
  }
});

test("local child composition preserves child-owned control/action/readout authority under real interaction", { skip: !enabled }, () => {
  const MT = require(path.resolve(process.env.R51_MORPHTILE_ROOT, "core/morphtile.js"));
  const { run } = require(path.resolve(process.env.R51_INTERFACE45_ROOT, "src"));
  const ws = MT.createWorkspace(MT.seedWorld());

  const child = run({ envelope_version: "0.1", request_id: "verify-r51-child", goal: "child owns interaction", intent: {
    tile_path: "mt_tower", title: "Child", elements: [
      { kind: "readout", binding: "beacon", label: "Beacon" },
      { kind: "control", binding: "levels", label: "Levels" },
      { kind: "action", binding: "toggle", label: "Toggle" }
    ], bindings: { readouts: ["beacon"], controls: ["levels"], actions: ["toggle"] }
  }, provenance: { caller: "verification" } });
  assert.equal(child.status, "CANDIDATE", JSON.stringify(child.holds));
  commit(MT, ws, child.candidate.operation, "r51-child");

  const parent = run({ envelope_version: "0.1", request_id: "verify-r51-parent", goal: "compose without authority transfer", intent: {
    tile_path: "mt_core", title: "Parent", elements: [{ kind: "tile", tile_id: "mt_tower" }]
  }, provenance: { caller: "verification" } });
  assert.equal(parent.status, "CANDIDATE", JSON.stringify(parent.holds));
  commit(MT, ws, parent.candidate.operation, "r51-parent");

  const beforeHash = MT.structHash(ws.live);
  const nodes = localOwnedNodes(MT, ws);
  assert.deepEqual(nodes.actions.map((n) => n.on), [{ type: "signal", tile: "mt_tower", name: "toggle" }]);
  assert.deepEqual(nodes.controls.map((n) => n.param), [{ tile: "mt_tower", id: "levels" }]);
  assert.deepEqual(nodes.readouts.map((n) => n.bind.tile), ["mt_tower"]);
  assert.equal(collect(nodes.parent, (n) => n.on && n.on.tile === "mt_core" && n.on.name === "toggle").length, 0);
  assert.equal(collect(nodes.parent, (n) => n.param && n.param.tile === "mt_core" && n.param.id === "levels").length, 0);
  assert.equal(MT.structHash(ws.live), beforeHash, "composition render must be read-only");

  const write = commit(MT, ws, { op: "param.set", id: "mt_tower", param: "levels", value: 5 }, "r51-child-write");
  assert.equal(localOwnedNodes(MT, ws).controls[0].attrs.value, 5);
  assert.equal((ws.live.tiles.mt_core.params || []).some((p) => p.id === "levels"), false);
  const rolled = MT.rollback(ws, write.rollback_token);
  assert.ok(rolled.ok && rolled.exact);
  assert.equal(MT.structHash(ws.live), beforeHash);

  const action = localOwnedNodes(MT, ws).actions[0].on;
  MT.act(ws, { do: action.type, tile: action.tile, name: action.name });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(MT.readVars(ws.live, "mt_core", 0), "beacon"), false);
});

test("same-root explicit-path composition preserves nested child authority", { skip: !enabled }, () => {
  const MT = require(path.resolve(process.env.R51_MORPHTILE_ROOT, "core/morphtile.js"));
  const { run } = require(path.resolve(process.env.R51_INTERFACE45_ROOT, "src"));
  const ws = MT.createWorkspace(nestedWorld(MT));

  const child = run({ envelope_version: "0.1", request_id: "verify-r51-nested-child", goal: "nested child owns interaction", intent: {
    tile_path: "mt_shell/mt_inner", title: "Inner", elements: [
      { kind: "readout", binding: "beacon", label: "Beacon" },
      { kind: "control", binding: "levels", label: "Levels" },
      { kind: "action", binding: "toggle", label: "Toggle" }
    ], bindings: { readouts: ["beacon"], controls: ["levels"], actions: ["toggle"] }
  }, provenance: { caller: "verification" } });
  assert.equal(child.status, "CANDIDATE", JSON.stringify(child.holds));
  commit(MT, ws, child.candidate.operation, "r51-nested-child");

  const parent = run({ envelope_version: "0.1", request_id: "verify-r51-nested-parent", goal: "nested same-root composition", intent: {
    tile_path: "mt_shell/mt_panel", title: "Panel", elements: [{ kind: "tile", tile_path: "mt_shell/mt_inner" }]
  }, provenance: { caller: "verification" } });
  assert.equal(parent.status, "CANDIDATE", JSON.stringify(parent.holds));
  commit(MT, ws, parent.candidate.operation, "r51-nested-parent");

  const nodes = nestedOwnedNodes(MT, ws);
  assert.deepEqual(nodes.actions.map((n) => n.on), [{ type: "signal", tile: "mt_shell/mt_inner", name: "toggle" }]);
  assert.deepEqual(nodes.controls.map((n) => n.param), [{ tile: "mt_shell/mt_inner", id: "levels" }]);
  assert.deepEqual(nodes.readouts.map((n) => n.bind.tile), ["mt_shell/mt_inner"]);

  const action = nodes.actions[0].on;
  MT.act(ws, { do: action.type, tile: action.tile, name: action.name });
  assert.equal(MT.readVars(ws.live, "mt_shell/mt_inner", 0).beacon, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(MT.readVars(ws.live, "mt_shell/mt_panel", 0), "beacon"), false);
});