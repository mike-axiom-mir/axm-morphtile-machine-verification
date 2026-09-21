"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "fa91b691c40cf418be1d17aa0baa323e38800333";
const FORM42 = "7ed9acc65a362bb40d4e055a68928f02dd6ce3af";
const INTERFACE_BASE = "3ca0fece5e6c2905629da0c29e87eaf657bc10d4";
const INTERFACE35 = "699a2db2691aae5814f5712ff59ccc3296d99c19";
const ASSEMBLY_CURRENT = "8a2a7bf6adf40266438945ad1482001be9d68900";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R34_FORM_BASE_ROOT && !!process.env.R34_FORM42_ROOT && !!process.env.R34_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R34_INTERFACE_BASE_ROOT && !!process.env.R34_INTERFACE35_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formRequest(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify bounded repeat vector arithmetic convergence",
    provenance: {},
    intent
  };
}

function assertEquivalentRun(Base, Head, input, label) {
  const baseInput = clone(input);
  const headInput = clone(input);
  const before = JSON.stringify(headInput);
  const baseOut = Base.run(baseInput);
  const first = Head.run(headInput);
  const second = Head.run(headInput);
  assert.deepEqual(first, baseOut, `${label}: public result drifted from integrated predecessor`);
  assert.deepEqual(second, first, `${label}: deterministic replay changed`);
  assert.equal(JSON.stringify(headInput), before, `${label}: caller-owned request mutated`);
  return first;
}

function filesUnder(root, relative) {
  const start = path.join(root, relative);
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  walk(start);
  return out.sort();
}

function assertTreeBytesEqual(aRoot, bRoot, relative) {
  const aFiles = filesUnder(aRoot, relative);
  const bFiles = filesUnder(bRoot, relative);
  assert.deepEqual(bFiles, aFiles, `${relative}: file set changed`);
  for (const file of aFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(bRoot, file)),
      fs.readFileSync(path.join(aRoot, file)),
      `${file}: bytes changed`
    );
  }
}

function lines(text) {
  return text.split(/\r?\n/);
}

