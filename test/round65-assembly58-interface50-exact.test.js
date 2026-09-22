const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SHAS = Object.freeze({
  assembly: 'c7f1a599e33709dc8bf96312b2b6f567b588cbdc',
  assemblyBase: 'a6dba7df09abdecbf33b982271f7da7ebdf82261',
  form: 'ef6a09e4d662d960e015f61d7991c58d33f5c6d1',
  surface: '4e4495182aa83e5dfba37722fc3756a70cfaafaa',
  capability: 'edc07af182ee26ca1ceb64b5d5205591ec6aca9d',
  interface: '21ae2ccf9a279b4d8094c1e1329e494d6bb0d764',
  core: '685df074701feeae3e9d789e532d0a3658030bf4'
});

const REPOS = Object.freeze({
  assembly: 'mike-axiom-mir/axm-morphtile-machine-assembly',
  form: 'mike-axiom-mir/axm-morphtile-machine-form',
  surface: 'mike-axiom-mir/axm-morphtile-machine-surface',
  capability: 'mike-axiom-mir/axm-morphtile-machine-capability',
  interface: 'mike-axiom-mir/axm-morphtile-machine-interface',
  core: 'mike-axiom-mir/axm-morphtile'
});

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function exactCheckout(parent, lane, sha, extraShas = []) {
  const root = path.join(parent, lane);
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['remote', 'add', 'origin', `https://github.com/${REPOS[lane]}.git`]);
  git(root, ['fetch', '-q', '--depth=1', 'origin', sha]);
  for (const extra of extraShas) git(root, ['fetch', '-q', '--depth=1', 'origin', extra]);
  git(root, ['checkout', '-q', '--detach', sha]);
  assert.equal(git(root, ['rev-parse', 'HEAD']), sha, `${lane} checkout drifted`);
  return root;
}

function request(request_id, goal, intent) {
  return {
    envelope_version: '0.1',
    request_id,
    goal,
    intent,
    provenance: { caller: 'verification-round65-generic-suite' }
  };
}

