"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "d242b9a18625b663dd389684e1f16d614432f3c9";
const INTERFACE40 = "a572a27c23478b678f5051c1add8c842e1d0dd16";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = !!process.env.R44_INTERFACE40_ROOT && !!process.env.R44_MORPHTILE_ROOT;

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R44_INTERFACE40_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test("Interface 40 is evidence/docs-only and registers its proof exactly once", { skip: !enabled }, () => {
  assert.equal(process.env.R44_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R44_INTERFACE40_COMMIT, INTERFACE40);
  assert.equal(process.env.R44_MORPHTILE_COMMIT, MORPHTILE);

  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE40]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "ARCHITECTURE.md",
    "test/integration-proof-manifest.json",
    "test/shared-canonical-control.integration.test.js"
  ].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE40, "--", "src", "machine.json", "package.json"]), "");

  const manifest = require(path.join(process.env.R44_INTERFACE40_ROOT, "test/integration-proof-manifest.json"));
  const matches = manifest.proofs.filter((entry) => entry.path === "test/shared-canonical-control.integration.test.js");
  assert.equal(matches.length, 1, "shared canonical control proof must have one manifest authority");
  assert.deepEqual(matches[0].dependencies, ["morphtile"]);
});

test("two authored controls remain two views over exactly one canonical parameter and rollback exactly", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R44_INTERFACE40_ROOT, "src"));
  const MT = require(path.join(process.env.R44_MORPHTILE_ROOT, "core/morphtile.js"));
  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const beforeTower = ws.live.tiles.mt_tower;
  const beforeParams = beforeTower.params.filter((param) => param.id === "levels");
  assert.equal(beforeParams.length, 1);
  const beforeValue = MT.paramValue(beforeTower, beforeParams[0]);

  const input = {
    envelope_version: "0.1",
    request_id: "verification-r44-shared-control",
    goal: "Verify multiple controls remain views over one target-owned parameter",
    canonical_state: { forbidden_snapshot: { value: beforeValue, marker: "must-not-copy" } },
    intent: {
      tile_path: "mt_tower",
      title: "Tower controls",
      elements: [
        { kind: "control", binding: "levels", label: "Quick levels" },
        { kind: "control", binding: "levels", label: "Detailed levels" }
      ],
      bindings: { controls: ["levels"] }
    },
    provenance: { caller: "verification-round44" }
  };
  const beforeInput = JSON.stringify(input);
  const first = Interface.run(input);
  const replay = Interface.run(input);
  assert.deepEqual(replay, first, "Interface replay drifted");
  assert.equal(JSON.stringify(input), beforeInput, "Interface mutated caller input");
  assert.equal(first.status, "CANDIDATE");
  assert.deepEqual(first.candidate.operation.view.body, [
    { control: "levels", label: "Quick levels" },
    { control: "levels", label: "Detailed levels" }
  ]);
  assert.deepEqual(first.dependencies[0].requires.control_param_ids, ["levels"], "target proof must deduplicate shared binding requirement");
  assert.equal(JSON.stringify(first.candidate).includes("must-not-copy"), false, "Interface copied caller canonical state into candidate matter");

  const candidate = MT.cloneBody(ws, "ai", "ai:verification-round44");
  const edited = MT.editCandidate(ws, candidate, first.candidate.operation);
  assert.equal(edited.ok, true, edited.error || "edit failed");
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id);
  assert.equal(committed.ok, true);

  const afterTower = ws.live.tiles.mt_tower;
  const afterParams = afterTower.params.filter((param) => param.id === "levels");
  assert.equal(afterParams.length, 1, "Interface created duplicate canonical parameter state");
  assert.equal(MT.paramValue(afterTower, afterParams[0]), beforeValue, "Interface changed target-owned canonical parameter value");

  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal(occurrences(html, 'data-param="mt_tower:levels"'), 2, "receiver did not render two independent views over shared target state");
  assert.match(html, /Quick levels/);
  assert.match(html, /Detailed levels/);

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash, "rollback failed exact structural restoration");
});
