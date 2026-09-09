#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realityGate } from "./reality-gate.mjs";

const ARTIFACT_KINDS = new Set(["source", "outline", "cast", "art", "script", "director", "storyboard", "frames", "video", "audio", "edit", "qc", "delivery"]);
const ARTIFACT_STATUSES = new Set(["planned", "working", "review", "approved", "stale", "missing", "blocked", "failed", "skipped"]);
const VOICE_TYPES = new Set(["voice-master", "exact-line", "performance-reference", "ambience", "music"]);
const RIGHTS = new Set(["synthetic", "owned", "licensed", "consented", "unknown"]);
const VOICE_STATUSES = new Set(["draft", "approved", "rejected", "missing"]);
const VOICE_LICENSE_SCOPES = new Set(["evaluation-only", "commercial"]);
const JOB_STATUSES = new Set(["planned", "approved", "stale", "submitted", "running", "succeeded", "failed", "cancelled", "rejected"]);
const H3_MODES = new Set(["h3-t2va", "h3-i2va", "h3-fl2va", "h3-ref2va"]);
const DIALOGUE_ROUTES = new Set(["h3-native-reference", "h3-native-free", "tts-guided-h3", "tts-post", "silent"]);
const AUDIO_RELATIONS = new Set(["reference", "weak_reference", "partially_copy", "fully_copy"]);
const REFERENCE_ROLES = new Set(["reference_image", "reference_video", "reference_audio", "first_frame", "last_frame"]);
const RISK_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const RISK_STATUSES = new Set(["open", "mitigated", "accepted", "closed"]);
const GENERATION_RESOLUTIONS = new Set(["768P", "2K"]);
const VIDEO_PROVIDERS = new Set(["minimax-official", "compshare"]);
const CONTEXT_IR_POLICIES = new Set(["off", "pilot", "selective", "on"]);
const EXPERIMENT_VARIABLES = new Set(["promptText", "promptLanguage", "referenceSet", "useContextIr", "duration", "resolution", "seed"]);
const COMPSHARE_CLEAN_SUFFIX = "No subtitles, captions, rendered dialogue text, title cards, logos, or watermarks.";
const ASPECT_PRESETS = {
  "21:9": { orientation: "landscape", deliveryWidth: 2520, deliveryHeight: 1080, compositionProfile: "ultrawide-blocking", safeArea: { action: 0.94, title: 0.86 } },
  "16:9": { orientation: "landscape", deliveryWidth: 1920, deliveryHeight: 1080, compositionProfile: "landscape-ensemble", safeArea: { action: 0.95, title: 0.90 } },
  "4:3": { orientation: "landscape", deliveryWidth: 1440, deliveryHeight: 1080, compositionProfile: "classic-landscape", safeArea: { action: 0.94, title: 0.88 } },
  "1:1": { orientation: "square", deliveryWidth: 1080, deliveryHeight: 1080, compositionProfile: "square-centered", safeArea: { action: 0.92, title: 0.84 } },
  "3:4": { orientation: "portrait", deliveryWidth: 1080, deliveryHeight: 1440, compositionProfile: "portrait-balanced", safeArea: { action: 0.92, title: 0.84 } },
  "9:16": { orientation: "portrait", deliveryWidth: 1080, deliveryHeight: 1920, compositionProfile: "portrait-subject-priority", safeArea: { action: 0.90, title: 0.80 } }
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function now() {
  return new Date().toISOString();
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function slugify(value) {
  const ascii = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (ascii) return ascii.slice(0, 48);
  return `short-drama-${crypto.createHash("sha256").update(String(value ?? "project")).digest("hex").slice(0, 8)}`;
}

function formatContract(aspectRatio, fps, targetModel, generationResolution) {
  const preset = ASPECT_PRESETS[aspectRatio];
  if (!preset) throw new Error(`不支持的项目画幅 ${aspectRatio}；可用 ${Object.keys(ASPECT_PRESETS).join(", ")}`);
  if (!GENERATION_RESOLUTIONS.has(generationResolution)) throw new Error(`generationResolution 必须为 768P 或 2K`);
  return { aspectRatio, fps, episodeCount: null, episodeSeconds: null, targetModel, generationResolution, ...structuredClone(preset) };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, data) {
  data.project.updatedAt = now();
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function issue(list, code, at, message) {
  list.push({ code, path: at, message });
}

function requireText(errors, value, at, label) {
  if (!isFilled(value)) issue(errors, "REQUIRED_TEXT", at, `${label}不能为空`);
}

function optionValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

function requireOption(args, name) {
  const result = optionValue(args, name);
  if (!isFilled(result)) throw new Error(`缺少参数 ${name}`);
  return result;
}

function csv(value) {
  if (!isFilled(value)) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumber(value, label) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} 必须是数字`);
  return result;
}

function ensureId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`${label} 只能包含字母、数字、点、下划线和短横线`);
  return value;
}

function storedPath(manifestPath, inputPath) {
  const manifestDir = path.dirname(manifestPath);
  const absolute = path.resolve(inputPath);
  const relative = path.relative(manifestDir, absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return normalizeSlashes(relative);
  if (relative === "") return ".";
  return normalizeSlashes(absolute);
}

function resolveStoredPath(manifestPath, stored) {
  if (!isFilled(stored)) return null;
  return path.isAbsolute(stored) ? path.normalize(stored) : path.resolve(path.dirname(manifestPath), stored);
}

function hashFile(file, hash) {
  hash.update(fs.readFileSync(file));
}

function listDirectoryFiles(root, manifestPath) {
  const results = [];
  const manifestAbsolute = path.resolve(manifestPath);
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (path.resolve(absolute) === manifestAbsolute) continue;
      if (entry.isDirectory()) walk(absolute);
      else results.push({ absolute, relative: normalizeSlashes(path.relative(root, absolute)), link: entry.isSymbolicLink() });
    }
  }
  walk(root);
  return results;
}

export function hashPath(target, manifestPath = "") {
  if (!target || !fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  const hash = crypto.createHash("sha256");
  if (stat.isFile()) {
    hash.update("file\0");
    hashFile(target, hash);
  } else if (stat.isDirectory()) {
    hash.update("directory\0");
    for (const item of listDirectoryFiles(target, manifestPath)) {
      hash.update(`${item.relative}\0`);
      if (item.link) hash.update(`link:${fs.readlinkSync(item.absolute)}\0`);
      else hashFile(item.absolute, hash);
    }
  } else if (stat.isSymbolicLink()) {
    hash.update(`link:${fs.readlinkSync(target)}`);
  } else {
    hash.update(`${stat.mode}:${stat.size}`);
  }
  return hash.digest("hex");
}

function currentArtifactHash(manifestPath, artifact) {
  const target = resolveStoredPath(manifestPath, artifact.path);
  return target ? hashPath(target, manifestPath) : null;
}

function currentVoiceHash(manifestPath, asset) {
  const target = resolveStoredPath(manifestPath, asset.path);
  return target ? hashPath(target, manifestPath) : null;
}

function artifactMap(manifest) {
  return new Map(arrayOf(manifest.artifacts).map((artifact) => [artifact.id, artifact]));
}

function voiceMap(manifest) {
  return new Map(arrayOf(manifest.voiceAssets).map((asset) => [asset.voiceAssetId, asset]));
}

function nextApprovalId(manifest) {
  return `APR-${String(arrayOf(manifest.approvals).length + 1).padStart(4, "0")}`;
}

export function createManifest({ title, sourcePath, manifestPath, aspectRatio = "16:9", fps = 24, targetModel = "MiniMax-H3", generationResolution = "768P", videoProvider = "minimax-official" }) {
  if (!VIDEO_PROVIDERS.has(videoProvider)) throw new Error(`videoProvider 必须为 ${[...VIDEO_PROVIDERS].join(" 或 ")}`);
  const timestamp = now();
  const sourceStored = storedPath(manifestPath, sourcePath);
  const sourceHash = hashPath(path.resolve(sourcePath), manifestPath);
  const sourceArtifact = {
    id: "source",
    kind: "source",
    stage: "ingest",
    producer: "user",
    path: sourceStored,
    episodes: "all",
    dependsOn: [],
    status: sourceHash ? "approved" : "missing",
    sha256: sourceHash,
    approvedSha256: sourceHash,
    approvedDependencyHashes: {},
    updatedAt: timestamp,
    notes: []
  };
  return {
    schemaVersion: "1.0",
    project: {
      id: slugify(title),
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      format: formatContract(aspectRatio, fps, targetModel, generationResolution)
    },
    policies: {
      batchEpisodes: 3,
      pilotJobs: 1,
      videoProvider,
      defaultDialogueRoute: "h3-native-reference",
      ambienceRoute: "h3-native",
      foleyRoute: "hybrid",
      musicRoute: "post",
      contextIrPolicy: "pilot",
      paidGenerationRequiresApproval: true
    },
    artifacts: [sourceArtifact],
    voiceAssets: [],
    jobs: [],
    approvals: sourceHash ? [{ approvalId: "APR-0001", artifactId: "source", by: "user", at: timestamp, sha256: sourceHash, dependencyHashes: {}, note: "项目输入源" }] : [],
    risks: []
  };
}

export function setProjectFormat(manifest, input = {}) {
  const current = manifest.project?.format ?? {};
  const aspectRatio = input.aspectRatio ?? current.aspectRatio ?? "16:9";
  const fps = input.fps ?? current.fps ?? 24;
  const targetModel = input.targetModel ?? current.targetModel ?? "MiniMax-H3";
  const generationResolution = input.generationResolution ?? current.generationResolution ?? "768P";
  const changed = aspectRatio !== current.aspectRatio || fps !== current.fps || generationResolution !== current.generationResolution || targetModel !== current.targetModel;
  manifest.project.format = { ...formatContract(aspectRatio, fps, targetModel, generationResolution), episodeCount: current.episodeCount ?? null, episodeSeconds: current.episodeSeconds ?? null };
  if (changed) {
    for (const artifact of arrayOf(manifest.artifacts)) {
      if (artifact.kind !== "source" && artifact.status !== "skipped") artifact.status = "stale";
    }
    for (const job of arrayOf(manifest.jobs)) {
      if (!new Set(["failed", "cancelled", "rejected"]).has(job.status)) job.status = "stale";
    }
    manifest.risks ??= [];
    manifest.risks.push({
      riskId: `RISK-FORMAT-${String(manifest.risks.length + 1).padStart(3, "0")}`,
      severity: "high",
      stage: "ingest",
      status: "open",
      description: `项目画幅/输出规格已改为 ${aspectRatio} ${fps}fps ${generationResolution}，所有非源制品需要重新对账`,
      mitigation: "重新生成或复审导演、分镜、关键帧、视频和剪辑后关闭本风险"
    });
  }
  return { changed, format: manifest.project.format };
}

export function registerArtifact(manifest, manifestPath, input) {
  const id = ensureId(input.id, "artifact id");
  if (!ARTIFACT_KINDS.has(input.kind)) throw new Error(`无效 artifact kind: ${input.kind}`);
  const targetStored = storedPath(manifestPath, input.path);
  const targetHash = hashPath(path.resolve(input.path), manifestPath);
  const existingIndex = arrayOf(manifest.artifacts).findIndex((artifact) => artifact.id === id);
  const next = {
    id,
    kind: input.kind,
    stage: input.stage,
    producer: input.producer ?? "manual",
    path: targetStored,
    episodes: input.episodes ?? "all",
    dependsOn: input.dependsOn ?? [],
    status: targetHash ? "review" : "missing",
    sha256: targetHash,
    approvedSha256: null,
    approvedDependencyHashes: {},
    updatedAt: now(),
    notes: isFilled(input.note) ? [input.note] : []
  };
  if (existingIndex >= 0) manifest.artifacts[existingIndex] = next;
  else manifest.artifacts.push(next);
  return next;
}

export function approveArtifact(manifest, manifestPath, id, by, note = "") {
  const artifacts = artifactMap(manifest);
  const artifact = artifacts.get(id);
  if (!artifact) throw new Error(`找不到 artifact: ${id}`);
  const hash = currentArtifactHash(manifestPath, artifact);
  if (!hash) throw new Error(`artifact 文件不存在: ${artifact.path}`);
  const dependencyHashes = {};
  for (const dependencyId of arrayOf(artifact.dependsOn)) {
    const dependency = artifacts.get(dependencyId);
    if (!dependency) throw new Error(`缺少依赖 artifact: ${dependencyId}`);
    if (dependency.status !== "approved") throw new Error(`依赖 ${dependencyId} 尚未 approved，当前为 ${dependency.status}`);
    const dependencyHash = currentArtifactHash(manifestPath, dependency);
    if (!dependencyHash || dependencyHash !== dependency.approvedSha256) throw new Error(`依赖 ${dependencyId} 的文件或审批哈希不一致`);
    dependencyHashes[dependencyId] = dependencyHash;
  }
  artifact.sha256 = hash;
  artifact.approvedSha256 = hash;
  artifact.approvedDependencyHashes = dependencyHashes;
  artifact.status = "approved";
  artifact.updatedAt = now();
  if (isFilled(note)) artifact.notes.push(note);
  const approval = { approvalId: nextApprovalId(manifest), artifactId: id, by, at: now(), sha256: hash, dependencyHashes, note };
  manifest.approvals.push(approval);
  return approval;
}

export function addVoiceAsset(manifest, manifestPath, input) {
  const voiceAssetId = ensureId(input.voiceAssetId, "voiceAssetId");
  const targetStored = storedPath(manifestPath, input.path);
  const targetHash = hashPath(path.resolve(input.path), manifestPath);
  const existingIndex = arrayOf(manifest.voiceAssets).findIndex((asset) => asset.voiceAssetId === voiceAssetId);
  const asset = {
    voiceAssetId,
    characterId: input.characterId,
    path: targetStored,
    sha256: targetHash,
    approvedSha256: null,
    language: input.language ?? "zh",
    durationSeconds: input.durationSeconds,
    sampleType: input.sampleType ?? "voice-master",
    rights: input.rights ?? "unknown",
    licenseScope: input.licenseScope ?? (input.providerModel === "s2.1-pro-free" ? "evaluation-only" : "commercial"),
    provider: input.provider ?? "manual",
    providerModel: input.providerModel ?? null,
    providerVoiceId: input.providerVoiceId ?? null,
    sourceType: input.sourceType ?? "manual",
    generatedAt: input.generatedAt ?? null,
    generationSha256: input.generationSha256 ?? targetHash,
    status: targetHash ? "draft" : "missing",
    notes: input.notes ?? ""
  };
  if (existingIndex >= 0) manifest.voiceAssets[existingIndex] = asset;
  else manifest.voiceAssets.push(asset);
  return asset;
}

export function approveVoiceAsset(manifest, manifestPath, id, by, note = "") {
  const asset = voiceMap(manifest).get(id);
  if (!asset) throw new Error(`找不到 voice asset: ${id}`);
  if (asset.rights === "unknown") throw new Error(`声音资产 ${id} 的 rights 不能为 unknown`);
  if (!isNumber(asset.durationSeconds) || asset.durationSeconds < 2 || asset.durationSeconds > 15) throw new Error(`声音资产 ${id} 时长必须为 2–15 秒`);
  const hash = currentVoiceHash(manifestPath, asset);
  if (!hash) throw new Error(`声音文件不存在: ${asset.path}`);
  asset.sha256 = hash;
  asset.approvedSha256 = hash;
  asset.status = "approved";
  const approval = { approvalId: nextApprovalId(manifest), voiceAssetId: id, by, at: now(), sha256: hash, dependencyHashes: {}, note };
  manifest.approvals.push(approval);
  return approval;
}

export function addJob(manifest, manifestPath, input) {
  const jobId = ensureId(input.jobId, "jobId");
  const existingIndex = arrayOf(manifest.jobs).findIndex((job) => job.jobId === jobId);
  const job = {
    jobId,
    episode: input.episode,
    clipId: input.clipId,
    model: input.model ?? "MiniMax-H3",
    mode: input.mode ?? "h3-ref2va",
    duration: input.duration,
    sequence: input.sequence ?? arrayOf(manifest.jobs).length + 1,
    ratio: input.ratio ?? (new Set(["h3-i2va", "h3-fl2va"]).has(input.mode) ? "adaptive" : manifest.project.format.aspectRatio),
    resolution: input.resolution ?? manifest.project.format.generationResolution ?? "768P",
    provider: input.provider ?? manifest.policies.videoProvider ?? "minimax-official",
    dialogueRoute: input.dialogueRoute ?? manifest.policies.defaultDialogueRoute,
    ambienceRoute: input.ambienceRoute ?? manifest.policies.ambienceRoute,
    musicRoute: input.musicRoute ?? manifest.policies.musicRoute,
    promptPath: input.promptPath ? storedPath(manifestPath, input.promptPath) : "",
    dependsOn: input.dependsOn ?? [],
    references: [],
    speakers: [],
    costApproved: false,
    status: "planned",
    outputPath: input.outputPath ? storedPath(manifestPath, input.outputPath) : "",
    inputHashes: {},
    inputVoiceHashes: {},
    attempt: 0,
    qc: { status: "pending", issues: [] }
  };
  if (existingIndex >= 0) manifest.jobs[existingIndex] = job;
  else manifest.jobs.push(job);
  return job;
}

export function syncJobsFromStoryboard(manifest, manifestPath, board, boardPath, input = {}) {
  if (board?.aspectRatio !== manifest.project?.format?.aspectRatio) throw new Error(`storyboard 画幅 ${board?.aspectRatio ?? "缺失"} 与 production ${manifest.project?.format?.aspectRatio ?? "缺失"} 不一致`);
  const dependsOn = input.dependsOn ?? [];
  const outputDir = path.resolve(input.outputDir ?? path.join(path.dirname(manifestPath), "video"));
  const synced = [];
  let sequence = 0;
  for (const episode of arrayOf(board?.episodes)) for (const segment of arrayOf(episode?.segments)) {
    sequence += 1;
    const jobId = input.prefix ? `${input.prefix}-${segment.id}` : `H3-${segment.id}`;
    const existing = arrayOf(manifest.jobs).find((job) => job.jobId === jobId);
    if (existing && new Set(["submitted", "running", "succeeded"]).has(existing.status)) throw new Error(`拒绝覆盖已提交/完成任务 ${jobId}`);
    const promptAbsolute = path.resolve(path.dirname(boardPath), segment.promptPath);
    const outputAbsolute = path.join(outputDir, `${segment.id}.mp4`);
    const job = addJob(manifest, manifestPath, {
      jobId,
      episode: episode.ep,
      clipId: segment.sourceClipId ?? segment.id,
      model: "MiniMax-H3",
      mode: segment.generationMode?.startsWith("h3-") ? segment.generationMode : "h3-ref2va",
      duration: arrayOf(segment.cuts).reduce((sum, cut) => sum + Number(cut?.seconds ?? 0), 0),
      sequence,
      ratio: new Set(["h3-i2va", "h3-fl2va"]).has(segment.generationMode) ? "adaptive" : manifest.project.format.aspectRatio,
      resolution: input.resolution ?? manifest.project.format.generationResolution,
      provider: input.provider ?? manifest.policies.videoProvider ?? "minimax-official",
      dialogueRoute: arrayOf(segment.speakerBindings).length ? "h3-native-reference" : manifest.policies.defaultDialogueRoute,
      promptPath: promptAbsolute,
      outputPath: outputAbsolute,
      dependsOn
    });
    job.references = arrayOf(segment.references).map((reference) => {
      if (!isFilled(reference?.path)) return structuredClone(reference);
      const absolute = path.isAbsolute(reference.path) ? path.normalize(reference.path) : path.resolve(path.dirname(boardPath), reference.path);
      return { ...structuredClone(reference), path: storedPath(manifestPath, absolute) };
    });
    job.speakers = structuredClone(arrayOf(segment.speakerBindings));
    job.sourceStoryboard = storedPath(manifestPath, boardPath);
    synced.push(job);
  }
  return synced;
}

export function quantizeH3Duration(seconds, policy = "nearest", provider = "minimax-official") {
  if (!VIDEO_PROVIDERS.has(provider)) throw new Error(`未知视频提供方：${provider}`);
  const maximum = provider === "compshare" ? 30 : 15;
  const source = Number(seconds);
  if (!Number.isFinite(source) || source <= 0 || source > maximum) throw new Error(`H3 源时长必须在 0–${maximum} 秒，收到 ${seconds}`);
  const quantizers = { nearest: Math.round, floor: Math.floor, ceil: Math.ceil };
  const quantize = quantizers[policy];
  if (!quantize) throw new Error("duration policy 必须为 nearest、floor 或 ceil");
  return Math.max(4, Math.min(maximum, quantize(source)));
}

function resolvePackageEntryPath(value, packagePath, manifestPath) {
  if (!isFilled(value)) return null;
  if (path.isAbsolute(value)) return path.normalize(value);
  const candidates = [
    path.resolve(path.dirname(packagePath), value),
    path.resolve(path.dirname(manifestPath), value)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export function syncJobsFromH3Package(manifest, manifestPath, packageManifest, packagePath, input = {}) {
  if (!Array.isArray(packageManifest)) throw new Error("H3 package manifest 根节点必须是数组");
  const selected = arrayOf(input.segments);
  if (!selected.length) throw new Error("必须显式指定至少一个 --segments；默认不批量同步付费任务");
  if (selected.length > (manifest.policies?.pilotJobs ?? 1) && !input.allowBatch) throw new Error(`一次最多同步 ${manifest.policies?.pilotJobs ?? 1} 个样片任务；批量需显式 --allow-batch`);
  const bySegment = new Map(packageManifest.map((item) => [item?.segment, item]));
  const provider = input.provider ?? manifest.policies?.videoProvider ?? "minimax-official";
  if (!VIDEO_PROVIDERS.has(provider)) throw new Error(`provider 必须为 ${[...VIDEO_PROVIDERS].join(" 或 ")}`);
  const outputDir = path.resolve(input.outputDir ?? path.join(path.dirname(manifestPath), "video"));
  const durationPolicy = input.durationPolicy ?? "nearest";
  const dependsOn = input.dependsOn ?? [];
  const synced = [];
  for (const segmentId of selected) {
    const item = bySegment.get(segmentId);
    if (!item) throw new Error(`H3 package 中找不到片段 ${segmentId}`);
    if (arrayOf(item.missing).length) throw new Error(`${segmentId} 仍缺 ${arrayOf(item.missing).length} 张参考图，拒绝建立投产任务`);
    const pictures = arrayOf(item.pictures);
    if (!pictures.length || pictures.length > 9) throw new Error(`${segmentId} 参考图数量必须为 1–9 张`);
    const promptAbsolute = resolvePackageEntryPath(item.prompt, packagePath, manifestPath);
    if (!fs.existsSync(promptAbsolute)) throw new Error(`${segmentId} 提示词不存在: ${promptAbsolute}`);
    const pictureAbsolutes = pictures.map((picture) => resolvePackageEntryPath(picture, packagePath, manifestPath));
    for (const picture of pictureAbsolutes) if (!fs.existsSync(picture)) throw new Error(`${segmentId} 参考图不存在: ${picture}`);
    const sourceDuration = Number(item.seconds);
    const duration = input.duration == null ? quantizeH3Duration(sourceDuration, durationPolicy, provider) : quantizeH3Duration(input.duration, "nearest", provider);
    const match = /^E(\d+)-/.exec(segmentId);
    if (!match) throw new Error(`片段号必须采用 E01-01 格式: ${segmentId}`);
    const prompt = fs.readFileSync(promptAbsolute, "utf8");
    const hasDialogue = /<d>[\s\S]*?<\/d>/i.test(prompt);
    const jobId = `${input.prefix ?? (provider === "compshare" ? "H3CS" : "H3")}-${segmentId}`;
    const existing = arrayOf(manifest.jobs).find((job) => job.jobId === jobId);
    if (existing && new Set(["submitted", "running", "succeeded"]).has(existing.status)) throw new Error(`拒绝覆盖已提交/完成任务 ${jobId}`);
    const job = addJob(manifest, manifestPath, {
      jobId,
      episode: Number(match[1]),
      clipId: segmentId,
      model: "MiniMax-H3",
      mode: "h3-ref2va",
      duration,
      sequence: Number(item.sequence ?? arrayOf(manifest.jobs).length + 1),
      ratio: manifest.project.format.aspectRatio,
      resolution: input.resolution ?? manifest.project.format.generationResolution,
      provider,
      dialogueRoute: input.dialogueRoute ?? (hasDialogue ? manifest.policies.defaultDialogueRoute : "silent"),
      promptPath: promptAbsolute,
      outputPath: path.join(outputDir, `${segmentId}.mp4`),
      dependsOn
    });
    job.references = pictureAbsolutes.map((picture, index) => ({ refId: `PIC-${index + 1}`, role: "reference_image", path: storedPath(manifestPath, picture) }));
    job.sourceDurationSeconds = sourceDuration;
    job.durationAdjustmentSeconds = Number((duration - sourceDuration).toFixed(3));
    job.durationPolicy = durationPolicy;
    job.sourcePackage = storedPath(manifestPath, packagePath);
    synced.push(job);
  }
  return synced;
}

function relativeToFile(fromFile, targetFile) {
  const relative = normalizeSlashes(path.relative(path.dirname(fromFile), targetFile));
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function exportCompShareJob(manifest, manifestPath, id, outPath, input = {}) {
  const realityErrors = realityGate(manifest, manifestPath);
  if (realityErrors.length) throw new Error(realityErrors.join('\n'));
  const job = arrayOf(manifest.jobs).find((item) => item.jobId === id);
  if (!job) throw new Error(`找不到 job: ${id}`);
  if (job.provider !== "compshare") throw new Error(`${id} 的 provider 不是 compshare`);
  const images = arrayOf(job.references).filter((ref) => ref?.role === "reference_image");
  if (!images.length || images.length > 9) throw new Error(`${id} 需要 1–9 张 reference_image`);
  if (arrayOf(job.references).some((ref) => ref?.role !== "reference_image")) throw new Error("当前 CompShare 客户端只导出参考图任务；声音/视频参考需使用对应适配器");
  const promptAbsolute = resolveStoredPath(manifestPath, job.promptPath);
  const outputAbsolute = resolveStoredPath(manifestPath, job.outputPath);
  if (!promptAbsolute || !fs.existsSync(promptAbsolute)) throw new Error(`提示词不存在: ${job.promptPath}`);
  const referenceImages = images.map((ref) => {
    const absolute = resolveStoredPath(manifestPath, ref.path);
    if (!absolute || !fs.existsSync(absolute)) throw new Error(`参考图不存在: ${ref.path}`);
    return { role: "reference_image", path: relativeToFile(outPath, absolute) };
  });
  const exported = {
    schemaVersion: "1.0",
    integrityVersion: 1,
    realityAudit: (() => {
      const auditPath = path.resolve(path.dirname(manifestPath), manifest.policies?.realityAuditPath || 'reality-audit.json');
      return fs.existsSync(auditPath) ? { path: relativeToFile(outPath, auditPath), sha256: crypto.createHash('sha256').update(fs.readFileSync(auditPath)).digest('hex') } : null;
    })(),
    provider: "compshare",
    sourceJobId: job.jobId,
    sourceStatus: job.status,
    costApproved: job.costApproved === true,
    segment: job.clipId,
    promptFile: relativeToFile(outPath, promptAbsolute),
    promptSuffix: input.promptSuffix ?? COMPSHARE_CLEAN_SUFFIX,
    resolution: job.resolution,
    ratio: job.ratio,
    duration: job.duration,
    sourceDurationSeconds: job.sourceDurationSeconds ?? job.duration,
    durationAdjustmentSeconds: job.durationAdjustmentSeconds ?? 0,
    useContextIr: job.useContextIr === true,
    minimumReferences: referenceImages.length,
    referenceImages,
    aigcWatermark: false,
    output: relativeToFile(outPath, outputAbsolute)
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
  job.externalJobPath = storedPath(manifestPath, outPath);
  return exported;
}

export function approveJob(manifest, manifestPath, id, by, note = "") {
  const realityErrors = realityGate(manifest, manifestPath);
  if (realityErrors.length) throw new Error(realityErrors.join('\n'));
  const job = arrayOf(manifest.jobs).find((item) => item.jobId === id);
  if (!job) throw new Error(`找不到 job: ${id}`);
  const artifacts = artifactMap(manifest);
  const voices = voiceMap(manifest);
  const inputHashes = {};
  for (const dependencyId of arrayOf(job.dependsOn)) {
    const dependency = artifacts.get(dependencyId);
    if (!dependency || dependency.status !== "approved") throw new Error(`任务依赖 ${dependencyId} 尚未 approved`);
    const dependencyHash = currentArtifactHash(manifestPath, dependency);
    if (!dependencyHash || dependencyHash !== dependency.approvedSha256) throw new Error(`任务依赖 ${dependencyId} 文件已变化`);
    inputHashes[dependencyId] = dependencyHash;
  }
  const inputVoiceHashes = {};
  for (const speaker of arrayOf(job.speakers)) {
    if (!isFilled(speaker.voiceAssetId)) continue;
    const voice = voices.get(speaker.voiceAssetId);
    if (!voice || voice.status !== "approved") throw new Error(`任务声音资产 ${speaker.voiceAssetId} 尚未 approved`);
    const voiceHash = currentVoiceHash(manifestPath, voice);
    if (!voiceHash || voiceHash !== voice.approvedSha256) throw new Error(`任务声音资产 ${speaker.voiceAssetId} 文件已变化`);
    inputVoiceHashes[speaker.voiceAssetId] = voiceHash;
  }
  job.inputHashes = inputHashes;
  job.inputVoiceHashes = inputVoiceHashes;
  job.costApproved = true;
  job.status = "approved";
  const approval = { approvalId: nextApprovalId(manifest), jobId: id, by, at: now(), sha256: null, dependencyHashes: { ...inputHashes, ...inputVoiceHashes }, note };
  manifest.approvals.push(approval);
  return approval;
}

function dependencyCycles(artifacts) {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function visit(id, chain) {
    if (visiting.has(id)) {
      const start = chain.indexOf(id);
      cycles.push([...chain.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const artifact = byId.get(id);
    for (const dependency of arrayOf(artifact?.dependsOn)) if (byId.has(dependency)) visit(dependency, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const artifact of artifacts) visit(artifact.id, []);
  return cycles;
}

export function refreshManifest(manifest, manifestPath) {
  const artifacts = artifactMap(manifest);
  for (const artifact of arrayOf(manifest.artifacts)) {
    const hash = currentArtifactHash(manifestPath, artifact);
    artifact.sha256 = hash;
    artifact.updatedAt = now();
    if (!hash) {
      artifact.status = artifact.status === "skipped" ? "skipped" : "missing";
      continue;
    }
    let dependencyChanged = false;
    for (const dependencyId of arrayOf(artifact.dependsOn)) {
      const dependency = artifacts.get(dependencyId);
      const dependencyHash = dependency ? currentArtifactHash(manifestPath, dependency) : null;
      if (!dependency || !dependencyHash || artifact.approvedDependencyHashes?.[dependencyId] !== dependencyHash || dependency.status !== "approved") dependencyChanged = true;
    }
    if (artifact.approvedSha256) {
      if (dependencyChanged) artifact.status = "stale";
      else if (artifact.approvedSha256 !== hash) artifact.status = "review";
      else artifact.status = "approved";
    } else if (!new Set(["working", "blocked", "failed", "skipped"]).has(artifact.status)) {
      artifact.status = "review";
    }
  }

  for (const asset of arrayOf(manifest.voiceAssets)) {
    const hash = currentVoiceHash(manifestPath, asset);
    asset.sha256 = hash;
    if (!hash) asset.status = "missing";
    else if (asset.approvedSha256 && asset.approvedSha256 === hash) asset.status = "approved";
    else if (asset.status === "approved") asset.status = "draft";
    else if (asset.status === "missing") asset.status = "draft";
  }

  const voices = voiceMap(manifest);
  for (const job of arrayOf(manifest.jobs)) {
    if (!new Set(["approved", "submitted", "running", "succeeded"]).has(job.status)) continue;
    let changed = false;
    for (const dependencyId of arrayOf(job.dependsOn)) {
      const dependency = artifacts.get(dependencyId);
      const hash = dependency ? currentArtifactHash(manifestPath, dependency) : null;
      if (!dependency || dependency.status !== "approved" || job.inputHashes?.[dependencyId] !== hash) changed = true;
    }
    for (const speaker of arrayOf(job.speakers)) {
      if (!isFilled(speaker.voiceAssetId)) continue;
      const voice = voices.get(speaker.voiceAssetId);
      const hash = voice ? currentVoiceHash(manifestPath, voice) : null;
      if (!voice || voice.status !== "approved" || job.inputVoiceHashes?.[speaker.voiceAssetId] !== hash) changed = true;
    }
    if (changed) job.status = "stale";
  }
  return manifest;
}

function validateH3Job(job, index, manifest, manifestPath, errors, warnings) {
  const at = `$.jobs[${index}]`;
  if (!H3_MODES.has(job.mode)) issue(errors, "JOB_MODE", `${at}.mode`, "H3 mode 枚举无效");
  const maximumDuration = job.provider === "compshare" ? 30 : 15;
  if (!Number.isInteger(job.duration) || job.duration < 4 || job.duration > maximumDuration) issue(errors, "H3_DURATION", `${at}.duration`, `H3 任务时长必须为 4–${maximumDuration} 秒整数`);
  if (!DIALOGUE_ROUTES.has(job.dialogueRoute)) issue(errors, "DIALOGUE_ROUTE", `${at}.dialogueRoute`, "dialogueRoute 枚举无效");
  if (!GENERATION_RESOLUTIONS.has(job.resolution)) issue(errors, "JOB_RESOLUTION", `${at}.resolution`, "H3 resolution 必须为 768P 或 2K");
  if (job.ratio !== "adaptive" && !ASPECT_PRESETS[job.ratio]) issue(errors, "JOB_RATIO", `${at}.ratio`, "H3 ratio 枚举无效");
  if (!VIDEO_PROVIDERS.has(job.provider)) issue(errors, "JOB_PROVIDER", `${at}.provider`, `provider 必须为 ${[...VIDEO_PROVIDERS].join(" 或 ")}`);
  if (job.useContextIr !== undefined && typeof job.useContextIr !== "boolean") issue(errors, "CONTEXT_IR_TYPE", `${at}.useContextIr`, "useContextIr 必须为布尔值");
  const contextIrPolicy = manifest.policies?.contextIrPolicy ?? "pilot";
  if (contextIrPolicy === "off" && job.useContextIr === true) issue(errors, "CONTEXT_IR_POLICY", `${at}.useContextIr`, "项目策略为 off，不允许启用 Context-IR");
  if (contextIrPolicy === "on" && job.useContextIr !== true) issue(warnings, "CONTEXT_IR_POLICY", `${at}.useContextIr`, "项目策略为 on，但该任务未显式启用 Context-IR");
  const refs = arrayOf(job.references);
  const byRole = (role) => refs.filter((ref) => ref?.role === role);
  const images = byRole("reference_image");
  const videos = byRole("reference_video");
  const audios = byRole("reference_audio");
  const firstFrames = byRole("first_frame");
  const lastFrames = byRole("last_frame");
  refs.forEach((ref, refIndex) => {
    const refAt = `${at}.references[${refIndex}]`;
    if (!isObject(ref)) {
      issue(errors, "REFERENCE_TYPE", refAt, "reference 必须是对象");
      return;
    }
    requireText(errors, ref.refId, `${refAt}.refId`, "refId");
    if (!REFERENCE_ROLES.has(ref.role)) issue(errors, "REFERENCE_ROLE", `${refAt}.role`, "reference role 枚举无效");
    if (Boolean(isFilled(ref.path)) === Boolean(isFilled(ref.url))) issue(errors, "REFERENCE_SOURCE", refAt, "reference 必须且只能提供 path 或 url 之一");
    if (isFilled(ref.url) && !/^https?:\/\//i.test(ref.url)) issue(errors, "REFERENCE_URL", `${refAt}.url`, "reference url 必须为 HTTP(S)");
    if (ref.role === "reference_audio" || ref.role === "reference_video") {
      if (!isNumber(ref.durationSeconds) || ref.durationSeconds < 2 || ref.durationSeconds > 15) issue(errors, "REFERENCE_DURATION", `${refAt}.durationSeconds`, "音频/视频参考时长必须为 2–15 秒");
    }
    if (ref.role === "reference_audio" && !AUDIO_RELATIONS.has(ref.relation)) issue(errors, "AUDIO_RELATION", `${refAt}.relation`, "reference_audio 需要有效 relation");
  });

  if (images.length > 9) issue(errors, "H3_IMAGE_COUNT", `${at}.references`, "H3 参考图最多 9 张");
  if (videos.length > 3) issue(errors, "H3_VIDEO_COUNT", `${at}.references`, "H3 参考视频最多 3 条");
  if (audios.length > 3) issue(errors, "H3_AUDIO_COUNT", `${at}.references`, "H3 参考音频最多 3 条");
  if (refs.length > 12) issue(errors, "H3_REFERENCE_TOTAL", `${at}.references`, "H3 全部参考文件合计最多 12 个");
  const videoSeconds = videos.reduce((sum, ref) => sum + (isNumber(ref.durationSeconds) ? ref.durationSeconds : 0), 0);
  const audioSeconds = audios.reduce((sum, ref) => sum + (isNumber(ref.durationSeconds) ? ref.durationSeconds : 0), 0);
  if (videoSeconds > 15) issue(errors, "H3_VIDEO_SECONDS", `${at}.references`, "H3 参考视频总时长最多 15 秒");
  if (audioSeconds > 15) issue(errors, "H3_AUDIO_SECONDS", `${at}.references`, "H3 参考音频总时长最多 15 秒");
  if (audios.length > 0 && images.length + videos.length === 0) issue(errors, "H3_AUDIO_ONLY", `${at}.references`, "H3 参考音频必须同时配合参考图或参考视频");

  const hasReference = images.length + videos.length + audios.length > 0;
  const hasFrame = firstFrames.length + lastFrames.length > 0;
  if (hasReference && hasFrame) issue(errors, "H3_MODE_MIX", `${at}.references`, "H3 参考模式与首帧/尾帧模式互斥");
  if (job.mode === "h3-ref2va" && (!hasReference || hasFrame)) issue(errors, "H3_REF2VA_INPUT", `${at}.mode`, "h3-ref2va 需要参考输入且不能含首尾帧");
  if (job.mode === "h3-t2va" && refs.length > 0) issue(errors, "H3_T2VA_INPUT", `${at}.references`, "h3-t2va 不应包含参考文件");
  if (job.mode === "h3-i2va" && (firstFrames.length + lastFrames.length !== 1 || hasReference)) issue(errors, "H3_I2VA_INPUT", `${at}.references`, "h3-i2va 需要且仅需要一个 first_frame 或 last_frame");
  if (job.mode === "h3-fl2va" && (firstFrames.length !== 1 || lastFrames.length !== 1 || hasReference)) issue(errors, "H3_FL2VA_INPUT", `${at}.references`, "h3-fl2va 需要一张 first_frame 与一张 last_frame");
  if (new Set(["h3-i2va", "h3-fl2va"]).has(job.mode) && job.ratio !== "adaptive") issue(errors, "H3_FRAME_RATIO", `${at}.ratio`, "首帧/尾帧模式的 ratio 必须为 adaptive，实际画幅由输入图决定");
  if (job.mode === "h3-ref2va" && job.ratio !== manifest.project?.format?.aspectRatio) issue(errors, "H3_PROJECT_RATIO", `${at}.ratio`, `Ref2VA 任务必须继承项目画幅 ${manifest.project?.format?.aspectRatio}`);

  const voices = voiceMap(manifest);
  const refById = new Map(refs.map((ref) => [ref?.refId, ref]));
  const speakers = arrayOf(job.speakers);
  if (job.dialogueRoute === "h3-native-reference") {
    if (job.mode !== "h3-ref2va") issue(errors, "VOICE_MODE", `${at}.dialogueRoute`, "h3-native-reference 必须使用 h3-ref2va");
    if (speakers.length === 0) issue(errors, "VOICE_SPEAKERS", `${at}.speakers`, "h3-native-reference 至少需要一位 speaker");
    for (let speakerIndex = 0; speakerIndex < speakers.length; speakerIndex += 1) {
      const speaker = speakers[speakerIndex];
      const speakerAt = `${at}.speakers[${speakerIndex}]`;
      requireText(errors, speaker.characterId, `${speakerAt}.characterId`, "characterId");
      if (!/^S[1-9][0-9]*$/.test(speaker.speakerId ?? "")) issue(errors, "SPEAKER_ID", `${speakerAt}.speakerId`, "speakerId 必须采用 S1、S2…");
      const voice = voices.get(speaker.voiceAssetId);
      if (!voice || voice.status !== "approved") issue(errors, "VOICE_NOT_APPROVED", `${speakerAt}.voiceAssetId`, `声音资产 ${speaker.voiceAssetId ?? ""} 尚未 approved`);
      const audioRef = refById.get(speaker.audioRefId);
      if (!audioRef || audioRef.role !== "reference_audio" || audioRef.voiceAssetId !== speaker.voiceAssetId) issue(errors, "VOICE_BINDING", `${speakerAt}.audioRefId`, "speaker 必须绑定同一 voiceAssetId 的 reference_audio");
      if (audioRef && audioRef.relation !== "reference") issue(errors, "VOICE_RELATION", `${speakerAt}.audioRefId`, "声音母版生成新台词时 relation 必须为 reference");
    }
  }

  if (job.dialogueRoute === "tts-guided-h3") {
    if (job.mode !== "h3-ref2va" || audios.length === 0) issue(errors, "TTS_GUIDED_INPUT", at, "tts-guided-h3 必须使用含参考音频的 h3-ref2va");
    if (!audios.some((ref) => new Set(["partially_copy", "fully_copy"]).has(ref.relation))) issue(errors, "TTS_GUIDED_RELATION", `${at}.references`, "tts-guided-h3 至少一条音频应为 partially_copy 或 fully_copy");
  }

  const promptFile = resolveStoredPath(manifestPath, job.promptPath);
  if (promptFile && fs.existsSync(promptFile) && fs.statSync(promptFile).isFile()) {
    const prompt = fs.readFileSync(promptFile, "utf8");
    const hasDialogueBlock = /<d>[\s\S]*?<\/d>/i.test(prompt);
    if (new Set(["tts-post", "silent"]).has(job.dialogueRoute) && hasDialogueBlock) issue(errors, "DUPLICATE_DIALOGUE", `${at}.promptPath`, `${job.dialogueRoute} 不得在 H3 提示词中包含 <d> 对白`);
    if (new Set(["h3-native-reference", "h3-native-free", "tts-guided-h3"]).has(job.dialogueRoute) && speakers.length > 0 && !hasDialogueBlock) issue(warnings, "DIALOGUE_BLOCK_MISSING", `${at}.promptPath`, "存在说话人但提示词没有 <d> 对白块");
  } else if (isFilled(job.promptPath)) {
    issue(errors, "PROMPT_MISSING", `${at}.promptPath`, `提示词文件不存在: ${job.promptPath}`);
  }

  if (job.musicRoute === "h3-native") issue(warnings, "NATIVE_MUSIC_CONTINUITY", `${at}.musicRoute`, "多片段 H3 原生配乐可能产生连续性问题，系列短剧建议 post");
  if (new Set(["submitted", "running", "succeeded"]).has(job.status) && !job.costApproved) issue(errors, "COST_APPROVAL", `${at}.costApproved`, "已提交或完成的付费任务必须有成本授权");
  if (job.status === "succeeded") {
    const output = resolveStoredPath(manifestPath, job.outputPath);
    if (!output || !fs.existsSync(output)) issue(errors, "OUTPUT_MISSING", `${at}.outputPath`, "succeeded 任务缺少输出文件");
  }
  if (new Set(["approved", "submitted", "running", "succeeded"]).has(job.status)) {
    const artifacts = artifactMap(manifest);
    for (const dependencyId of arrayOf(job.dependsOn)) {
      const dependency = artifacts.get(dependencyId);
      if (!dependency || dependency.status !== "approved") issue(errors, "JOB_DEPENDENCY", `${at}.dependsOn`, `任务依赖 ${dependencyId} 尚未 approved`);
      else if (job.inputHashes?.[dependencyId] !== dependency.sha256) issue(errors, "JOB_INPUT_HASH", `${at}.inputHashes`, `任务的 ${dependencyId} 输入哈希已过期`);
    }
  }
}

export function validateManifest(manifest, manifestPath) {
  const errors = [];
  const warnings = [];
  const stats = { artifacts: 0, approvedArtifacts: 0, staleArtifacts: 0, voiceAssets: 0, jobs: 0, approvedJobs: 0, openRisks: 0 };
  if (!isObject(manifest)) {
    issue(errors, "ROOT_TYPE", "$", "production.json 根节点必须是对象");
    return { ok: false, errors, warnings, stats };
  }
  if (manifest.schemaVersion !== "1.0") issue(errors, "SCHEMA_VERSION", "$.schemaVersion", "schemaVersion 必须为 1.0");
  for (const message of realityGate(manifest, manifestPath)) issue(errors, "REALITY_NOT_READY", "$.policies.realityAuditPath", message);
  if (!isObject(manifest.project)) issue(errors, "PROJECT", "$.project", "project 必须是对象");
  else {
    requireText(errors, manifest.project.id, "$.project.id", "project.id");
    requireText(errors, manifest.project.title, "$.project.title", "project.title");
    requireText(errors, manifest.project.format?.aspectRatio, "$.project.format.aspectRatio", "aspectRatio");
    if (!isNumber(manifest.project.format?.fps) || manifest.project.format.fps <= 0) issue(errors, "FPS", "$.project.format.fps", "fps 必须是正数");
    const format = manifest.project.format ?? {};
    const preset = ASPECT_PRESETS[format.aspectRatio];
    if (!preset) issue(errors, "ASPECT_RATIO", "$.project.format.aspectRatio", `项目画幅必须为 ${Object.keys(ASPECT_PRESETS).join(", ")}`);
    else {
      for (const key of ["orientation", "deliveryWidth", "deliveryHeight", "compositionProfile"]) if (format[key] !== preset[key]) issue(errors, "FORMAT_CONTRACT", `$.project.format.${key}`, `${format.aspectRatio} 的 ${key} 必须为 ${preset[key]}`);
      if (JSON.stringify(format.safeArea) !== JSON.stringify(preset.safeArea)) issue(errors, "FORMAT_SAFE_AREA", "$.project.format.safeArea", `${format.aspectRatio} 安全区合同不匹配`);
    }
    if (!GENERATION_RESOLUTIONS.has(format.generationResolution)) issue(errors, "GENERATION_RESOLUTION", "$.project.format.generationResolution", "generationResolution 必须为 768P 或 2K");
  }
  if (!isObject(manifest.policies)) issue(errors, "POLICIES", "$.policies", "policies 必须是对象");
  else {
    if (!DIALOGUE_ROUTES.has(manifest.policies.defaultDialogueRoute)) issue(errors, "DEFAULT_DIALOGUE_ROUTE", "$.policies.defaultDialogueRoute", "默认对白路线无效");
    if (!VIDEO_PROVIDERS.has(manifest.policies.videoProvider ?? "minimax-official")) issue(errors, "VIDEO_PROVIDER", "$.policies.videoProvider", `视频提供方必须为 ${[...VIDEO_PROVIDERS].join(" 或 ")}`);
    if (!Number.isInteger(manifest.policies.batchEpisodes) || manifest.policies.batchEpisodes < 1) issue(errors, "BATCH_EPISODES", "$.policies.batchEpisodes", "batchEpisodes 必须为正整数");
    if (!Number.isInteger(manifest.policies.pilotJobs) || manifest.policies.pilotJobs < 1) issue(errors, "PILOT_JOBS", "$.policies.pilotJobs", "pilotJobs 必须为正整数");
    const contextIrPolicy = manifest.policies.contextIrPolicy ?? "pilot";
    if (!CONTEXT_IR_POLICIES.has(contextIrPolicy)) issue(errors, "CONTEXT_IR_POLICY", "$.policies.contextIrPolicy", "contextIrPolicy 必须为 off、pilot、selective 或 on");
    if (manifest.policies.contextIrPolicy === undefined) issue(warnings, "CONTEXT_IR_POLICY_LEGACY", "$.policies.contextIrPolicy", "旧项目未登记 Context-IR 策略，按 pilot 解释");
  }

  const artifacts = arrayOf(manifest.artifacts);
  stats.artifacts = artifacts.length;
  const artifactIds = new Set();
  artifacts.forEach((artifact, index) => {
    const at = `$.artifacts[${index}]`;
    if (!isObject(artifact)) {
      issue(errors, "ARTIFACT_TYPE", at, "artifact 必须是对象");
      return;
    }
    requireText(errors, artifact.id, `${at}.id`, "artifact.id");
    if (artifactIds.has(artifact.id)) issue(errors, "DUPLICATE_ARTIFACT", `${at}.id`, `artifact id ${artifact.id} 重复`);
    artifactIds.add(artifact.id);
    if (!ARTIFACT_KINDS.has(artifact.kind)) issue(errors, "ARTIFACT_KIND", `${at}.kind`, "artifact kind 无效");
    requireText(errors, artifact.stage, `${at}.stage`, "artifact.stage");
    requireText(errors, artifact.path, `${at}.path`, "artifact.path");
    if (!ARTIFACT_STATUSES.has(artifact.status)) issue(errors, "ARTIFACT_STATUS", `${at}.status`, "artifact status 无效");
    if (!Array.isArray(artifact.dependsOn)) issue(errors, "ARTIFACT_DEPENDS", `${at}.dependsOn`, "dependsOn 必须是数组");
    if (artifact.status === "approved") {
      stats.approvedArtifacts += 1;
      if (!isFilled(artifact.approvedSha256) || artifact.sha256 !== artifact.approvedSha256) issue(errors, "ARTIFACT_APPROVAL_HASH", at, "approved artifact 的当前哈希与审批哈希不一致");
    }
    if (artifact.status === "stale") stats.staleArtifacts += 1;
    if (new Set(["missing", "stale", "blocked", "failed"]).has(artifact.status)) issue(warnings, "ARTIFACT_ATTENTION", at, `${artifact.id} 当前状态为 ${artifact.status}`);
  });
  artifacts.forEach((artifact, index) => arrayOf(artifact.dependsOn).forEach((dependency) => {
    if (!artifactIds.has(dependency)) issue(errors, "UNKNOWN_DEPENDENCY", `$.artifacts[${index}].dependsOn`, `依赖 ${dependency} 不存在`);
  }));
  for (const cycle of dependencyCycles(artifacts)) issue(errors, "DEPENDENCY_CYCLE", "$.artifacts", `制品依赖形成环：${cycle.join(" → ")}`);

  const voiceIds = new Set();
  const masterByCharacter = new Map();
  stats.voiceAssets = arrayOf(manifest.voiceAssets).length;
  arrayOf(manifest.voiceAssets).forEach((asset, index) => {
    const at = `$.voiceAssets[${index}]`;
    if (!isObject(asset)) {
      issue(errors, "VOICE_TYPE", at, "voice asset 必须是对象");
      return;
    }
    requireText(errors, asset.voiceAssetId, `${at}.voiceAssetId`, "voiceAssetId");
    if (voiceIds.has(asset.voiceAssetId)) issue(errors, "DUPLICATE_VOICE", `${at}.voiceAssetId`, `voiceAssetId ${asset.voiceAssetId} 重复`);
    voiceIds.add(asset.voiceAssetId);
    requireText(errors, asset.characterId, `${at}.characterId`, "characterId");
    requireText(errors, asset.path, `${at}.path`, "voice path");
    if (!VOICE_TYPES.has(asset.sampleType)) issue(errors, "VOICE_SAMPLE_TYPE", `${at}.sampleType`, "sampleType 无效");
    if (!RIGHTS.has(asset.rights)) issue(errors, "VOICE_RIGHTS", `${at}.rights`, "rights 无效");
    const licenseScope = asset.licenseScope ?? (asset.providerModel === "s2.1-pro-free" ? "evaluation-only" : "commercial");
    if (!asset.licenseScope) issue(warnings, "VOICE_LICENSE_SCOPE_LEGACY", `${at}.licenseScope`, `旧声音资产未登记范围，按 ${licenseScope} 解释；下次重制时补齐`);
    if (!VOICE_LICENSE_SCOPES.has(licenseScope)) issue(errors, "VOICE_LICENSE_SCOPE", `${at}.licenseScope`, "licenseScope 必须为 evaluation-only 或 commercial");
    if (asset.providerModel === "s2.1-pro-free" && licenseScope !== "evaluation-only") issue(errors, "FREE_VOICE_SCOPE", `${at}.licenseScope`, "s2.1-pro-free 资产只能是 evaluation-only");
    if (!VOICE_STATUSES.has(asset.status)) issue(errors, "VOICE_STATUS", `${at}.status`, "voice status 无效");
    if (!isNumber(asset.durationSeconds) || asset.durationSeconds < 2 || asset.durationSeconds > 15) issue(errors, "VOICE_DURATION", `${at}.durationSeconds`, "声音资产时长必须为 2–15 秒");
    if (asset.status === "approved") {
      if (asset.rights === "unknown") issue(errors, "VOICE_RIGHTS_UNKNOWN", `${at}.rights`, "approved 声音资产不得 rights=unknown");
      if (!asset.sha256 || asset.sha256 !== asset.approvedSha256) issue(errors, "VOICE_APPROVAL_HASH", at, "approved 声音资产的哈希不一致");
      if (licenseScope === "evaluation-only") issue(warnings, "VOICE_EVALUATION_ONLY", at, `${asset.voiceAssetId} 仅可用于内部评估/H3样片，商业交付前需重制`);
    }
    if (asset.sampleType === "voice-master" && asset.status === "approved") {
      if (masterByCharacter.has(asset.characterId)) issue(warnings, "MULTIPLE_VOICE_MASTERS", at, `${asset.characterId} 有多个 approved voice-master`);
      masterByCharacter.set(asset.characterId, asset.voiceAssetId);
    }
  });

  const jobIds = new Set();
  stats.jobs = arrayOf(manifest.jobs).length;
  arrayOf(manifest.jobs).forEach((job, index) => {
    const at = `$.jobs[${index}]`;
    if (!isObject(job)) {
      issue(errors, "JOB_TYPE", at, "job 必须是对象");
      return;
    }
    requireText(errors, job.jobId, `${at}.jobId`, "jobId");
    if (jobIds.has(job.jobId)) issue(errors, "DUPLICATE_JOB", `${at}.jobId`, `jobId ${job.jobId} 重复`);
    jobIds.add(job.jobId);
    if (!JOB_STATUSES.has(job.status)) issue(errors, "JOB_STATUS", `${at}.status`, "job status 无效");
    if (new Set(["approved", "submitted", "running", "succeeded"]).has(job.status)) stats.approvedJobs += 1;
    validateH3Job(job, index, manifest, manifestPath, errors, warnings);
  });
  arrayOf(manifest.jobs).forEach((job, index) => {
    if (job.experiment === undefined) return;
    const at = `$.jobs[${index}].experiment`;
    const experiment = isObject(job.experiment) ? job.experiment : {};
    if (!isObject(job.experiment)) issue(errors, "EXPERIMENT_TYPE", at, "experiment 必须是对象");
    requireText(errors, experiment.groupId, `${at}.groupId`, "groupId");
    requireText(errors, experiment.baselineJobId, `${at}.baselineJobId`, "baselineJobId");
    requireText(errors, experiment.hypothesis, `${at}.hypothesis`, "hypothesis");
    if (experiment.baselineJobId === job.jobId) issue(errors, "EXPERIMENT_SELF_BASELINE", `${at}.baselineJobId`, "baselineJobId 不能指向自身");
    else if (isFilled(experiment.baselineJobId) && !jobIds.has(experiment.baselineJobId)) issue(errors, "EXPERIMENT_BASELINE_UNKNOWN", `${at}.baselineJobId`, `找不到基线任务 ${experiment.baselineJobId}`);
    const variables = arrayOf(experiment.changedVariables);
    if (!Array.isArray(experiment.changedVariables) || variables.length === 0) issue(errors, "EXPERIMENT_VARIABLES", `${at}.changedVariables`, "changedVariables 必须是非空数组");
    variables.forEach((variable, variableIndex) => {
      if (!EXPERIMENT_VARIABLES.has(variable)) issue(errors, "EXPERIMENT_VARIABLE", `${at}.changedVariables[${variableIndex}]`, `未知实验变量 ${variable}`);
    });
    if (new Set(variables).size !== variables.length) issue(errors, "EXPERIMENT_VARIABLE_DUPLICATE", `${at}.changedVariables`, "changedVariables 不得重复");
    if (variables.length > 1) issue(warnings, "EXPERIMENT_CONFOUNDED", `${at}.changedVariables`, `同时改变 ${variables.length} 项，只能比较整体方案，不能作单变量因果结论`);
    if (experiment.result !== undefined) {
      const result = isObject(experiment.result) ? experiment.result : {};
      if (!isObject(experiment.result)) issue(errors, "EXPERIMENT_RESULT_TYPE", `${at}.result`, "result 必须是对象");
      if (result.winnerJobId !== null && result.winnerJobId !== undefined && !jobIds.has(result.winnerJobId)) issue(errors, "EXPERIMENT_WINNER_UNKNOWN", `${at}.result.winnerJobId`, `找不到胜出任务 ${result.winnerJobId}`);
      if (result.observedAdvantages !== undefined && !Array.isArray(result.observedAdvantages)) issue(errors, "EXPERIMENT_ADVANTAGES", `${at}.result.observedAdvantages`, "observedAdvantages 必须是数组");
      requireText(errors, result.causalConclusion, `${at}.result.causalConclusion`, "causalConclusion");
    }
  });
  if (artifacts.some((artifact) => artifact.kind === "delivery" && artifact.status === "approved")) {
    const voices = voiceMap(manifest);
    for (const job of arrayOf(manifest.jobs)) for (const speaker of arrayOf(job.speakers)) {
      const voice = voices.get(speaker.voiceAssetId);
      const scope = voice?.licenseScope ?? (voice?.providerModel === "s2.1-pro-free" ? "evaluation-only" : "commercial");
      if (scope === "evaluation-only") issue(errors, "DELIVERY_VOICE_SCOPE", "$.voiceAssets", `交付任务 ${job.jobId} 使用评估声音 ${voice.voiceAssetId}；请用付费/商用许可模型重制同一资产`);
    }
  }

  if (!Array.isArray(manifest.approvals)) issue(errors, "APPROVALS", "$.approvals", "approvals 必须是数组");
  if (!Array.isArray(manifest.risks)) issue(errors, "RISKS", "$.risks", "risks 必须是数组");
  arrayOf(manifest.risks).forEach((risk, index) => {
    const at = `$.risks[${index}]`;
    requireText(errors, risk.riskId, `${at}.riskId`, "riskId");
    if (!RISK_SEVERITIES.has(risk.severity)) issue(errors, "RISK_SEVERITY", `${at}.severity`, "risk severity 无效");
    if (!RISK_STATUSES.has(risk.status)) issue(errors, "RISK_STATUS", `${at}.status`, "risk status 无效");
    requireText(errors, risk.description, `${at}.description`, "risk description");
    if (risk.status === "open") stats.openRisks += 1;
  });
  if (arrayOf(manifest.jobs).filter((job) => new Set(["approved", "submitted", "running", "succeeded"]).has(job.status)).length > (manifest.policies?.pilotJobs ?? 1) && !arrayOf(manifest.approvals).some((approval) => approval.scope === "batch-generation")) {
    issue(warnings, "BATCH_APPROVAL_MISSING", "$.jobs", "批准任务数超过样片上限，但没有 batch-generation 审批记录");
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}

function shortHash(value) {
  return isFilled(value) ? value.slice(0, 10) : "—";
}

// Uses the refreshed manifest snapshot; this is guidance, never an approval.
export function reviewQueue(manifest) {
  const artifacts = arrayOf(manifest.artifacts);
  const byId = new Map(artifacts.map(a => [a.id, a]));
  const ready = [], blocked = [];
  for (const artifact of artifacts) {
    if (!["review", "stale"].includes(artifact.status)) continue;
    const dependencies = arrayOf(artifact.dependsOn).filter(id => byId.get(id)?.status !== "approved");
    const item = { id: artifact.id, kind: artifact.kind, episodes: artifact.episodes, path: artifact.path, dependencies };
    if (artifact.status === "review" && !dependencies.length) ready.push(item);
    else blocked.push(item);
  }
  return { ready, blocked };
}

export function statusText(manifest) {
  const lines = [];
  lines.push(`${manifest.project.title}｜短剧生产状态`, "");
  lines.push("制品：");
  for (const artifact of arrayOf(manifest.artifacts)) lines.push(`- ${artifact.id} [${artifact.kind}] ${artifact.status}｜${artifact.episodes}｜${shortHash(artifact.sha256)}｜依赖 ${arrayOf(artifact.dependsOn).join(", ") || "无"}`);
  lines.push("", "声音资产：");
  if (!arrayOf(manifest.voiceAssets).length) lines.push("- 尚未登记");
  else for (const asset of manifest.voiceAssets) lines.push(`- ${asset.voiceAssetId} → ${asset.characterId}｜${asset.sampleType}｜${asset.status}｜${asset.durationSeconds}s｜${asset.rights}/${asset.licenseScope ?? "legacy"}`);
  lines.push("", "生成任务：");
  if (!arrayOf(manifest.jobs).length) lines.push("- 尚未登记");
  else for (const job of manifest.jobs) lines.push(`- ${job.jobId}｜${job.provider}｜E${String(job.episode).padStart(2, "0")} ${job.clipId}｜${job.mode}/${job.dialogueRoute}｜${job.ratio}/${job.resolution}｜${job.duration}s｜${job.status}｜成本授权 ${job.costApproved ? "是" : "否"}`);
  const attention = arrayOf(manifest.artifacts).filter((artifact) => new Set(["missing", "stale", "review", "blocked", "failed"]).has(artifact.status));
  const reviews = reviewQueue(manifest);
  lines.push("", "人工审阅交接（当前状态快照）：");
  for (const item of reviews.ready) lines.push(`- 待展示 ${item.id}｜${item.episodes}｜内容源 ${item.path}；先自检，再打开对应报告并说明检查重点，在对话中请求本版本结论。`);
  for (const item of reviews.blocked) lines.push(`- 暂不请用户批准 ${item.id}：${item.dependencies.length ? `先处理依赖 ${item.dependencies.join(", ")}` : "先修复过期内容并刷新状态"}。`);
  if (!reviews.ready.length) lines.push("- 暂无可直接交接的待审制品；缺失或过期内容先由 agent 整理，不能要求用户批准占位内容。");
  lines.push("", "下一步：");
  if (reviews.ready.length) lines.push(`- 完成 ${reviews.ready[0].id} 的审阅交接；用户结论只控制依赖它的步骤，独立准备可继续。`);
  else if (attention.length) lines.push(`- 优先处理 ${attention[0].id}（${attention[0].status}）`);
  else if (!manifest.artifacts.some((artifact) => artifact.kind === "outline")) lines.push("- 运行 novel-outline 并登记 outline 制品");
  else if (!manifest.artifacts.some((artifact) => artifact.kind === "script")) lines.push("- 进入首批剧本阶段");
  else if (!manifest.artifacts.some((artifact) => artifact.kind === "director")) lines.push("- 进入 short-drama-director 导演阶段");
  else if (!manifest.artifacts.some((artifact) => artifact.kind === "storyboard")) lines.push("- 将已批准导演包转换成技术分镜");
  else lines.push("- 按审批范围推进样片、后期或 QC");
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

export function renderManifest(manifest, manifestPath = "production.json") {
  const validation = validateManifest(manifest, manifestPath);
  const lines = [`# ${manifest.project.title}｜短剧生产报告`, ""];
  lines.push(`- 项目 ID：${manifest.project.id}`, `- 画幅：${manifest.project.format.aspectRatio}｜${manifest.project.format.orientation}｜${manifest.project.format.deliveryWidth}×${manifest.project.format.deliveryHeight}｜${manifest.project.format.fps} fps`, `- 构图配置：${manifest.project.format.compositionProfile}｜生成分辨率 ${manifest.project.format.generationResolution}`, `- 目标模型：${manifest.project.format.targetModel}`, `- 视频提供方：${manifest.policies.videoProvider ?? "minimax-official"}`, `- 默认对白：${manifest.policies.defaultDialogueRoute}`, `- 更新：${manifest.project.updatedAt}`, "");
  lines.push("## 阶段制品", "", "| ID | 阶段 | 类型 | 集数 | 状态 | 当前哈希 | 依赖 |", "|---|---|---|---|---|---|---|");
  for (const artifact of arrayOf(manifest.artifacts)) lines.push(`| ${escapeCell(artifact.id)} | ${escapeCell(artifact.stage)} | ${escapeCell(artifact.kind)} | ${escapeCell(artifact.episodes)} | ${escapeCell(artifact.status)} | ${shortHash(artifact.sha256)} | ${escapeCell(arrayOf(artifact.dependsOn).join(", "))} |`);
  lines.push("", "## 声音资产", "");
  if (!arrayOf(manifest.voiceAssets).length) lines.push("尚未登记。", "");
  else {
    lines.push("| 声音 ID | 角色 | 类型 | 时长 | 来源模型 | 权利/范围 | 状态 |", "|---|---|---|---|---|---|---|");
    for (const asset of manifest.voiceAssets) lines.push(`| ${escapeCell(asset.voiceAssetId)} | ${escapeCell(asset.characterId)} | ${escapeCell(asset.sampleType)} | ${asset.durationSeconds}s | ${escapeCell(asset.providerModel ?? asset.provider ?? "manual")} | ${escapeCell(`${asset.rights}/${asset.licenseScope}`)} | ${escapeCell(asset.status)} |`);
    lines.push("");
  }
  lines.push("## H3 / 生成任务", "");
  if (!arrayOf(manifest.jobs).length) lines.push("尚未登记。", "");
  else {
    lines.push("| 任务 | 提供方 | 集/片段 | 模式 | 画幅/清晰度 | 对白 | 时长 | 状态 | 成本授权 | QC |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const job of manifest.jobs) lines.push(`| ${escapeCell(job.jobId)} | ${escapeCell(job.provider)} | E${String(job.episode).padStart(2, "0")} / ${escapeCell(job.clipId)} | ${escapeCell(job.mode)} | ${escapeCell(job.ratio)}/${escapeCell(job.resolution)} | ${escapeCell(job.dialogueRoute)} | ${job.duration}s | ${escapeCell(job.status)} | ${job.costApproved ? "是" : "否"} | ${escapeCell(job.qc?.status ?? "pending")} |`);
    lines.push("");
  }
  lines.push("## 风险", "");
  if (!arrayOf(manifest.risks).length) lines.push("尚未登记。", "");
  else for (const risk of manifest.risks) lines.push(`- [${risk.severity}/${risk.status}] ${risk.riskId}：${risk.description}${isFilled(risk.mitigation) ? `；措施：${risk.mitigation}` : ""}`);
  lines.push("", "## 质量门", "", `- 结构结果：${validation.ok ? "PASS" : "FAIL"}`, `- ${validation.errors.length} errors / ${validation.warnings.length} warnings`);
  for (const error of validation.errors) lines.push(`- ERROR ${error.code}｜${error.path}｜${error.message}`);
  for (const warning of validation.warnings) lines.push(`- WARN ${warning.code}｜${warning.path}｜${warning.message}`);
  return `${lines.join("\n").trim()}\n`;
}

function printValidation(result, jsonMode) {
  if (jsonMode) return console.log(JSON.stringify(result, null, 2));
  console.log(result.ok ? "PASS｜production.json 通过结构质量门" : "FAIL｜production.json 未通过结构质量门");
  console.log(`统计：${result.stats.artifacts} 制品 / ${result.stats.voiceAssets} 声音 / ${result.stats.jobs} 任务 / ${result.stats.openRisks} 开放风险`);
  for (const error of result.errors) console.log(`[ERROR ${error.code}] ${error.path}｜${error.message}`);
  for (const warning of result.warnings) console.log(`[WARN  ${warning.code}] ${warning.path}｜${warning.message}`);
  console.log(`结果：${result.errors.length} errors, ${result.warnings.length} warnings`);
}

function usage() {
  console.log(`short-drama-production toolkit

Usage:
  node scripts/production-kit.mjs init <project-dir> --title <title> --source <path> [--aspect 16:9] [--resolution 768P] [--provider compshare]
  node scripts/production-kit.mjs format-set <production.json> --aspect <16:9> [--fps 24] [--resolution 768P]
  node scripts/production-kit.mjs register <production.json> --id <id> --kind <kind> --stage <stage> --path <file> [--depends a,b] [--episodes 1-3] [--producer skill]
  node scripts/production-kit.mjs approve <production.json> --id <artifact> --by user [--note text]
  node scripts/production-kit.mjs voice-add <production.json> --id <voice> --character <C01> --path <audio> --seconds <n> [--rights synthetic]
  node scripts/production-kit.mjs voice-approve <production.json> --id <voice> --by user [--note text]
  node scripts/production-kit.mjs job-add <production.json> --id <job> --ep <n> --clip <id> --duration <n> [--mode h3-ref2va] [--dialogue h3-native-reference]
  node scripts/production-kit.mjs jobs-sync <production.json> --storyboard <storyboard.json> [--depends storyboard,frames] [--output-dir video]
  node scripts/production-kit.mjs jobs-sync-package <production.json> --manifest <h3-package/manifest.json> --segments E01-16 --provider compshare [--duration-policy nearest]
  node scripts/production-kit.mjs job-export-compshare <production.json> --id <job> --out <job.json>
  node scripts/production-kit.mjs job-approve <production.json> --id <job> --by user [--note text]
  node scripts/production-kit.mjs refresh <production.json>
  node scripts/production-kit.mjs validate <production.json> [--json]
  node scripts/production-kit.mjs status <production.json>
  node scripts/production-kit.mjs render <production.json>
`);
}

async function main() {
  const [command, target, ...args] = process.argv.slice(2);
  if (!command || ["help", "-h", "--help"].includes(command)) return usage();
  if (!target) throw new Error(`${command} 需要目标路径`);

  if (command === "init") {
    const projectDir = path.resolve(target);
    fs.mkdirSync(projectDir, { recursive: true });
    const manifestPath = path.join(projectDir, "production.json");
    if (fs.existsSync(manifestPath)) throw new Error(`production.json 已存在，拒绝覆盖: ${manifestPath}`);
    const source = requireOption(args, "--source");
    const manifest = createManifest({
      title: requireOption(args, "--title"),
      sourcePath: source,
      manifestPath,
      aspectRatio: optionValue(args, "--aspect", "16:9"),
      fps: parseNumber(optionValue(args, "--fps", "24"), "fps"),
      targetModel: optionValue(args, "--model", "MiniMax-H3"),
      generationResolution: optionValue(args, "--resolution", "768P"),
      videoProvider: optionValue(args, "--provider", "minimax-official")
    });
    writeJson(manifestPath, manifest);
    console.log(manifestPath);
    return;
  }

  const manifestPath = path.resolve(target);
  const manifest = readJson(manifestPath);

  if (command === "format-set") {
    const result = setProjectFormat(manifest, {
      aspectRatio: optionValue(args, "--aspect", manifest.project.format.aspectRatio),
      fps: parseNumber(optionValue(args, "--fps", String(manifest.project.format.fps ?? 24)), "fps"),
      targetModel: optionValue(args, "--model", manifest.project.format.targetModel),
      generationResolution: optionValue(args, "--resolution", manifest.project.format.generationResolution ?? "768P")
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "register") {
    const artifact = registerArtifact(manifest, manifestPath, {
      id: requireOption(args, "--id"),
      kind: requireOption(args, "--kind"),
      stage: requireOption(args, "--stage"),
      path: requireOption(args, "--path"),
      dependsOn: csv(optionValue(args, "--depends", "")),
      episodes: optionValue(args, "--episodes", "all"),
      producer: optionValue(args, "--producer", "manual"),
      note: optionValue(args, "--note", "")
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(artifact, null, 2));
    return;
  }
  if (command === "approve") {
    const approval = approveArtifact(manifest, manifestPath, requireOption(args, "--id"), requireOption(args, "--by"), optionValue(args, "--note", ""));
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  if (command === "voice-add") {
    const asset = addVoiceAsset(manifest, manifestPath, {
      voiceAssetId: requireOption(args, "--id"),
      characterId: requireOption(args, "--character"),
      path: requireOption(args, "--path"),
      language: optionValue(args, "--language", "zh"),
      durationSeconds: parseNumber(requireOption(args, "--seconds"), "seconds"),
      sampleType: optionValue(args, "--type", "voice-master"),
      rights: optionValue(args, "--rights", "unknown"),
      notes: optionValue(args, "--note", "")
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(asset, null, 2));
    return;
  }
  if (command === "voice-approve") {
    const approval = approveVoiceAsset(manifest, manifestPath, requireOption(args, "--id"), requireOption(args, "--by"), optionValue(args, "--note", ""));
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  if (command === "job-add") {
    const job = addJob(manifest, manifestPath, {
      jobId: requireOption(args, "--id"),
      episode: parseNumber(requireOption(args, "--ep"), "ep"),
      clipId: requireOption(args, "--clip"),
      model: optionValue(args, "--model", "MiniMax-H3"),
      mode: optionValue(args, "--mode", "h3-ref2va"),
      duration: parseNumber(requireOption(args, "--duration"), "duration"),
      sequence: parseNumber(optionValue(args, "--sequence", String(arrayOf(manifest.jobs).length + 1)), "sequence"),
      ratio: optionValue(args, "--ratio", undefined),
      resolution: optionValue(args, "--resolution", manifest.project.format.generationResolution ?? "768P"),
      provider: optionValue(args, "--provider", manifest.policies.videoProvider ?? "minimax-official"),
      dialogueRoute: optionValue(args, "--dialogue", manifest.policies.defaultDialogueRoute),
      ambienceRoute: optionValue(args, "--ambience", manifest.policies.ambienceRoute),
      musicRoute: optionValue(args, "--music", manifest.policies.musicRoute),
      promptPath: optionValue(args, "--prompt", ""),
      outputPath: optionValue(args, "--output", ""),
      dependsOn: csv(optionValue(args, "--depends", ""))
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(job, null, 2));
    return;
  }
  if (command === "jobs-sync") {
    const boardPath = path.resolve(requireOption(args, "--storyboard"));
    const jobs = syncJobsFromStoryboard(manifest, manifestPath, readJson(boardPath), boardPath, {
      dependsOn: csv(optionValue(args, "--depends", "")),
      outputDir: optionValue(args, "--output-dir", path.join(path.dirname(manifestPath), "video")),
      resolution: optionValue(args, "--resolution", manifest.project.format.generationResolution),
      prefix: optionValue(args, "--prefix", ""),
      provider: optionValue(args, "--provider", manifest.policies.videoProvider ?? "minimax-official")
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }
  if (command === "jobs-sync-package") {
    const packagePath = path.resolve(requireOption(args, "--manifest"));
    const provider = optionValue(args, "--provider", manifest.policies.videoProvider ?? "minimax-official");
    const jobs = syncJobsFromH3Package(manifest, manifestPath, readJson(packagePath), packagePath, {
      segments: csv(requireOption(args, "--segments")),
      dependsOn: csv(optionValue(args, "--depends", "")),
      outputDir: optionValue(args, "--output-dir", path.join(path.dirname(manifestPath), "video")),
      resolution: optionValue(args, "--resolution", manifest.project.format.generationResolution),
      provider,
      durationPolicy: optionValue(args, "--duration-policy", "nearest"),
      prefix: optionValue(args, "--prefix", undefined),
      allowBatch: args.includes("--allow-batch")
    });
    manifest.policies.videoProvider = provider;
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }
  if (command === "job-export-compshare") {
    const outPath = path.resolve(requireOption(args, "--out"));
    const exported = exportCompShareJob(manifest, manifestPath, requireOption(args, "--id"), outPath, {
      promptSuffix: optionValue(args, "--prompt-suffix", COMPSHARE_CLEAN_SUFFIX)
    });
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify({ job: outPath, segment: exported.segment, duration: exported.duration, references: exported.referenceImages.length }, null, 2));
    return;
  }
  if (command === "job-approve") {
    const approval = approveJob(manifest, manifestPath, requireOption(args, "--id"), requireOption(args, "--by"), optionValue(args, "--note", ""));
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  if (command === "refresh") {
    refreshManifest(manifest, manifestPath);
    writeJson(manifestPath, manifest);
    console.log(statusText(manifest));
    return;
  }
  if (command === "validate") {
    refreshManifest(manifest, manifestPath);
    const result = validateManifest(manifest, manifestPath);
    printValidation(result, args.includes("--json"));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "status") {
    refreshManifest(manifest, manifestPath);
    console.log(statusText(manifest));
    return;
  }
  if (command === "render") {
    refreshManifest(manifest, manifestPath);
    process.stdout.write(renderManifest(manifest, manifestPath));
    return;
  }
  usage();
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR｜${error.message}`);
    process.exitCode = 1;
  });
}
