"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "ddafc9e30144d12605c6e4198cd8d6c5764e6212";
const INTERFACE44 = "b2d2b809f1805bc029cb2b5aaa18fcc0aa6c0cf8";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R49_INTERFACE44_ROOT && process.env.R49_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R49_INTERFACE44_ROOT, encoding: "utf8" });
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

function levelControls(root) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.param && node.param.tile === "mt_tower" && node.param.id === "levels") found.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return found;
}

function renderedLevel(MT, world, host) {
  const panel = MT.compilePanel(world, host);
  const controls = levelControls(panel.root);
  assert.equal(controls.length, 1, "presentation multiplied canonical control authority");
  return { value: controls[0].attrs.value, html: MT.vnodeToHTML(panel.root) };
}

test("Interface 44 is evidence-only and registers exactly one structured claim", { skip: !enabled }, () => {
  assert.equal(process.env.R49_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R49_INTERFACE44_COMMIT, INTERFACE44);
  assert.equal(process.env.R49_MORPHTILE_COMMIT, MORPHTILE);
  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE44]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["test/control-write-through-presentation.integration.test.js", "test/integration-proof-manifest.json"].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE44, "--", "src", "machine.json", "package.json"]), "");

  const manifest = require(path.join(process.env.R49_INTERFACE44_ROOT, "test/integration-proof-manifest.json"));
  const matches = manifest.proofs.filter((proof) => proof.claim === "canonical-control-write-through-presentations");
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    path: "test/control-write-through-presentation.integration.test.js",
    claim: "canonical-control-write-through-presentations",
    dependencies: ["morphtile"]
  });
});

test("Interface 44 proves one canonical write-through authority with session state remaining read-only", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R49_INTERFACE44_ROOT, "src"));
  const MT = require(path.join(process.env.R49_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = {
    envelope_version: "0.1",
    request_id: "r49-interface44-write-through",
    goal: "Verify one canonical control authority across presentation modes",
    intent: {
      tile_path: "mt_tower",
      title: "Portable tower control",
      elements: [{ kind: "control", binding: "levels", label: "Tower levels" }],
      bindings: { controls: ["levels"] },
      placement: { mode: "screen", preferred_size: [360,240], preferred_position: [0,0], user_adjustable: true }
    },
    provenance: { caller: "verification-round49" }
  };
  const beforeInput = JSON.stringify(input);
  const out = Interface.run(input);
  assert.deepEqual(Interface.run(input), out, "Interface output replay drifted");
  assert.equal(JSON.stringify(input), beforeInput, "Interface mutated caller request");
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.dependencies[0].requires.control_param_ids, ["levels"]);

  const ws = MT.createWorkspace(MT.seedWorld());
  const initialHash = MT.structHash(ws.live);
  const interfaceReceipt = commitOperations(MT, ws, out.candidate.operations, "r49-interface-source");
  const interfaceHash = MT.structHash(ws.live);
  const canonicalPresentation = JSON.stringify(ws.live.tiles.mt_tower.presentation);
  const host = { session_presentations: { mt_tower: { mode: "floating", preferred_size: [420,260], preferred_position: [32,18] } } };
  const hostBefore = JSON.stringify(host);

  const canonicalBefore = renderedLevel(MT, ws.live, undefined);
  const sessionBefore = renderedLevel(MT, ws.live, host);
  assert.equal(canonicalBefore.value, 3);
  assert.equal(sessionBefore.value, 3);
  assert.match(canonicalBefore.html, /data-presentation-mode="screen"/);
  assert.match(sessionBefore.html, /data-presentation-mode="floating"/);
  assert.equal(MT.structHash(ws.live), interfaceHash, "presentation observation mutated canonical matter");
  assert.equal(JSON.stringify(host), hostBefore, "rendering mutated session presentation input");

  const levelReceipt = commitOperations(MT, ws, [{ op: "param.set", id: "mt_tower", param: "levels", value: 6 }], "r49-level-edit");
  const changedHash = MT.structHash(ws.live);
  assert.notEqual(changedHash, interfaceHash);
  const tower = ws.live.tiles.mt_tower;
  const params = tower.params.filter((param) => param.id === "levels");
  assert.equal(params.length, 1, "canonical write forked parameter authority");
  assert.equal(MT.paramValue(tower, params[0]), 6);
  assert.equal(tower.facets.mesh.data.levels, 6);
  assert.ok(Math.abs(tower.facets.connect.sockets[1].pos[1] - 8.2) < 1e-12);
  assert.equal(JSON.stringify(tower.presentation), canonicalPresentation, "parameter write changed canonical presentation matter");
  assert.equal(JSON.stringify(host), hostBefore, "canonical write leaked authoritative state into session presentation input");

  assert.equal(renderedLevel(MT, ws.live, undefined).value, 6);
  assert.equal(renderedLevel(MT, ws.live, host).value, 6);
  assert.equal(MT.structHash(ws.live), changedHash, "readout after write added presentation/session state");
  assert.equal(JSON.stringify(host), hostBefore);

  const rollbackLevel = MT.rollback(ws, levelReceipt.rollback_token);
  assert.ok(rollbackLevel.ok && rollbackLevel.exact);
  assert.equal(MT.structHash(ws.live), interfaceHash);
  assert.equal(renderedLevel(MT, ws.live, undefined).value, 3);
  assert.equal(renderedLevel(MT, ws.live, host).value, 3);

  const rollbackInterface = MT.rollback(ws, interfaceReceipt.rollback_token);
  assert.ok(rollbackInterface.ok && rollbackInterface.exact);
  assert.equal(MT.structHash(ws.live), initialHash);
});
