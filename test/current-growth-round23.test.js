"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "d4da0515c290b0b504c02b9d29e974d3add4e6b5";
const FORM36 = "3e4485a6d15b053d87a338790e04dc06f9684305";
const INTERFACE_BASE = "96dfea316216922dffca872ec083a549e4777c96";
const INTERFACE29 = "d297777a93c76f25c1cf25d7772b0a9f53741b3b";
const ASSEMBLY_BASE = "3a4af4417de21fff862bf309e3576c362bcac7f5";
const ASSEMBLY35 = "e8fb9fd02671a8ffa719409cca5c4197fbd3c2cc";
const SURFACE = "4e4495182aa83e5dfba37722fc3756a70cfaafaa";
const CAPABILITY = "edc07af182ee26ca1ceb64b5d5205591ec6aca9d";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 23 replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function fileHash(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function treeHashes(root, relative) {
  const start = path.join(root, relative);
  const out = {};
  function walk(current, prefix) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out[rel] = fileHash(full);
    }
  }
  walk(start, relative);
  return out;
}

function leafOf(candidate) {
  let node = candidate.facets.mesh.data.parts[0];
  while (node && Number.isInteger(node.repeat) && Array.isArray(node.body)) node = node.body[0];
  return node;
}

function panelDefinition() {
  return {
    id: "panel",
    name: "Round 23 variable-width panel",
    created_by: "verification-round23",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: {
            generator: "recipe",
            vars: { width: 1 },
            parts: [{ shape: "plane", size: [["var", "width"], 1, 1] }]
          }
        }
      }
    }
  };
}

function uiEligibility(id, name) {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      id,
      name,
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-round23-ui-eligibility" }
  };
}

function applyImported(MT, receiver, imported) {
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
}

const formEnabled = !!process.env.R23_FORM_BASE_ROOT && !!process.env.R23_FORM36_ROOT && !!process.env.R23_CORE_PATH;
const interfaceEnabled = !!process.env.R23_INTERFACE_BASE_ROOT && !!process.env.R23_INTERFACE29_ROOT;
const assemblyEnabled = !!process.env.R23_ASSEMBLY_BASE_ROOT && !!process.env.R23_ASSEMBLY35_ROOT
  && !!process.env.R23_FORM_BASE_ROOT && !!process.env.R23_SURFACE_ROOT
  && !!process.env.R23_CAPABILITY_ROOT && !!process.env.R23_INTERFACE_BASE_ROOT && !!process.env.R23_CORE_PATH;

