"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "8a2a7bf6adf40266438945ad1482001be9d68900";
const ASSEMBLY41 = "aaaea70d7660841b53aca765506970db4aa6b2d8";
const ASSEMBLY42 = "1b345acb9692e2212576cafb2d01d706d1581474";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R35_ASSEMBLY_BASE_ROOT
  && !!process.env.R35_ASSEMBLY41_ROOT
  && !!process.env.R35_ASSEMBLY42_ROOT
  && !!process.env.R35_MORPHTILE_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requestWithWords(root, words) {
  const fixture = require(path.join(root, "fixtures", "request.assembly.json"));
  const request = clone(fixture);
  request.request_id = "r35-import-plan-coverage";
  request.intent = { id: "mt_r35_plan_coverage", name: "Round 35 plan coverage" };
  request.world_requirements = { words };
  return request;
}

function structuredRequest(field, value, wrapped) {
  const candidate = {
    schema: "morphtile.tile-spec/v0.4",
    form_hints: ["game_asset", "ui_panel"],
    facets: {
      mesh: {
        type: "primitive",
        source: null,
        data: { shape: "box", size: [1, 1, 1] }
      }
    },
    [field]: value
  };
  return {
    envelope_version: "0.1",
    request_id: `r35-${wrapped ? "wrapped" : "direct"}-${field}`,
    goal: "Verify authored structured-container identity",
    intent: { name: "Round 35 structured-container proof" },
    inputs: [wrapped ? { candidate } : candidate],
    provenance: { verifier: "round35" }
  };
}

function holdCode(output, code) {
  return Array.isArray(output && output.holds) && output.holds.some((item) => item && item.code === code);
}

test("Assembly #41 rejects READY plans that omit or substitute declared portable matter", { skip: !enabled }, () => {
  assert.equal(process.env.R35_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R35_ASSEMBLY41_COMMIT, ASSEMBLY41);
  assert.equal(process.env.R35_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R35_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R35_ASSEMBLY41_ROOT, "src"));
  const BaseKit = require(path.join(process.env.R35_ASSEMBLY_BASE_ROOT, "src", "kit"));
  const HeadKit = require(path.join(process.env.R35_ASSEMBLY41_ROOT, "src", "kit"));
  const MT = require(path.join(process.env.R35_MORPHTILE_ROOT, "core", "morphtile.js"));

  const request = requestWithWords(process.env.R35_ASSEMBLY41_ROOT, {
    ease: { name: "ease", args: ["x"], body: ["var", "x"], note: "round35" }
  });
  const before = JSON.stringify(request);
  const baseAssembly = Base.run(clone(request));
  const headAssembly = Head.run(clone(request));
  assert.equal(baseAssembly.status, "CANDIDATE", JSON.stringify(baseAssembly.holds));
  assert.deepEqual(headAssembly, baseAssembly, "Assembly #41 changed assembly semantics before kit planning");
  assert.equal(JSON.stringify(request), before, "Assembly #41 mutated caller-owned request state");

  const baseMaterialized = BaseKit.materializeKit(baseAssembly, MT, { name: "r35 baseline" });
  const headMaterialized = HeadKit.materializeKit(headAssembly, MT, { name: "r35 accepted" });
  assert.equal(baseMaterialized.status, "CANDIDATE", JSON.stringify(baseMaterialized.holds));
  assert.equal(headMaterialized.status, "CANDIDATE", JSON.stringify(headMaterialized.holds));
  assert.deepEqual(headMaterialized.kit, baseMaterialized.kit, "ordinary portable kit drifted");
  assert.equal(
    headMaterialized.evidence.some((entry) => entry.kind === "KIT_IMPORT_PLAN_COVERAGE" && entry.status === "PASS"),
    true,
    "accepted #41 path did not publish plan-coverage proof"
  );

  const omittingRuntime = Object.assign({}, MT, {
    importKit(world, kit, opts) {
      const checked = MT.importKit(world, kit, opts);
      if (!checked || checked.status !== "READY") return checked;
      return { ...checked, ops: checked.ops.filter((operation) => operation && operation.op !== "word.define") };
    }
  });
  const omitted = HeadKit.materializeKit(headAssembly, omittingRuntime, { name: "r35 omitted word" });
  assert.equal(omitted.status, "HOLD");
  assert.equal(holdCode(omitted, "HOLD_KIT_RUNTIME_IMPORT_PLAN_INCOMPLETE"), true);
  assert.deepEqual(omitted.holds[0].plan_coverage.missing.words, ["ease"]);

  const substitutingRuntime = Object.assign({}, MT, {
    importKit(world, kit, opts) {
      const checked = MT.importKit(world, kit, opts);
      if (!checked || checked.status !== "READY") return checked;
      return {
        ...checked,
        ops: checked.ops.map((operation) => operation && operation.op === "word.define"
          ? { ...operation, body: 999 }
          : operation)
      };
    }
  });
  const substituted = HeadKit.materializeKit(headAssembly, substitutingRuntime, { name: "r35 substituted word" });
  assert.equal(substituted.status, "HOLD");
  assert.equal(holdCode(substituted, "HOLD_KIT_RUNTIME_IMPORT_PLAN_INCOMPLETE"), true);
  assert.equal(substituted.holds[0].plan_coverage.changed.words[0].id, "ease");
});

test("Assembly #42 preserves authored structured-container identity before folding", { skip: !enabled }, () => {
  assert.equal(process.env.R35_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R35_ASSEMBLY42_COMMIT, ASSEMBLY42);

  const Base = require(path.join(process.env.R35_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R35_ASSEMBLY42_ROOT, "src"));
  const cases = [
    ["params", {}, "HOLD_PARAMS_SHAPE_INVALID"],
    ["view", [], "HOLD_VIEW_SHAPE_INVALID"],
    ["presentation", null, "HOLD_PRESENTATION_SHAPE_INVALID"]
  ];

  for (const [field, value, code] of cases) {
    for (const wrapped of [false, true]) {
      const request = structuredRequest(field, value, wrapped);
      const before = JSON.stringify(request);
      const base = Base.run(clone(request));
      const head = Head.run(clone(request));
      assert.equal(holdCode(base, code), false, `${field}/${wrapped}: predecessor unexpectedly owned new HOLD`);
      assert.equal(head.status, "HOLD", `${field}/${wrapped}: malformed authored container escaped`);
      assert.equal(holdCode(head, code), true, `${field}/${wrapped}: exact shape HOLD missing`);
      assert.equal(JSON.stringify(request), before, `${field}/${wrapped}: caller request mutated`);
    }
  }

  const valid = {
    envelope_version: "0.1",
    request_id: "r35-valid-structured",
    goal: "Verify valid structured matter remains behavior-compatible",
    intent: { name: "Round 35 valid structured matter" },
    inputs: [{
      schema: "morphtile.tile-spec/v0.4",
      form_hints: ["ui_panel"],
      facets: { mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } } },
      params: [{ id: "speed", type: "number", min: 0, max: 10, value: 2 }],
      view: { title: "Controls", body: [] },
      presentation: { mode: "screen" }
    }],
    provenance: { verifier: "round35" }
  };
  const expected = Base.run(clone(valid));
  const actual = Head.run(clone(valid));
  assert.equal(actual.status, "CANDIDATE", JSON.stringify(actual.holds));
  assert.deepEqual(actual, expected, "valid structured tile behavior drifted from integrated predecessor");
});
