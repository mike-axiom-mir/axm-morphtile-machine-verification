"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "2d35851704ca291ce81bba0d5fc85c85bb65d05e";
const ASSEMBLY_HEAD = "65c7ddfafdc07c7d5c564167f0ed5a08fd52dae6";
const PREVIOUS_INTERFACE = "21ae2ccf9a279b4d8094c1e1329e494d6bb0d764";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "6a496ece147f13e420385d455ef5a9cfaf899c89",
  core: "685df074701feeae3e9d789e532d0a3658030bf4"
});

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

test("round68 exact Assembly59 receipt advances only the independently integrated Interface identity", { timeout: 90000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axm-round68-"));
  try {
    const assembly = checkout(
      tmp,
      "assembly",
      "mike-axiom-mir/axm-morphtile-machine-assembly",
      ASSEMBLY_HEAD,
      [ASSEMBLY_BASE]
    );
    const iface = checkout(
      tmp,
      "interface",
      "mike-axiom-mir/axm-morphtile-machine-interface",
      EXPECTED.interface,
      [PREVIOUS_INTERFACE]
    );

    const changed = git(assembly, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY_HEAD])
      .split("\n").filter(Boolean);
    assert.deepEqual(changed, ["fixtures/current-fleet.json"]);
    assert.equal(
      git(assembly, ["diff", "--numstat", ASSEMBLY_BASE, ASSEMBLY_HEAD]),
      "1\t1\tfixtures/current-fleet.json"
    );

    const before = jsonAt(assembly, ASSEMBLY_BASE, "fixtures/current-fleet.json");
    const after = JSON.parse(fs.readFileSync(path.join(assembly, "fixtures/current-fleet.json"), "utf8"));
    assert.equal(after.schema, "axm.morphtile.assembly-current-fleet/v1");
    assert.deepEqual(Object.keys(after).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());

    for (const lane of ["schema", "form", "surface", "capability", "core"]) {
      assert.equal(after[lane], before[lane], `${lane}: unrelated fleet identity moved`);
    }
    assert.equal(before.interface, PREVIOUS_INTERFACE, "predecessor receipt does not pin Interface #50 main");
    assert.equal(after.interface, EXPECTED.interface, "receipt does not pin integrated Interface #51 main");
    for (const [lane, sha] of Object.entries(EXPECTED)) {
      assert.equal(after[lane], sha, `${lane}: current-fleet identity drifted`);
    }

    assert.equal(git(iface, ["rev-parse", "HEAD"]), EXPECTED.interface, "Interface checkout does not match receipt");
    const rawCommit = git(iface, ["cat-file", "-p", "HEAD"]);
    const parentLines = rawCommit.split("\n").filter((line) => line.startsWith("parent "));
    assert.ok(
      parentLines.includes(`parent ${PREVIOUS_INTERFACE}`),
      "integrated Interface #51 merge commit does not name prior Interface main as a direct parent"
    );

    const pins = require(path.join(assembly, "scripts/current-fleet-pins.js"));
    assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
    assert.deepEqual(pins.validateFleet(after), [], "candidate receipt fails Assembly executable grammar");
    assert.equal(
      pins.outputLines(after),
      pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n"
    );

    const producer = spawnSync(process.execPath, ["--test", "test/current-fleet.test.js"], {
      cwd: assembly,
      encoding: "utf8",
      env: { ...process.env }
    });
    assert.equal(producer.status, 0, producer.stderr || producer.stdout);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