test("Form PR #36: shared validation movement is exact-public-output equivalent across all established progression lanes", { skip: !formEnabled }, () => {
  assert.equal(process.env.R23_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R23_FORM36_COMMIT, FORM36);
  assert.equal(process.env.R23_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R23_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R23_FORM36_ROOT, "src"));
  const MT = require(path.resolve(process.env.R23_CORE_PATH));

  const cases = [
    request("r23-rotation", {
      grid: {
        counts: [3, 1, 1],
        step: [0, 0, 0],
        rot_step: { x: [0, 0.25, 0] },
        part: { shape: "wedge", size: [1, 2, 1], pos: [4, -2, 1], rot: [0, 0.5, 0] }
      }
    }),
    request("r23-size", {
      grid: {
        counts: [3, 1, 1],
        step: [0, 0, 0],
        size_step: { x: [0.25, -0.2, 0] },
        part: { shape: "box", size: [1, 2, 1], pos: [4, -2, 1] }
      }
    }),
    request("r23-scale", {
      grid: {
        counts: [3, 1, 1],
        step: [0, 0, 0],
        scale_step: { x: 0.25 },
        instance: { use: "panel", scale: 0.5, pos: [4, -2, 1] }
      }
    }),
    request("r23-settings", {
      grid: {
        counts: [3, 1, 1],
        step: [0, 0, 0],
        with_step: { x: { width: 0.25 } },
        instance: { use: "panel", with: { width: 1 }, pos: [4, -2, 1] }
      }
    }),
    request("r23-composed-size-rotation", {
      grid: {
        counts: [2, 2, 1],
        step: [0, 0, 0],
        size_step: { x: [0.25, 0, 0], y: [0, 0.15, 0] },
        rot_step: { y: [0, 0.1, 0] },
        part: { shape: "wedge", size: [1, 2, 1] }
      }
    })
  ];

  for (const input of cases) {
    const before = JSON.stringify(input);
    const base = Base.run(input);
    const head = Head.run(input);
    assert.deepEqual(head, base, `${input.request_id}: internal helper convergence changed public output`);
    assert.deepEqual(Head.run(input), head, `${input.request_id}: replay must remain deterministic`);
    assert.equal(JSON.stringify(input), before, `${input.request_id}: caller matter must remain unchanged`);
  }

  const inactive = request("r23-inactive-scale-axis", {
    grid: {
      counts: [1, 2, 1],
      step: [0, 1, 0],
      scale_step: { x: 0.1 },
      instance: { use: "panel" }
    }
  });
  const inactiveBase = Base.run(inactive);
  const inactiveHead = Head.run(inactive);
  assert.equal(inactiveHead.status, "HOLD");
  assert.equal(inactiveHead.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.deepEqual(inactiveHead, inactiveBase, "inactive progression-axis rejection must remain exact-equivalent");

  const collapse = Number.MAX_SAFE_INTEGER + 1;
  const completeCollision = request("r23-complete-state-collapse", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      with_step: { x: { width: 1 } },
      instance: { use: "panel", with: { width: collapse }, pos: [collapse, 0, 0] }
    }
  });
  const collisionBase = Base.run(completeCollision);
  const collisionHead = Head.run(completeCollision);
  assert.equal(collisionHead.status, "HOLD");
  assert.match(collisionHead.holds[0].detail, /duplicate authored state/);
  assert.deepEqual(collisionHead, collisionBase, "complete-state numeric-collapse proof must survive helper convergence");

  const helper = require(path.join(process.env.R23_FORM36_ROOT, "src", "grid-progression"));
  const step = [0, 7, 0];
  const counts = [2, 1, 3];
  const deltas = [[0, 0.2, 0], null, { width: 0.5 }];
  assert.deepEqual(helper.progressionValidationStep(step, counts, deltas), [1, 7, 1]);
  assert.deepEqual(step, [0, 7, 0]);
  assert.deepEqual(counts, [2, 1, 3]);
  assert.deepEqual(deltas, [[0, 0.2, 0], null, { width: 0.5 }]);

  const runtimeOut = Head.run(cases[4]);
  assert.equal(runtimeOut.status, "CANDIDATE", JSON.stringify(runtimeOut.holds));
  const compiled = MT.compileMesh(MT.createTile(runtimeOut.candidate));
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-validation-step-round23/v0.1",
    target_commit: FORM36,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "rotation-output-equivalence",
      "size-output-equivalence",
      "scale-output-equivalence",
      "setting-output-equivalence",
      "composed-progression-output-equivalence",
      "inactive-axis-hold-equivalence",
      "complete-state-collapse-hold-equivalence",
      "helper-input-immutability",
      "real-core-finite-geometry"
    ],
    placement: "FORM_MACHINE_VALIDATION_SCAFFOLD_CONVERGENCE"
  }));
});

