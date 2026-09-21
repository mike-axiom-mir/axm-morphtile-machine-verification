"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "09d3b1a96a5f62adc9c41870e513ce56d2370966";
const FORM43 = "aedc9cad00adcde257f461fb77e06ac95b5034c0";
const INTERFACE_BASE = "565321eb682b2f4952adfeb2d33693fd61a51e42";
const INTERFACE36 = "e8ec5a0497b11bc2bfa14c5d959757f585322e4c";
const ASSEMBLY_PREV = "8a2a7bf6adf40266438945ad1482001be9d68900";
const ASSEMBLY_CURRENT = "c45f8305196d149362045cef339ff1634f9095fe";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R36_FORM_BASE_ROOT
  && !!process.env.R36_FORM43_ROOT
  && !!process.env.R36_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R36_INTERFACE_BASE_ROOT
  && !!process.env.R36_INTERFACE36_ROOT
  && !!process.env.R36_ASSEMBLY_PREV_ROOT
  && !!process.env.R36_ASSEMBLY_CURRENT_ROOT
  && !!process.env.R36_MORPHTILE_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formRequest(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify repeat scale generated-state convergence",
    provenance: { verifier: "round36" },
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

function compileWithPanel(MT, candidate) {
  const world = MT.createWorld("Verification round 36");
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

function interfaceRequest(id) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Prove current Assembly import-plan coverage with real Interface matter",
    intent: {
      tile_path: "mt_receiver_panel",
      title: "Import plan coverage proof",
      elements: [{ kind: "text", text: "Plan coverage" }],
      placement: {
        mode: "docked",
        preferred_position: [0, 0],
        user_adjustable: false
      }
    },
    provenance: { caller: "verification-round36" }
  };
}

function uiEligibility() {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-round36-ui-eligibility" }
  };
}

function isPlainMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function evidenceStatus(result, kind) {
  const entry = Array.isArray(result && result.evidence)
    ? result.evidence.find((item) => item && item.kind === kind)
    : null;
  return entry && entry.status;
}

