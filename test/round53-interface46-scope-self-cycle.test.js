"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "586ac55c2523be59739b75c446b0b95938ae5319";
const INTERFACE46 = "115fdd6121449f3f496a76777ed2c20b5a1cdcd7";
const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R53_INTERFACE46_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function commitView(MT, ws, operation, label) {
  const candidate = MT.cloneBody(ws, label, "verification:interface46");
  const edited = MT.editCandidate(ws, candidate, operation);
  assert.ok(edited.ok, edited.error);
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok, JSON.stringify(committed));
  return committed.receipt;
}

function nestedWorld(MT) {
  const world = MT.seedWorld();
  const panel = MT.createTile({ id: "mt_panel", name: "Owner panel", form_hints: ["ui_panel"] });
  const shell = MT.createTile({ id: "mt_shell", name: "Path shell", form_hints: ["ui_panel"] });
  shell.facets.mesh = { type: "interior", source: null, data: {} };
  shell.interior = { tiles: { mt_panel: panel }, edges: {}, ports: [] };
  shell.provenance.sha256 = MT.contentHash(shell);
  world.tiles.mt_shell = shell;
  const valid = MT.validateWorld(world);
  assert.equal(valid.ok, true, valid.errors.join("; "));
  return world;
}

function request(id, tilePath, elements, extra) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independently verify Interface composition authority boundary",
    intent: Object.assign({ tile_path: tilePath, title: "Verification", elements }, extra || {}),
    provenance: { caller: "verification-round53" }
  };
}

test("Interface 46 exact head has the bounded producer scope and one registered self-cycle claim", { skip: !enabled }, () => {
  assert.equal(process.env.R53_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R53_INTERFACE46_COMMIT, INTERFACE46);
  assert.equal(process.env.R53_MORPHTILE_COMMIT, CORE);

  const changed = git(process.env.R53_INTERFACE46_ROOT, ["diff", "--name-only", INTERFACE_BASE, INTERFACE46]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "src/index.js",
    "test/integration-proof-manifest.json",
    "test/self-composition-inertness.integration.test.js",
    "test/tile-composition.test.js"
  ].sort());
  assert.equal(git(process.env.R53_INTERFACE46_ROOT, ["diff", "--name-only", INTERFACE_BASE, INTERFACE46, "--", "machine.json", "package.json", "src/interface-intent.js"]), "");

  const manifest = require(path.join(process.env.R53_INTERFACE46_ROOT, "test/integration-proof-manifest.json"));
  const hits = manifest.proofs.filter((p) => p.claim === "self-composition-inertness");
  assert.equal(hits.length, 1, "self-composition proof claim must have one structured owner");
  assert.equal(hits[0].path, "test/self-composition-inertness.integration.test.js");
  assert.deepEqual(hits[0].dependencies, ["morphtile"]);
  assert.ok(fs.existsSync(path.join(process.env.R53_INTERFACE46_ROOT, hits[0].path)));
});

test("nested bare-id composition fails closed through nested layout while valid bounded forms remain available", { skip: !enabled }, () => {
  const { run } = require(path.resolve(process.env.R53_INTERFACE46_ROOT, "src"));

  const escaped = run(request(
    "nested-bare-id-scope-escape",
    "mt_shell/mt_panel",
    [{ kind: "group", children: [{ kind: "row", children: [{ kind: "tile", tile_id: "mt_tower" }] }] }]
  ));
  assert.equal(escaped.status, "HOLD");
  assert.equal(escaped.holds[0].code, "HOLD_INTERFACE_TILE_SCOPE");
  assert.equal(escaped.candidate, null, "scope rejection must not leak a candidate operation");

  const local = run(request("top-level-local-id-control", "mt_core", [{ kind: "tile", tile_id: "mt_tower" }]));
  assert.equal(local.status, "CANDIDATE", JSON.stringify(local.holds));
  assert.deepEqual(local.candidate.operation.view.body, [{ tile: "mt_tower" }]);

  const sameRoot = run(request("nested-explicit-path-control", "mt_shell/mt_panel", [{ kind: "tile", tile_path: "mt_shell/mt_inner" }]));
  assert.equal(sameRoot.status, "CANDIDATE", JSON.stringify(sameRoot.holds));
  assert.deepEqual(sameRoot.candidate.operation.view.body, [{ tile: "/mt_shell/mt_inner" }]);
});

test("local self composition is visible inert matter, read-only on render, and exactly rollbackable", { skip: !enabled }, () => {
  const MT = require(path.resolve(process.env.R53_MORPHTILE_ROOT, "core/morphtile.js"));
  const { run } = require(path.resolve(process.env.R53_INTERFACE46_ROOT, "src"));
  const ws = MT.createWorkspace(MT.seedWorld());
  const before = MT.structHash(ws.live);

  const out = run(request("local-self-cycle", "mt_tower", [{ kind: "tile", tile_id: "mt_tower" }]));
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.candidate.operation.view.body, [{ tile: "mt_tower" }]);

  const receipt = commitView(MT, ws, out.candidate.operation, "r53-interface46-local-self");
  const committedHash = MT.structHash(ws.live);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(html, /class="v-embed"[^>]*data-tile="mt_tower"/);
  assert.match(html, /this view leans on itself/);
  assert.equal(MT.structHash(ws.live), committedHash, "rendering a self-cycle must not mutate canonical matter");
  assert.deepEqual(MT.resolveTile(ws.live, "mt_tower").view.body, [{ tile: "mt_tower" }]);

  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MT.structHash(ws.live), before);
});

test("explicit same-root self path is equally inert without rewriting authored identity", { skip: !enabled }, () => {
  const MT = require(path.resolve(process.env.R53_MORPHTILE_ROOT, "core/morphtile.js"));
  const { run } = require(path.resolve(process.env.R53_INTERFACE46_ROOT, "src"));
  const ws = MT.createWorkspace(nestedWorld(MT));
  const before = MT.structHash(ws.live);

  const out = run(request("same-root-self-cycle", "mt_shell/mt_panel", [{ kind: "tile", tile_path: "mt_shell/mt_panel" }]));
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.candidate.operation.view.body, [{ tile: "/mt_shell/mt_panel" }]);

  const receipt = commitView(MT, ws, out.candidate.operation, "r53-interface46-path-self");
  const committedHash = MT.structHash(ws.live);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, { open: { mt_shell: true } }).root);
  assert.match(html, /class="v-embed"[^>]*data-tile="mt_shell\/mt_panel"/);
  assert.match(html, /this view leans on itself/);
  assert.equal(MT.structHash(ws.live), committedHash, "same-root self rendering must remain structurally read-only");
  assert.deepEqual(MT.resolveTile(ws.live, "mt_shell/mt_panel").view.body, [{ tile: "/mt_shell/mt_panel" }]);

  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MT.structHash(ws.live), before);
});
