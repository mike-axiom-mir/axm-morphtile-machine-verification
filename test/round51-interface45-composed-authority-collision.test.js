"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "fc918bcddf4e0dce9bbc649ec35887c98a2d2af3";
const INTERFACE45 = "948e6aeca7426a2f3b80cf5904640c943713ea17";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R51_INTERFACE45_ROOT && process.env.R51_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R51_INTERFACE45_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function portableClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function commitOperation(MT, ws, operation, label) {
  const candidate = MT.cloneBody(ws, label, "ai:verification-machine");
  const edited = MT.editCandidate(ws, candidate, operation);
  assert.ok(edited.ok, edited.error);
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok, JSON.stringify(committed));
  return committed.receipt;
}

function collect(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return found;
}

function interactiveTile(MT, source, id, name) {
  return MT.createTile({
    id,
    name,
    form_hints: ["ui_panel"],
    params: portableClone(source.params),
    facets: portableClone(source.facets)
  });
}

function collisionWorld(MT, mode) {
  const world = MT.seedWorld();
  const source = world.tiles.mt_tower;
  if (mode === "local") {
    world.tiles.mt_parent = interactiveTile(MT, source, "mt_parent", "Collision parent");
    world.tiles.mt_child = interactiveTile(MT, source, "mt_child", "Collision child");
    const valid = MT.validateWorld(world);
    assert.equal(valid.ok, true, valid.errors.join("; "));
    return { world, parentPath: "mt_parent", childPath: "mt_child", host: undefined };
  }

  const parent = interactiveTile(MT, source, "mt_parent", "Nested collision parent");
  const child = interactiveTile(MT, source, "mt_child", "Nested collision child");
  const shell = MT.createTile({ id: "mt_shell", name: "Collision shell", form_hints: ["ui_panel"] });
  shell.facets.mesh = { type: "interior", source: null, data: {} };
  shell.interior = { tiles: { mt_parent: parent, mt_child: child }, edges: {}, ports: [] };
  shell.provenance.sha256 = MT.contentHash(shell);
  world.tiles.mt_shell = shell;
  const valid = MT.validateWorld(world);
  assert.equal(valid.ok, true, valid.errors.join("; "));
  return {
    world,
    parentPath: "mt_shell/mt_parent",
    childPath: "mt_shell/mt_child",
    host: { open: { mt_shell: true } }
  };
}

function authorInteractiveView(Interface, tilePath, requestId) {
  return Interface.run({
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Author a readout, control and action whose names intentionally collide with another tile",
    intent: {
      tile_path: tilePath,
      title: "Collision authority",
      elements: [
        { kind: "readout", binding: "beacon", label: "Beacon" },
        { kind: "control", binding: "levels", label: "Levels" },
        { kind: "action", binding: "toggle", label: "Toggle" }
      ],
      bindings: {
        readouts: ["beacon"],
        controls: ["levels"],
        actions: ["toggle"]
      }
    },
    provenance: { caller: "verification-round51" }
  });
}

function observe(MT, ws, parentPath, childPath, host) {
  const compiled = MT.compilePanel(ws.live, host);
  const parents = collect(compiled.root, (node) => node.tile === parentPath && typeof node.cls === "string" && node.cls.includes("mt-panel"));
  assert.equal(parents.length, 1, `${parentPath}: expected one parent panel`);
  const parent = parents[0];
  const embeds = collect(parent, (node) => node.tile === childPath && node.cls === "v-embed");
  assert.equal(embeds.length, 1, `${childPath}: expected one embedded child view`);
  const embed = embeds[0];

  const parentActions = collect(parent, (node) => node.on && node.on.type === "signal" && node.on.tile === parentPath && node.on.name === "toggle");
  const parentControls = collect(parent, (node) => node.param && node.param.tile === parentPath && node.param.id === "levels");
  const parentReadouts = collect(parent, (node) => node.bind && node.bind.tile === parentPath && node.bind.name === "beacon");
  const childActions = collect(embed, (node) => node.on && node.on.type === "signal" && node.on.tile === childPath && node.on.name === "toggle");
  const childControls = collect(embed, (node) => node.param && node.param.tile === childPath && node.param.id === "levels");
  const childReadouts = collect(embed, (node) => node.bind && node.bind.tile === childPath && node.bind.name === "beacon");

  assert.equal(parentActions.length, 1, "same-name child action shadowed or multiplied parent action authority");
  assert.equal(parentControls.length, 1, "same-name child control shadowed or multiplied parent parameter authority");
  assert.equal(parentReadouts.length, 1, "same-name child readout shadowed or multiplied parent readout authority");
  assert.equal(childActions.length, 1, "parent action shadowed or multiplied child action authority");
  assert.equal(childControls.length, 1, "parent control shadowed or multiplied child parameter authority");
  assert.equal(childReadouts.length, 1, "parent readout shadowed or multiplied child readout authority");

  return {
    parentAction: { ...parentActions[0].on },
    childAction: { ...childActions[0].on },
    parentLevel: parentControls[0].attrs.value,
    childLevel: childControls[0].attrs.value,
    parentBeacon: parentReadouts[0].text,
    childBeacon: childReadouts[0].text
  };
}

