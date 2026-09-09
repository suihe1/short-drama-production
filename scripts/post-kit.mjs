#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveStored(manifestPath, stored) {
  return path.isAbsolute(stored) ? path.normalize(stored) : path.resolve(path.dirname(manifestPath), stored);
}

function fileSha256(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function parseEpisodeRange(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error("--eps 必须形如 2 或 1-3");
  return [Number(match[1]), Number(match[2] ?? match[1])];
}

function inRange(ep, range) {
  return !range || (ep >= range[0] && ep <= range[1]);
}

function formatDimensions(format) {
  if (Number.isInteger(format?.deliveryWidth) && Number.isInteger(format?.deliveryHeight)) return { width: format.deliveryWidth, height: format.deliveryHeight };
  if (format?.aspectRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function buildEditPlan(manifest, manifestPath, options = {}) {
  const range = options.episodes ?? null;
  const format = manifest.project?.format ?? {};
  const dimensions = formatDimensions(format);
  const jobs = arrayOf(manifest.jobs)
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.status === "succeeded" && inRange(job.episode, range))
    .sort((a, b) => a.job.episode - b.job.episode || Number(a.job.sequence ?? a.index) - Number(b.job.sequence ?? b.index));
  const groups = new Map();
  for (const entry of jobs) {
    const key = `${entry.job.episode}/${entry.job.clipId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const selections = options.takeSelections ?? {};
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) throw new Error('选片表必须是 episode/clipId 到 jobId 的对象');
  for (const key of Object.keys(selections)) if (!groups.has(key)) throw new Error(`选片表包含当前范围内没有成功素材的片段：${key}`);
  for (const value of Object.values(selections)) if (typeof value !== 'string' || !value.trim()) throw new Error('选片表的 jobId 必须是非空字符串');
  const selectedJobs = [];
  for (const [key, candidates] of groups) {
    const selected = Object.hasOwn(selections, key) ? selections[key] : null;
    if (candidates.length > 1 && !selected) throw new Error(`${key} 有多个成功版本，请用 --select-file 明确选用 jobId`);
    const entry = selected ? candidates.find(item => item.job.jobId === selected) : candidates[0];
    if (!entry) throw new Error(`${key} 指定的 ${selected} 不是该片段的成功版本`);
    selectedJobs.push(entry);
  }
  selectedJobs.sort((a, b) => a.job.episode - b.job.episode || Number(a.job.sequence ?? a.index) - Number(b.job.sequence ?? b.index));
  const byEpisode = new Map();
  for (const { job, index } of selectedJobs) {
    const output = resolveStored(manifestPath, job.outputPath);
    if (!byEpisode.has(job.episode)) byEpisode.set(job.episode, []);
    byEpisode.get(job.episode).push({
      order: Number(job.sequence ?? index + 1),
      jobId: job.jobId,
      clipId: job.clipId,
      path: output,
      expectedSeconds: job.duration,
      trimIn: 0,
      trimOut: job.duration,
      transition: "cut",
      sha256: fs.existsSync(output) && fs.statSync(output).isFile() ? fileSha256(output) : null
    });
  }
  const outputRoot = path.resolve(options.outputDir ?? path.join(path.dirname(manifestPath), "edit"));
  return {
    schemaVersion: "1.0",
    sourceProduction: path.resolve(manifestPath),
    projectId: manifest.project?.id,
    format: {
      aspectRatio: format.aspectRatio ?? "16:9",
      width: dimensions.width,
      height: dimensions.height,
      fps: format.fps ?? 24,
      sampleRate: 48000,
      audioLayout: "stereo"
    },
    policies: { scaleMode: "contain-pad", background: "black", normalizeAudio: true, requireAudioPerClip: true },
    episodes: [...byEpisode.entries()].map(([ep, clips]) => ({
      ep,
      clips,
      expectedSeconds: clips.reduce((sum, clip) => sum + clip.expectedSeconds, 0),
      output: path.join(outputRoot, `E${String(ep).padStart(2, "0")}-roughcut.mp4`)
    }))
  };
}

function executable(candidate, versionFlag = "-version") {
  if (!candidate) return null;
  const result = spawnSync(candidate, [versionFlag], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? candidate : null;
}

export function findFfmpeg() {
  return executable(process.env.FFMPEG_PATH) ?? executable("ffmpeg");
}

export function findFfprobe() {
  return executable(process.env.FFPROBE_PATH) ?? executable("ffprobe");
}

export function ffmpegArgsForEpisode(plan, episode) {
  const inputs = [];
  const filters = [];
  const streams = [];
  arrayOf(episode.clips).forEach((clip, index) => {
    inputs.push("-i", clip.path);
    filters.push(`[${index}:v]scale=${plan.format.width}:${plan.format.height}:force_original_aspect_ratio=decrease,pad=${plan.format.width}:${plan.format.height}:(ow-iw)/2:(oh-ih)/2:color=${plan.policies.background},fps=${plan.format.fps},setsar=1,setpts=PTS-STARTPTS[v${index}]`);
    filters.push(`[${index}:a]aresample=${plan.format.sampleRate}:async=1:first_pts=0,aformat=sample_rates=${plan.format.sampleRate}:channel_layouts=${plan.format.audioLayout},asetpts=PTS-STARTPTS[a${index}]`);
    streams.push(`[v${index}][a${index}]`);
  });
  filters.push(`${streams.join("")}concat=n=${episode.clips.length}:v=1:a=1[outv][outa]`);
  return [...inputs, "-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", String(plan.format.sampleRate), "-movflags", "+faststart", "-n", episode.output];
}

export function probeMedia(file, ffprobe = findFfprobe()) {
  if (!ffprobe) return { available: false, file };
  const result = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return { available: true, file, error: (result.stderr || result.stdout || "ffprobe failed").trim() };
  return { available: true, file, ...JSON.parse(result.stdout) };
}

function fpsNumber(value) {
  if (typeof value !== "string") return Number(value);
  const [a, b] = value.split("/").map(Number);
  return b ? a / b : a;
}

export function preflightEditPlan(plan, options = {}) {
  const errors = [];
  const warnings = [];
  const ffprobe = options.ffprobe === undefined ? findFfprobe() : options.ffprobe;
  if (arrayOf(plan.episodes).length === 0) errors.push("没有 succeeded 视频任务可供装配");
  for (const episode of arrayOf(plan.episodes)) {
    if (arrayOf(episode.clips).length === 0) errors.push(`E${String(episode.ep).padStart(2, "0")} 没有片段`);
    for (const clip of arrayOf(episode.clips)) {
      if (!fs.existsSync(clip.path) || !fs.statSync(clip.path).isFile()) {
        errors.push(`${clip.jobId} 输出不存在: ${clip.path}`);
        continue;
      }
      if (!clip.sha256 || fileSha256(clip.path) !== clip.sha256) {
        errors.push(`${clip.jobId} 素材哈希变化或缺失，请重新选片并生成计划`);
        continue;
      }
      if (clip.trimIn !== 0 || clip.trimOut !== clip.expectedSeconds) {
        errors.push(`${clip.jobId} 当前顺序拼接工具不支持自定义裁切，请使用外部剪辑工具`);
        continue;
      }
      if (!ffprobe) continue;
      const probe = probeMedia(clip.path, ffprobe);
      if (probe.error) {
        errors.push(`${clip.jobId} 无法解码: ${probe.error}`);
        continue;
      }
      const video = arrayOf(probe.streams).find((stream) => stream.codec_type === "video");
      const audio = arrayOf(probe.streams).find((stream) => stream.codec_type === "audio");
      if (!video) errors.push(`${clip.jobId} 没有视频流`);
      if (plan.policies.requireAudioPerClip && !audio) errors.push(`${clip.jobId} 没有音频流；先补静音/对白轨再装配`);
      if (video) {
        const actualRatio = Number(video.width) / Number(video.height);
        const targetRatio = plan.format.width / plan.format.height;
        if (Math.abs(actualRatio - targetRatio) > 0.02) warnings.push(`${clip.jobId} 画幅 ${video.width}x${video.height} 将按 contain-pad 适配 ${plan.format.aspectRatio}`);
        const fps = fpsNumber(video.avg_frame_rate);
        if (Number.isFinite(fps) && Math.abs(fps - plan.format.fps) > 0.05) warnings.push(`${clip.jobId} ${fps.toFixed(3)}fps 将转换为 ${plan.format.fps}fps`);
      }
    }
  }
  if (!ffprobe) warnings.push("未找到 ffprobe：已完成文件/哈希预检，跳过编解码、画幅、帧率和音轨检查");
  return { ok: errors.length === 0, errors, warnings, ffmpeg: options.ffmpeg === undefined ? findFfmpeg() : options.ffmpeg, ffprobe };
}

export function qcEpisode(plan, episode, options = {}) {
  const output = episode.output;
  if (!fs.existsSync(output) || !fs.statSync(output).isFile()) return { ok: false, output, issues: [{ severity: "critical", code: "OUTPUT_MISSING", message: "粗剪输出不存在" }] };
  const probe = probeMedia(output, options.ffprobe === undefined ? findFfprobe() : options.ffprobe);
  return evaluateEpisodeProbe(plan, episode, probe);
}

export function evaluateEpisodeProbe(plan, episode, probe) {
  const output = episode.output;
  const issues = [];
  if (!probe.available) return { ok: false, verified: false, output, issues: [{ severity: "medium", code: "FFPROBE_MISSING", message: "未安装 ffprobe，技术 QC 未完成" }] };
  if (probe.error) return { ok: false, output, issues: [{ severity: "critical", code: "DECODE_FAILED", message: probe.error }] };
  const video = arrayOf(probe.streams).find((stream) => stream.codec_type === "video");
  const audio = arrayOf(probe.streams).find((stream) => stream.codec_type === "audio");
  if (!video) issues.push({ severity: "critical", code: "VIDEO_STREAM_MISSING", message: "没有视频流" });
  if (!audio) issues.push({ severity: "high", code: "AUDIO_STREAM_MISSING", message: "没有音频流" });
  if (video && (video.width !== plan.format.width || video.height !== plan.format.height)) issues.push({ severity: "high", code: "DIMENSION_MISMATCH", message: `实际 ${video.width}x${video.height}，目标 ${plan.format.width}x${plan.format.height}` });
  if (video) {
    const fps = fpsNumber(video.avg_frame_rate);
    if (!Number.isFinite(fps) || fps <= 0 || Math.abs(fps - plan.format.fps) > 0.05) issues.push({ severity: 'high', code: 'FPS_MISMATCH', message: `实际帧率 ${video.avg_frame_rate ?? '未知'}，目标 ${plan.format.fps}` });
  }
  if (audio && (Number(audio.sample_rate) !== plan.format.sampleRate || Number(audio.channels) !== 2)) issues.push({ severity: 'high', code: 'AUDIO_FORMAT_MISMATCH', message: '音频采样率或声道与交付规格不符' });
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(episode.expectedSeconds) || episode.expectedSeconds <= 0 || Math.abs(duration - episode.expectedSeconds) > Math.max(0.5, episode.expectedSeconds * 0.01)) issues.push({ severity: "high", code: "DURATION_MISMATCH", message: `实际 ${probe.format?.duration ?? '未知'}s，期望 ${episode.expectedSeconds}s` });
  return { ok: !issues.some((item) => ["critical", "high"].includes(item.severity)), output, duration, issues };
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

function usage() {
  console.log(`short-drama post toolkit

Usage:
  node scripts/post-kit.mjs plan <production.json> --out <edit-plan.json> [--eps 1-3] [--output-dir edit] [--select-file takes.json]
  node scripts/post-kit.mjs preflight <edit-plan.json>
  node scripts/post-kit.mjs assemble <edit-plan.json> [--ep 1] [--execute]
  node scripts/post-kit.mjs qc <edit-plan.json> [--ep 1]
`);
}

function main() {
  const [command, target, ...args] = process.argv.slice(2);
  if (!command || ["help", "-h", "--help"].includes(command)) return usage();
  if (!target) throw new Error(`${command} 需要输入路径`);
  if (command === "plan") {
    const manifestPath = path.resolve(target);
    const out = path.resolve(option(args, "--out", path.join(path.dirname(manifestPath), "edit-plan.json")));
    if (fs.existsSync(out) && !args.includes("--force")) throw new Error(`输出已存在，使用 --force 才能覆盖: ${out}`);
    const selectionFile = option(args, '--select-file', null);
    if (args.includes('--select-file') && (!selectionFile || selectionFile.startsWith('--'))) throw new Error('--select-file 缺少文件路径');
    const plan = buildEditPlan(readJson(manifestPath), manifestPath, { episodes: parseEpisodeRange(option(args, "--eps", "")), outputDir: option(args, "--output-dir", path.join(path.dirname(manifestPath), "edit")), takeSelections: selectionFile ? readJson(path.resolve(selectionFile)) : {} });
    writeJson(out, plan);
    console.log(out);
    return;
  }
  const plan = readJson(path.resolve(target));
  if (command === "preflight") {
    const result = preflightEditPlan(plan);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const requestedEp = Number(option(args, "--ep", "0"));
  const episodes = arrayOf(plan.episodes).filter((episode) => !requestedEp || episode.ep === requestedEp);
  if (episodes.length === 0) throw new Error("找不到要处理的集");
  if (command === "assemble") {
    const preflight = preflightEditPlan({ ...plan, episodes });
    if (!preflight.ok) throw new Error(preflight.errors.join("\n"));
    const commands = episodes.map((episode) => ({ ep: episode.ep, executable: preflight.ffmpeg ?? "ffmpeg", args: ffmpegArgsForEpisode(plan, episode) }));
    if (!args.includes("--execute")) {
      console.log(JSON.stringify({ execute: false, commands, note: "加 --execute 才会写出粗剪文件" }, null, 2));
      return;
    }
    if (!preflight.ffmpeg) throw new Error("未找到 ffmpeg；设置 FFMPEG_PATH 或安装 ffmpeg 后重试");
    for (const command of commands) {
      fs.mkdirSync(path.dirname(plan.episodes.find((episode) => episode.ep === command.ep).output), { recursive: true });
      const result = spawnSync(command.executable, command.args, { stdio: "inherit", windowsHide: true });
      if (result.status !== 0) throw new Error(`E${String(command.ep).padStart(2, "0")} FFmpeg 装配失败`);
    }
    return;
  }
  if (command === "qc") {
    const results = episodes.map((episode) => ({ ep: episode.ep, ...qcEpisode(plan, episode) }));
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => !result.ok)) process.exitCode = 1;
    return;
  }
  usage();
  process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`ERROR｜${error.message}`); process.exitCode = 1; }
}
