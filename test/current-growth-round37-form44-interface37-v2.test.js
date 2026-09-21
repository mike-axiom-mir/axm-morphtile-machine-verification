"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "565798b682b60907ecea91a646df1bbb35157a28";
const FORM44 = "2cd9b5653d9f0561179fe0c2ccb0883e8cd3787a";
const INTERFACE_BASE = "935774d6f2cca71f528d008f8805397a6333eaea";
const INTERFACE37 = "928a5dcde78c0b685227e922d97bf9f70a4cca2c";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R37_FORM_BASE_ROOT && !!process.env.R37_FORM44_ROOT && !!process.env.R37_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R37_INTERFACE_BASE_ROOT && !!process.env.R37_INTERFACE37_ROOT && !!process.env.R37_MORPHTILE_ROOT;

const clone = (value) => JSON.parse(JSON.stringify(value));

function formRequest(requestId, intent) {
  return { envelope_version: "0.1", request_id: requestId, goal: "Verify repeat setting convergence", provenance: { verifier: "round37-v2" }, intent };
}

function equivalentRun(Base, Head, input, label) {
  const expected = Base.run(clone(input));
  const owned = clone(input);
  const before = JSON.stringify(owned);
  const first = Head.run(owned);
  const replay = Head.run(owned);
  assert.deepEqual(first, expected, `${label}: public result drifted from predecessor`);
  assert.deepEqual(replay, first, `${label}: replay changed`);
  assert.equal(JSON.stringify(owned), before, `${label}: caller input mutated`);
  return first;
}

function definitionWorld() {
  return { defs: { panel: { id: "panel", name: "Panel", body: { facets: {
    mesh: { type: "generated", source: null, data: { generator: "recipe", vars: { width: 1, depth: 1 }, parts: [{ shape: "plane", size: [["var", "width"], 1, ["var", "depth"]] }] } },
    material: { type: "primitive", source: null, data: { color: [0.5, 0.5, 0.5] } }
  } } } } };
}

function planeWidthSpans(compiled, count) {
  const scalarsPerPlane = 18;
  return Array.from({ length: count }, (_, index) => {
    const chunk = compiled.P.slice(index * scalarsPerPlane, (index + 1) * scalarsPerPlane);
    const xs = [];
    for (let i = 0; i < chunk.length; i += 3) xs.push(chunk[i]);
    return Math.max(...xs) - Math.min(...xs);
  });
}

function filesUnder(root, relative) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(root, relative));
  return out.sort();
}

function assertTreeBytesEqual(aRoot, bRoot, relative) {
  const a = filesUnder(aRoot, relative), b = filesUnder(bRoot, relative);
  assert.deepEqual(b, a, `${relative}: file set changed`);
  for (const file of a) assert.deepEqual(fs.readFileSync(path.join(bRoot, file)), fs.readFileSync(path.join(aRoot, file)), `${file}: bytes changed`);
}

function interfaceRequest(id, placement) {
  return { envelope_version: "0.1", request_id: id, goal: "Verify host presentation evidence", intent: {
    tile_path: "mt_tower", title: "Round 37 host proof", text: `mode ${placement.mode}`, placement
  }, provenance: { verifier: "round37-v2" } };
}

function commitCandidate(MT, ws, out) {
  const candidate = MT.cloneBody(ws, "ai", "ai:verification-round37-v2");
  for (const operation of out.candidate.operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.ok(edited.ok, edited.error);
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok);
  return committed.receipt;
}

