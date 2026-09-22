"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "67894cab657168bd316af1f0c6b6463c7cc7bb3a";
const INTERFACE43 = "e494c15a58f97fa02e771c5dcebe96005db98ca3";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R48_INTERFACE43_ROOT && process.env.R48_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R48_INTERFACE43_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function request(id, userAdjustable) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify host presentation mode cannot fork canonical control authority",
    intent: {
      tile_path: "mt_tower",
      title: "Portable tower control",
      elements: [{ kind: "control", binding: "levels", label: "Tower levels" }],
      bindings: { controls: ["levels"] },
      placement: { mode: "screen", preferred_size: [360, 240], preferred_position: [0, 0], user_adjustable: userAdjustable }
    },
    provenance: { caller: "verification-round48" }
  };
}

function stableRun(machine, input) {
  const before = JSON.stringify(input);
  const first = machine.run(input);
  assert.deepEqual(machine.run(input), first, "Interface replay drifted");
  assert.equal(JSON.stringify(input), before, "Interface mutated caller input");
  return first;
}

function commit(MT, ws, out) {
  const candidate = MT.cloneBody(ws, "ai", "ai:verification-round48");
  for (const operation of out.candidate.operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.equal(edited.ok, true, edited.error || "edit failed");
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id);
  assert.equal(committed.ok, true);
  return committed.receipt;
}

function host() {
  return { session_presentations: { mt_tower: { mode: "floating", preferred_size: [420, 260], preferred_position: [32, 18] } } };
}

function occurrences(text, needle) { return text.split(needle).length - 1; }

test("Interface 43 is evidence-only and registers one exact semantic claim", { skip: !enabled }, () => {
  assert.equal(process.env.R48_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R48_INTERFACE43_COMMIT, INTERFACE43);
  assert.equal(process.env.R48_MORPHTILE_COMMIT, MORPHTILE);
  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE43]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["test/integration-proof-manifest.json", "test/presentation-mode-shared-control.integration.test.js"].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE43, "--", "src", "machine.json", "package.json"]), "");
  const manifest = require(path.join(process.env.R48_INTERFACE43_ROOT, "test/integration-proof-manifest.json"));
  const matches = manifest.proofs.filter((entry) => entry.path === "test/presentation-mode-shared-control.integration.test.js");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].claim, "host-mode-shared-canonical-control");
  assert.deepEqual(matches[0].dependencies, ["morphtile"]);
});

test("allowed host mode is session-only and keeps exactly one target-owned control authority", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R48_INTERFACE43_ROOT, "src"));
  const MT = require(path.join(process.env.R48_MORPHTILE_ROOT, "core/morphtile.js"));
  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const beforeParams = JSON.stringify(ws.live.tiles.mt_tower.params);
  const levels = ws.live.tiles.mt_tower.params.filter((p) => p.id === "levels");
  assert.equal(levels.length, 1);
  const beforeValue = MT.paramValue(ws.live.tiles.mt_tower, levels[0]);

  const out = stableRun(Interface, request("r48-interface43-allowed", true));
  assert.equal(out.status, "CANDIDATE");
  assert.equal(out.candidate.operations.length, 2);
  assert.deepEqual(out.dependencies[0].requires.control_param_ids, ["levels"]);
  const receipt = commit(MT, ws, out);
  const canonicalHash = MT.structHash(ws.live);
  assert.equal(ws.live.tiles.mt_tower.presentation.mode, "screen");
  assert.equal(ws.live.tiles.mt_tower.presentation.user_adjustable, true);
  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.params), beforeParams);
  assert.equal(MT.paramValue(ws.live.tiles.mt_tower, ws.live.tiles.mt_tower.params.find((p) => p.id === "levels")), beforeValue);

  const session = host();
  const sessionBefore = JSON.stringify(session);
  const resolved = MT.resolvePresentation(ws.live, "mt_tower", session);
  assert.equal(resolved.status, "READY");
  assert.equal(resolved.session_applied, true);
  assert.equal(resolved.resolved.mode, "floating");
  assert.deepEqual(resolved.resolved.preferred_size, [420, 260]);
  assert.deepEqual(resolved.resolved.preferred_position, [32, 18]);
  assert.equal(JSON.stringify(session), sessionBefore, "receiver mutated host session evidence");
  assert.equal(MT.structHash(ws.live), canonicalHash, "session choice rewrote canonical world");
  assert.equal(ws.live.tiles.mt_tower.presentation.mode, "screen");
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, session).root);
  assert.match(html, /data-presentation-mode="floating"/);
  assert.equal(occurrences(html, 'data-param="mt_tower:levels"'), 1);

  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash);
});

test("non-adjustable canonical presentation rejects host mode without forking control state", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R48_INTERFACE43_ROOT, "src"));
  const MT = require(path.join(process.env.R48_MORPHTILE_ROOT, "core/morphtile.js"));
  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const beforeParams = JSON.stringify(ws.live.tiles.mt_tower.params);
  const out = stableRun(Interface, request("r48-interface43-denied", false));
  const receipt = commit(MT, ws, out);
  const canonicalHash = MT.structHash(ws.live);
  const session = host();
  const resolved = MT.resolvePresentation(ws.live, "mt_tower", session);
  assert.equal(resolved.status, "READY");
  assert.equal(resolved.session_applied, false);
  assert.equal(resolved.resolved.mode, "screen");
  assert.deepEqual(resolved.resolved.preferred_size, [360, 240]);
  assert.deepEqual(resolved.resolved.preferred_position, [0, 0]);
  assert.equal(MT.structHash(ws.live), canonicalHash);
  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.params), beforeParams);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, session).root);
  assert.match(html, /data-presentation-mode="screen"/);
  assert.equal(occurrences(html, 'data-param="mt_tower:levels"'), 1);
  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash);
});
