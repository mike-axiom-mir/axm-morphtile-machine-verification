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

const formEnabled = !!process.env.R37_FORM_BASE_ROOT
  && !!process.env.R37_FORM44_ROOT
  && !!process.env.R37_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R37_INTERFACE_BASE_ROOT
  && !!process.env.R37_INTERFACE37_ROOT
  && !!process.env.R37_MORPHTILE_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formRequest(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify repeat setting generated-state convergence",
    provenance: { verifier: "round37" },
    intent
  };
}

function equivalentRun(Base, Head, input, label) {
  const baseInput = clone(input);
  const headInput = clone(input);
  const before = JSON.stringify(headInput);
  const expected = Base.run(baseInput);
  const first = Head.run(headInput);
  const second = Head.run(headInput);
  assert.deepEqual(first, expected, `${label}: public result drifted from integrated predecessor`);
  assert.deepEqual(second, first, `${label}: deterministic replay changed`);
  assert.equal(JSON.stringify(headInput), before, `${label}: caller-owned request mutated`);
  return first;
}

function definitionWorld() {
  return {
    defs: {
      panel: {
        id: "panel",
        name: "Parametric panel",
        created_by: "verification-round37",
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
            },
            material: { type: "primitive", source: null, data: { color: [0.5, 0.5, 0.5] } }
          }
        }
      }
    }
  };
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

function interfaceRequest(id, placement) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify Interface presentation reaches host without gaining host/session authority",
    intent: {
      tile_path: "mt_tower",
      title: "Round 37 presentation proof",
      text: `mode ${placement.mode}`,
      placement
    },
    provenance: { caller: "verification-round37" }
  };
}