test("Form PR #43 centralizes repeat scale generated state without taking validation authority", { skip: !formEnabled }, () => {
  assert.equal(process.env.R36_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R36_FORM43_COMMIT, FORM43);
  assert.equal(process.env.R36_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R36_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R36_FORM43_ROOT, "src"));
  const { scaleStateFromRepeat, generatedScaleFromRepeat } = require(path.join(process.env.R36_FORM43_ROOT, "src", "repeat-scale-state.js"));
  const MT = require(path.join(process.env.R36_MORPHTILE_ROOT, "core", "morphtile.js"));

  assert.deepEqual(scaleStateFromRepeat({ instance: { use: "panel" }, scale_step: 0.25 }), { kind: "scalar", base: 1, delta: 0.25 });
  assert.deepEqual(generatedScaleFromRepeat({ instance: { use: "panel", scale: 2 }, scale_step: 0.5 }, 3), [3.5]);
  assert.deepEqual(generatedScaleFromRepeat({ instance: { use: "panel" } }, 9), [1]);

  const helperInput = {
    instance: { use: "panel", scale: [1, 2, 3] },
    scale_step: [0.5, -0.5, 1]
  };
  const helperBefore = JSON.stringify(helperInput);
  const helperState = scaleStateFromRepeat(helperInput);
  const helperGenerated = generatedScaleFromRepeat(helperInput, 2);
  assert.deepEqual(helperState, { kind: "vector", base: [1, 2, 3], delta: [0.5, -0.5, 1] });
  assert.deepEqual(helperGenerated, [2, 1, 5]);
  helperState.base[0] = 99;
  helperState.delta[0] = 99;
  helperGenerated[0] = 99;
  assert.equal(JSON.stringify(helperInput), helperBefore, "generated scale state aliases caller matter");
  assert.deepEqual(generatedScaleFromRepeat(helperInput, 2), [2, 1, 5], "generated scale replay changed after output mutation");

  const scalarOnlyDistinctness = formRequest("r36-scale-only-distinctness", {
    repeat: {
      count: 3,
      step: [0, 0, 0],
      scale_step: 0.25,
      instance: { use: "panel", scale: 1 }
    }
  });
  const scalarOnlyOut = equivalentRun(Base, Head, scalarOnlyDistinctness, "scale-only-complete-state-distinctness");
  assert.equal(scalarOnlyOut.status, "CANDIDATE", JSON.stringify(scalarOnlyOut.holds));

  const vector = formRequest("r36-vector-scale", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      scale_step: [0.2, -0.1, 0],
      instance: { use: "panel", scale: [0.5, 1.2, 0.8] }
    }
  });
  assert.equal(equivalentRun(Base, Head, vector, "vector-scale").status, "CANDIDATE");

  const staticVector = formRequest("r36-static-vector", {
    repeat: {
      count: 3,
      step: [1, 0, 0],
      instance: { use: "panel", scale: [0.5, 1.2, 0.8] }
    }
  });
  assert.equal(equivalentRun(Base, Head, staticVector, "static-vector-scale").status, "CANDIDATE");

  const scalarBaseVectorStep = formRequest("r36-invalid-scalar-base-vector-step", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      scale_step: [0.1, 0, 0],
      instance: { use: "panel", scale: 2 }
    }
  });
  const scalarBaseVectorStepOut = equivalentRun(Base, Head, scalarBaseVectorStep, "scalar-base-vector-step-validation-owner");
  assert.equal(scalarBaseVectorStepOut.status, "HOLD");
  assert.equal(scalarBaseVectorStepOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const vectorBaseScalarStep = formRequest("r36-invalid-vector-base-scalar-step", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      scale_step: 0.1,
      instance: { use: "panel", scale: [1, 2, 3] }
    }
  });
  const vectorBaseScalarStepOut = equivalentRun(Base, Head, vectorBaseScalarStep, "vector-base-scalar-step-validation-owner");
  assert.equal(vectorBaseScalarStepOut.status, "HOLD");
  assert.equal(vectorBaseScalarStepOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const collapsedScale = formRequest("r36-scale-float-collapse", {
    repeat: {
      count: 2,
      step: [0, 0, 0],
      scale_step: 1,
      instance: { use: "panel", scale: 2 ** 53 }
    }
  });
  const collapsedOut = equivalentRun(Base, Head, collapsedScale, "scale-floating-point-complete-state-collision");
  assert.equal(collapsedOut.status, "HOLD");
  assert.equal(collapsedOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const nonpositive = formRequest("r36-scale-nonpositive", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      scale_step: -2,
      instance: { use: "panel", scale: 1 }
    }
  });
  const nonpositiveOut = equivalentRun(Base, Head, nonpositive, "scale-positive-domain");
  assert.equal(nonpositiveOut.status, "HOLD");
  assert.equal(nonpositiveOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const overflow = formRequest("r36-scale-overflow", {
    repeat: {
      count: 2,
      step: [1, 0, 0],
      scale_step: Number.MAX_VALUE,
      instance: { use: "panel", scale: Number.MAX_VALUE }
    }
  });
  const overflowOut = equivalentRun(Base, Head, overflow, "scale-overflow");
  assert.equal(overflowOut.status, "HOLD");
  assert.equal(overflowOut.holds[0].code, "HOLD_FORM_REPEAT_INVALID");

  const changing = Head.run(formRequest("r36-receiver-changing-scale", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      scale_step: 0.25,
      instance: { use: "panel", scale: 1 }
    }
  }));
  const fixed = Head.run(formRequest("r36-receiver-fixed-scale", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      instance: { use: "panel", scale: 1 }
    }
  }));
  assert.equal(changing.status, "CANDIDATE", JSON.stringify(changing.holds));
  assert.equal(fixed.status, "CANDIDATE", JSON.stringify(fixed.holds));
  const changingMesh = compileWithPanel(MT, changing.candidate);
  const fixedMesh = compileWithPanel(MT, fixed.candidate);
  for (const mesh of [changingMesh, fixedMesh]) {
    assert.equal(mesh.hold, null);
    assert.ok(mesh.P.length > 0);
    assert.ok(mesh.P.every(Number.isFinite));
  }
  assert.notDeepEqual(changingMesh.P, fixedMesh.P, "MorphTile receiver ignored emitted scalar scale progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-repeat-scale-state-round36/v0.1",
    target_commit: FORM43,
    predecessor_commit: FORM_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: [
      "scalar-vector-static-default-state",
      "copy-no-alias",
      "scale-only-complete-state-distinctness",
      "vector-predecessor-equivalence",
      "static-vector-predecessor-equivalence",
      "compatibility-validation-authority",
      "floating-point-collapse-hold",
      "positive-domain-hold",
      "overflow-hold",
      "deterministic-replay",
      "caller-immutability",
      "real-receiver-scale-effect"
    ],
    placement: "FORM_REPEAT_SCALE_GENERATED_STATE"
  }));
});