function runCollisionScenario(mode) {
  const Interface = require(path.join(process.env.R51_INTERFACE45_ROOT, "src"));
  const MT = require(path.join(process.env.R51_MORPHTILE_ROOT, "core/morphtile.js"));
  const setup = collisionWorld(MT, mode);
  const ws = MT.createWorkspace(setup.world);

  const child = authorInteractiveView(Interface, setup.childPath, `${mode}-child`);
  assert.equal(child.status, "CANDIDATE", JSON.stringify(child.holds));
  commitOperation(MT, ws, child.candidate.operation, `${mode}-child-view`);

  const parentIntent = {
    envelope_version: "0.1",
    request_id: `${mode}-parent`,
    goal: "Compose a child with colliding interaction names without transferring authority",
    intent: {
      tile_path: setup.parentPath,
      title: "Collision parent",
      elements: [
        { kind: "readout", binding: "beacon", label: "Parent beacon" },
        { kind: "control", binding: "levels", label: "Parent levels" },
        { kind: "action", binding: "toggle", label: "Parent toggle" },
        mode === "local" ? { kind: "tile", tile_id: "mt_child" } : { kind: "tile", tile_path: setup.childPath }
      ],
      bindings: {
        readouts: ["beacon"],
        controls: ["levels"],
        actions: ["toggle"]
      }
    },
    provenance: { caller: "verification-round51" }
  };
  const beforeParentIntent = JSON.stringify(parentIntent);
  const parent = Interface.run(parentIntent);
  assert.deepEqual(Interface.run(parentIntent), parent, `${mode}: deterministic replay drifted`);
  assert.equal(JSON.stringify(parentIntent), beforeParentIntent, `${mode}: caller input was mutated`);
  assert.equal(parent.status, "CANDIDATE", JSON.stringify(parent.holds));
  commitOperation(MT, ws, parent.candidate.operation, `${mode}-parent-view`);

  const composedHash = MT.structHash(ws.live);
  const parentTile = MT.resolveTile(ws.live, setup.parentPath);
  const childTile = MT.resolveTile(ws.live, setup.childPath);
  const parentView = JSON.stringify(parentTile.view);
  const childView = JSON.stringify(childTile.view);
  const parentLogic = JSON.stringify(parentTile.facets.logic);
  const childLogic = JSON.stringify(childTile.facets.logic);

  const initial = observe(MT, ws, setup.parentPath, setup.childPath, setup.host);
  assert.deepEqual(initial.parentAction, { type: "signal", tile: setup.parentPath, name: "toggle" });
  assert.deepEqual(initial.childAction, { type: "signal", tile: setup.childPath, name: "toggle" });
  assert.equal(initial.parentLevel, 3);
  assert.equal(initial.childLevel, 3);
  assert.equal(initial.parentBeacon, "0");
  assert.equal(initial.childBeacon, "0");
  assert.equal(MT.structHash(ws.live), composedHash, `${mode}: rendering mutated canonical matter`);

  const childLevelReceipt = commitOperation(MT, ws, { op: "param.set", id: setup.childPath, param: "levels", value: 5 }, `${mode}-child-level`);
  let state = observe(MT, ws, setup.parentPath, setup.childPath, setup.host);
  assert.equal(state.childLevel, 5);
  assert.equal(state.parentLevel, 3, `${mode}: child write leaked into parent authority`);

  const parentLevelReceipt = commitOperation(MT, ws, { op: "param.set", id: setup.parentPath, param: "levels", value: 7 }, `${mode}-parent-level`);
  state = observe(MT, ws, setup.parentPath, setup.childPath, setup.host);
  assert.equal(state.parentLevel, 7);
  assert.equal(state.childLevel, 5, `${mode}: parent write leaked into child authority`);

  let rollback = MT.rollback(ws, parentLevelReceipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  rollback = MT.rollback(ws, childLevelReceipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MT.structHash(ws.live), composedHash, `${mode}: parameter rollback did not restore exact composed structure`);

  const childAction = observe(MT, ws, setup.parentPath, setup.childPath, setup.host).childAction;
  MT.act(ws, { do: childAction.type, tile: childAction.tile, name: childAction.name });
  state = observe(MT, ws, setup.parentPath, setup.childPath, setup.host);
  assert.equal(state.childBeacon, "1");
  assert.equal(state.parentBeacon, "0", `${mode}: child signal leaked into parent runtime authority`);

  const parentAction = state.parentAction;
  MT.act(ws, { do: parentAction.type, tile: parentAction.tile, name: parentAction.name });
  state = observe(MT, ws, setup.parentPath, setup.childPath, setup.host);
  assert.equal(state.parentBeacon, "1");
  assert.equal(state.childBeacon, "1", `${mode}: parent signal altered child runtime authority`);
  assert.equal(MT.structHash(ws.live), composedHash, `${mode}: runtime signals rewrote canonical structural matter`);

  assert.equal(JSON.stringify(MT.resolveTile(ws.live, setup.parentPath).view), parentView);
  assert.equal(JSON.stringify(MT.resolveTile(ws.live, setup.childPath).view), childView);
  assert.equal(JSON.stringify(MT.resolveTile(ws.live, setup.parentPath).facets.logic), parentLogic);
  assert.equal(JSON.stringify(MT.resolveTile(ws.live, setup.childPath).facets.logic), childLogic);
}

test("Interface 45 exact head is evidence-only and registers both composition-authority claims once", { skip: !enabled }, () => {
  assert.equal(process.env.R51_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R51_INTERFACE45_COMMIT, INTERFACE45);
  assert.equal(process.env.R51_MORPHTILE_COMMIT, MORPHTILE);

  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE45]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "test/integration-proof-manifest.json",
    "test/tile-owned-interaction-composition.integration.test.js",
    "test/tile-path-owned-interaction-composition.integration.test.js"
  ].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE45, "--", "src", "machine.json", "package.json"]), "");

  const manifest = require(path.join(process.env.R51_INTERFACE45_ROOT, "test/integration-proof-manifest.json"));
  const claims = manifest.proofs.map((proof) => proof.claim);
  const paths = manifest.proofs.map((proof) => proof.path);
  assert.equal(new Set(claims).size, claims.length, "semantic claim identities must be singular");
  assert.equal(new Set(paths).size, paths.length, "proof paths must be singular");
  assert.deepEqual(manifest.proofs.filter((proof) => proof.claim === "tile-owned-interaction-composition"), [{
    path: "test/tile-owned-interaction-composition.integration.test.js",
    claim: "tile-owned-interaction-composition",
    dependencies: ["morphtile"]
  }]);
  assert.deepEqual(manifest.proofs.filter((proof) => proof.claim === "same-root-path-owned-interaction-composition"), [{
    path: "test/tile-path-owned-interaction-composition.integration.test.js",
    claim: "same-root-path-owned-interaction-composition",
    dependencies: ["morphtile"]
  }]);
});

test("local tile composition keeps same-named parent and child interaction authorities isolated", { skip: !enabled }, () => {
  runCollisionScenario("local");
});

test("same-root path composition keeps same-named parent and child interaction authorities isolated", { skip: !enabled }, () => {
  runCollisionScenario("path");
});
