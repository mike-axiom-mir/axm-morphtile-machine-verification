"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "778bd4f46d9675bbbc991ba98a0bddf85a92c6b3";
const ASSEMBLY46 = "2a767016fb2ded6f37e078870a09065a9a214e1c";
const EXPECTED = Object.freeze({
  form: "cd72aba99ef8372290b36c17109aae14c308fecf",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "1af4d358174af995459e5b4bded5d24c2d2c52a2",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R45_ASSEMBLY46_ROOT && process.env.R45_FORM_ROOT && process.env.R45_MORPHTILE_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R45_ASSEMBLY46_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function findPrimitiveLeaf(value, shape) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPrimitiveLeaf(item, shape);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (value.shape === shape) return value;
  for (const item of Object.values(value)) {
    const found = findPrimitiveLeaf(item, shape);
    if (found) return found;
  }
  return null;
}

function req(id, goal, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "verification-round45" }
  };
}

function applyImported(MT, receiver, imported) {
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
}

test("Assembly 46 exact head is evidence-only and has one executable current-fleet identity authority", { skip: !enabled }, () => {
  assert.equal(process.env.R45_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R45_ASSEMBLY46_COMMIT, ASSEMBLY46);
  assert.equal(process.env.R45_FORM_COMMIT, EXPECTED.form);
  assert.equal(process.env.R45_MORPHTILE_COMMIT, EXPECTED.core);

  const changed = git(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY46]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    ".github/workflows/current-fleet.yml",
    "fixtures/current-fleet.json",
    "scripts/current-fleet-pins.js",
    "test/current-fleet-pin-integrity.test.js",
    "test/current-form-grid-position-receiver.integration.test.js",
    "test/current-form-position-receiver.integration.test.js",
    "test/current-form-size-receiver.integration.test.js",
    "test/round37-current-fleet.integration.test.js"
  ].sort());
  assert.equal(git(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY46, "--", "src", "machine.json", "package.json"]), "");

  const fleet = require(path.join(process.env.R45_ASSEMBLY46_ROOT, "fixtures/current-fleet.json"));
  const pins = require(path.join(process.env.R45_ASSEMBLY46_ROOT, "scripts/current-fleet-pins.js"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(pins.validateFleet(fleet), []);
  for (const [lane, sha] of Object.entries(EXPECTED)) {
    assert.equal(fleet[lane], sha, `${lane}: current-fleet identity is stale or premature`);
    assert.match(fleet[lane], /^[0-9a-f]{40}$/);
  }
  assert.equal(
    pins.outputLines(fleet),
    Object.keys(EXPECTED).map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n"
  );

  const workflow = fs.readFileSync(path.join(process.env.R45_ASSEMBLY46_ROOT, ".github/workflows/current-fleet.yml"), "utf8");
  assert.match(workflow, /id:\s*pins\s*\n\s*run:\s*node scripts\/current-fleet-pins\.js >> "\$GITHUB_OUTPUT"/);
  const contracts = {
    form: ["mike-axiom-mir/axm-morphtile-machine-form", "CURRENT_FORM_COMMIT"],
    surface: ["mike-axiom-mir/axm-morphtile-machine-surface", "CURRENT_SURFACE_COMMIT"],
    capability: ["mike-axiom-mir/axm-morphtile-machine-capability", "CURRENT_CAPABILITY_COMMIT"],
    interface: ["mike-axiom-mir/axm-morphtile-machine-interface", "CURRENT_INTERFACE_COMMIT"],
    core: ["mike-axiom-mir/axm-morphtile", "CURRENT_MORPHTILE_COMMIT"]
  };
  for (const [lane, [repository, envName]] of Object.entries(contracts)) {
    const output = `\${{ steps.pins.outputs.${lane} }}`;
    const escaped = output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repoEscaped = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(workflow, new RegExp(`repository:\\s*${repoEscaped}[\\s\\S]{0,160}?ref:\\s*${escaped}(?:\\s|$)`));
    assert.match(workflow, new RegExp(`${envName}:\\s*${escaped}(?:\\s|$)`));
    assert.equal(workflow.includes(EXPECTED[lane]), false, `${lane}: workflow duplicates manifest identity`);
  }

  assert.throws(() => pins.outputLines({ ...fleet, form: "not-a-sha" }), /form: expected an exact lowercase 40-character commit sha/);
  const missing = { ...fleet };
  delete missing.interface;
  assert.throws(() => pins.outputLines(missing), /interface: expected an exact lowercase 40-character commit sha/);
});

