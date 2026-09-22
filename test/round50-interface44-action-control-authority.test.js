"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "ddafc9e30144d12605c6e4198cd8d6c5764e6212";
const INTERFACE44 = "c7f145526f56c54e5a545ad1115d2afb5170fc77";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R50_INTERFACE44_ROOT && process.env.R50_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R50_INTERFACE44_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function commitOperations(MT, ws, operations, label) {
  const candidate = MT.cloneBody(ws, label, "ai:verification-machine");
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

function observePanel(MT, world, host) {
  const compiled = MT.compilePanel(world, host);
  const actions = collect(compiled.root, (node) => node.on && node.on.type === "signal" && node.on.tile === "mt_tower" && node.on.name === "toggle");
  const controls = collect(compiled.root, (node) => node.param && node.param.tile === "mt_tower" && node.param.id === "levels");
  const readouts = collect(compiled.root, (node) => node.bind && node.bind.tile === "mt_tower" && node.bind.name === "beacon");
  assert.equal(actions.length, 1, "presentation multiplied canonical toggle action authority");
  assert.equal(controls.length, 1, "presentation multiplied canonical levels authority");
  assert.equal(readouts.length, 1, "presentation multiplied canonical beacon readout");
  return {
    action: { ...actions[0].on },
    level: controls[0].attrs.value,
    beacon: readouts[0].text,
    html: MT.vnodeToHTML(compiled.root)
  };
}

test("Interface 44 exact head is evidence-only and registers action/control claims without duplicate semantic authority", { skip: !enabled }, () => {
  assert.equal(process.env.R50_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R50_INTERFACE44_COMMIT, INTERFACE44);
  assert.equal(process.env.R50_MORPHTILE_COMMIT, MORPHTILE);

  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE44]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "test/action-write-through-presentation.integration.test.js",
    "test/control-write-through-presentation.integration.test.js",
    "test/integration-proof-manifest.json"
  ].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE44, "--", "src", "machine.json", "package.json"]), "");

  const manifest = require(path.join(process.env.R50_INTERFACE44_ROOT, "test/integration-proof-manifest.json"));
  const claims = manifest.proofs.map((proof) => proof.claim);
  const paths = manifest.proofs.map((proof) => proof.path);
  assert.equal(new Set(claims).size, claims.length, "semantic claim identity must be singular");
  assert.equal(new Set(paths).size, paths.length, "proof path identity must be singular");

  const action = manifest.proofs.filter((proof) => proof.claim === "canonical-action-write-through-presentations");
  const control = manifest.proofs.filter((proof) => proof.claim === "canonical-control-write-through-presentations");
  assert.deepEqual(action, [{
    path: "test/action-write-through-presentation.integration.test.js",
    claim: "canonical-action-write-through-presentations",
    dependencies: ["morphtile"]
  }]);
  assert.deepEqual(control, [{
    path: "test/control-write-through-presentation.integration.test.js",
    claim: "canonical-control-write-through-presentations",
    dependencies: ["morphtile"]
  }]);
});

