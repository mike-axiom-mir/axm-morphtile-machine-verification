"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "1af4d358174af995459e5b4bded5d24c2d2c52a2";
const INTERFACE41 = "702ee75be3ab14f59bbdc86396d53416bf3f5ad3";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R45_INTERFACE41_ROOT && process.env.R45_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R45_INTERFACE41_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test("Interface 41 is evidence-only and gives each executable proof a unique structured semantic identity", { skip: !enabled }, () => {
  assert.equal(process.env.R45_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R45_INTERFACE41_COMMIT, INTERFACE41);
  assert.equal(process.env.R45_MORPHTILE_COMMIT, MORPHTILE);

  const changed = git(["diff", "--name-only", INTERFACE_BASE, INTERFACE41]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    "ARCHITECTURE.md",
    "ROADMAP.md",
    "STATUS.md",
    "scripts/run-integration-proofs.js",
    "test/integration-proof-claims.test.js",
    "test/integration-proof-manifest.json",
    "test/shared-binding-views.integration.test.js"
  ].sort());
  assert.equal(git(["diff", "--name-only", INTERFACE_BASE, INTERFACE41, "--", "src", "machine.json", "package.json"]), "");

  const manifestPath = path.join(process.env.R45_INTERFACE41_ROOT, "test/integration-proof-manifest.json");
  const runnerPath = path.join(process.env.R45_INTERFACE41_ROOT, "scripts/run-integration-proofs.js");
  const manifest = require(manifestPath);
  const { CLAIM_ID, validateManifest } = require(runnerPath);
  const actual = manifest.proofs.map((proof) => proof.path);
  assert.equal(manifest.schema, "axm.interface-integration-proofs/v0.2");
  assert.equal(validateManifest(manifest, actual), true);

  const paths = manifest.proofs.map((proof) => proof.path);
  const claims = manifest.proofs.map((proof) => proof.claim);
  assert.equal(new Set(paths).size, paths.length, "proof path identity is duplicated");
  assert.equal(new Set(claims).size, claims.length, "semantic claim identity is duplicated");
  for (const proof of manifest.proofs) {
    assert.match(proof.claim, CLAIM_ID, `${proof.path}: malformed semantic claim identity`);
    assert.equal(Array.isArray(proof.dependencies) && proof.dependencies.length > 0, true, `${proof.path}: missing dependency identity`);
  }

  const shared = manifest.proofs.filter((proof) => proof.path === "test/shared-binding-views.integration.test.js");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].claim, "shared-binding-view-multiplicity");
  assert.deepEqual(shared[0].dependencies, ["morphtile"]);

  const copy = () => JSON.parse(JSON.stringify(manifest));
  const missing = copy();
  delete missing.proofs[0].claim;
  assert.throws(() => validateManifest(missing, actual), /must declare one lowercase kebab-case semantic claim identity/);
  const malformed = copy();
  malformed.proofs[0].claim = "Not A Claim";
  assert.throws(() => validateManifest(malformed, actual), /must declare one lowercase kebab-case semantic claim identity/);
  const duplicate = copy();
  duplicate.proofs[1].claim = duplicate.proofs[0].claim;
  assert.throws(() => validateManifest(duplicate, actual), /duplicate integration proof semantic claim identity/);
});

test("Interface 41 keeps repeated readout, control and action surfaces as views over singular target authority", { skip: !enabled }, () => {
  const Interface = require(path.join(process.env.R45_INTERFACE41_ROOT, "src"));
  const MT = require(path.join(process.env.R45_MORPHTILE_ROOT, "core/morphtile.js"));
  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const beforeTower = ws.live.tiles.mt_tower;
  const beforeParams = JSON.stringify(beforeTower.params);
  const beforeLogic = JSON.stringify(beforeTower.facets.logic);
  const levelsParam = beforeTower.params.find((param) => param.id === "levels");
  const beforeLevels = MT.paramValue(beforeTower, levelsParam);

  const input = {
    envelope_version: "0.1",
    request_id: "verification-r45-shared-binding-views",
    goal: "Verify view multiplicity does not multiply target state or authority",
    canonical_state: { forbidden_snapshot: { levels: beforeLevels, marker: "verification-must-not-copy" } },
    intent: {
      tile_path: "mt_tower",
      title: "Independent shared views",
      elements: [
        { kind: "readout", binding: "beacon", label: "Beacon A" },
        { kind: "readout", binding: "beacon", label: "Beacon B" },
        { kind: "control", binding: "levels", label: "Levels A" },
        { kind: "control", binding: "levels", label: "Levels B" },
        { kind: "action", binding: "toggle", label: "Toggle A" },
        { kind: "action", binding: "toggle", label: "Toggle B" }
      ],
      bindings: {
        readouts: ["beacon"],
        controls: ["levels"],
        actions: ["toggle"]
      }
    },
    provenance: { caller: "verification-round45" }
  };
  const beforeInput = JSON.stringify(input);
  const first = Interface.run(input);
  const replay = Interface.run(input);
  assert.deepEqual(replay, first, "Interface replay drifted");
  assert.equal(JSON.stringify(input), beforeInput, "Interface mutated caller input");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first.dependencies[0].requires, {
    tile_exists: true,
    form_hints_include: ["ui_panel"],
    readout_logic_vars: ["beacon"],
    control_param_ids: ["levels"],
    action_input_signal_socket_ids: ["toggle"]
  });
  assert.equal(first.candidate.operation.view.body.length, 6);
  assert.equal(JSON.stringify(first.candidate).includes("verification-must-not-copy"), false, "candidate copied caller canonical state");

  const candidate = MT.cloneBody(ws, "ai", "ai:verification-round45");
  const edited = MT.editCandidate(ws, candidate, first.candidate.operation);
  assert.equal(edited.ok, true, edited.error || "edit failed");
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id);
  assert.equal(committed.ok, true);

  const afterTower = ws.live.tiles.mt_tower;
  assert.equal(JSON.stringify(afterTower.params), beforeParams, "view multiplicity rewrote target parameter definitions");
  assert.equal(JSON.stringify(afterTower.facets.logic), beforeLogic, "view multiplicity rewrote target logic authority");
  const afterLevels = afterTower.params.find((param) => param.id === "levels");
  assert.equal(MT.paramValue(afterTower, afterLevels), beforeLevels, "view multiplicity changed canonical parameter state");

  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.equal(occurrences(html, 'data-param="mt_tower:levels"'), 2, "receiver did not render two controls over the one parameter");
  assert.equal(occurrences(html, 'data-signal="mt_tower:toggle"'), 2, "receiver did not render two actions over the one input signal");
  for (const label of ["Beacon A", "Beacon B", "Levels A", "Levels B", "Toggle A", "Toggle B"]) {
    assert.match(html, new RegExp(label));
  }

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash, "rollback failed exact structural restoration");
});