test("Assembly 46 independently preserves changed Form grid-position state through portable receiver closure", { skip: !enabled }, () => {
  const Form = require(path.join(process.env.R45_FORM_ROOT, "src"));
  const { run: assemble } = require(path.join(process.env.R45_ASSEMBLY46_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R45_ASSEMBLY46_ROOT, "src/kit"));
  const MT = require(path.join(process.env.R45_MORPHTILE_ROOT, "core/morphtile.js"));

  const formInput = req("r45-form-grid", "Create independent grid-position receiver specimen", {
    grid: {
      counts: [2, 1, 2],
      step: [1.25, 8, -0.5],
      size_step: {
        x: [0.2, 0, 0],
        z: [0, 0, 0.15]
      },
      part: { shape: "box", pos: [3, 4, 5], size: [1, 2, 0.5] }
    }
  });
  const formBefore = JSON.stringify(formInput);
  const form = Form.run(formInput);
  assert.deepEqual(Form.run(formInput), form, "Form receiver specimen replay drifted");
  assert.equal(JSON.stringify(formInput), formBefore, "Form mutated receiver specimen input");
  assert.equal(form.status, "CANDIDATE", JSON.stringify(form.holds));

  const authoredLeaf = findPrimitiveLeaf(form.candidate.facets.mesh.data.parts, "box");
  assert.ok(authoredLeaf);
  assert.deepEqual(authoredLeaf.pos, [
    ["+", 3, ["*", ["var", "gx"], 1.25]],
    4,
    ["+", 5, ["*", ["var", "gz"], -0.5]]
  ]);
  assert.deepEqual(authoredLeaf.size, [
    ["+", 1, ["*", ["var", "gx"], 0.2]],
    2,
    ["+", 0.5, ["*", ["var", "gz"], 0.15]]
  ]);

  const assemblyInput = {
    envelope_version: "0.1",
    request_id: "r45-assembly-grid",
    goal: "Transport independent Form grid-position state through Assembly",
    intent: { id: "mt_r45_grid", name: "Round 45 grid" },
    inputs: [form],
    provenance: { caller: "verification-round45" }
  };
  const assemblyBefore = JSON.stringify(assemblyInput);
  const assembled = assemble(assemblyInput);
  assert.deepEqual(assemble(assemblyInput), assembled, "Assembly receiver replay drifted");
  assert.equal(JSON.stringify(assemblyInput), assemblyBefore, "Assembly mutated receiver input");
  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds));
  const assembledLeaf = findPrimitiveLeaf(assembled.candidate.facets.mesh.data.parts, "box");
  assert.deepEqual(assembledLeaf, authoredLeaf, "Assembly changed the Form recipe leaf");

  const portable = materializeKit(assembled, MT, { name: "Round 45 receiver kit" });
  assert.equal(portable.status, "CANDIDATE", JSON.stringify(portable.holds));
  for (const kind of ["KIT_IMPORT_PLAN_COVERAGE", "KIT_APPLY", "KIT_RECEIVER_CLOSURE"]) {
    assert.equal(portable.evidence.some((entry) => entry.kind === kind && entry.status === "PASS"), true, `${kind} not earned`);
  }
  assert.deepEqual(findPrimitiveLeaf(portable.kit.tile.facets.mesh.data.parts, "box"), authoredLeaf);

  const receiver = MT.createWorld("Round 45 receiver");
  const imported = MT.importKit(receiver, JSON.parse(JSON.stringify(portable.kit)));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  applyImported(MT, receiver, imported);
  const received = MT.resolveTile(receiver, "mt_r45_grid");
  assert.ok(received);
  assert.deepEqual(findPrimitiveLeaf(received.facets.mesh.data.parts, "box"), authoredLeaf);

  const mesh = MT.compileMesh(received, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4, "2x1x2 grid did not compile to four concrete primitives");
  assert.equal(mesh.P.every(Number.isFinite), true, "receiver geometry contains non-finite coordinates");
});
