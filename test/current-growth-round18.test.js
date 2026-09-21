"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CORE_MAIN = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const CORE_PR17 = "8e8dc095ffe9b4a81ed07e05203c8c5ca979dd56";
const FORM_BASE = "679573783f9f8d925d64089bf3b871dadcac5d11";
const FORM_PR31 = "a44fd9509e4b832f6faf354d2b88a6f257bc9dd5";
const INTERFACE_BASE = "d1c2ee9d25d9f8db1dbb1c907e9d022928467f70";
const INTERFACE_PR26 = "0c391e0042e8be97fb0f28daffed2d49f1f63eaa";
const INTERFACE_PR25 = "dd93d83f1fc93536851a9cb0025255241172104f";
const ASSEMBLY_RECEIVER = "66eb29fa8a344a20aabce0cb73f1cd302166efd8";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 18 replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileSnapshot(root, relative) {
  const start = path.join(root, relative);
  const rows = [];
  function walk(current, rel) {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) {
        walk(path.join(current, name), path.join(rel, name));
      }
      return;
    }
    rows.push([rel.replaceAll(path.sep, "/"), fs.readFileSync(current).toString("base64")]);
  }
  walk(start, relative);
  return rows;
}

const hasForm = !!process.env.R18_FORM_BASE_ROOT && !!process.env.R18_FORM31_ROOT && !!process.env.R18_CORE_MAIN_PATH;
test("Form PR #31: complete repeat generated-state proof rejects precision-collapsed matter without rejecting a still-distinct combined state", { skip: !hasForm }, () => {
  assert.equal(process.env.R18_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R18_FORM31_COMMIT, FORM_PR31);
  assert.equal(process.env.R18_CORE_MAIN_COMMIT, CORE_MAIN);

  const Base = require(path.join(process.env.R18_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R18_FORM31_ROOT, "src"));
  const MT = require(path.resolve(process.env.R18_CORE_MAIN_PATH));

  const collapsed = request("r18-form31-translation-collapse", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_SAFE_INTEGER + 1, 0, 0] }
    }
  });
  const collapsedBefore = JSON.stringify(collapsed);
  const oldCollapsed = Base.run(collapsed);
  const newCollapsed = Head.run(collapsed);
  assert.equal(oldCollapsed.status, "CANDIDATE", "integrated predecessor must demonstrate the precision hole");
  assert.equal(newCollapsed.status, "HOLD");
  assert.equal(newCollapsed.candidate, null);
  assert.equal(newCollapsed.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  assert.match(newCollapsed.holds[0].detail, /duplicate authored state/);
  assert.equal(JSON.stringify(collapsed), collapsedBefore, "candidate evaluation must not rewrite caller matter");
  assert.deepEqual(Head.run(collapsed), newCollapsed, "precision-collapse replay must be deterministic");

  const combined = request("r18-form31-collapsed-position-distinct-rotation", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      rot_step: [0, 0.5, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_SAFE_INTEGER + 1, 0, 0], rot: [0, 0, 0] }
    }
  });
  const oldCombined = Base.run(combined);
  const newCombined = Head.run(combined);
  assert.equal(newCombined.status, "CANDIDATE", JSON.stringify(newCombined.holds));
  assert.deepEqual(newCombined, oldCombined, "a collapsed component must remain valid when another verified component keeps complete state distinct");
  assert.deepEqual(Head.run(combined), newCombined, "combined-state replay must be deterministic");

  const runtimeRequest = request("r18-form31-real-receiver", {
    repeat: {
      count: 4,
      step: [0, 0.5, 0],
      rot_step: [0, 0.25, 0],
      part: { shape: "box", size: [1, 0.25, 0.5], pos: [0, 0, 0], rot: [0, 0, 0] }
    }
  });
  const oldRuntime = Base.run(runtimeRequest);
  const runtime = Head.run(runtimeRequest);
  assert.equal(runtime.status, "CANDIDATE", JSON.stringify(runtime.holds));
  assert.deepEqual(runtime, oldRuntime, "ordinary distinct repeat semantics must stay exact across the new proof");

  const tile = MT.createTile(runtime.candidate);
  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));

  const fixed = clone(runtime.candidate);
  const fixedLeaf = fixed.facets.mesh.data.parts[0].body[0];
  fixedLeaf.rot = [0, 0, 0];
  const fixedMesh = MT.compileMesh(MT.createTile(fixed));
  assert.equal(fixedMesh.hold, null, JSON.stringify(fixedMesh));
  assert.notDeepEqual(mesh.P, fixedMesh.P, "real MorphTile receiver must consume the progression that proves the complete generated state is meaningful");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-repeat-complete-state-round18/v0.1",
    target_commit: FORM_PR31,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE_MAIN,
    status: "PASS",
    checked: [
      "predecessor-demonstrates-precision-hole",
      "precision-collapsed-complete-state-holds",
      "collapsed-component-plus-distinguishing-component-passes",
      "deterministic-source-preserving-replay",
      "ordinary-semantics-exact-equivalence",
      "real-core-receiver-effect"
    ],
    placement: "FORM_MACHINE_GENERATED_STATE_PROOF"
  }));
});