test("Interface PR #36 re-earns exact current Assembly plan coverage without runtime authority drift", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R36_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R36_INTERFACE36_COMMIT, INTERFACE36);
  assert.equal(process.env.R36_ASSEMBLY_PREV_COMMIT, ASSEMBLY_PREV);
  assert.equal(process.env.R36_ASSEMBLY_CURRENT_COMMIT, ASSEMBLY_CURRENT);
  assert.equal(process.env.R36_MORPHTILE_COMMIT, MORPHTILE);

  const baseRoot = process.env.R36_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R36_INTERFACE36_ROOT;
  assertTreeBytesEqual(baseRoot, headRoot, "src");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(headRoot, file)), fs.readFileSync(path.join(baseRoot, file)), `${file}: executable metadata drifted`);
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(headRoot, "machine.json"), "utf8"));
  assert.equal(pins.assembly.repository, "mike-axiom-mir/axm-morphtile-machine-assembly");
  assert.equal(pins.assembly.commit, ASSEMBLY_CURRENT);
  assert.equal(manifest.tested_against.commit, MORPHTILE);

  const workflow = fs.readFileSync(path.join(headRoot, ".github", "workflows", "test.yml"), "utf8");
  assert.ok(workflow.includes("test/assembly-plan-coverage.integration.test.js"), "current receiver proof is not executable in Interface CI");
  assert.ok(workflow.includes('integration-sources.json").assembly.commit'), "workflow no longer derives Assembly pin from executable fixture");
  assert.ok(workflow.includes('ref: ${{ steps.pins.outputs.assembly }}'), "workflow no longer checks out the fixture-derived Assembly receiver");

  const BaseInterface = require(path.join(baseRoot, "src"));
  const HeadInterface = require(path.join(headRoot, "src"));
  const sourceRequest = interfaceRequest("r36-interface-source");
  const sourceBefore = JSON.stringify(sourceRequest);
  const baseOut = BaseInterface.run(clone(sourceRequest));
  const firstOut = HeadInterface.run(clone(sourceRequest));
  const secondOut = HeadInterface.run(clone(sourceRequest));
  assert.deepEqual(firstOut, baseOut, "Interface runtime output drifted despite evidence-only claim");
  assert.deepEqual(secondOut, firstOut, "Interface runtime replay changed");
  assert.equal(JSON.stringify(sourceRequest), sourceBefore, "Interface verification mutated caller request");
  assert.equal(firstOut.status, "CANDIDATE", JSON.stringify(firstOut.holds));

  const expectedPresentation = firstOut.candidate.operations[1].presentation;
  assert.deepEqual(expectedPresentation, {
    mode: "docked",
    preferred_position: [0, 0],
    user_adjustable: false
  });
  assert.equal(Object.prototype.hasOwnProperty.call(expectedPresentation, "dock"), false, "receiver-owned dock omission was materialized by producer");

  const PrevAssembly = require(path.join(process.env.R36_ASSEMBLY_PREV_ROOT, "src"));
  const CurrentAssembly = require(path.join(process.env.R36_ASSEMBLY_CURRENT_ROOT, "src"));
  const PrevKit = require(path.join(process.env.R36_ASSEMBLY_PREV_ROOT, "src", "kit"));
  const CurrentKit = require(path.join(process.env.R36_ASSEMBLY_CURRENT_ROOT, "src", "kit"));
  const MT = require(path.join(process.env.R36_MORPHTILE_ROOT, "core", "morphtile.js"));

  const assemblyRequest = {
    envelope_version: "0.1",
    request_id: "r36-interface-assembly",
    goal: "Fold Interface matter through predecessor and current receivers",
    intent: {
      id: "mt_receiver_panel",
      tile_path: "mt_receiver_panel",
      name: "Import plan coverage proof"
    },
    inputs: [uiEligibility(), firstOut],
    provenance: { caller: "verification-round36" }
  };
  const assemblyBefore = JSON.stringify(assemblyRequest);
  const previousCombined = PrevAssembly.run(clone(assemblyRequest));
  const currentCombined = CurrentAssembly.run(clone(assemblyRequest));
  assert.equal(JSON.stringify(assemblyRequest), assemblyBefore, "Assembly receiver verification mutated caller request");
  assert.equal(previousCombined.status, "CANDIDATE", JSON.stringify(previousCombined.holds));
  assert.equal(currentCombined.status, "CANDIDATE", JSON.stringify(currentCombined.holds));
  assert.deepEqual(currentCombined, previousCombined, "valid Interface matter changed while Assembly receiver evidence advanced");
  assert.equal(isPlainMap(currentCombined.candidate.view), true, "Interface-authored view is no longer a plain structured map");
  assert.equal(isPlainMap(currentCombined.candidate.presentation), true, "Interface-authored presentation is no longer a plain structured map");
  assert.deepEqual(currentCombined.candidate.presentation, expectedPresentation);

  const kitOptions = { name: "Verification round 36 Interface plan coverage" };
  const previousMaterialized = PrevKit.materializeKit(previousCombined, MT, kitOptions);
  const currentBefore = JSON.stringify(currentCombined);
  const currentMaterialized = CurrentKit.materializeKit(currentCombined, MT, kitOptions);
  const currentReplay = CurrentKit.materializeKit(currentCombined, MT, kitOptions);
  assert.equal(previousMaterialized.status, "CANDIDATE", JSON.stringify(previousMaterialized.holds));
  assert.equal(currentMaterialized.status, "CANDIDATE", JSON.stringify(currentMaterialized.holds));
  assert.deepEqual(currentMaterialized.kit, previousMaterialized.kit, "portable Interface kit identity drifted across receiver evidence advance");
  assert.deepEqual(currentReplay, currentMaterialized, "current Assembly materialization/reception replay changed");
  assert.equal(JSON.stringify(currentCombined), currentBefore, "kit receiver proof mutated assembled candidate");

  assert.equal(evidenceStatus(previousMaterialized, "KIT_IMPORT_PLAN_COVERAGE"), undefined, "predecessor unexpectedly owns current import-plan coverage proof");
  assert.equal(evidenceStatus(previousMaterialized, "KIT_APPLY"), "PASS");
  assert.equal(evidenceStatus(previousMaterialized, "KIT_RECEIVER_CLOSURE"), "PASS");
  assert.equal(evidenceStatus(currentMaterialized, "KIT_IMPORT_PLAN_COVERAGE"), "PASS");
  assert.equal(evidenceStatus(currentMaterialized, "KIT_APPLY"), "PASS");
  assert.equal(evidenceStatus(currentMaterialized, "KIT_RECEIVER_CLOSURE"), "PASS");
  assert.deepEqual(currentMaterialized.kit.tile.view, currentCombined.candidate.view);
  assert.deepEqual(currentMaterialized.kit.tile.presentation, expectedPresentation);
  assert.deepEqual(currentMaterialized.holds, []);

  const status = fs.readFileSync(path.join(headRoot, "STATUS.md"), "utf8");
  const readme = fs.readFileSync(path.join(headRoot, "README.md"), "utf8");
  const roadmap = fs.readFileSync(path.join(headRoot, "ROADMAP.md"), "utf8");
  assert.ok(status.includes(`- Assembly receiver evidence target: \`${ASSEMBLY_CURRENT}\``), "STATUS receiver identity drifted");
  assert.ok(readme.includes(`- ASSEMBLY RECEIVER TARGET: exact integrated Assembly \`${ASSEMBLY_CURRENT}\`;`), "README receiver identity drifted");
  assert.ok(roadmap.includes(`- [x] Re-prove a real Interface-authored view/presentation specimen through exact integrated Assembly \`${ASSEMBLY_CURRENT}\``), "ROADMAP does not record the exact receiver proof");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-plan-coverage-round36/v0.1",
    target_commit: INTERFACE36,
    predecessor_commit: INTERFACE_BASE,
    predecessor_receiver_commit: ASSEMBLY_PREV,
    current_receiver_commit: ASSEMBLY_CURRENT,
    morphtile_commit: MORPHTILE,
    status: "PASS",
    checked: [
      "src-byte-identity",
      "machine-package-byte-identity",
      "fixture-derived-current-receiver-pin",
      "runtime-output-equivalence",
      "dock-omission-false-zero-preservation",
      "plain-view-presentation-containers",
      "predecessor-plan-coverage-absence",
      "current-plan-coverage-pass",
      "ordered-application-pass",
      "installed-receiver-closure-pass",
      "portable-kit-identity",
      "deterministic-replay",
      "caller-immutability",
      "truth-surface-receiver-identity"
    ],
    placement: "INTERFACE_CURRENT_ASSEMBLY_PLAN_COVERAGE_EVIDENCE"
  }));
});