test("Form #44 exact head preserves owner behavior and changes real receiver geometry", { skip: !formEnabled }, () => {
  assert.equal(process.env.R37_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R37_FORM44_COMMIT, FORM44);
  assert.equal(process.env.R37_MORPHTILE_COMMIT, MORPHTILE);
  const Base = require(path.join(process.env.R37_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_FORM44_ROOT, "src"));
  const helper = require(path.join(process.env.R37_FORM44_ROOT, "src", "repeat-setting-state.js"));
  const MT = require(path.join(process.env.R37_MORPHTILE_ROOT, "core", "morphtile.js"));

  const base = Object.create(null); base.__proto__ = 2; base.width = 1; base.depth = 10;
  const step = Object.create(null); step.__proto__ = 0.5; step.width = 2;
  const baseBefore = JSON.stringify(base), stepBefore = JSON.stringify(step);
  assert.deepEqual(helper.generatedSettingValues(base, step, 2), [3, 10, 5]);
  const expressions = helper.settingExpressionState(base, step);
  assert.equal(Object.prototype.hasOwnProperty.call(expressions, "__proto__"), true);
  assert.deepEqual(expressions.__proto__, ["+", 2, ["*", ["var", "i"], 0.5]]);
  assert.deepEqual(expressions.width, ["+", 1, ["*", ["var", "i"], 2]]);
  expressions.width[1] = 999;
  assert.equal(JSON.stringify(base), baseBefore); assert.equal(JSON.stringify(step), stepBefore);
  assert.deepEqual(helper.settingExpressionState(base, step).width, ["+", 1, ["*", ["var", "i"], 2]]);

  const valid = formRequest("r37v2-valid", { repeat: { count: 3, step: [4,0,0], instance: { use: "panel", with: { depth: 2, width: 1 } }, with_step: { width: 1 } } });
  const out = equivalentRun(Base, Head, valid, "valid setting progression");
  assert.equal(out.status, "CANDIDATE");
  assert.deepEqual(out.candidate.facets.mesh.data.parts[0].body[0].with, { depth: 2, width: ["+",1,["*",["var","i"],1]] });

  for (const [id, intent] of [
    ["unknown", { repeat: { count:3, step:[1,0,0], instance:{use:"panel",with:{width:1}}, with_step:{depth:1} } }],
    ["zero", { repeat: { count:3, step:[1,0,0], instance:{use:"panel",with:{width:1}}, with_step:{width:0} } }]
  ]) {
    const held = equivalentRun(Base, Head, formRequest(`r37v2-${id}`, intent), id);
    assert.equal(held.status, "HOLD");
    assert.equal(held.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  }

  equivalentRun(Base, Head, formRequest("r37v2-collapse", { repeat: { count:2, step:[0,0,0], instance:{use:"panel",with:{width:10000000000000000}}, with_step:{width:1} } }), "floating collapse");

  const tile = MT.createTile(out.candidate);
  assert.equal(MT.validateTile(tile).ok, true);
  const first = MT.compileMesh(tile, definitionWorld()), replay = MT.compileMesh(tile, definitionWorld());
  assert.deepEqual(replay, first);
  assert.equal(first.hold, null);
  assert.deepEqual(planeWidthSpans(first, 3), [1,2,3]);
});

test("Interface #37 exact head proves host modes, render defaults, session isolation and rollback", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R37_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R37_INTERFACE37_COMMIT, INTERFACE37);
  assert.equal(process.env.R37_MORPHTILE_COMMIT, MORPHTILE);
  const Base = require(path.join(process.env.R37_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_INTERFACE37_ROOT, "src"));
  const MT = require(path.join(process.env.R37_MORPHTILE_ROOT, "core", "morphtile.js"));

  assertTreeBytesEqual(process.env.R37_INTERFACE_BASE_ROOT, process.env.R37_INTERFACE37_ROOT, "src");
  for (const file of ["machine.json", "package.json"]) assert.deepEqual(fs.readFileSync(path.join(process.env.R37_INTERFACE37_ROOT,file)), fs.readFileSync(path.join(process.env.R37_INTERFACE_BASE_ROOT,file)));
  const status = fs.readFileSync(path.join(process.env.R37_INTERFACE37_ROOT, "STATUS.md"), "utf8");
  const stateLine = status.split(/\r?\n/).find((line) => line.startsWith("- State:"));
  assert.ok(stateLine); assert.doesNotMatch(stateLine, /\bcandidate\b/i); assert.match(status, /^## Current receiver evidence$/m);

  const modes = [...Head.PRESENTATION_MODES].sort();
  assert.deepEqual(modes, ["docked","embedded","floating","fullscreen","screen","tile","world"]);
  for (const mode of modes) {
    const placement = { mode, preferred_size:[320,240], preferred_position: mode === "world" ? [0,0,0] : [0,0], user_adjustable:false };
    const input = interfaceRequest(`r37v2-${mode}`, placement), beforeInput = JSON.stringify(input);
    const baseOut = Base.run(clone(input)), out = Head.run(input), replay = Head.run(input);
    assert.deepEqual(out, baseOut, `${mode}: producer output changed`); assert.deepEqual(replay, out); assert.equal(JSON.stringify(input), beforeInput); assert.equal(out.status,"CANDIDATE");
    const ws = MT.createWorkspace(MT.seedWorld()), beforeWorld = MT.structHash(ws.live);
    const receipt = commitCandidate(MT, ws, out), canonicalHash = MT.structHash(ws.live);
    const resolved = MT.resolvePresentation(ws.live, "mt_tower");
    assert.equal(resolved.status,"READY"); assert.equal(resolved.resolved.mode,mode); assert.equal(resolved.session_applied,false); assert.equal(MT.structHash(ws.live),canonicalHash);
    if (mode === "docked") assert.equal(Object.prototype.hasOwnProperty.call(ws.live.tiles.mt_tower.presentation,"dock"),false,"producer omission must remain canonical omission");
    if (mode === "tile") assert.equal(resolved.anchor_frame.anchor,"mt_tower");
    if (mode === "world") assert.equal(resolved.anchor_frame.anchor,"world-root");
    const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
    assert.match(html,new RegExp(`data-presentation-mode=\"${mode}\"`)); assert.match(html,new RegExp(`mt-p-${mode}`));
    assert.match(html,/--p-width:320px/); assert.match(html,/--p-height:240px/); assert.match(html,/--p-x:0px/); assert.match(html,/--p-y:0px/);
    if (mode === "docked") assert.match(html,/docked right/,"receiver-owned omitted dock default must be observable in rendered output");
    const rollback = MT.rollback(ws, receipt.rollback_token); assert.ok(rollback.ok && rollback.exact); assert.equal(MT.structHash(ws.live),beforeWorld);
  }

  const out = Head.run(interfaceRequest("r37v2-session", { mode:"docked", dock:"right", preferred_size:[360,480], preferred_position:[0,0], user_adjustable:true }));
  const ws = MT.createWorkspace(MT.seedWorld()), beforeWorld = MT.structHash(ws.live), receipt = commitCandidate(MT,ws,out), canonicalHash = MT.structHash(ws.live);
  const host = { session_presentations: { mt_tower: { dock:"left", preferred_position:[24,12] } } };
  const resolved = MT.resolvePresentation(ws.live,"mt_tower",host);
  assert.equal(resolved.status,"READY"); assert.equal(resolved.session_applied,true); assert.equal(resolved.resolved.dock,"left"); assert.deepEqual(resolved.resolved.preferred_position,[24,12]);
  assert.equal(ws.live.tiles.mt_tower.presentation.dock,"right"); assert.deepEqual(ws.live.tiles.mt_tower.presentation.preferred_position,[0,0]); assert.equal(MT.structHash(ws.live),canonicalHash);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live,host).root); assert.match(html,/mt-p-docked mt-dock-left/); assert.match(html,/--p-x:24px/); assert.match(html,/--p-y:12px/); assert.match(html,/session adjusted/);
  const rollback = MT.rollback(ws,receipt.rollback_token); assert.ok(rollback.ok && rollback.exact); assert.equal(MT.structHash(ws.live),beforeWorld);
});
