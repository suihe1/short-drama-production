#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/doctor.mjs [--json] [--skills-dir <directory>]');
  process.exit(0);
}
const index = args.indexOf('--skills-dir');
if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--skills-dir requires a directory');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoots = [];
for (let dir = process.cwd();;) {
  projectRoots.push(path.join(dir, '.agents', 'skills'));
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
const roots = [...new Set([
  ...(index >= 0 ? [path.resolve(args[index + 1])] : []),
  path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'),
  ...projectRoots, path.dirname(root)
])];
function version(command, argv) {
  const result = spawnSync(command, argv, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  return result.status === 0 ? `${result.stdout || result.stderr}`.trim().split('\n')[0] : null;
}
const pythonCandidates = [['python3', ['--version']], ['python', ['--version']], ...(process.platform === 'win32' ? [['py', ['-3', '--version']]] : [])];
let python = null;
for (const [command, argv] of pythonCandidates) {
  const value = version(command, argv);
  const match = value?.match(/Python (\d+)\.(\d+)/);
  if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 10))) { python = { command, version: value }; break; }
}
const skills = ['novel-outline', 'novel-characters', 'novel-art', 'novel-script', 'short-drama-director', 'novel-storyboard', 'h3-prompt-writing'].map(name => {
  const found = roots.map(dir => path.join(dir, name, 'SKILL.md')).find(file => fs.existsSync(file));
  return { name, installed: Boolean(found), path: found || null };
});
const result = {
  offline: true,
  coreReady: Number(process.versions.node.split('.')[0]) >= 18,
  node: process.version,
  python,
  ffmpeg: version('ffmpeg', ['-version']),
  ffprobe: version('ffprobe', ['-version']),
  skills,
  note: '仅检查本机文件和程序版本；不读取密钥、不联网、不安装依赖。Python 用于 CompShare，FFmpeg/ffprobe 用于粗剪；缺失不阻止离线示例。'
};
if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`${result.coreReady ? 'PASS' : 'FAIL'} 核心运行环境：Node ${result.node}`);
  console.log(`CompShare Python 3.10+：${python ? `${python.command} (${python.version})` : '未在 PATH 中找到，可手动使用 Python 3.10+ 的完整路径'}`);
  console.log(`粗剪：FFmpeg ${result.ffmpeg ? '可用' : '缺失'} / ffprobe ${result.ffprobe ? '可用' : '缺失'}`);
  for (const skill of skills) console.log(`${skill.installed ? 'FOUND' : 'MISSING'} ${skill.name}`);
  console.log(result.note);
  console.log('缺失专业 skill 的接入方式见 references/getting-started.md；正式 H3 提示词需要 h3-prompt-writing。');
}
process.exitCode = result.coreReady ? 0 : 1;
