import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realityGate } from './reality-gate.mjs';
import { approveJob, exportCompShareJob, validateManifest } from './production-kit.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-reality-test-'));
const manifestPath = path.join(dir, 'production.json');
const manifest = { policies: { realityRequired: true }, jobs: [] };
const audit = {
  schemaVersion: '1.0', projectMode: 'reality-grounded', researchedAt: '2026-09-05',
  sources: [{ id: 'R1', title: 'Offline fixture', url: 'https://example.com', accessedAt: '2026-09-05', kind: 'authoritative' }],
  scenes: [{ sceneId: 'S1', domain: 'office', realWorldFunction: 'work', mustHave: ['desk', 'chair', 'monitor'], topology: ['chair behind desk', 'monitor on desk'], confusionsToAvoid: ['empty showroom', 'airport'], sourceRefs: ['R1'], flow: { entry: 'door', operation: 'desk', exit: 'door', counterflow: 'separate aisle' }, peoplePolicy: { assetSheet: 'empty', productionShot: 'workers present' }, audit: { assetPrompt: 'pass', storyboard: 'pass', frames: 'pass' } }]
};
try {
  assert.ok(realityGate(manifest, manifestPath).length, 'required missing file must block');
  assert.deepEqual(realityGate({ policies: {} }, manifestPath), [], 'unrelated project remains usable');
  for (const state of ['pending', 'fail', 'not-applicable', 'pass']) {
    audit.scenes[0].audit.frames = state;
    fs.writeFileSync(path.join(dir, 'reality-audit.json'), JSON.stringify(audit));
    assert.equal(realityGate(manifest, manifestPath).length === 0, state === 'pass');
    if (state !== 'pass') {
      assert.throws(() => approveJob(manifest, manifestPath, 'J1', 'user'), /尚未通过/);
      assert.throws(() => exportCompShareJob(manifest, manifestPath, 'J1', path.join(dir, 'job.json')), /尚未通过/);
      assert.ok(validateManifest(manifest, manifestPath).errors.some(e => e.code === 'REALITY_NOT_READY'));
      assert.equal(fs.existsSync(path.join(dir, 'job.json')), false);
    }
  }
  fs.writeFileSync(path.join(dir, 'reality-audit.json'), 'null');
  assert.ok(realityGate(manifest, manifestPath).length, 'invalid root must block');
  console.log('PASS reality gate: missing, pending, failed, not-applicable, approved, invalid root; approval/export/validation integration');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