test("Interface PR #29: receiver refresh is truth-only and does not smuggle runtime/schema authority", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R23_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R23_INTERFACE29_COMMIT, INTERFACE29);
  assert.equal(process.env.R23_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);

  const baseRoot = process.env.R23_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R23_INTERFACE29_ROOT;
  assert.deepEqual(treeHashes(headRoot, "src"), treeHashes(baseRoot, "src"), "Interface runtime source tree must be byte-identical");
  for (const filename of ["machine.json", "package.json", ".github/workflows/test.yml"]) {
    assert.equal(fileHash(path.join(headRoot, filename)), fileHash(path.join(baseRoot, filename)), `${filename} must remain byte-identical`);
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.repository, "mike-axiom-mir/axm-morphtile-machine-assembly");
  assert.equal(pins.assembly.commit, ASSEMBLY_BASE);

  const Base = require(path.join(baseRoot, "src"));
  const Head = require(path.join(headRoot, "src"));
  const input = request("r23-interface-truth-only", {
    tile_path: "mt_round23_panel",
    title: "Round 23 panel",
    elements: [{ kind: "repeat", binding: "count", step: 1, max: 4, children: [{ kind: "text", text: "marker" }] }],
    bindings: { readouts: ["count"] }
  });
  const before = JSON.stringify(input);
  const base = Base.run(input);
  const head = Head.run(input);
  assert.equal(head.status, "CANDIDATE", JSON.stringify(head.holds));
  assert.deepEqual(head, base, "evidence refresh must not change producer output");
  assert.deepEqual(Head.run(input), head, "replay must remain deterministic");
  assert.equal(JSON.stringify(input), before, "caller matter must remain unchanged");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-receiver-truth-round23/v0.1",
    target_commit: INTERFACE29,
    predecessor_commit: INTERFACE_BASE,
    receiver_commit: ASSEMBLY_BASE,
    status: "PASS",
    checked: [
      "runtime-tree-byte-identity",
      "manifest-package-workflow-byte-identity",
      "exact-assembly-pin",
      "public-output-equivalence",
      "deterministic-replay",
      "caller-immutability"
    ],
    placement: "INTERFACE_MACHINE_RECEIVER_EVIDENCE"
  }));
});

