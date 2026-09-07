#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.log('Usage: node scripts/reality-audit.mjs validate|preflight <reality-audit.json>');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const [command, input] = process.argv.slice(2);
if (["help", "--help", "-h"].includes(command)) {
  usage();
  process.exit(0);
}
if (!['validate', 'preflight'].includes(command) || !input) {
  usage();
  process.exit(2);
}

const file = path.resolve(input);
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`无法读取 ${file}: ${error.message}`);
  process.exit();
}

const errors = [];
const requiredString = (value, at) => {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${at} 必须是非空字符串`);
};
const requiredList = (value, at, min = 1) => {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push(`${at} 至少需要 ${min} 个非空字符串`);
  }
};

if (!data || typeof data !== 'object' || Array.isArray(data)) {
  fail('审计根节点必须为对象');
  process.exit(1);
}
if (data.schemaVersion !== '1.0') errors.push('schemaVersion 必须为 1.0');
if (data.projectMode !== 'reality-grounded') errors.push('projectMode 必须为 reality-grounded');
requiredString(data.researchedAt, 'researchedAt');

const sources = Array.isArray(data.sources) ? data.sources : [];
if (!sources.length) errors.push('sources 至少需要一条来源');
const sourceIds = new Set();
let authoritative = 0;
for (const [index, source] of sources.entries()) {
  const at = `sources[${index}]`;
  requiredString(source?.id, `${at}.id`);
  requiredString(source?.title, `${at}.title`);
  requiredString(source?.url, `${at}.url`);
  requiredString(source?.accessedAt, `${at}.accessedAt`);
  if (!['authoritative', 'visual'].includes(source?.kind)) errors.push(`${at}.kind 必须为 authoritative 或 visual`);
  if (source?.kind === 'authoritative') authoritative += 1;
  if (sourceIds.has(source?.id)) errors.push(`${at}.id 重复：${source.id}`);
  sourceIds.add(source?.id);
}
if (!authoritative) errors.push('至少需要一条 authoritative 来源');

const scenes = Array.isArray(data.scenes) ? data.scenes : [];
if (!scenes.length) errors.push('scenes 至少需要一个现实敏感场景');
const sceneIds = new Set();
for (const [index, scene] of scenes.entries()) {
  const at = `scenes[${index}]`;
  requiredString(scene?.sceneId, `${at}.sceneId`);
  requiredString(scene?.domain, `${at}.domain`);
  requiredString(scene?.realWorldFunction, `${at}.realWorldFunction`);
  requiredList(scene?.mustHave, `${at}.mustHave`, 3);
  requiredList(scene?.topology, `${at}.topology`, 2);
  requiredList(scene?.confusionsToAvoid, `${at}.confusionsToAvoid`, 2);
  requiredList(scene?.sourceRefs, `${at}.sourceRefs`, 1);
  for (const ref of scene?.sourceRefs ?? []) if (!sourceIds.has(ref)) errors.push(`${at}.sourceRefs 引用了不存在的来源 ${ref}`);
  requiredString(scene?.flow?.entry, `${at}.flow.entry`);
  requiredString(scene?.flow?.operation, `${at}.flow.operation`);
  requiredString(scene?.flow?.exit, `${at}.flow.exit`);
  requiredString(scene?.flow?.counterflow, `${at}.flow.counterflow`);
  if (scene?.peoplePolicy?.assetSheet !== 'empty') errors.push(`${at}.peoplePolicy.assetSheet 必须为 empty`);
  requiredString(scene?.peoplePolicy?.productionShot, `${at}.peoplePolicy.productionShot`);
  for (const key of ['assetPrompt', 'storyboard', 'frames']) {
    if (!['pending', 'pass', 'fail', 'not-applicable'].includes(scene?.audit?.[key])) {
      errors.push(`${at}.audit.${key} 必须为 pending/pass/fail/not-applicable`);
    }
  }
  if (sceneIds.has(scene?.sceneId)) errors.push(`${at}.sceneId 重复：${scene.sceneId}`);
  sceneIds.add(scene?.sceneId);
}

if (command === 'preflight') {
  for (const scene of scenes) for (const key of ['assetPrompt', 'storyboard', 'frames']) {
    if (scene?.audit?.[key] !== 'pass') errors.push(`${scene?.sceneId ?? '未知场景'}.${key} 尚未通过：${scene?.audit?.[key] ?? 'missing'}`);
  }
}

if (errors.length) {
  console.error(`✗ 真实性审计未通过（${errors.length} 项）`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const pending = scenes.flatMap((scene) => ['assetPrompt', 'storyboard', 'frames']
  .filter((key) => scene.audit[key] === 'pending')
  .map((key) => `${scene.sceneId}.${key}`));
console.log(`✓ 真实性审计结构通过：${scenes.length} 个场景，${sources.length} 条来源（权威 ${authoritative}）`);
if (pending.length) console.log(`⚠ 待人工验收：${pending.join(', ')}`);