test("Form PR #42 converges repeat vector arithmetic without changing public semantics", { skip: !formEnabled }, () => {
  assert.equal(process.env.R34_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R34_FORM42_COMMIT, FORM42);
  assert.equal(process.env.R34_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R34_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R34_FORM42_ROOT, "src"));
  const {
    linearVector,
    linearVectorExpression
  } = require(path.join(process.env.R34_FORM42_ROOT, "src", "repeat-progression.js"));
  const MT = require(path.join(process.env.R34_MORPHTILE_ROOT, "core", "morphtile.js"));

  const vectorBase = [1, 2, 3];
  const vectorDelta = [0.5, -1, 0];
  const vectorBefore = JSON.stringify({ vectorBase, vectorDelta });
  const generated = linearVector(vectorBase, 2, vectorDelta);
  assert.deepEqual(generated, [2, 0, 3]);
  assert.deepEqual(
    linearVectorExpression(vectorBase, vectorDelta),
    [["+", 1, ["*", ["var", "i"], 0.5]], ["+", 2, ["*", ["var", "i"], -1]], 3]
  );
  generated[0] = 999;
  assert.equal(JSON.stringify({ vectorBase, vectorDelta }), vectorBefore, "vector helper aliases or mutates caller state");
  assert.deepEqual(linearVector(vectorBase, 2, vectorDelta), [2, 0, 3], "vector helper replay changed after output mutation");

  const primitive = formRequest("r34-primitive-vector-convergence", {
    repeat: {
      count: 4,
      step: [0.5, 1, 0],
      rot_step: [0, 0.2, 0],
      size_step: [0.1, -0.05, 0],
      part: {
        shape: "box",
        size: [1, 1, 0.5],
        pos: [1, 0, 0],
        rot: [0, 0.1, 0]
      }
    }
  });
  const primitiveOut = assertEquivalentRun(Base, Head, primitive, "primitive-position-rotation-size");
  assert.equal(primitiveOut.status, "CANDIDATE", JSON.stringify(primitiveOut.holds));

  const vectorScale = formRequest("r34-definition-vector-scale", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      rot_step: [0, 0.15, 0],
      scale_step: [0.2, -0.1, 0],
      with_step: { width: 0.5 },
      instance: {
        use: "panel",
        scale: [0.5, 1.2, 0.8],
        rot: [0, 0.1, 0],
        with: { width: 1 }
      }
    }
  });
  const vectorScaleOut = assertEquivalentRun(Base, Head, vectorScale, "definition-vector-scale-rotation-setting");
  assert.equal(vectorScaleOut.status, "CANDIDATE", JSON.stringify(vectorScaleOut.holds));

  const scalarScale = formRequest("r34-definition-scalar-scale", {
    repeat: {
      count: 3,
      step: [0, 1, 0],
      scale_step: 0.1,
      instance: { use: "panel", scale: 0.8 }
    }
  });
  const scalarScaleOut = assertEquivalentRun(Base, Head, scalarScale, "scalar-scale-control");
  assert.equal(scalarScaleOut.status, "CANDIDATE", JSON.stringify(scalarScaleOut.holds));

  const collision = formRequest("r34-float-collapse", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      part: { shape: "box", pos: [2 ** 53, 0, 0] }
    }
  });
  const collisionOut = assertEquivalentRun(Base, Head, collision, "complete-state-float-collapse");
  assert.equal(collisionOut.status, "HOLD");
  assert.equal(collisionOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const overflow = formRequest("r34-rotation-overflow", {
    repeat: {
      count: 2,
      step: [0, 1, 0],
      rot_step: [Number.MAX_VALUE, 0, 0],
      part: { shape: "box", rot: [Number.MAX_VALUE, 0, 0] }
    }
  });
  const overflowOut = assertEquivalentRun(Base, Head, overflow, "rotation-overflow");
  assert.equal(overflowOut.status, "HOLD");
  assert.equal(overflowOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const fixedPrimitive = Head.run(formRequest("r34-primitive-fixed", {
    repeat: {
      count: 4,
      step: [0.5, 1, 0],
      part: {
        shape: "box",
        size: [1, 1, 0.5],
        pos: [1, 0, 0],
        rot: [0, 0.1, 0]
      }
    }
  }));
  assert.equal(fixedPrimitive.status, "CANDIDATE", JSON.stringify(fixedPrimitive.holds));
  const changingMesh = MT.compileMesh(MT.createTile(primitiveOut.candidate));
  const fixedMesh = MT.compileMesh(MT.createTile(fixedPrimitive.candidate));
  for (const mesh of [changingMesh, fixedMesh]) {
    assert.equal(mesh.hold, null);
    assert.ok(mesh.P.length > 0);
    assert.ok(mesh.P.every(Number.isFinite));
  }
  assert.notDeepEqual(changingMesh.P, fixedMesh.P, "receiver geometry did not reflect emitted vector progression");

  function compileWithPanel(candidate) {
    const world = MT.createWorld("Verification round 34");
    world.defs = {
      panel: {
        id: "panel",
        name: "Panel",
        body: {
          facets: {
            mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } },
            material: { type: "primitive", source: null, data: { color: [0.7, 0.7, 0.9] } }
          }
        }
      }
    };
    const tile = MT.createTile(candidate);
    world.tiles[tile.id] = tile;
    return MT.compileMesh(tile, world);
  }

  const fixedVectorScale = Head.run(formRequest("r34-definition-vector-fixed", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      instance: {
        use: "panel",
        scale: [0.5, 1.2, 0.8],
        rot: [0, 0.1, 0],
        with: { width: 1 }
      }
    }
  }));
  assert.equal(fixedVectorScale.status, "CANDIDATE", JSON.stringify(fixedVectorScale.holds));
  const vectorScaleMesh = compileWithPanel(vectorScaleOut.candidate);
  const fixedVectorScaleMesh = compileWithPanel(fixedVectorScale.candidate);
  for (const mesh of [vectorScaleMesh, fixedVectorScaleMesh]) {
    assert.equal(mesh.hold, null);
    assert.ok(mesh.P.length > 0);
    assert.ok(mesh.P.every(Number.isFinite));
  }
  assert.notDeepEqual(vectorScaleMesh.P, fixedVectorScaleMesh.P, "receiver geometry did not reflect vector scale progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-repeat-vector-round34/v0.1",
    target_commit: FORM42,
    predecessor_commit: FORM_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: [
      "numeric-vector-kernel",
      "expression-vector-kernel",
      "zero-delta-constant",
      "copy-no-alias",
      "primitive-predecessor-equivalence",
      "definition-vector-scale-predecessor-equivalence",
      "scalar-scale-control",
      "complete-state-float-collapse-hold",
      "overflow-hold",
      "deterministic-replay",
      "caller-immutability",
      "primitive-receiver-effect",
      "definition-vector-scale-receiver-effect"
    ],
    placement: "FORM_REPEAT_VECTOR_ARITHMETIC_CONVERGENCE"
  }));
});