const hasInterfaceTruth = !!process.env.R18_INTERFACE_BASE_ROOT && !!process.env.R18_INTERFACE26_ROOT;
test("Interface PR #26: integration-truth convergence changes docs only and names the exact integrated pins and still-open core HOLD", { skip: !hasInterfaceTruth }, () => {
  assert.equal(process.env.R18_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R18_INTERFACE26_COMMIT, INTERFACE_PR26);

  const baseRoot = process.env.R18_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R18_INTERFACE26_ROOT;
  for (const runtimePath of ["src", "machine.json", "package.json"]) {
    assert.deepEqual(
      fileSnapshot(headRoot, runtimePath),
      fileSnapshot(baseRoot, runtimePath),
      `${runtimePath} must remain byte-identical in a truth-only candidate`
    );
  }

  const docs = ["README.md", "STATUS.md", "ROADMAP.md", "CHANGELOG.md"]
    .map((name) => fs.readFileSync(path.join(headRoot, name), "utf8"))
    .join("\n");
  assert.match(docs, new RegExp(INTERFACE_BASE), "docs must name the integrated Interface main exactly");
  assert.match(docs, new RegExp(INTERFACE_PR25), "docs must preserve the exact independently verified 0.5.13 candidate evidence");
  assert.match(docs, new RegExp(ASSEMBLY_RECEIVER), "docs must name the current Assembly receiver pin exactly");
  assert.match(docs, /MorphTile core PR #17|core PR #17/i, "docs must keep the occupied lexical-scope core lane visible");
  assert.match(docs, /direct repeat-local value rendering remains outside Interface|repeat-local value rendering remains outside/i, "docs must not claim the held producer surface is implemented");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-integration-truth-round18/v0.1",
    target_commit: INTERFACE_PR26,
    predecessor_commit: INTERFACE_BASE,
    status: "PASS",
    checked: [
      "runtime-src-byte-identical",
      "machine-and-package-byte-identical",
      "integrated-interface-pin-truth",
      "verified-candidate-pin-truth",
      "assembly-receiver-pin-truth",
      "core-hold-remains-explicit"
    ],
    placement: "INTERFACE_MACHINE_TRUTH_ONLY"
  }));
});

const hasCoreHold = !!process.env.R18_CORE_MAIN_ROOT && !!process.env.R18_CORE17_ROOT;
test("MorphTile core PR #17: current regression head independently reproduces exactly the two lexical presentation-scope failures while main view tests remain green", { skip: !hasCoreHold }, () => {
  assert.equal(process.env.R18_CORE_MAIN_COMMIT, CORE_MAIN);
  assert.equal(process.env.R18_CORE17_COMMIT, CORE_PR17);

  const mainRun = spawnSync(process.execPath, ["--test", "test/views.js"], {
    cwd: process.env.R18_CORE_MAIN_ROOT,
    encoding: "utf8"
  });
  assert.equal(mainRun.status, 0, `${mainRun.stdout}\n${mainRun.stderr}`);

  const holdRun = spawnSync(process.execPath, ["--test", "test/views.js"], {
    cwd: process.env.R18_CORE17_ROOT,
    encoding: "utf8"
  });
  const output = `${holdRun.stdout}\n${holdRun.stderr}`;
  assert.notEqual(holdRun.status, 0, "the regression-only core candidate must remain red until implementation exists");
  assert.match(output, /an interface can be written over repeats and expressions, like everything else/);
  assert.match(output, /repeat lexical scope reaches expression-backed node labels without changing action or control authority/);
  assert.match(output, /# fail 2\b/);
  assert.match(output, /expression-backed text sees the repeat lexical index rather than only outer canonical vars/);
  assert.match(output, /meter 0/, "node-label regression must fail after the preceding signal/control authority assertions have already passed");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/core-repeat-lexical-presentation-hold-round18/v0.1",
    target_commit: CORE_PR17,
    baseline_commit: CORE_MAIN,
    status: "HOLD_RECONFIRMED",
    checked: [
      "current-main-view-suite-green",
      "regression-head-intentionally-red",
      "exactly-two-failures",
      "expression-text-repeat-scope-gap",
      "expression-node-label-repeat-scope-gap",
      "action-control-authority-not-the-failing-boundary"
    ],
    placement: "MORPHTILE_CORE_RUNTIME_SCOPE",
    merge_allowed: false
  }));
});