test("Assembly PR #35: current-fleet receiver evidence stays runtime-identical and fails closed on kit corruption", { skip: !assemblyEnabled }, () => {
  assert.equal(process.env.R23_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R23_ASSEMBLY35_COMMIT, ASSEMBLY35);
  assert.equal(process.env.R23_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R23_SURFACE_COMMIT, SURFACE);
  assert.equal(process.env.R23_CAPABILITY_COMMIT, CAPABILITY);
  assert.equal(process.env.R23_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R23_CORE_COMMIT, CORE);

  const assemblyBaseRoot = process.env.R23_ASSEMBLY_BASE_ROOT;
  const assemblyHeadRoot = process.env.R23_ASSEMBLY35_ROOT;
  assert.deepEqual(treeHashes(assemblyHeadRoot, "src"), treeHashes(assemblyBaseRoot, "src"), "Assembly runtime source tree must be byte-identical");
  for (const filename of ["machine.json", "package.json"]) {
    assert.equal(fileHash(path.join(assemblyHeadRoot, filename)), fileHash(path.join(assemblyBaseRoot, filename)), `${filename} must remain byte-identical`);
  }

  const Assembly = require(path.join(assemblyHeadRoot, "src"));
  const { materializeKit } = require(path.join(assemblyHeadRoot, "src", "kit"));
  const Form = require(path.join(process.env.R23_FORM_BASE_ROOT, "src"));
  const Surface = require(path.join(process.env.R23_SURFACE_ROOT, "src"));
  const Capability = require(path.join(process.env.R23_CAPABILITY_ROOT, "src"));
  const Interface = require(path.join(process.env.R23_INTERFACE_BASE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R23_CORE_PATH));
  const id = "mt_round23_current_fleet";

  const form = Form.run(request("r23-assembly-form", {
    grid: {
      counts: [2, 1, 2],
      step: [0.25, 91, -0.5],
      with_step: { z: { width: 0.125 } },
      instance: { use: "panel", with: { width: 1 }, pos: [3, -4, 2] }
    }
  }));
  const surface = Surface.run(request("r23-assembly-surface", { base_color: [0.22, 0.48, 0.66] }));
  const capability = Capability.run(request("r23-assembly-capability", { kind: "counter", initial: 2 }));
  const interfaceOut = Interface.run(request("r23-assembly-interface", {
    tile_path: id,
    title: "Round 23 receiver",
    elements: [{ kind: "repeat", binding: "count", step: 1, max: 4, children: [{ kind: "text", text: "r23-marker" }] }],
    bindings: { readouts: ["count"] }
  }));
  for (const [name, output] of Object.entries({ form, surface, capability, interface: interfaceOut })) {
    assert.equal(output.status, "CANDIDATE", `${name}: ${JSON.stringify(output.holds)}`);
  }

  const authoredLeaf = leafOf(form.candidate);
  assert.deepEqual(authoredLeaf.pos, [
    ["+", 3, ["*", ["var", "gx"], 0.25]],
    -4,
    ["+", 2, ["*", ["var", "gz"], -0.5]]
  ]);
  assert.deepEqual(authoredLeaf.with.width, ["+", 1, ["*", ["var", "gz"], 0.125]]);

  const assemblyRequest = {
    envelope_version: "0.1",
    request_id: "r23-assembly-current-fleet",
    goal: "independent current-fleet receiver verification",
    intent: { id, name: "Round 23 current fleet" },
    inputs: [uiEligibility(id, "Round 23 current fleet"), form, surface, capability, interfaceOut],
    world_requirements: { definitions: { panel: panelDefinition() } },
    provenance: { caller: "verification-round23" }
  };
  const before = JSON.stringify(assemblyRequest);
  const assembledA = Assembly.run(assemblyRequest);
  const assembledB = Assembly.run(assemblyRequest);
  assert.equal(assembledA.status, "CANDIDATE", JSON.stringify(assembledA.holds));
  assert.deepEqual(assembledA, assembledB, "Assembly replay must be deterministic");
  assert.equal(JSON.stringify(assemblyRequest), before, "Assembly caller matter must remain unchanged");
  assert.deepEqual(assembledA.required_definitions, ["panel"]);
  assert.deepEqual(leafOf(assembledA.candidate), authoredLeaf, "Assembly must preserve current Form recipe meaning exactly");

  const portableA = materializeKit(assembledA, MT, { name: "Round 23 portable kit" });
  const portableB = materializeKit(assembledA, MT, { name: "Round 23 portable kit" });
  assert.equal(portableA.status, "CANDIDATE", JSON.stringify(portableA.holds));
  assert.deepEqual(portableA, portableB, "kit materialization must be deterministic");
  assert.equal(portableA.kit.expect.defs, 1);
  assert.equal(portableA.dependency_resolution.length, 1);
  assert.equal(portableA.dependency_resolution[0].status, "SATISFIED");

  const receiver = MT.createWorld("Round 23 receiver");
  const imported = MT.importKit(receiver, JSON.parse(JSON.stringify(portableA.kit)));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  assert.equal(imported.evidence, "verified_payload_sha256");
  applyImported(MT, receiver, imported);
  const received = MT.resolveTile(receiver, id);
  assert.ok(received);
  assert.deepEqual(leafOf(received), authoredLeaf);
  const mesh = MT.compileMesh(received, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));
  const beforeRender = MT.structHash(receiver);
  const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
  assert.equal((html.match(/r23-marker/g) || []).length, 2);
  assert.equal(MT.structHash(receiver), beforeRender, "rendering must remain structurally read-only");

  const corruptedReceiver = MT.createWorld("Round 23 corrupted receiver");
  const corruptedBefore = MT.structHash(corruptedReceiver);
  const corruptedKit = JSON.parse(JSON.stringify(portableA.kit));
  corruptedKit.tile.facets.logic.data.vars.count = 3;
  const corruptedImport = MT.importKit(corruptedReceiver, corruptedKit);
  assert.notEqual(corruptedImport.status, "READY", "payload mutation must invalidate the verified kit");
  assert.equal(MT.structHash(corruptedReceiver), corruptedBefore, "failed corruption import must not mutate the receiver");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-current-fleet-round23/v0.1",
    target_commit: ASSEMBLY35,
    predecessor_commit: ASSEMBLY_BASE,
    producer_commits: { form: FORM_BASE, surface: SURFACE, capability: CAPABILITY, interface: INTERFACE_BASE },
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "runtime-tree-byte-identity",
      "deterministic-assembly-replay",
      "caller-immutability",
      "definition-closure",
      "form-recipe-preservation",
      "deterministic-kit-materialization",
      "verified-fresh-world-import",
      "finite-runtime-geometry",
      "read-only-runtime-rendering",
      "kit-corruption-rejection-without-mutation"
    ],
    placement: "ASSEMBLY_MACHINE_CURRENT_FLEET_RECEIVER_EVIDENCE"
  }));
});