test("Interface PR #35 converges lifecycle truth without changing executable receiver semantics", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R34_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R34_INTERFACE35_COMMIT, INTERFACE35);
  assert.equal(process.env.R34_ASSEMBLY_CURRENT_COMMIT, ASSEMBLY_CURRENT);
  assert.equal(process.env.R34_MORPHTILE_COMMIT, MORPHTILE);

  const baseRoot = process.env.R34_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R34_INTERFACE35_ROOT;

  assertTreeBytesEqual(baseRoot, headRoot, "src");
  assertTreeBytesEqual(baseRoot, headRoot, "fixtures");
  assertTreeBytesEqual(baseRoot, headRoot, ".github/workflows");
  for (const file of ["machine.json", "package.json", "README.md", "test/assembly-dependency.integration.test.js"]) {
    assert.deepEqual(
      fs.readFileSync(path.join(headRoot, file)),
      fs.readFileSync(path.join(baseRoot, file)),
      `${file}: receiver/runtime evidence bytes changed during lifecycle-only candidate`
    );
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.repository, "mike-axiom-mir/axm-morphtile-machine-assembly");
  assert.equal(pins.assembly.commit, ASSEMBLY_CURRENT);
  const manifest = JSON.parse(fs.readFileSync(path.join(headRoot, "machine.json"), "utf8"));
  assert.equal(manifest.tested_against.commit, MORPHTILE);

  const baseRoadmap = fs.readFileSync(path.join(baseRoot, "ROADMAP.md"), "utf8");
  const headRoadmap = fs.readFileSync(path.join(headRoot, "ROADMAP.md"), "utf8");
  const baseLines = lines(baseRoadmap).filter((line) => line.includes(ASSEMBLY_CURRENT));
  const headLines = lines(headRoadmap).filter((line) => line.includes(ASSEMBLY_CURRENT));
  assert.ok(baseLines.some((line) => line.startsWith("- [ ] ")), "integrated predecessor must reproduce stale unchecked receiver proof");
  assert.ok(headLines.some((line) => line.startsWith("- [x] ")), "candidate must mark exact integrated receiver proof complete");
  assert.equal(headLines.filter((line) => line.startsWith("- [ ] ")).length, 0, "candidate leaves exact current receiver proof simultaneously unresolved");

  const baseStatus = fs.readFileSync(path.join(baseRoot, "STATUS.md"), "utf8");
  const headStatus = fs.readFileSync(path.join(headRoot, "STATUS.md"), "utf8");
  assert.ok(baseStatus.includes("- State: RECEIVER-CLOSURE EVIDENCE CANDIDATE — runtime semantics unchanged"));
  assert.ok(headStatus.includes("- State: RECEIVER-CLOSURE EVIDENCE INTEGRATED — runtime semantics unchanged"));
  assert.ok(headStatus.includes(`- Assembly receiver evidence target: \`${ASSEMBLY_CURRENT}\``));
  assert.ok(headStatus.includes(`merged as \`${INTERFACE_BASE}\``), "candidate does not bind integrated Interface #33 history to its merge commit");
  assert.ok(!headStatus.includes("at current Interface main `2cff4674c4cfb5de97bf842a6d307f3585268ab1`"), "stale historical commit is still labeled current Interface main");

  const identityTest = fs.readFileSync(path.join(headRoot, "test", "integration-evidence-identity.test.js"), "utf8");
  assert.ok(identityTest.includes('const roadmap = read("ROADMAP.md")'));
  assert.ok(identityTest.includes("must mark the current exact Assembly receiver evidence target as completed"));
  assert.ok(identityTest.includes("must not leave the current exact Assembly receiver evidence target as an unresolved TODO"));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-lifecycle-truth-round34/v0.1",
    target_commit: INTERFACE35,
    predecessor_commit: INTERFACE_BASE,
    assembly_receiver_commit: ASSEMBLY_CURRENT,
    morphtile_commit: MORPHTILE,
    status: "PASS",
    checked: [
      "src-byte-identity",
      "fixture-byte-identity",
      "workflow-byte-identity",
      "manifest-package-readme-byte-identity",
      "receiver-suite-byte-identity",
      "exact-receiver-pin",
      "exact-core-pin",
      "predecessor-stale-roadmap-reproduced",
      "current-roadmap-complete",
      "candidate-to-integrated-status-transition",
      "historical-merge-identity",
      "stale-current-main-claim-removed",
      "reusable-roadmap-truth-guard"
    ],
    placement: "INTERFACE_RECEIVER_LIFECYCLE_TRUTH"
  }));
});
