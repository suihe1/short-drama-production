#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createManifest, registerArtifact, approveArtifact, refreshManifest, validateManifest, renderManifest } from './production-kit.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/offline-demo.mjs [--out <new-directory>]');
  process.exit(0);
}
const index = args.indexOf('--out');
if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--out requires a new directory');
const destination = path.resolve(index >= 0 ? args[index + 1] : `runs/offline-demo-${Date.now()}`);
// mkdir without recursive refuses an existing output; never replaces user work.
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.mkdirSync(destination);
const manifestPath = path.join(destination, 'production.json');
const sourcePath = path.join(destination, 'source.md');
fs.copyFileSync(fileURLToPath(new URL('../examples/offline/source.md', import.meta.url)), sourcePath);
const manifest = createManifest({ title: '门口的伞｜离线演示', sourcePath, manifestPath });
const outlinePath = path.join(destination, 'outline.json');
const scriptPath = path.join(destination, 'script.json');
fs.writeFileSync(outlinePath, JSON.stringify({ title: '门口的伞', demoOnly: true, synopsis: '发现雨伞，走进厨房，帮父亲端饭。' }, null, 2));
fs.writeFileSync(scriptPath, JSON.stringify({ demoOnly: true, scene: '家中门口与厨房', action: '小林放下包，接过父亲手里的碗。' }, null, 2));
registerArtifact(manifest, manifestPath, { id: 'outline', kind: 'outline', stage: 'outline', path: outlinePath, dependsOn: ['source'], producer: 'manual' });
approveArtifact(manifest, manifestPath, 'outline', 'offline-demo', '仅演示本地状态流转，非用户真实审批');
registerArtifact(manifest, manifestPath, { id: 'script', kind: 'script', stage: 'script', path: scriptPath, dependsOn: ['outline'], producer: 'manual' });
approveArtifact(manifest, manifestPath, 'script', 'offline-demo', '仅演示本地状态流转，非用户真实审批');
assert.equal(validateManifest(manifest, manifestPath).ok, true);
fs.writeFileSync(path.join(destination, 'before-change.md'), renderManifest(manifest, manifestPath));
fs.appendFileSync(outlinePath, '\n');
refreshManifest(manifest, manifestPath);
assert.equal(manifest.artifacts.find(a => a.id === 'outline').status, 'review');
assert.equal(manifest.artifacts.find(a => a.id === 'script').status, 'stale');
assert.equal(manifest.jobs.length, 0);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(destination, 'production-report.md'), renderManifest(manifest, manifestPath));
console.log(`PASS 离线示例：修改大纲后，大纲变为 review，依赖剧本变为 stale。\n输出：${destination}\n未创建视频任务，未读取密钥，未调用外部 API。`);
