"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "a13e495c61e911ef1382512b4532ddf26fdcc080";
const FORM45 = "6945cfb5a2fcab6f20238055fdc85ae0cbac23f9";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R39_FORM_BASE_ROOT && !!process.env.R39_FORM45_ROOT && !!process.env.R39_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify grid setting state convergence on current Form",
    provenance: { verifier: "round39" },
    intent
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
        name: "Round 39 parametric panel",
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

function equivalentRun(Base, Head, input, label) {
  const baseInput = clone(input);
  const headInput = clone(input);
  const before = JSON.stringify(headInput);
  const expected = Base.run(baseInput);
  const first = Head.run(headInput);
  const replay = Head.run(headInput);
  assert.deepEqual(first, expected, `${label}: public result drifted from current integrated predecessor`);
  assert.deepEqual(replay, first, `${label}: deterministic replay drifted`);
  assert.equal(JSON.stringify(headInput), before, `${label}: caller input mutated`);
  return first;
}

test("Form #45 refreshed exact head centralizes grid setting state without public drift", { skip: !enabled }, () => {
  assert.equal(process.env.R39_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R39_FORM45_COMMIT, FORM45);
  assert.equal(process.env.R39_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R39_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R39_FORM45_ROOT, "src"));
  const helper = require(path.join(process.env.R39_FORM45_ROOT, "src", "grid-setting-state.js"));
  const MT = require(path.join(process.env.R39_MORPHTILE_ROOT, "core", "morphtile.js"));

  const baseSettings = JSON.parse('{"__proto__":2,"depth":10,"width":1}');
  const deltas = [JSON.parse('{"__proto__":0.5,"width":2}'), Object.assign(Object.create(null), { depth: 0.25 }), Object.assign(Object.create(null), { width: -1 })];
  const baseBefore = JSON.stringify(baseSettings);
  const deltasBefore = JSON.stringify(deltas);
  const generated = helper.generatedSettingValues(baseSettings, deltas, [2, 1, 3]);
  assert.deepEqual(generated, [3, 10.25, 2]);
  const expressions = helper.settingExpressionState(baseSettings, deltas);
  assert.equal(Object.prototype.hasOwnProperty.call(expressions, "__proto__"), true);
  assert.deepEqual(expressions.__proto__, ["+", 2, ["*", ["var", "gx"], 0.5]]);
  assert.deepEqual(expressions.depth, ["+", 10, ["*", ["var", "gy"], 0.25]]);
  assert.deepEqual(expressions.width, ["+", ["+", 1, ["*", ["var", "gx"], 2]], ["*", ["var", "gz"], -1]]);
  assert.equal(JSON.stringify(baseSettings), baseBefore, "helper mutated base settings");
  assert.equal(JSON.stringify(deltas), deltasBefore, "helper mutated deltas");
  expressions.width[0] = "mutated";
  assert.deepEqual(helper.settingExpressionState(baseSettings, deltas).width, ["+", ["+", 1, ["*", ["var", "gx"], 2]], ["*", ["var", "gz"], -1]], "helper leaked output identity");
  assert.deepEqual(helper.generatedSettingValues({ width: 1 }, [Object.assign(Object.create(null), { depth: 9 }), null, null], [4,0,0]), [1], "helper must remain validation-neutral for unowned deltas");

  const ordinary = request("r39-grid-setting", {
    grid: {
      counts: [2, 2, 1],
      step: [2, 0, 91],
      with_step: { x: { width: 0.5 }, y: { depth: 0.25 } },
      instance: { use: "panel", with: { width: 1, depth: 2 }, pos: [10, -2, 3] }
    }
  });
  const ordinaryOut = equivalentRun(Base, Head, ordinary, "ordinary setting grid");
  assert.equal(ordinaryOut.status, "CANDIDATE", JSON.stringify(ordinaryOut.holds));
  const leaf = leafOf(ordinaryOut.candidate);
  assert.deepEqual(leaf.with, {
    depth: ["+", 2, ["*", ["var", "gy"], 0.25]],
    width: ["+", 1, ["*", ["var", "gx"], 0.5]]
  });

  const collapse = Number.MAX_SAFE_INTEGER + 1;
  const stillDistinct = equivalentRun(Base, Head, request("r39-distinct", {
    grid: {
      counts: [2,1,1], step: [1,0,0], with_step: { x: { width: 0.5 } },
      instance: { use: "panel", with: { width: 1 }, pos: [collapse,0,0] }
    }
  }), "collapsed position but distinct setting");
  assert.equal(stillDistinct.status, "CANDIDATE");

  const duplicate = equivalentRun(Base, Head, request("r39-duplicate", {
    grid: {
      counts: [2,1,1], step: [1,0,0], with_step: { x: { width: 1 } },
      instance: { use: "panel", with: { width: collapse }, pos: [collapse,0,0] }
    }
  }), "complete-state collapse");
  assert.equal(duplicate.status, "HOLD");
  assert.equal(duplicate.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(duplicate.holds[0].detail, /duplicate authored state/);

  for (const [id, grid] of [
    ["unknown-axis", { counts:[2,1,1], step:[1,0,0], with_step:{ q:{ width:1 } }, instance:{ use:"panel", with:{ width:1 } } }],
    ["missing-base", { counts:[2,1,1], step:[1,0,0], with_step:{ x:{ missing:1 } }, instance:{ use:"panel", with:{ width:1 } } }],
    ["zero-effect", { counts:[2,1,1], step:[1,0,0], with_step:{ x:{ width:0 } }, instance:{ use:"panel", with:{ width:1 } } }]
  ]) {
    const held = equivalentRun(Base, Head, request(`r39-${id}`, { grid }), id);
    assert.equal(held.status, "HOLD");
  }

  const tile = MT.createTile(ordinaryOut.candidate);
  const world = definitionWorld();
  world.tiles = { [tile.id]: tile };
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));
  const replayCompiled = MT.compileMesh(tile, world);
  assert.deepEqual(replayCompiled, compiled, "real receiver replay drifted");

  const noSettingsCandidate = clone(ordinaryOut.candidate);
  leafOf(noSettingsCandidate).with = { width: 1, depth: 2 };
  const noSettingsTile = MT.createTile(noSettingsCandidate);
  const noSettingsWorld = definitionWorld();
  noSettingsWorld.tiles = { [noSettingsTile.id]: noSettingsTile };
  const noSettings = MT.compileMesh(noSettingsTile, noSettingsWorld);
  assert.equal(noSettings.hold, null, JSON.stringify(noSettings));
  assert.notDeepEqual(compiled.P, noSettings.P, "receiver must consume the preserved setting progression");
});
