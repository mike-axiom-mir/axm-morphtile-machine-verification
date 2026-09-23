"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "6f16e1019af8d081e390a3a74d836a10a93d8d5d";
const ASSEMBLY_HEAD = "f583fa8559949217ce35b3a93c764b9e504b758a";
const PREVIOUS_INTERFACE = "cec03d917227881100d4ce576ed49174e51d8210";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "8c0559abfd705cd7437b94f5840902933eb3ec47",
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

test("round73 exact Assembly62 receipt advances only the independently integrated Interface54 identity", { timeout: 90000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axm-round73-"));
  try {
    const assembly = checkout(tmp, "assembly", "mike-axiom-mir/axm-morphtile-machine-assembly", ASSEMBLY_HEAD, [ASSEMBLY_BASE]);
    const iface = checkout(tmp, "interface", "mike-axiom-mir/axm-morphtile-machine-interface", EXPECTED.interface, [PREVIOUS_INTERFACE]);

    const changed = git(assembly, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY_HEAD]).split("\n").filter(Boolean);
    assert.deepEqual(changed, ["fixtures/current-fleet.json"]);
    assert.equal(git(assembly, ["diff", "--numstat", ASSEMBLY_BASE, ASSEMBLY_HEAD]), "1\t1\tfixtures/current-fleet.json");

    const before = jsonAt(assembly, ASSEMBLY_BASE, "fixtures/current-fleet.json");
    const after = JSON.parse(fs.readFileSync(path.join(assembly, "fixtures/current-fleet.json"), "utf8"));
    assert.equal(after.schema, "axm.morphtile.assembly-current-fleet/v1");
    assert.deepEqual(Object.keys(after).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
    for (const lane of ["schema", "form", "surface", "capability", "core"]) {
      assert.equal(after[lane], before[lane], `${lane}: unrelated fleet identity moved`);
    }
    assert.equal(before.interface, PREVIOUS_INTERFACE);
    assert.equal(after.interface, EXPECTED.interface);
    for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(after[lane], sha, `${lane}: current-fleet identity drifted`);

    const rawCommit = git(iface, ["cat-file", "-p", "HEAD"]);
    const parentLines = rawCommit.split("\n").filter((line) => line.startsWith("parent "));
    assert.ok(parentLines.includes(`parent ${PREVIOUS_INTERFACE}`), "Interface #54 merge commit does not name prior Interface main as parent");

    const pins = require(path.join(assembly, "scripts/current-fleet-pins.js"));
    assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
    assert.deepEqual(pins.validateFleet(after), [], "candidate receipt fails Assembly executable grammar");
    assert.equal(pins.outputLines(after), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n");

    const producer = spawnSync(process.execPath, ["--test", "test/current-fleet.test.js"], { cwd: assembly, encoding: "utf8", env: { ...process.env } });
    assert.equal(producer.status, 0, producer.stderr || producer.stdout);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
