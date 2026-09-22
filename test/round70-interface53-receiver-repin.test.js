"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const INTERFACE_BASE = "4c14818289bd2d37deaf82c732836d4d2874f3e3";
const INTERFACE_HEAD = "f1e7ff4e685f8364f1c31681f79fc9765b0e700d";
const OLD_ASSEMBLY = "03206629321a023c046c7ee900a926bb6698f154";
const ASSEMBLY = "726fb4ad8efc4068bcda0c2c3d5e3873335b280e";
const CORE = "685df074701feeae3e9d789e532d0a3658030bf4";
const EXPECTED_DIFF = [
  "INTEGRATION.md",
  "README.md",
  "ROADMAP.md",
  "STATUS.md",
  "fixtures/integration-sources.json"
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function checkout(parent, name, repo, head, extra = []) {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
  git(root, ["fetch", "-q", "--depth=1", "origin", head]);
  for (const sha of extra) git(root, ["fetch", "-q", "--depth=1", "origin", sha]);
  git(root, ["checkout", "-q", "--detach", head]);
  assert.equal(git(root, ["rev-parse", "HEAD"]), head);
  return root;
}

function jsonAt(root, ref, file) {
  return JSON.parse(git(root, ["show", `${ref}:${file}`]));
}

function run(root, args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("round70 Interface53 is an exact receiver-evidence repin with independently closed dependencies", { timeout: 120000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axm-round70-"));
  try {
    const iface = checkout(
      tmp,
      "interface",
      "mike-axiom-mir/axm-morphtile-machine-interface",
      INTERFACE_HEAD,
      [INTERFACE_BASE]
    );
    const assembly = checkout(
      tmp,
      "assembly",
      "mike-axiom-mir/axm-morphtile-machine-assembly",
      ASSEMBLY
    );
    const core = checkout(
      tmp,
      "core",
      "mike-axiom-mir/axm-morphtile",
      CORE
    );

    const changed = git(iface, ["diff", "--name-only", INTERFACE_BASE, INTERFACE_HEAD])
      .split("\n").filter(Boolean).sort();
    assert.deepEqual(changed, [...EXPECTED_DIFF].sort(), "candidate widened beyond evidence/truth surfaces");

    const beforeSources = jsonAt(iface, INTERFACE_BASE, "fixtures/integration-sources.json");
    const afterSources = JSON.parse(fs.readFileSync(path.join(iface, "fixtures/integration-sources.json"), "utf8"));
    assert.equal(beforeSources.assembly.commit, OLD_ASSEMBLY, "base receiver identity is not the declared predecessor");
    assert.equal(afterSources.assembly.commit, ASSEMBLY, "candidate receiver identity is not exact Assembly #60 main");
    assert.deepEqual(
      { ...afterSources, assembly: { ...afterSources.assembly, commit: OLD_ASSEMBLY } },
      beforeSources,
      "receiver fixture changed outside the Assembly commit identity"
    );

    const baseMachine = jsonAt(iface, INTERFACE_BASE, "machine.json");
    const headMachine = JSON.parse(fs.readFileSync(path.join(iface, "machine.json"), "utf8"));
    assert.deepEqual(headMachine, baseMachine, "evidence-only candidate changed machine contract");
    assert.equal(headMachine.tested_against.commit, CORE, "Interface Core pin drifted");

    for (const file of ["INTEGRATION.md", "README.md", "STATUS.md"]) {
      const text = fs.readFileSync(path.join(iface, file), "utf8");
      assert.ok(text.includes(ASSEMBLY), `${file}: exact current receiver identity missing`);
    }
    const roadmap = fs.readFileSync(path.join(iface, "ROADMAP.md"), "utf8");
    assert.ok(roadmap.includes(OLD_ASSEMBLY), "ROADMAP lost predecessor evidence history");
    assert.ok(roadmap.includes(ASSEMBLY), "ROADMAP does not record the new exact receiver evidence");

    const fleet = JSON.parse(fs.readFileSync(path.join(assembly, "fixtures/current-fleet.json"), "utf8"));
    assert.equal(fleet.interface, INTERFACE_BASE, "Assembly receiver does not explicitly contain settled Interface base");
    assert.equal(fleet.core, CORE, "Assembly receiver Core identity disagrees with Interface Core pin");
    const pins = require(path.join(assembly, "scripts/current-fleet-pins.js"));
    assert.deepEqual(pins.validateFleet(fleet), [], "Assembly current-fleet receipt fails its executable grammar");

    assert.ok(fs.existsSync(path.join(core, "core", "morphtile.js")), "exact MorphTile Core checkout lacks expected runtime entrypoint");

    run(iface, ["--test"]);
    run(iface, ["scripts/run-integration-proofs.js", "--dependency", "morphtile"], {
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
    run(iface, ["scripts/run-integration-proofs.js", "--dependency", "assembly"], {
      MORPHTILE_ASSEMBLY: path.join(assembly, "src"),
      MORPHTILE_ASSEMBLY_COMMIT: ASSEMBLY,
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
