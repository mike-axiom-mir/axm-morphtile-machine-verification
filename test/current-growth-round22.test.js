"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "58a9c272257fed179b0136671c2fcfb42ac7dfe2";
const FORM_PR35 = "57af06dd66b311dad1a3d2d1f380815b312d32c9";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 22 replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function leafOf(candidate) {
  let node = candidate.facets.mesh.data.parts[0];
  while (node && Number.isInteger(node.repeat) && Array.isArray(node.body)) node = node.body[0];
  return node;
}

function definitionWorld() {
  return {
    defs: {
      panel: {
        id: "panel",
        name: "Round 22 parametric panel",
        body: {
          facets: {
            mesh: {
              type: "generated",
              source: null,
              data: {
                generator: "recipe",
                vars: { width: 1, depth: 1 },
                parts: [{ shape: "plane", size: [["var", "width"], 1, ["var", "depth"]] }]
              }
            }
          }
        }
      }
    }
  };
}

const enabled = !!process.env.R22_FORM_BASE_ROOT && !!process.env.R22_FORM35_ROOT && !!process.env.R22_CORE_PATH;

test("Form PR #35: definition-setting grid position convergence preserves complete-state semantics and real receiver effects", { skip: !enabled }, () => {
  assert.equal(process.env.R22_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R22_FORM35_COMMIT, FORM_PR35);
  assert.equal(process.env.R22_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R22_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R22_FORM35_ROOT, "src"));
  const MT = require(path.resolve(process.env.R22_CORE_PATH));

  const ordinary = request("r22-form-settings-position", {
    grid: {
      counts: [2, 2, 1],
      step: [2, 0, 91],
      with_step: {
        x: { width: 0.5 },
        y: { depth: 0.25 }
      },
      instance: {
        use: "panel",
        with: { width: 1, depth: 2 },
        pos: [10, -2, 3]
      }
    }
  });
  const ordinaryBefore = JSON.stringify(ordinary);
  const ordinaryBase = Base.run(ordinary);
  const ordinaryHead = Head.run(ordinary);
  assert.equal(ordinaryHead.status, "CANDIDATE", JSON.stringify(ordinaryHead.holds));
  assert.deepEqual(ordinaryHead, ordinaryBase, "internal position-kernel convergence must preserve exact public output");
  assert.deepEqual(Head.run(ordinary), ordinaryHead, "replay must remain deterministic");
  assert.equal(JSON.stringify(ordinary), ordinaryBefore, "caller matter must remain unchanged");

  const leaf = leafOf(ordinaryHead.candidate);
  assert.deepEqual(leaf.pos, [
    ["+", 10, ["*", ["var", "gx"], 2]],
    -2,
    3
  ], "inactive one-cell z must not receive a gz reference even when its authored step is nonzero");
  assert.deepEqual(leaf.with.width, ["+", 1, ["*", ["var", "gx"], 0.5]]);
  assert.deepEqual(leaf.with.depth, ["+", 2, ["*", ["var", "gy"], 0.25]]);
  assert.equal(JSON.stringify(ordinaryHead.candidate).includes('"gz"'), false, "inactive lexical axes must stay absent from emitted matter");

  const collapse = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(collapse + 1, collapse, "test requires a representationally collapsed translation step");

  const translationCollapsedButSettingDistinct = request("r22-form-collapse-setting-distinct", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      with_step: { x: { width: 0.5 } },
      instance: {
        use: "panel",
        with: { width: 1 },
        pos: [collapse, 0, 0]
      }
    }
  });
  const distinctBase = Base.run(translationCollapsedButSettingDistinct);
  const distinctHead = Head.run(translationCollapsedButSettingDistinct);
  assert.equal(distinctHead.status, "CANDIDATE", JSON.stringify(distinctHead.holds));
  assert.deepEqual(distinctHead, distinctBase, "collapsed translation must remain valid when the complete authored state is distinguished by a setting");

  const fullyCollapsed = request("r22-form-collapse-complete-state", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      with_step: { x: { width: 1 } },
      instance: {
        use: "panel",
        with: { width: collapse },
        pos: [collapse, 0, 0]
      }
    }
  });
  const fullyCollapsedBase = Base.run(fullyCollapsed);
  const fullyCollapsedHead = Head.run(fullyCollapsed);
  assert.equal(fullyCollapsedHead.status, "HOLD");
  assert.equal(fullyCollapsedHead.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(fullyCollapsedHead.holds[0].detail, /duplicate authored state/);
  assert.deepEqual(fullyCollapsedHead, fullyCollapsedBase, "the refactor must preserve complete-domain duplicate detection when both position and setting collapse numerically");

  const signedZero = request("r22-form-signed-zero", {
    grid: {
      counts: [2, 1, 1],
      step: [-0, 0, 0],
      with_step: { x: { width: 0.5 } },
      instance: { use: "panel", with: { width: 1 } }
    }
  });
  const signedZeroBase = Base.run(signedZero);
  const signedZeroHead = Head.run(signedZero);
  assert.equal(signedZeroHead.status, "HOLD");
  assert.equal(signedZeroHead.holds[0].code, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  assert.deepEqual(signedZeroHead, signedZeroBase, "portability must still precede internal position arithmetic");
  assert.equal(Object.is(signedZero.intent.grid.step[0], -0), true, "caller-owned signed zero must remain untouched");

  function compile(candidate) {
    const tile = MT.createTile(candidate);
    const world = definitionWorld();
    world.tiles = { [tile.id]: tile };
    return MT.compileMesh(tile, world);
  }

  const compiled = compile(ordinaryHead.candidate);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const noPositionCandidate = JSON.parse(JSON.stringify(ordinaryHead.candidate));
  leafOf(noPositionCandidate).pos = [10, -2, 3];
  const noPosition = compile(noPositionCandidate);
  assert.equal(noPosition.hold, null, JSON.stringify(noPosition));
  assert.notDeepEqual(compiled.P, noPosition.P, "real MorphTile must consume the refactored grid position expressions");

  const noSettingsCandidate = JSON.parse(JSON.stringify(ordinaryHead.candidate));
  leafOf(noSettingsCandidate).with = { width: 1, depth: 2 };
  const noSettings = compile(noSettingsCandidate);
  assert.equal(noSettings.hold, null, JSON.stringify(noSettings));
  assert.notDeepEqual(compiled.P, noSettings.P, "real MorphTile must independently consume setting progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-settings-position-kernel-round22/v0.1",
    target_commit: FORM_PR35,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "ordinary-public-output-exact-equivalence",
      "inactive-axis-lexical-omission",
      "deterministic-replay",
      "caller-immutability",
      "translation-collapse-distinguished-by-setting",
      "complete-state-numeric-collapse-hold",
      "signed-zero-portability-precedes-kernel",
      "real-core-position-expression-effect",
      "real-core-setting-expression-effect"
    ],
    placement: "FORM_MACHINE_DEFINITION_GRID_POSITION_CONVERGENCE"
  }));
});