function commitInterfaceCandidate(MT, ws, out) {
  const candidate = MT.cloneBody(ws, "ai", "ai:verification-round37");
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

test("Form PR #44 preserves repeat-setting owner semantics while centralizing generated state", { skip: !formEnabled }, () => {
  assert.equal(process.env.R37_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R37_FORM44_COMMIT, FORM44);
  assert.equal(process.env.R37_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R37_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_FORM44_ROOT, "src"));
  const { generatedSettingValues, settingExpressionState } = require(path.join(process.env.R37_FORM44_ROOT, "src", "repeat-setting-state.js"));
  const MT = require(path.join(process.env.R37_MORPHTILE_ROOT, "core", "morphtile.js"));

  const authoredBase = Object.create(null);
  authoredBase.__proto__ = 2;
  authoredBase.width = 1;
  authoredBase.depth = 10;
  const authoredStep = Object.create(null);
  authoredStep.__proto__ = 0.5;
  authoredStep.width = 2;
  const baseBefore = JSON.stringify(authoredBase);
  const stepBefore = JSON.stringify(authoredStep);

  assert.deepEqual(generatedSettingValues(authoredBase, authoredStep, 2), [3, 10, 5]);
  const expressionState = settingExpressionState(authoredBase, authoredStep);
  assert.equal(Object.getPrototypeOf(expressionState), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(expressionState, "__proto__"), true);
  assert.deepEqual(expressionState.__proto__, ["+", 2, ["*", ["var", "i"], 0.5]]);
  assert.equal(expressionState.depth, 10);
  assert.deepEqual(expressionState.width, ["+", 1, ["*", ["var", "i"], 2]]);
  expressionState.width[1] = 999;
  assert.equal(JSON.stringify(authoredBase), baseBefore, "setting expression state aliases caller base settings");
  assert.equal(JSON.stringify(authoredStep), stepBefore, "setting expression state aliases caller setting deltas");
  assert.deepEqual(settingExpressionState(authoredBase, authoredStep).width, ["+", 1, ["*", ["var", "i"], 2]], "helper replay changed after output mutation");

  const valid = formRequest("r37-setting-valid", {
    repeat: {
      count: 3,
      step: [4, 0, 0],
      instance: { use: "panel", with: { depth: 2, width: 1 } },
      with_step: { width: 1 }
    }
  });
  const validOut = equivalentRun(Base, Head, valid, "valid-setting-progression");
  assert.equal(validOut.status, "CANDIDATE", JSON.stringify(validOut.holds));
  assert.deepEqual(validOut.candidate.facets.mesh.data.parts[0].body[0].with, {
    depth: 2,
    width: ["+", 1, ["*", ["var", "i"], 1]]
  });

  const unknownDelta = formRequest("r37-setting-unowned-delta", {
    repeat: {
      count: 3,
      step: [1, 0, 0],
      instance: { use: "panel", with: { width: 1 } },
      with_step: { depth: 1 }
    }
  });
  const unknownOut = equivalentRun(Base, Head, unknownDelta, "unowned-setting-delta");
  assert.equal(unknownOut.status, "HOLD");
  assert.equal(unknownOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const zeroOnly = formRequest("r37-setting-zero-only", {
    repeat: {
      count: 3,
      step: [1, 0, 0],
      instance: { use: "panel", with: { width: 1 } },
      with_step: { width: 0 }
    }
  });
  const zeroOut = equivalentRun(Base, Head, zeroOnly, "zero-only-setting-delta");
  assert.equal(zeroOut.status, "HOLD");
  assert.equal(zeroOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const collapse = formRequest("r37-setting-floating-collapse", {
    repeat: {
      count: 2,
      step: [0, 0, 0],
      instance: { use: "panel", with: { width: 10000000000000000 } },
      with_step: { width: 1 }
    }
  });
  equivalentRun(Base, Head, collapse, "floating-point-setting-distinctness");

  const tile = MT.createTile(validOut.candidate);
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const first = MT.compileMesh(tile, definitionWorld());
  const second = MT.compileMesh(tile, definitionWorld());
  assert.deepEqual(first, second, "pinned MorphTile setting receiver replay changed");
  assert.equal(first.hold, null);
  assert.equal(first.recipe_parts, 3);
  assert.deepEqual(planeWidthSpans(first, 3), [1, 2, 3], "bounded setting progression must change actual receiver geometry");
});

test("Interface PR #37 keeps producer runtime byte-identical while proving all host presentation modes and exact rollback", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R37_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R37_INTERFACE37_COMMIT, INTERFACE37);
  assert.equal(process.env.R37_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R37_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_INTERFACE37_ROOT, "src"));
  const MT = require(path.join(process.env.R37_MORPHTILE_ROOT, "core", "morphtile.js"));

  assertTreeBytesEqual(process.env.R37_INTERFACE_BASE_ROOT, process.env.R37_INTERFACE37_ROOT, "src");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(
      fs.readFileSync(path.join(process.env.R37_INTERFACE37_ROOT, file)),
      fs.readFileSync(path.join(process.env.R37_INTERFACE_BASE_ROOT, file)),
      `${file}: runtime contract changed in evidence-only Interface candidate`
    );
  }

  const status = fs.readFileSync(path.join(process.env.R37_INTERFACE37_ROOT, "STATUS.md"), "utf8");
  const stateLine = status.split(/\r?\n/).find((line) => line.startsWith("- State:"));
  assert.ok(stateLine);
  assert.doesNotMatch(stateLine, /\bcandidate\b/i, "persistent Interface state must not embed transient PR lifecycle");
  assert.match(status, /^## Current receiver evidence$/m);

  const modes = [...Head.PRESENTATION_MODES].sort();
  assert.deepEqual(modes, ["docked", "embedded", "floating", "fullscreen", "screen", "tile", "world"]);

  for (const mode of modes) {
    const placement = {
      mode,
      preferred_size: [320, 240],
      preferred_position: mode === "world" ? [0, 0, 0] : [0, 0],
      user_adjustable: false
    };
    const input = interfaceRequest(`r37-host-${mode}`, placement);
    const beforeInput = JSON.stringify(input);
    const baseOut = Base.run(clone(input));
    const headOut = Head.run(input);
    const replay = Head.run(input);
    assert.deepEqual(headOut, baseOut, `${mode}: evidence-only candidate changed producer output`);
    assert.deepEqual(replay, headOut, `${mode}: producer replay changed`);
    assert.equal(JSON.stringify(input), beforeInput, `${mode}: Interface mutated caller request`);
    assert.equal(headOut.status, "CANDIDATE");

    const ws = MT.createWorkspace(MT.seedWorld());
    const beforeWorld = MT.structHash(ws.live);
    const receipt = commitInterfaceCandidate(MT, ws, headOut);
    const canonicalHash = MT.structHash(ws.live);
    const resolved = MT.resolvePresentation(ws.live, "mt_tower");
    assert.equal(resolved.status, "READY", `${mode}: pinned host did not resolve supported mode`);
    assert.equal(resolved.resolved.mode, mode);
    assert.equal(resolved.session_applied, false);
    assert.equal(MT.structHash(ws.live), canonicalHash, `${mode}: presentation resolution mutated canonical world`);

    if (mode === "docked") {
      assert.equal(Object.prototype.hasOwnProperty.call(ws.live.tiles.mt_tower.presentation, "dock"), false, "docked proof must preserve producer omission");
      assert.equal(resolved.resolved.dock, "right", "host must own the omitted dock default");
    }
    if (mode === "tile") assert.equal(resolved.anchor_frame.anchor, "mt_tower");
    if (mode === "world") assert.equal(resolved.anchor_frame.anchor, "world-root");

    const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
    assert.match(html, new RegExp(`data-presentation-mode=\"${mode}\"`));
    assert.match(html, new RegExp(`mt-p-${mode}`));
    assert.match(html, /--p-width:320px/);
    assert.match(html, /--p-height:240px/);
    assert.match(html, /--p-x:0px/);
    assert.match(html, /--p-y:0px/);

    const rollback = MT.rollback(ws, receipt.rollback_token);
    assert.ok(rollback.ok && rollback.exact, `${mode}: rollback was not exact`);
    assert.equal(MT.structHash(ws.live), beforeWorld, `${mode}: rollback did not restore exact pre-state`);
  }

  const adjustable = interfaceRequest("r37-host-session-adjustment", {
    mode: "docked",
    dock: "right",
    preferred_size: [360, 480],
    preferred_position: [0, 0],
    user_adjustable: true
  });
  const out = Head.run(adjustable);
  assert.equal(out.status, "CANDIDATE");
  const ws = MT.createWorkspace(MT.seedWorld());
  const receipt = commitInterfaceCandidate(MT, ws, out);
  const canonicalHash = MT.structHash(ws.live);
  const host = {
    session_presentations: {
      mt_tower: { dock: "left", preferred_position: [24, 12] }
    }
  };
  const resolved = MT.resolvePresentation(ws.live, "mt_tower", host);
  assert.equal(resolved.status, "READY");
  assert.equal(resolved.session_applied, true);
  assert.equal(resolved.resolved.dock, "left");
  assert.deepEqual(resolved.resolved.preferred_position, [24, 12]);
  assert.equal(ws.live.tiles.mt_tower.presentation.dock, "right");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation.preferred_position, [0, 0]);
  assert.equal(MT.structHash(ws.live), canonicalHash, "session placement leaked into canonical matter");
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, host).root);
  assert.match(html, /mt-p-docked mt-dock-left/);
  assert.match(html, /--p-x:24px/);
  assert.match(html, /--p-y:12px/);
  assert.match(html, /session adjusted/);
  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
});