test('round65 exact Assembly58 / Interface50 fleet receiver receipt', { timeout: 120000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-round65-'));
  try {
    const roots = {
      assembly: exactCheckout(tmp, 'assembly', SHAS.assembly, [SHAS.assemblyBase]),
      form: exactCheckout(tmp, 'form', SHAS.form),
      surface: exactCheckout(tmp, 'surface', SHAS.surface),
      capability: exactCheckout(tmp, 'capability', SHAS.capability),
      interface: exactCheckout(tmp, 'interface', SHAS.interface),
      core: exactCheckout(tmp, 'core', SHAS.core)
    };

    const changed = git(roots.assembly, ['diff', '--name-only', SHAS.assemblyBase, SHAS.assembly])
      .split('\n').filter(Boolean).sort();
    assert.deepEqual(changed, [
      'fixtures/current-fleet.json',
      'test/current-interface-repeat-local-receiver.integration.test.js'
    ]);

    const receipt = JSON.parse(fs.readFileSync(path.join(roots.assembly, 'fixtures/current-fleet.json'), 'utf8'));
    assert.equal(receipt.schema, 'axm.morphtile.assembly-current-fleet/v1');
    assert.deepEqual(Object.keys(receipt).sort(), ['capability', 'core', 'form', 'interface', 'schema', 'surface']);
    for (const lane of ['form', 'surface', 'capability', 'interface', 'core']) {
      assert.equal(receipt[lane], SHAS[lane], `${lane} receipt drifted`);
    }

    const previous = JSON.parse(git(roots.assembly, ['show', `${SHAS.assemblyBase}:fixtures/current-fleet.json`]));
    assert.equal(previous.interface, '25dcb936e09bd440816d158b55151c879d5a558d');
    for (const lane of ['form', 'surface', 'capability', 'core']) {
      assert.equal(receipt[lane], previous[lane], `${lane} moved unexpectedly`);
    }

    const Capability = require(path.resolve(roots.capability, 'src'));
    const Interface = require(path.resolve(roots.interface, 'src'));
    const { run: assemble } = require(path.resolve(roots.assembly, 'src'));
    const { materializeKit } = require(path.resolve(roots.assembly, 'src/kit'));
    const MT = require(path.resolve(roots.core, 'core/morphtile.js'));

    const id = 'mt_verify_round65_repeat_receiver';
    const ui = {
      candidate: {
        schema: 'morphtile.tile-spec/v0.4',
        id,
        name: 'Verification receiver',
        form_hints: ['ui_panel'],
        facets: {}
      },
      provenance: { caller: 'verification-round65-base' }
    };

    const capability = Capability.run(request('cap', 'Provide one canonical count and increment authority', {
      kind: 'counter', initial: 3
    }));
    const iface = Interface.run(request('iface', 'Repeat presentation over one canonical read and action authority', {
      tile_path: id,
      title: 'Verification receiver',
      elements: [{
        kind: 'repeat', binding: 'count', step: 1, max: 4,
        children: [
          { kind: 'repeat_text', source: 'index', prefix: 'slot ' },
          { kind: 'readout', binding: 'count', repeat_label: { source: 'index', prefix: 'readout ' } },
          { kind: 'action', binding: 'increment', repeat_label: { source: 'index', prefix: 'increment ' } }
        ]
      }],
      bindings: { readouts: ['count'], actions: ['increment'], controls: [] }
    }));

    assert.equal(capability.status, 'CANDIDATE', JSON.stringify(capability.holds));
    assert.equal(iface.status, 'CANDIDATE', JSON.stringify(iface.holds));

    const out = assemble({
      envelope_version: '0.1',
      request_id: 'assemble',
      goal: 'Portable receiver proof',
      intent: { id, name: 'Verification receiver' },
      inputs: [ui, capability, iface],
      provenance: { caller: 'verification-round65-generic-suite' }
    });

    assert.equal(out.status, 'CANDIDATE', JSON.stringify(out.holds));
    assert.deepEqual(out.candidate.view, iface.candidate.operation.view);
    assert.equal(Object.keys(out.candidate.facets.logic.data.vars).filter(name => name === 'count').length, 1);
    assert.equal(out.candidate.facets.connect.sockets.filter(s => s.id === 'increment' && s.kind === 'signal' && s.dir === 'in').length, 1);

    const portable = materializeKit(out, MT, { name: 'Verification receiver kit' });
    assert.equal(portable.status, 'CANDIDATE', JSON.stringify(portable.holds));
    const receiver = MT.createWorld('Verification receiver world');
    const imported = MT.importKit(receiver, JSON.parse(JSON.stringify(portable.kit)));
    assert.equal(imported.status, 'READY', JSON.stringify(imported));
    for (const op of imported.ops || []) MT.applyStructOp(receiver, op);

    const received = MT.resolveTile(receiver, id);
    assert.ok(received);
    assert.deepEqual(received.view, out.candidate.view);
    assert.equal(Object.keys(received.facets.logic.data.vars).filter(name => name === 'count').length, 1);
    assert.equal(received.facets.connect.sockets.filter(s => s.id === 'increment' && s.kind === 'signal' && s.dir === 'in').length, 1);

    const before = MT.structHash(receiver);
    const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
    for (let i = 0; i < 3; i += 1) {
      assert.match(html, new RegExp(`slot ${i}`));
      assert.match(html, new RegExp(`readout ${i}`));
      assert.match(html, new RegExp(`increment ${i}`));
    }
    assert.equal((html.match(/readout [0-2]/g) || []).length, 3);
    assert.equal((html.match(new RegExp(`data-signal=\\"${id}:increment\\"`, 'g')) || []).length, 3);
    assert.equal(MT.structHash(receiver), before, 'rendering must remain structurally read-only');

    execFileSync('npm', ['test'], {
      cwd: roots.assembly,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        CURRENT_FORM_MACHINE_PATH: path.join(roots.form, 'src'),
        CURRENT_FORM_COMMIT: SHAS.form,
        CURRENT_SURFACE_MACHINE_PATH: path.join(roots.surface, 'src'),
        CURRENT_SURFACE_COMMIT: SHAS.surface,
        CURRENT_CAPABILITY_MACHINE_PATH: path.join(roots.capability, 'src'),
        CURRENT_CAPABILITY_COMMIT: SHAS.capability,
        CURRENT_INTERFACE_MACHINE_PATH: path.join(roots.interface, 'src'),
        CURRENT_INTERFACE_COMMIT: SHAS.interface,
        CURRENT_MORPHTILE_CORE_PATH: path.join(roots.core, 'core/morphtile.js'),
        CURRENT_MORPHTILE_COMMIT: SHAS.core
      }
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
