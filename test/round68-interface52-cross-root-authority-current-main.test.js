const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INTERFACE_HEAD = '21a0ea63cfd5967624bfe6febd93fd3137005629';
const INTERFACE_BASE = '6a496ece147f13e420385d455ef5a9cfaf899c89';
const CORE_HEAD = '685df074701feeae3e9d789e532d0a3658030bf4';
const CLAIM = 'cross-root-composition-authority-boundary';

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

function request() {
  return {
    envelope_version: '0.1',
    request_id: 'verification-round68-cross-root-authority',
    goal: 'Do not infer cross-root creation authority from runtime path reachability',
    intent: {
      tile_path: 'mt_verify_owner/mt_panel',
      title: 'Cross-root authority verification',
      elements: [{ kind: 'tile', tile_path: 'mt_verify_remote/mt_inner' }]
    },
    provenance: { caller: 'verification-round68' }
  };
}

function representedWorld(MT) {
  const world = MT.seedWorld();

  const panel = MT.createTile({ id: 'mt_panel', name: 'Owner panel', form_hints: ['ui_panel'] });
  panel.view = {
    title: 'Owner view',
    body: [{ tile: '/mt_verify_remote/mt_inner' }]
  };
  panel.provenance.sha256 = MT.contentHash(panel);

  const owner = MT.createTile({ id: 'mt_verify_owner', name: 'Owner root', form_hints: ['ui_panel'] });
  owner.facets.mesh = { type: 'interior', source: null, data: {} };
  owner.interior = { tiles: { mt_panel: panel }, edges: {}, ports: [] };
  owner.provenance.sha256 = MT.contentHash(owner);

  const inner = MT.createTile({ id: 'mt_inner', name: 'Remote nested tile', form_hints: ['ui_panel'] });
  inner.view = { title: 'Remote owner', body: [{ text: 'Remote view remains remote-owned' }] };
  inner.provenance.sha256 = MT.contentHash(inner);

  const remote = MT.createTile({ id: 'mt_verify_remote', name: 'Remote root', form_hints: ['ui_panel'] });
  remote.facets.mesh = { type: 'interior', source: null, data: {} };
  remote.interior = { tiles: { mt_inner: inner }, edges: {}, ports: [] };
  remote.provenance.sha256 = MT.contentHash(remote);

  world.tiles.mt_verify_owner = owner;
  world.tiles.mt_verify_remote = remote;
  const valid = MT.validateWorld(world);
  assert.equal(valid.ok, true, valid.errors.join('; '));
  return world;
}

test('round68 independently verifies Interface52 cross-root authority stays fail-closed on current Verification main', { timeout: 90000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-round68-'));
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
      'test/cross-root-composition-authority-boundary.integration.test.js',
      'test/integration-proof-manifest.json'
    ]);

    const machine = JSON.parse(fs.readFileSync(path.join(ifaceRoot, 'machine.json'), 'utf8'));
    assert.equal(machine.tested_against.repository, 'mike-axiom-mir/axm-morphtile');
    assert.equal(machine.tested_against.commit, CORE_HEAD);

    const proofManifest = JSON.parse(fs.readFileSync(path.join(ifaceRoot, 'test/integration-proof-manifest.json'), 'utf8'));
    const claimEntries = proofManifest.proofs.filter(p => p.claim === CLAIM);
    assert.equal(claimEntries.length, 1, 'cross-root authority claim must be unique');
    assert.equal(claimEntries[0].path, 'test/cross-root-composition-authority-boundary.integration.test.js');
    assert.deepEqual(claimEntries[0].dependencies, ['morphtile']);

    const Interface = require(path.join(ifaceRoot, 'src'));
    const MT = require(path.join(coreRoot, 'core/morphtile.js'));

    const first = Interface.run(request());
    const second = Interface.run(JSON.parse(JSON.stringify(request())));
    assert.deepEqual(second, first, 'same cross-root request must replay deterministically');
    assert.equal(first.status, 'HOLD');
    assert.equal(first.candidate, null, 'held cross-root authoring must not emit an installable candidate');
    assert.deepEqual(first.dependencies, [], 'held cross-root authoring must not synthesize bridge or target authority');
    assert.equal(first.holds.length, 1);
    assert.equal(first.holds[0].code, 'HOLD_INTERFACE_TILE_SCOPE');
    assert.match(first.holds[0].detail, /cross-root composition requires a separate authority contract/);

    const world = representedWorld(MT);
    const before = MT.structHash(world);
    const html = MT.vnodeToHTML(MT.compilePanel(world, {
      open: { mt_verify_owner: true, mt_verify_remote: true }
    }).root);
    assert.match(html, /class="v-embed"[^>]*data-tile="mt_verify_remote\/mt_inner"/,
      'Core should remain able to represent an explicitly authored absolute cross-root view');
    assert.match(html, /Remote view remains remote-owned/);
    assert.equal(MT.structHash(world), before, 'rendering an explicit represented cross-root view must be structurally read-only');
    assert.deepEqual(MT.resolveTile(world, 'mt_verify_remote/mt_inner').view,
      { title: 'Remote owner', body: [{ text: 'Remote view remains remote-owned' }] },
      'remote tile must retain ownership of its view');

    execFileSync(process.execPath, ['--test', 'test/cross-root-composition-authority-boundary.integration.test.js'], {
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