test("Interface 44 keeps action and control presentation views over one canonical target authority", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R50_INTERFACE44_ROOT, "src"));
  const MT = require(path.join(process.env.R50_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = {
    envelope_version: "0.1",
    request_id: "r50-interface44-shared-authority",
    goal: "Verify canonical action/control authority across canonical and session presentations",
    intent: {
      tile_path: "mt_tower",
      title: "Tower authority panel",
      elements: [
        { kind: "readout", binding: "beacon", label: "Beacon" },
        { kind: "control", binding: "levels", label: "Tower levels" },
        { kind: "action", binding: "toggle", label: "Toggle beacon" }
      ],
      bindings: {
        readouts: ["beacon"],
        controls: ["levels"],
        actions: ["toggle"]
      },
      placement: {
        mode: "screen",
        preferred_size: [360, 240],
        preferred_position: [0, 0],
        user_adjustable: true
      }
    },
    provenance: { caller: "verification-round50" }
  };
  const beforeInput = JSON.stringify(input);
  const out = Interface.run(input);
  assert.deepEqual(Interface.run(input), out, "Interface exact-head replay drifted");
  assert.equal(JSON.stringify(input), beforeInput, "Interface mutated caller input");
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.dependencies[0].requires, {
    tile_exists: true,
    form_hints_include: ["ui_panel"],
    readout_logic_vars: ["beacon"],
    control_param_ids: ["levels"],
    action_input_signal_socket_ids: ["toggle"]
  });

  const ws = MT.createWorkspace(MT.seedWorld());
  const initialHash = MT.structHash(ws.live);
  const interfaceReceipt = commitOperations(MT, ws, out.candidate.operations, "r50-interface-source");
  const interfaceHash = MT.structHash(ws.live);
  const authoredView = JSON.stringify(ws.live.tiles.mt_tower.view);
  const authoredPresentation = JSON.stringify(ws.live.tiles.mt_tower.presentation);
  const targetLogic = JSON.stringify(ws.live.tiles.mt_tower.facets.logic);
  const host = {
    session_presentations: {
      mt_tower: { mode: "floating", preferred_size: [420, 260], preferred_position: [32, 18] }
    }
  };
  const hostBefore = JSON.stringify(host);

  const canonicalBefore = observePanel(MT, ws.live, undefined);
  const sessionBefore = observePanel(MT, ws.live, host);
  assert.deepEqual(canonicalBefore.action, { type: "signal", tile: "mt_tower", name: "toggle" });
  assert.deepEqual(sessionBefore.action, canonicalBefore.action, "session presentation forked action identity");
  assert.equal(canonicalBefore.level, 3);
  assert.equal(sessionBefore.level, 3);
  assert.equal(canonicalBefore.beacon, "0");
  assert.equal(sessionBefore.beacon, "0");
  assert.match(canonicalBefore.html, /data-presentation-mode="screen"/);
  assert.match(sessionBefore.html, /data-presentation-mode="floating"/);
  assert.equal(MT.structHash(ws.live), interfaceHash, "presentation observation mutated canonical matter");
  assert.equal(JSON.stringify(host), hostBefore, "presentation observation mutated session input");

  const levelReceipt = commitOperations(MT, ws, [{ op: "param.set", id: "mt_tower", param: "levels", value: 6 }], "r50-level-edit");
  const changedHash = MT.structHash(ws.live);
  const towerChanged = ws.live.tiles.mt_tower;
  assert.equal(towerChanged.params.filter((param) => param.id === "levels").length, 1, "control write forked parameter authority");
  assert.equal(MT.paramValue(towerChanged, towerChanged.params.find((param) => param.id === "levels")), 6);
  assert.equal(towerChanged.facets.mesh.data.levels, 6);
  assert.ok(Math.abs(towerChanged.facets.connect.sockets[1].pos[1] - 8.2) < 1e-12);
  assert.equal(observePanel(MT, ws.live, undefined).level, 6);
  assert.equal(observePanel(MT, ws.live, host).level, 6);

  const sessionAction = observePanel(MT, ws.live, host).action;
  MT.act(ws, { do: sessionAction.type, tile: sessionAction.tile, name: sessionAction.name });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1, "session action did not reach canonical runtime state");
  assert.equal(observePanel(MT, ws.live, undefined).beacon, "1");
  assert.equal(observePanel(MT, ws.live, host).beacon, "1");
  assert.equal(MT.structHash(ws.live), changedHash, "runtime action rewrote canonical structural matter");

  const canonicalAction = observePanel(MT, ws.live, undefined).action;
  MT.act(ws, { do: canonicalAction.type, tile: canonicalAction.tile, name: canonicalAction.name });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0, "canonical action and session action reached different runtime authority");
  assert.equal(observePanel(MT, ws.live, undefined).beacon, "0");
  assert.equal(observePanel(MT, ws.live, host).beacon, "0");

  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.view), authoredView);
  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.presentation), authoredPresentation);
  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.facets.logic), targetLogic);
  assert.equal(JSON.stringify(host), hostBefore);

  const rollbackLevel = MT.rollback(ws, levelReceipt.rollback_token);
  assert.ok(rollbackLevel.ok && rollbackLevel.exact);
  assert.equal(MT.structHash(ws.live), interfaceHash);
  assert.equal(observePanel(MT, ws.live, undefined).level, 3);
  assert.equal(observePanel(MT, ws.live, host).level, 3);

  const rollbackInterface = MT.rollback(ws, interfaceReceipt.rollback_token);
  assert.ok(rollbackInterface.ok && rollbackInterface.exact);
  assert.equal(MT.structHash(ws.live), initialHash);
});
