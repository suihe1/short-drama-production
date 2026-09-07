#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export function buildView(board, boardPath, production = {}, productionPath = boardPath) {
  if (!Array.isArray(board.episodes)) throw new Error('storyboard.json 必须包含 episodes 数组');
  function media(value, base) {
    if (!value || typeof value !== 'string' || /^[a-z]+:/i.test(value) && !path.isAbsolute(value)) return null;
    const absolute = path.resolve(path.dirname(base), value);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? pathToFileURL(absolute).href : null;
  }
  const shots = [];
  for (const ep of board.episodes) for (const seg of ep.segments || []) {
    const jobs = (production.jobs || []).filter(j => Number(j.episode) === Number(ep.ep) && [seg.id, seg.sourceClipId].filter(Boolean).includes(j.clipId));
    const variants = jobs.map(j => ({ id: j.jobId, status: j.status, video: media(j.outputPath, productionPath), refs: (j.references || []).map(r => ({ role: r.role, purpose: r.purpose || '', url: media(r.path, productionPath) })) }));
    let start = 0;
    for (const [i, cut] of (seg.cuts || []).entries()) {
      const duration = Number(cut.seconds);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${seg.id} 第 ${i + 1} 镜时长无效`);
      shots.push({ key: `${ep.ep}/${seg.id}/${i + 1}`, episode: ep.ep, segment: seg.id, scene: seg.sourceSceneId ?? seg.sceneId ?? seg.sceneIndex ?? '', id: cut.sourceShotId || `${seg.id}-SH${i + 1}`, start, duration, size: cut.size, camera: cut.cameraPlan || cut.camera, angle: cut.angle, action: cut.blocking || cut.frame, purpose: cut.dramaticPurpose || seg.dramaticFunction, continuity: { direction: cut.screenDirection, axis: cut.axisAction, pose: cut.pose, information: cut.information }, image: media(cut.planningImage || `${seg.id}/f${i + 1}.png`, boardPath), plannedRefs: (seg.references || []).map(r => ({ role: r.role, purpose: r.purpose || '', url: media(r.path, boardPath) })), variants });
      start += duration;
    }
  }
  return { title: production.project?.title || board.source || '故事板', aspect: board.aspectRatio || '16:9', shots };
}

export function renderView(data) {
  const template = fs.readFileSync(new URL('../assets/storyboard-view.html', import.meta.url), 'utf8');
  return template.replace('/*STORYBOARD_DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('Usage: node scripts/storyboard-view.mjs <storyboard.json> [--production <production.json>] --out <new-report.html>');
  } else {
    const get = flag => { const i = args.indexOf(flag); if (i < 0) return null; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${flag} 缺少路径`); return path.resolve(args[i + 1]); };
    const boardPath = path.resolve(args[0]);
    const productionPath = get('--production');
    const out = get('--out');
    if (!out) throw new Error('必须指定 --out');
    const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
    const production = productionPath ? JSON.parse(fs.readFileSync(productionPath, 'utf8')) : {};
    const data = buildView(board, boardPath, production, productionPath || boardPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderView(data), { encoding: 'utf8', flag: 'wx' });
    console.log(`已生成 ${data.shots.length} 镜故事板：${out}`);
  }
}
