const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INTERFACE_HEAD = 'fbcc26ff36985021f8e0c7be02b5bc313228d015';
const INTERFACE_BASE = '21ae2ccf9a279b4d8094c1e1329e494d6bb0d764';
const CORE_HEAD = '685df074701feeae3e9d789e532d0a3658030bf4';
const RECEIVER_PIN = '03206629321a023c046c7ee900a926bb6698f154';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function checkout(parent, name, repo, head, extra = []) {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['remote', 'add', 'origin', `https://github.com/${repo}.git`]);
  git(root, ['fetch', '-q', '--depth=1', 'origin', head]);
  for (const sha of extra) git(root, ['fetch', '-q', '--depth=1', 'origin', sha]);
  git(root, ['checkout', '-q', '--detach', head]);
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
  return root;
}

function request(placement) {
  return {
    envelope_version: '0.1',
    request_id: 'verification-round67-layer-boundary-current-main',
    goal: 'Reject private presentation layer authority while Core has no canonical layer primitive',
    intent: {
      tile_path: 'mt_verify_layer_boundary',
      title: 'Layer boundary',
      text: 'No private z-order contract',
      placement
    },
    provenance: { caller: 'verification-round67' }
  };
}

test('round67 exact Interface51 presentation-layer substrate boundary on current Verification main', { timeout: 90000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-round67-'));
  try {
    const ifaceRoot = checkout(
      tmp,
      'interface',
      'mike-axiom-mir/axm-morphtile-machine-interface',
      INTERFACE_HEAD,
      [INTERFACE_BASE]
    );
    const coreRoot = checkout(tmp, 'core', 'mike-axiom-mir/axm-morphtile', CORE_HEAD);

    const changed = git(ifaceRoot, ['diff', '--name-only', INTERFACE_BASE, INTERFACE_HEAD])
      .split('\n').filter(Boolean).sort();
    assert.deepEqual(changed, [
      'test/integration-proof-manifest.json',
      'test/presentation-layer-substrate-boundary.integration.test.js'
    ]);

    const machine = JSON.parse(fs.readFileSync(path.join(ifaceRoot, 'machine.json'), 'utf8'));
    assert.equal(machine.tested_against.repository, 'mike-axiom-mir/axm-morphtile');
    assert.equal(machine.tested_against.commit, CORE_HEAD);

    const sources = JSON.parse(fs.readFileSync(path.join(ifaceRoot, 'fixtures/integration-sources.json'), 'utf8'));
    assert.equal(sources.assembly.repository, 'mike-axiom-mir/axm-morphtile-machine-assembly');
    assert.equal(sources.assembly.commit, RECEIVER_PIN);

    const proofManifest = JSON.parse(fs.readFileSync(path.join(ifaceRoot, 'test/integration-proof-manifest.json'), 'utf8'));
    const claimEntries = proofManifest.proofs.filter(p => p.claim === 'presentation-layer-substrate-boundary');
    assert.equal(claimEntries.length, 1, 'semantic claim must be unique');
    assert.equal(claimEntries[0].path, 'test/presentation-layer-substrate-boundary.integration.test.js');
    assert.deepEqual(claimEntries[0].dependencies, ['morphtile']);

    const Interface = require(path.join(ifaceRoot, 'src'));
    const MT = require(path.join(coreRoot, 'core/morphtile.js'));

    assert.deepEqual([...Interface.PRESENTATION_MODES].sort(), [...MT.PRESENTATION_MODES].sort(),
      'Interface presentation modes drift from pinned Core');
    assert.equal(Interface.PRESENTATION_KEYS.has('layer'), false, 'Interface must not invent private layer authority');

    const placement = {
      mode: 'floating',
      preferred_position: [12, 18],
      user_adjustable: false,
      layer: 2
    };
    const first = Interface.run(request(placement));
    const second = Interface.run(request(JSON.parse(JSON.stringify(placement))));
    assert.deepEqual(second, first, 'replay must be deterministic');
    assert.equal(first.status, 'HOLD');
    assert.equal(first.candidate, null);
    assert.equal(first.holds[0].code, 'HOLD_INVALID_PRESENTATION_PLACEMENT');
    assert.match(first.holds[0].detail, /unsupported field\(s\): layer/);

    const coreError = MT.presentationError(placement);
    assert.match(coreError || '', /presentation unknown fields: layer/,
      'pinned Core unexpectedly accepted layer matter');

    execFileSync(process.execPath, ['--test', 'test/presentation-layer-substrate-boundary.integration.test.js'], {
      cwd: ifaceRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        MORPHTILE_CORE: path.join(coreRoot, 'core/morphtile.js'),
        MORPHTILE_COMMIT: CORE_HEAD
      }
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
