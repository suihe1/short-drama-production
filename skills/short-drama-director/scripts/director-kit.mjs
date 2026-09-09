#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EPSILON = 1e-6;
const AUDIO_ROUTES = new Set(["native", "h3-native-reference", "h3-native-free", "tts-guided-h3", "tts-post", "silent"]);
const GENERATION_MODES = new Set(["model-agnostic", "h3-ref2va", "h3-i2va", "h3-fl2va"]);
const REFERENCE_MODES = new Set(["none", "first-frame", "first-last-frame", "multi-reference"]);
const REFERENCE_ROLES = new Set(["reference_image", "reference_video", "reference_audio", "first_frame", "last_frame", "subject_reference"]);
const AUDIO_RELATIONS = new Set(["reference", "weak_reference", "partially_copy", "fully_copy"]);
const VOICE_RIGHTS = new Set(["synthetic", "owned", "licensed", "consented", "unknown"]);
const VOICE_STATUSES = new Set(["draft", "approved", "rejected", "missing"]);
const SHOT_SIZES = new Set(["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "INSERT", "OTS", "TWO_SHOT", "POV"]);
const ANGLES = new Set(["eye", "high", "low", "overhead", "dutch", "ground"]);
const MOVES = new Set(["static", "pan", "tilt", "push", "pull", "truck", "pedestal", "track", "arc", "handheld", "crane", "whip_pan", "roll"]);
const SCREEN_DIRECTIONS = new Set(["left-to-right", "right-to-left", "neutral"]);
const AXIS_ACTIONS = new Set(["keep", "reset", "cross"]);
const TRANSITIONS = new Set(["cut", "cut_on_action", "reaction_cut", "match_cut", "J_cut", "L_cut", "dissolve", "whip", "fade"]);
const CLOSE_SIZES = new Set(["CU", "ECU", "INSERT"]);
const INFORMATION_CARRIERS = new Set(["phone-screen", "computer-screen", "document", "prop", "environment-sign", "other"]);
const DISPLAY_STRATEGIES = new Set(["contextual", "insert", "full-frame-content", "post-composite"]);
const INFORMATION_CRITICALITY = new Set(["context", "plot-essential"]);
const COVERAGE_METRICS = new Set(["frame-height", "frame-width", "frame-area"]);
const MOTION_LOADS = new Set(["low", "medium", "high"]);
const PACING_METHODS = new Set(["retime-shots", "rewrite-blocking", "post-speed-preview"]);

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

function issue(list, code, at, message) {
  list.push({ code, path: at, message });
}

function requireString(errors, value, at, label) {
  if (!isFilled(value)) issue(errors, "REQUIRED_TEXT", at, `${label}不能为空`);
}

function requireStringArray(errors, value, at, label, allowEmpty = false) {
  if (!Array.isArray(value)) {
    issue(errors, "REQUIRED_ARRAY", at, `${label}必须是数组`);
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(errors, "EMPTY_ARRAY", at, `${label}不能为空`);
  value.forEach((item, index) => {
    if (!isFilled(item)) issue(errors, "INVALID_ARRAY_ITEM", `${at}[${index}]`, `${label}的每项必须是非空文本`);
  });
  return value;
}

function fixed(value) {
  return Number(value).toFixed(2);
}

function usesPromptDialogue(audioRoute) {
  return new Set(["native", "h3-native-reference", "h3-native-free", "tts-guided-h3"]).has(audioRoute);
}

function officialShotMarker(shot, index) {
  if (index === 0) return "[Shot 1]";
  const totalMs = Math.round(shot.start * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = ((totalMs % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `[Shot ${index + 1}] At ${pad(minutes)}:${seconds},`;
}

function sectionRanges(prompt, headings, errors, at) {
  const found = [];
  let previous = -1;
  for (const heading of headings) {
    const pattern = new RegExp(`(?:^|\\n)${heading}:\\s*`, "g");
    const matches = [...prompt.matchAll(pattern)];
    if (matches.length === 0) {
      issue(errors, "H3_SECTION_MISSING", at, `H3 提示词缺少 ${heading}:`);
      continue;
    }
    const match = matches[0];
    const index = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const contentStart = match.index + match[0].length;
    if (index < previous) issue(errors, "H3_SECTION_ORDER", at, `H3 章节 ${heading}: 顺序错误`);
    if (matches.length > 1) issue(errors, "H3_SECTION_DUPLICATE", at, `H3 章节 ${heading}: 重复`);
    found.push({ heading, index, contentStart });
    previous = index;
  }
  const ranges = new Map();
  for (let i = 0; i < found.length; i += 1) {
    const current = found[i];
    const next = found[i + 1];
    ranges.set(current.heading, prompt.slice(current.contentStart, next ? next.index : prompt.length));
  }
  return ranges;
}

function validateH3Clip({ clip, clipPath, format, beatById, voiceById, errors, warnings }) {
  const mode = format.generation.mode;
  const references = arrayOf(clip.references);
  const prompt = typeof clip.modelPrompt === "string" ? clip.modelPrompt : "";

  if (!Number.isInteger(clip.duration) || clip.duration < 4 || clip.duration > 15) {
    issue(errors, "H3_DURATION", `${clipPath}.duration`, "H3 单次生成时长必须是 4–15 秒整数");
  }
  requireString(errors, prompt, `${clipPath}.modelPrompt`, "H3 modelPrompt");

  let detailedHeading = "integrated_multimodal_description";
  let headings = ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"];

  if (mode === "h3-ref2va") {
    headings = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"];
    detailedHeading = "detailed_description";
    if (clip.referenceMode !== "multi-reference") {
      issue(errors, "H3_REFERENCE_MODE", `${clipPath}.referenceMode`, "h3-ref2va 必须使用 multi-reference");
    }
    const imageRefs = references.filter((ref) => ["reference_image", "subject_reference"].includes(ref?.role));
    const videoRefs = references.filter((ref) => ref?.role === "reference_video");
    const audioRefs = references.filter((ref) => ref?.role === "reference_audio");
    const unsupported = references.filter((ref) => !["reference_image", "subject_reference", "reference_video", "reference_audio"].includes(ref?.role));
    if (references.length < 1 || references.length > 12) issue(errors, "H3_REFERENCE_COUNT", `${clipPath}.references`, "h3-ref2va 媒体参考总数必须为 1–12");
    if (imageRefs.length > 9) issue(errors, "H3_IMAGE_REFERENCE_COUNT", `${clipPath}.references`, "H3 参考图最多 9 张");
    if (videoRefs.length > 3) issue(errors, "H3_VIDEO_REFERENCE_COUNT", `${clipPath}.references`, "H3 参考视频最多 3 条");
    if (audioRefs.length > 3) issue(errors, "H3_AUDIO_REFERENCE_COUNT", `${clipPath}.references`, "H3 参考音频最多 3 条");
    if (audioRefs.length > 0 && imageRefs.length + videoRefs.length === 0) issue(errors, "H3_AUDIO_ONLY_REFERENCE", `${clipPath}.references`, "参考音频不能作为唯一媒体，必须同时提供参考图或参考视频");
    if (unsupported.length > 0) issue(errors, "H3_REFERENCE_ROLE", `${clipPath}.references`, "h3-ref2va 只接受 reference_image、reference_video、reference_audio");
    if (imageRefs.some((ref) => ref.role === "subject_reference")) issue(warnings, "H3_LEGACY_REFERENCE_ROLE", `${clipPath}.references`, "subject_reference 是旧兼容写法，投产请改为 reference_image");
    for (const [kind, refs, maxTotal] of [["视频", videoRefs, 15], ["音频", audioRefs, 15]]) {
      let total = 0;
      refs.forEach((ref, index) => {
        const refPath = `${clipPath}.references[${references.indexOf(ref)}]`;
        if (!isNumber(ref.durationSeconds) || ref.durationSeconds < 2 || ref.durationSeconds > 15) issue(errors, "H3_REFERENCE_DURATION", `${refPath}.durationSeconds`, `参考${kind}单条必须为 2–15 秒`);
        else total += ref.durationSeconds;
        if (kind === "音频" && !AUDIO_RELATIONS.has(ref.relation)) issue(errors, "H3_AUDIO_RELATION", `${refPath}.relation`, "参考音频 relation 必须为 reference、weak_reference、partially_copy 或 fully_copy");
      });
      if (total > maxTotal + EPSILON) issue(errors, "H3_REFERENCE_TOTAL_DURATION", `${clipPath}.references`, `参考${kind}总时长不得超过 ${maxTotal} 秒`);
    }
  }

  if (mode === "h3-i2va") {
    if (clip.referenceMode !== "first-frame") {
      issue(errors, "H3_REFERENCE_MODE", `${clipPath}.referenceMode`, "h3-i2va 必须使用 first-frame");
    }
    if (references.length !== 1 || references[0]?.role !== "first_frame") {
      issue(errors, "H3_REFERENCE_COUNT", `${clipPath}.references`, "h3-i2va 必须且只能提供一张 first_frame");
    }
    const firstLine = prompt.split(/\r?\n/, 1)[0] ?? "";
    if (!/first frame|provided image/i.test(firstLine)) {
      issue(warnings, "H3_FIRST_FRAME_DECLARATION", `${clipPath}.modelPrompt`, "h3-i2va 首行应明确已提供画面是首帧");
    }
  }

  if (mode === "h3-fl2va") {
    if (clip.referenceMode !== "first-last-frame") {
      issue(errors, "H3_REFERENCE_MODE", `${clipPath}.referenceMode`, "h3-fl2va 必须使用 first-last-frame");
    }
    const roles = references.map((ref) => ref?.role).sort();
    if (references.length !== 2 || roles.join(",") !== "first_frame,last_frame") {
      issue(errors, "H3_REFERENCE_COUNT", `${clipPath}.references`, "h3-fl2va 必须提供且仅提供 first_frame 与 last_frame");
    }
    const firstLine = prompt.split(/\r?\n/, 1)[0] ?? "";
    if (!/first frame/i.test(firstLine) || !/last frame/i.test(firstLine)) {
      issue(warnings, "H3_FIRST_LAST_DECLARATION", `${clipPath}.modelPrompt`, "h3-fl2va 首行应明确首帧和尾帧均已提供");
    }
  }

  const ranges = sectionRanges(prompt, headings, errors, `${clipPath}.modelPrompt`);
  const detailed = ranges.get(detailedHeading) ?? "";
  const markerPositions = [];
  const shots = arrayOf(clip.shots);
  for (let shotIndex = 0; shotIndex < shots.length; shotIndex += 1) {
    const shot = shots[shotIndex];
    if (!isNumber(shot.start) || !isNumber(shot.duration) || !isFilled(shot.shotId)) continue;
    const marker = officialShotMarker(shot, shotIndex);
    const markerIndex = detailed.indexOf(marker);
    if (markerIndex < 0) {
      issue(errors, "H3_SHOT_WINDOW", `${clipPath}.modelPrompt`, `逐镜章节缺少官方切镜标记 ${marker}`);
    } else {
      markerPositions.push({ shot, marker, index: markerIndex });
    }
  }
  markerPositions.sort((a, b) => a.index - b.index);
  for (let i = 0; i < markerPositions.length; i += 1) {
    const current = markerPositions[i];
    const expectedShot = shots[i];
    if (expectedShot && current.shot.shotId !== expectedShot.shotId) {
      issue(errors, "H3_SHOT_ORDER", `${clipPath}.modelPrompt`, "逐镜章节的镜头标记顺序与 shots 不一致");
      break;
    }
    if (usesPromptDialogue(format.audioRoute)) {
      const next = markerPositions[i + 1];
      const block = detailed.slice(current.index, next ? next.index : detailed.length);
      for (const beatId of arrayOf(current.shot.dialogueRefs)) {
        const beat = beatById.get(beatId);
        if (!beat) continue;
        if (!block.includes("<d>") || !block.includes("</d>") || !block.includes(beat.text)) {
          issue(errors, "H3_DIALOGUE_WINDOW", `${clipPath}.modelPrompt`, `${beatId} 的原生对白必须逐字位于对应镜头的 <d> 块中`);
        }
      }
    }
  }

  if (["tts-post", "silent"].includes(format.audioRoute) && /<d>[\s\S]*?<\/d>/i.test(prompt)) {
    issue(errors, "AUDIO_ROUTE_CONFLICT", `${clipPath}.modelPrompt`, "tts-post 路线不得包含 H3 <d> 原生对白块");
  }

  const audioRefs = references.filter((ref) => ref?.role === "reference_audio");
  if (format.audioRoute === "h3-native-reference") {
    if (mode !== "h3-ref2va") issue(errors, "H3_VOICE_MODE", "$.format.audioRoute", "h3-native-reference 必须搭配 h3-ref2va");
    const speakers = new Set();
    for (const shot of shots) {
      for (const beatId of arrayOf(shot.dialogueRefs)) {
        const beat = beatById.get(beatId);
        if (isFilled(beat?.speaker)) speakers.add(beat.speaker);
      }
    }
    const bindings = arrayOf(clip.speakerBindings);
    for (const speaker of speakers) {
      const binding = bindings.find((item) => item?.characterId === speaker);
      const bindingPath = `${clipPath}.speakerBindings`;
      if (!binding) {
        issue(errors, "H3_SPEAKER_BINDING", bindingPath, `对白角色 ${speaker} 缺少音色绑定`);
        continue;
      }
      if (!/^S\d+$/.test(binding.speakerId ?? "")) issue(errors, "H3_SPEAKER_ID", bindingPath, `${speaker} 的 speakerId 必须使用 S1、S2…`);
      const voice = voiceById.get(binding.voiceAssetId);
      if (!voice || voice.status !== "approved") issue(errors, "H3_VOICE_NOT_APPROVED", bindingPath, `${speaker} 绑定的 voiceAssetId 必须指向 approved 音色资产`);
      const ref = audioRefs.find((item) => item.refId === binding.audioRefId);
      if (!ref || ref.voiceAssetId !== binding.voiceAssetId || ref.relation !== "reference") {
        issue(errors, "H3_VOICE_REFERENCE_BINDING", bindingPath, `${speaker} 必须绑定 relation=reference 且 voiceAssetId 一致的 reference_audio`);
      }
      const subjectDefinitions = ranges.get("subject_definitions") ?? "";
      const speakerPattern = new RegExp(`<Audio\\s+\\d+>\\s+is the voice-timbre reference for\\s+<Subject\\s+\\d+>\\s+\\(${binding.speakerId}\\)\\.`, "i");
      if (!speakerPattern.test(subjectDefinitions)) issue(errors, "H3_PROMPT_VOICE_BINDING", `${clipPath}.modelPrompt`, `${speaker} 的 ${binding.speakerId} 必须在 subject_definitions 中显式绑定 Audio 与 Subject`);
    }
  }
  if (format.audioRoute === "tts-guided-h3") {
    if (mode !== "h3-ref2va") issue(errors, "H3_TTS_GUIDE_MODE", "$.format.audioRoute", "tts-guided-h3 必须搭配 h3-ref2va");
    if (!audioRefs.some((ref) => ["partially_copy", "fully_copy"].includes(ref.relation))) {
      issue(errors, "H3_TTS_GUIDE_REFERENCE", `${clipPath}.references`, "tts-guided-h3 至少需要一条 partially_copy 或 fully_copy 的 reference_audio");
    }
  }
  if (format.audioRoute === "native") {
    issue(warnings, "LEGACY_NATIVE_ROUTE", "$.format.audioRoute", "native 是兼容旧包的模糊路线；新项目请选择 h3-native-reference 或 h3-native-free");
  }

  const englishWords = (prompt.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).length;
  const cjk = (prompt.match(/[\u3400-\u9fff]/g) ?? []).length;
  if (mode === "h3-ref2va" && englishWords < 300) {
    issue(warnings, "H3_PROMPT_THIN", `${clipPath}.modelPrompt`, `Ref2VA 英文提示词仅约 ${englishWords} 词，可能不足以覆盖保持项、调度、逐镜和声音`);
  }
  if (cjk > englishWords * 0.35) {
    issue(warnings, "H3_PROMPT_LANGUAGE", `${clipPath}.modelPrompt`, "H3 稳定投产默认应使用英文描述；中文对白可保留原文");
  }
}

export function validatePackage(data) {
  const errors = [];
  const warnings = [];
  const stats = { episodes: 0, scenes: 0, clips: 0, shots: 0, sourceBeats: 0, inventedBeats: 0, totalSeconds: 0 };

  if (!isObject(data)) {
    issue(errors, "ROOT_TYPE", "$", "根节点必须是 JSON 对象");
    return { ok: false, errors, warnings, stats };
  }

  if (data.schemaVersion !== "1.0") issue(errors, "SCHEMA_VERSION", "$.schemaVersion", "schemaVersion 必须为 1.0");
  requireString(errors, data.title, "$.title", "title");
  requireString(errors, data.source, "$.source", "source");

  const format = isObject(data.format) ? data.format : {};
  if (!isObject(data.format)) issue(errors, "FORMAT_REQUIRED", "$.format", "format 必须是对象");
  requireString(errors, format.aspectRatio, "$.format.aspectRatio", "aspectRatio");
  if (!isNumber(format.fps) || format.fps <= 0) issue(errors, "FPS", "$.format.fps", "fps 必须是正数");
  if (!AUDIO_ROUTES.has(format.audioRoute)) issue(errors, "AUDIO_ROUTE", "$.format.audioRoute", "audioRoute 枚举无效");
  const soundPlan = isObject(format.soundPlan) ? format.soundPlan : {};
  if (!isObject(format.soundPlan)) issue(errors, "SOUND_PLAN_REQUIRED", "$.format.soundPlan", "soundPlan 必须是对象");
  for (const key of ["ambienceRoute", "foleyRoute", "musicRoute", "fallbackDialogueRoute"]) requireString(errors, soundPlan[key], `$.format.soundPlan.${key}`, key);

  const generation = isObject(format.generation) ? format.generation : {};
  if (!isObject(format.generation)) issue(errors, "GENERATION_REQUIRED", "$.format.generation", "generation 必须是对象");
  if (!GENERATION_MODES.has(generation.mode)) issue(errors, "GENERATION_MODE", "$.format.generation.mode", "generation.mode 枚举无效");
  if (!isNumber(generation.minClipSeconds) || generation.minClipSeconds <= 0) issue(errors, "CLIP_MIN", "$.format.generation.minClipSeconds", "minClipSeconds 必须是正数");
  if (!isNumber(generation.maxClipSeconds) || generation.maxClipSeconds < generation.minClipSeconds) issue(errors, "CLIP_MAX", "$.format.generation.maxClipSeconds", "maxClipSeconds 必须不小于 minClipSeconds");
  if (typeof generation.integerDuration !== "boolean") issue(errors, "INTEGER_DURATION", "$.format.generation.integerDuration", "integerDuration 必须是布尔值");

  const visualBible = isObject(data.visualBible) ? data.visualBible : {};
  if (!isObject(data.visualBible)) issue(errors, "VISUAL_BIBLE_REQUIRED", "$.visualBible", "visualBible 必须是对象");
  for (const key of ["genreTone", "palette", "contrast", "cameraPersonality", "lensStrategy", "compositionStrategy"]) {
    requireString(errors, visualBible[key], `$.visualBible.${key}`, key);
  }
  for (const key of ["movementRules", "continuityRules", "motifs"]) {
    requireStringArray(errors, visualBible[key], `$.visualBible.${key}`, key);
  }

  if (!Array.isArray(data.assumptions)) issue(errors, "ASSUMPTIONS", "$.assumptions", "assumptions 必须是数组");
  if (!Array.isArray(data.unresolvedRisks)) issue(errors, "RISKS", "$.unresolvedRisks", "unresolvedRisks 必须是数组");

  const episodes = arrayOf(data.episodes);
  if (!Array.isArray(data.episodes) || episodes.length === 0) issue(errors, "EPISODES", "$.episodes", "episodes 必须是非空数组");
  stats.episodes = episodes.length;

  const globalIds = new Map();
  function registerId(id, at) {
    if (!isFilled(id)) {
      issue(errors, "ID_REQUIRED", at, "ID 不能为空");
      return;
    }
    if (globalIds.has(id)) issue(errors, "DUPLICATE_ID", at, `ID ${id} 已在 ${globalIds.get(id)} 使用`);
    else globalIds.set(id, at);
  }

  const voiceAssets = arrayOf(data.voiceAssets);
  if (!Array.isArray(data.voiceAssets)) issue(errors, "VOICE_ASSETS", "$.voiceAssets", "voiceAssets 必须是数组");
  const voiceById = new Map();
  voiceAssets.forEach((voice, index) => {
    const voicePath = `$.voiceAssets[${index}]`;
    if (!isObject(voice)) {
      issue(errors, "VOICE_ASSET_TYPE", voicePath, "voiceAsset 必须是对象");
      return;
    }
    registerId(voice.voiceAssetId, `${voicePath}.voiceAssetId`);
    if (voiceById.has(voice.voiceAssetId)) issue(errors, "DUPLICATE_VOICE_ASSET", `${voicePath}.voiceAssetId`, `voiceAssetId ${voice.voiceAssetId} 重复`);
    else voiceById.set(voice.voiceAssetId, voice);
    requireString(errors, voice.characterId, `${voicePath}.characterId`, "characterId");
    requireString(errors, voice.path, `${voicePath}.path`, "voice path");
    requireString(errors, voice.language, `${voicePath}.language`, "voice language");
    if (!isNumber(voice.durationSeconds) || voice.durationSeconds < 2 || voice.durationSeconds > 15) issue(errors, "VOICE_DURATION", `${voicePath}.durationSeconds`, "H3 音色参考单条必须为 2–15 秒");
    if (!VOICE_RIGHTS.has(voice.rights)) issue(errors, "VOICE_RIGHTS", `${voicePath}.rights`, "rights 枚举无效");
    if (!VOICE_STATUSES.has(voice.status)) issue(errors, "VOICE_STATUS", `${voicePath}.status`, "status 枚举无效");
    if (voice.status === "approved" && voice.rights === "unknown") issue(errors, "VOICE_RIGHTS_UNKNOWN", `${voicePath}.rights`, "未知权利状态的音色不得批准投产");
    if (voice.status === "approved" && !/^[a-f0-9]{64}$/i.test(voice.sha256 ?? "")) issue(errors, "VOICE_HASH", `${voicePath}.sha256`, "approved 音色资产必须记录 64 位 sha256");
  });

  const allLens = [];
  for (let epIndex = 0; epIndex < episodes.length; epIndex += 1) {
    const episode = episodes[epIndex];
    const epPath = `$.episodes[${epIndex}]`;
    if (!isObject(episode)) {
      issue(errors, "EPISODE_TYPE", epPath, "episode 必须是对象");
      continue;
    }
    if (!Number.isInteger(episode.ep) || episode.ep < 1) issue(errors, "EP_NUMBER", `${epPath}.ep`, "ep 必须是正整数");
    if (!isNumber(episode.targetSeconds) || episode.targetSeconds <= 0) issue(errors, "EP_DURATION", `${epPath}.targetSeconds`, "targetSeconds 必须是正数");
    requireString(errors, episode.dramaticQuestion, `${epPath}.dramaticQuestion`, "dramaticQuestion");
    requireString(errors, episode.coldOpen, `${epPath}.coldOpen`, "coldOpen");
    requireStringArray(errors, episode.turnPoints, `${epPath}.turnPoints`, "turnPoints");
    requireString(errors, episode.climax, `${epPath}.climax`, "climax");
    requireString(errors, episode.cliff, `${epPath}.cliff`, "cliff");
    requireStringArray(errors, episode.emotionCurve, `${epPath}.emotionCurve`, "emotionCurve");

    const scenes = arrayOf(episode.scenes);
    if (!Array.isArray(episode.scenes) || scenes.length === 0) issue(errors, "SCENES", `${epPath}.scenes`, "scenes 必须是非空数组");
    stats.scenes += scenes.length;
    let episodeSeconds = 0;
    const episodeShots = [];

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
      const scene = scenes[sceneIndex];
      const scenePath = `${epPath}.scenes[${sceneIndex}]`;
      if (!isObject(scene)) {
        issue(errors, "SCENE_TYPE", scenePath, "scene 必须是对象");
        continue;
      }
      registerId(scene.sceneId, `${scenePath}.sceneId`);
      for (const key of ["slug", "objective", "obstacle", "turn", "valueShift", "powerShift", "geography", "axis", "continuityIn", "continuityOut"]) {
        requireString(errors, scene[key], `${scenePath}.${key}`, key);
      }
      requireStringArray(errors, scene.blocking, `${scenePath}.blocking`, "blocking");

      const sourceBeats = arrayOf(scene.sourceBeats);
      const inventedBeats = arrayOf(scene.inventedBeats);
      if (!Array.isArray(scene.sourceBeats)) issue(errors, "SOURCE_BEATS", `${scenePath}.sourceBeats`, "sourceBeats 必须是数组");
      if (!Array.isArray(scene.inventedBeats)) issue(errors, "INVENTED_BEATS", `${scenePath}.inventedBeats`, "inventedBeats 必须是数组");
      if (sourceBeats.length + inventedBeats.length === 0) issue(errors, "NO_BEATS", scenePath, "场景至少需要一个源节拍或新增节拍");
      stats.sourceBeats += sourceBeats.length;
      stats.inventedBeats += inventedBeats.length;

      const beatById = new Map();
      const primaryClaims = new Map();
      const allBeats = [...sourceBeats, ...inventedBeats];
      allBeats.forEach((beat, beatIndex) => {
        const collection = beatIndex < sourceBeats.length ? "sourceBeats" : "inventedBeats";
        const localIndex = beatIndex < sourceBeats.length ? beatIndex : beatIndex - sourceBeats.length;
        const beatPath = `${scenePath}.${collection}[${localIndex}]`;
        if (!isObject(beat)) {
          issue(errors, "BEAT_TYPE", beatPath, "beat 必须是对象");
          return;
        }
        registerId(beat.beatId, `${beatPath}.beatId`);
        if (beatById.has(beat.beatId)) issue(errors, "DUPLICATE_BEAT", `${beatPath}.beatId`, `场内 beatId ${beat.beatId} 重复`);
        beatById.set(beat.beatId, beat);
        if (!new Set(["action", "dialogue"]).has(beat.kind)) issue(errors, "BEAT_KIND", `${beatPath}.kind`, "kind 必须为 action 或 dialogue");
        requireString(errors, beat.text, `${beatPath}.text`, "beat text");
        if (beat.kind === "dialogue") requireString(errors, beat.speaker, `${beatPath}.speaker`, "dialogue speaker");
        if (collection === "inventedBeats") requireString(errors, beat.reason, `${beatPath}.reason`, "invented beat reason");
        primaryClaims.set(beat.beatId, []);
      });

      const clips = arrayOf(scene.clips);
      if (!Array.isArray(scene.clips) || clips.length === 0) issue(errors, "CLIPS", `${scenePath}.clips`, "clips 必须是非空数组");
      stats.clips += clips.length;
      const sceneShots = [];

      for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
        const clip = clips[clipIndex];
        const clipPath = `${scenePath}.clips[${clipIndex}]`;
        if (!isObject(clip)) {
          issue(errors, "CLIP_TYPE", clipPath, "clip 必须是对象");
          continue;
        }
        registerId(clip.clipId, `${clipPath}.clipId`);
        if (!isNumber(clip.duration) || clip.duration <= 0) issue(errors, "CLIP_DURATION", `${clipPath}.duration`, "clip.duration 必须是正数");
        else {
          episodeSeconds += clip.duration;
          stats.totalSeconds += clip.duration;
          if (isNumber(generation.minClipSeconds) && clip.duration < generation.minClipSeconds - EPSILON) issue(errors, "CLIP_TOO_SHORT", `${clipPath}.duration`, `片段短于 ${generation.minClipSeconds} 秒`);
          if (isNumber(generation.maxClipSeconds) && clip.duration > generation.maxClipSeconds + EPSILON) issue(errors, "CLIP_TOO_LONG", `${clipPath}.duration`, `片段长于 ${generation.maxClipSeconds} 秒`);
          if (generation.integerDuration && !Number.isInteger(clip.duration)) issue(errors, "CLIP_NOT_INTEGER", `${clipPath}.duration`, "当前模型要求片段时长为整数");
        }
        requireString(errors, clip.dramaticFunction, `${clipPath}.dramaticFunction`, "dramaticFunction");
        requireString(errors, clip.audioPlan, `${clipPath}.audioPlan`, "audioPlan");
        if (clip.pacingPlan !== undefined) {
          const pacing = isObject(clip.pacingPlan) ? clip.pacingPlan : {};
          if (!isObject(clip.pacingPlan)) issue(errors, "PACING_PLAN", `${clipPath}.pacingPlan`, "pacingPlan 必须是对象");
          if (!isNumber(pacing.baselineSeconds) || pacing.baselineSeconds <= 0) issue(errors, "PACING_BASELINE", `${clipPath}.pacingPlan.baselineSeconds`, "baselineSeconds 必须是正数");
          if (!isNumber(pacing.targetSeconds) || pacing.targetSeconds <= 0) issue(errors, "PACING_TARGET", `${clipPath}.pacingPlan.targetSeconds`, "targetSeconds 必须是正数");
          else if (isNumber(clip.duration) && Math.abs(pacing.targetSeconds - clip.duration) > EPSILON) issue(errors, "PACING_TARGET_MISMATCH", `${clipPath}.pacingPlan.targetSeconds`, "targetSeconds 必须等于当前 clip.duration");
          if (!isNumber(pacing.compressionRatio) || pacing.compressionRatio <= 0) issue(errors, "PACING_RATIO", `${clipPath}.pacingPlan.compressionRatio`, "compressionRatio 必须是正数");
          else if (isNumber(pacing.baselineSeconds) && isNumber(pacing.targetSeconds) && Math.abs(pacing.compressionRatio - pacing.targetSeconds / pacing.baselineSeconds) > 0.001) issue(errors, "PACING_RATIO_MISMATCH", `${clipPath}.pacingPlan.compressionRatio`, "compressionRatio 必须等于 targetSeconds / baselineSeconds");
          if (!PACING_METHODS.has(pacing.method)) issue(errors, "PACING_METHOD", `${clipPath}.pacingPlan.method`, "method 必须为 retime-shots、rewrite-blocking 或 post-speed-preview");
          requireStringArray(errors, pacing.protectedHolds, `${clipPath}.pacingPlan.protectedHolds`, "protectedHolds");
          if (pacing.method === "post-speed-preview") issue(warnings, "POST_SPEED_PREVIEW_ONLY", `${clipPath}.pacingPlan.method`, "post-speed-preview 只用于内部节奏预览，正式生产应重排镜头时长或调度");
        }
        if (!REFERENCE_MODES.has(clip.referenceMode)) issue(errors, "REFERENCE_MODE", `${clipPath}.referenceMode`, "referenceMode 枚举无效");
        if (!Array.isArray(clip.references)) issue(errors, "REFERENCES", `${clipPath}.references`, "references 必须是数组");
        arrayOf(clip.references).forEach((ref, refIndex) => {
          const refPath = `${clipPath}.references[${refIndex}]`;
          if (!isObject(ref)) {
            issue(errors, "REFERENCE_TYPE", refPath, "reference 必须是对象");
            return;
          }
          registerId(ref.refId, `${refPath}.refId`);
          requireString(errors, ref.role, `${refPath}.role`, "reference role");
          requireString(errors, ref.path, `${refPath}.path`, "reference path");
          if (isFilled(ref.role) && !REFERENCE_ROLES.has(ref.role)) issue(errors, "REFERENCE_ROLE", `${refPath}.role`, "reference role 枚举无效");
        });

        const shots = arrayOf(clip.shots);
        if (!Array.isArray(clip.shots) || shots.length === 0) issue(errors, "SHOTS", `${clipPath}.shots`, "shots 必须是非空数组");
        stats.shots += shots.length;
        let cursor = 0;

        for (let shotIndex = 0; shotIndex < shots.length; shotIndex += 1) {
          const shot = shots[shotIndex];
          const shotPath = `${clipPath}.shots[${shotIndex}]`;
          if (!isObject(shot)) {
            issue(errors, "SHOT_TYPE", shotPath, "shot 必须是对象");
            continue;
          }
          registerId(shot.shotId, `${shotPath}.shotId`);
          if (!isNumber(shot.start) || Math.abs(shot.start - cursor) > EPSILON) issue(errors, "SHOT_TIMELINE", `${shotPath}.start`, `镜头必须从 ${fixed(cursor)} 秒连续开始`);
          if (!isNumber(shot.duration) || shot.duration <= 0) issue(errors, "SHOT_DURATION", `${shotPath}.duration`, "shot.duration 必须是正数");
          if (isNumber(shot.duration)) cursor += shot.duration;

          const beatRefs = requireStringArray(errors, shot.beatRefs, `${shotPath}.beatRefs`, "beatRefs", true);
          const coverageRefs = shot.coverageRefs === undefined
            ? []
            : requireStringArray(errors, shot.coverageRefs, `${shotPath}.coverageRefs`, "coverageRefs", true);
          const audioCarryRefs = requireStringArray(errors, shot.audioCarryRefs, `${shotPath}.audioCarryRefs`, "audioCarryRefs", true);
          const dialogueRefs = requireStringArray(errors, shot.dialogueRefs, `${shotPath}.dialogueRefs`, "dialogueRefs", true);
          if (beatRefs.length === 0 && coverageRefs.length === 0) issue(errors, "SHOT_WITHOUT_BEAT", shotPath, "镜头必须主要认领 beatRefs，或用 coverageRefs 说明它是已认领节拍的补充信息/反应覆盖");
          for (const beatId of [...beatRefs, ...coverageRefs, ...audioCarryRefs, ...dialogueRefs]) {
            if (!beatById.has(beatId)) issue(errors, "UNKNOWN_BEAT_REF", shotPath, `引用了不存在的节拍 ${beatId}`);
          }
          for (const beatId of beatRefs) {
            if (primaryClaims.has(beatId)) primaryClaims.get(beatId).push(shot.shotId);
          }
          for (const beatId of dialogueRefs) {
            const beat = beatById.get(beatId);
            if (beat && beat.kind !== "dialogue") issue(errors, "DIALOGUE_REF_KIND", `${shotPath}.dialogueRefs`, `${beatId} 不是 dialogue 节拍`);
            if (!beatRefs.includes(beatId) && !audioCarryRefs.includes(beatId)) issue(errors, "DIALOGUE_REF_SCOPE", `${shotPath}.dialogueRefs`, `${beatId} 必须同时位于本镜的 beatRefs 或 audioCarryRefs`);
          }
          if (format.audioRoute === "silent" && dialogueRefs.length > 0) issue(errors, "SILENT_DIALOGUE", `${shotPath}.dialogueRefs`, "silent 路线不得安排对白引用");

          requireString(errors, shot.dramaticPurpose, `${shotPath}.dramaticPurpose`, "dramaticPurpose");
          if (isFilled(shot.dramaticPurpose) && shot.dramaticPurpose.trim().length < 8) issue(warnings, "THIN_PURPOSE", `${shotPath}.dramaticPurpose`, "镜头目的过短，可能只是标签而非叙事功能");
          if (!SHOT_SIZES.has(shot.size)) issue(errors, "SHOT_SIZE", `${shotPath}.size`, "size 枚举无效");
          if (!ANGLES.has(shot.angle)) issue(errors, "SHOT_ANGLE", `${shotPath}.angle`, "angle 枚举无效");
          if (shot.lensMm !== null && shot.lensMm !== undefined) {
            if (!isNumber(shot.lensMm) || shot.lensMm < 12 || shot.lensMm > 300) issue(errors, "LENS", `${shotPath}.lensMm`, "lensMm 应为 12–300 的数值或 null");
            else allLens.push(shot.lensMm);
          }

          const camera = isObject(shot.camera) ? shot.camera : {};
          if (!isObject(shot.camera)) issue(errors, "CAMERA", `${shotPath}.camera`, "camera 必须是对象");
          if (!MOVES.has(camera.move)) issue(errors, "CAMERA_MOVE", `${shotPath}.camera.move`, "camera.move 枚举无效");
          if (camera.move && camera.move !== "static") {
            requireString(errors, camera.trigger, `${shotPath}.camera.trigger`, "移动镜头 trigger");
            requireString(errors, camera.path, `${shotPath}.camera.path`, "移动镜头 path");
            requireString(errors, camera.endState, `${shotPath}.camera.endState`, "移动镜头 endState");
            if (!isFilled(camera.amplitude)) issue(warnings, "MOVE_AMPLITUDE", `${shotPath}.camera.amplitude`, "建议说明移动幅度");
            if (!isFilled(camera.speed)) issue(warnings, "MOVE_SPEED", `${shotPath}.camera.speed`, "建议说明移动速度");
          }

          for (const key of ["composition", "blocking", "eyeline", "action", "framePrompt", "motionPrompt"]) {
            requireString(errors, shot[key], `${shotPath}.${key}`, key);
          }

          if (shot.motionPlan !== undefined) {
            const motion = isObject(shot.motionPlan) ? shot.motionPlan : {};
            if (!isObject(shot.motionPlan)) issue(errors, "MOTION_PLAN", `${shotPath}.motionPlan`, "motionPlan 必须是对象");
            requireString(errors, motion.primaryMotion, `${shotPath}.motionPlan.primaryMotion`, "primaryMotion");
            requireStringArray(errors, motion.secondaryMotion, `${shotPath}.motionPlan.secondaryMotion`, "secondaryMotion", true);
            if (!isObject(motion.phases)) issue(errors, "MOTION_PHASES", `${shotPath}.motionPlan.phases`, "phases 必须是对象");
            for (const phase of ["setup", "trigger", "development", "settle"]) requireString(errors, motion.phases?.[phase], `${shotPath}.motionPlan.phases.${phase}`, phase);
            if (!MOTION_LOADS.has(motion.motionLoad)) issue(errors, "MOTION_LOAD", `${shotPath}.motionPlan.motionLoad`, "motionLoad 必须为 low、medium 或 high");
            if (arrayOf(motion.secondaryMotion).length > 2) issue(warnings, "MOTION_COMPETITION", `${shotPath}.motionPlan.secondaryMotion`, "一镜超过两个次运动，可能与主运动争夺注意力");
          }

          if (shot.poseContinuity !== undefined) {
            const pose = isObject(shot.poseContinuity) ? shot.poseContinuity : {};
            if (!isObject(shot.poseContinuity)) issue(errors, "POSE_CONTINUITY", `${shotPath}.poseContinuity`, "poseContinuity 必须是对象");
            requireString(errors, pose.posture, `${shotPath}.poseContinuity.posture`, "posture");
            requireStringArray(errors, pose.supportPoints, `${shotPath}.poseContinuity.supportPoints`, "supportPoints");
            if (pose.propHands !== undefined && !isObject(pose.propHands)) issue(errors, "PROP_HANDS", `${shotPath}.poseContinuity.propHands`, "propHands 必须是道具 ID 到 left/right 的对象");
            for (const [propId, hand] of Object.entries(isObject(pose.propHands) ? pose.propHands : {})) {
              if (!isFilled(propId) || !new Set(["left", "right", "both", "none"]).has(hand)) issue(errors, "PROP_HAND_VALUE", `${shotPath}.poseContinuity.propHands.${propId}`, "持物手必须是 left/right/both/none");
            }
          }

          if (shot.informationPlan !== undefined) {
            const info = isObject(shot.informationPlan) ? shot.informationPlan : {};
            if (!isObject(shot.informationPlan)) issue(errors, "INFORMATION_PLAN", `${shotPath}.informationPlan`, "informationPlan 必须是对象");
            if (!INFORMATION_CARRIERS.has(info.carrier)) issue(errors, "INFORMATION_CARRIER", `${shotPath}.informationPlan.carrier`, "carrier 枚举无效");
            if (!DISPLAY_STRATEGIES.has(info.displayStrategy)) issue(errors, "DISPLAY_STRATEGY", `${shotPath}.informationPlan.displayStrategy`, "displayStrategy 枚举无效");
            if (!INFORMATION_CRITICALITY.has(info.criticality)) issue(errors, "INFORMATION_CRITICALITY", `${shotPath}.informationPlan.criticality`, "criticality 枚举无效");
            const readable = requireStringArray(errors, info.requiredReadableElements, `${shotPath}.informationPlan.requiredReadableElements`, "requiredReadableElements", info.criticality !== "plot-essential");
            if (info.criticality === "plot-essential" && info.displayStrategy === "contextual") issue(errors, "PLOT_INFO_CONTEXTUAL", `${shotPath}.informationPlan.displayStrategy`, "剧情关键信息不能只留在环境内的小屏幕中");
            if (new Set(["insert", "full-frame-content"]).has(info.displayStrategy)) {
              if (!isNumber(info.minFrameCoverage) || info.minFrameCoverage <= 0 || info.minFrameCoverage > 1) issue(errors, "FRAME_COVERAGE", `${shotPath}.informationPlan.minFrameCoverage`, "插入/全屏信息镜头必须给 0–1 的 minFrameCoverage");
              if (!COVERAGE_METRICS.has(info.coverageMetric)) issue(errors, "COVERAGE_METRIC", `${shotPath}.informationPlan.coverageMetric`, "coverageMetric 必须是 frame-height、frame-width 或 frame-area");
              if (info.displayStrategy === "insert" && isNumber(info.minFrameCoverage) && info.minFrameCoverage < 0.5) issue(errors, "INSERT_TOO_SMALL", `${shotPath}.informationPlan.minFrameCoverage`, "关键信息插入镜头至少覆盖画面 50%");
              if (info.displayStrategy === "full-frame-content" && isNumber(info.minFrameCoverage) && info.minFrameCoverage < 0.9) issue(errors, "FULL_FRAME_TOO_SMALL", `${shotPath}.informationPlan.minFrameCoverage`, "全屏内容镜头至少覆盖画面 90%");
            }
            if (info.exactText === true && info.displayStrategy !== "post-composite") issue(errors, "EXACT_TEXT_ROUTE", `${shotPath}.informationPlan.displayStrategy`, "需要精确文字时必须使用 post-composite");
            if (readable.length && !/信息|揭示|证据|看清|read|reveal|screen|content/i.test(shot.dramaticPurpose ?? "")) issue(warnings, "INFORMATION_PURPOSE", `${shotPath}.dramaticPurpose`, "关键信息镜头的 dramaticPurpose 应说明观众需要看清什么");
          }
          if (!SCREEN_DIRECTIONS.has(shot.screenDirection)) issue(errors, "SCREEN_DIRECTION", `${shotPath}.screenDirection`, "screenDirection 枚举无效");
          if (!AXIS_ACTIONS.has(shot.axisAction)) issue(errors, "AXIS_ACTION", `${shotPath}.axisAction`, "axisAction 枚举无效");
          if (shot.axisAction === "cross") requireString(errors, shot.axisJustification, `${shotPath}.axisJustification`, "越轴理由");
          if (shot.axisAction === "reset" && !isFilled(shot.axisJustification)) issue(errors, "AXIS_RESET", `${shotPath}.axisJustification`, "重置轴线必须说明画面如何建立新关系");
          if (!TRANSITIONS.has(shot.transition)) issue(errors, "TRANSITION", `${shotPath}.transition`, "transition 枚举无效");

          episodeShots.push(shot);
          sceneShots.push(shot);
        }

        if (isNumber(clip.duration) && Math.abs(cursor - clip.duration) > EPSILON) {
          issue(errors, "CLIP_SHOT_SUM", `${clipPath}.duration`, `镜头合计 ${fixed(cursor)} 秒，不等于片段 ${fixed(clip.duration)} 秒`);
        }

        if (generation.mode?.startsWith("h3-")) validateH3Clip({ clip, clipPath, format, beatById, voiceById, errors, warnings });
        else if (!usesPromptDialogue(format.audioRoute) && /<d>[\s\S]*?<\/d>/i.test(clip.modelPrompt ?? "")) {
          issue(errors, "AUDIO_ROUTE_CONFLICT", `${clipPath}.modelPrompt`, `${format.audioRoute} 路线不得包含原生对白块`);
        }
      }

      for (const [beatId, claims] of primaryClaims) {
        if (claims.length === 0) issue(errors, "BEAT_UNCLAIMED", `${scenePath}.sourceBeats`, `${beatId} 没有被任何镜头主要认领`);
        if (claims.length > 1) issue(errors, "BEAT_MULTICLAIMED", `${scenePath}.clips`, `${beatId} 被多个镜头主要认领：${claims.join(", ")}`);
      }

      if (sceneShots.length >= 6) {
        const closeRatio = sceneShots.filter((shot) => CLOSE_SIZES.has(shot.size)).length / sceneShots.length;
        const movingRatio = sceneShots.filter((shot) => shot.camera?.move && shot.camera.move !== "static").length / sceneShots.length;
        if (closeRatio > 0.6) issue(warnings, "CLOSEUP_OVERUSE", scenePath, `近景/特写/插入占 ${Math.round(closeRatio * 100)}%，可能失去景别层级`);
        if (movingRatio > 0.7) issue(warnings, "MOVEMENT_OVERUSE", scenePath, `运动镜头占 ${Math.round(movingRatio * 100)}%，请确认每次移动均有戏剧触发`);
      }
      const sceneSeconds = sceneShots.reduce((sum, shot) => sum + (isNumber(shot.duration) ? shot.duration : 0), 0);
      const uniqueSizes = new Set(sceneShots.map((shot) => shot.size));
      if (sceneSeconds > 30 && uniqueSizes.size < 2) issue(warnings, "SHOT_SCALE_FLAT", scenePath, "超过 30 秒的场景只有一个景别，视觉层级可能过平");
      if (sceneShots.length >= 3 && !sceneShots.some((shot) => /反应|发现|揭示|证据|权力|reaction|reveal/i.test(shot.dramaticPurpose ?? ""))) {
        issue(warnings, "TURN_NOT_VISUALIZED", scenePath, "未发现明确承担反应、揭示、证据或权力变化的镜头，请确认场内转折已视觉化");
      }
    }

    if (isNumber(episode.targetSeconds) && Math.abs(episodeSeconds - episode.targetSeconds) > EPSILON) {
      issue(errors, "EPISODE_SHOT_SUM", `${epPath}.targetSeconds`, `片段合计 ${fixed(episodeSeconds)} 秒，不等于单集目标 ${fixed(episode.targetSeconds)} 秒`);
    }
    if (episodeShots.length >= 6) {
      const lensSet = new Set(episodeShots.map((shot) => shot.lensMm).filter(isNumber));
      if (lensSet.size === 1) issue(warnings, "LENS_FLAT", epPath, "全集团只有一个焦段，请确认视觉距离是否随戏剧层级变化");
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

export function seedPackage(script, options = {}) {
  if (!isObject(script) || !Array.isArray(script.episodes)) throw new Error("输入必须包含 episodes 数组");
  const aspectRatio = options.aspectRatio ?? script.aspectRatio ?? script.format?.aspectRatio ?? "16:9";
  const mode = options.mode ?? "model-agnostic";
  const audioRoute = options.audioRoute ?? (mode === "h3-ref2va" ? "h3-native-reference" : "tts-post");
  if (!AUDIO_ROUTES.has(audioRoute)) throw new Error(`无效 audioRoute: ${audioRoute}`);
  if (!GENERATION_MODES.has(mode)) throw new Error(`无效 generation mode: ${mode}`);
  const isH3 = mode.startsWith("h3-");

  return {
    schemaVersion: "1.0",
    title: script.source ?? script.title ?? "未命名短剧",
    source: options.source ?? "上游 script.json",
    format: {
      aspectRatio,
      fps: 24,
      audioRoute,
      soundPlan: {
        ambienceRoute: "post",
        foleyRoute: "post",
        musicRoute: "post",
        fallbackDialogueRoute: "tts-post"
      },
      generation: {
        mode,
        minClipSeconds: isH3 ? 4 : 1,
        maxClipSeconds: 15,
        integerDuration: isH3
      }
    },
    visualBible: {
      genreTone: "",
      palette: "",
      contrast: "",
      cameraPersonality: "",
      lensStrategy: "",
      compositionStrategy: "",
      movementRules: [],
      continuityRules: [],
      motifs: []
    },
    voiceAssets: [],
    episodes: script.episodes.map((episode, epIndex) => {
      const epNumber = Number.isInteger(episode.ep) ? episode.ep : epIndex + 1;
      return {
        ep: epNumber,
        targetSeconds: episode.targetSeconds ?? 90,
        dramaticQuestion: episode.hook ?? "",
        coldOpen: episode.hook ?? "",
        turnPoints: [],
        climax: "",
        cliff: episode.cliff ?? "",
        emotionCurve: [],
        scenes: arrayOf(episode.scenes).map((scene, sceneIndex) => {
          const sceneId = `E${pad(epNumber)}-S${pad(sceneIndex + 1)}`;
          const sourceBeats = arrayOf(scene.flow).map((beat, beatIndex) => {
            const dialogue = isFilled(beat.line) || isFilled(beat.speaker);
            return {
              beatId: `${sceneId}-B${pad(beatIndex + 1, 3)}`,
              kind: dialogue ? "dialogue" : "action",
              ...(dialogue ? { speaker: beat.speaker ?? "UNKNOWN" } : {}),
              text: dialogue ? beat.line ?? "" : beat.action ?? "",
              ...(isFilled(beat.delivery) ? { delivery: beat.delivery } : {})
            };
          });
          const sourceSceneId = scene.sceneId ?? `S${pad(sceneIndex + 1)}`;
          const locationHint = scene.slug ?? scene.heading ?? scene.location ?? scene.lighting ?? "未命名场景";
          return {
            sceneId,
            sourceSceneId,
            slug: String(locationHint),
            objective: "",
            obstacle: "",
            turn: "",
            valueShift: "",
            powerShift: "",
            geography: "",
            axis: "",
            blocking: [],
            continuityIn: "",
            continuityOut: "",
            sourceBeats,
            inventedBeats: [],
            clips: []
          };
        })
      };
    }),
    assumptions: [
      `seed 自动采用 ${aspectRatio}、24 fps、${audioRoute} 声音路线与 ${mode} 生成模式；导演需复核`,
      "空白导演字段必须在设计镜头前补全"
    ],
    unresolvedRisks: []
  };
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function cameraSummary(camera = {}) {
  if (camera.move === "static") return "static";
  return [camera.move, camera.trigger, camera.path, camera.endState].filter(isFilled).join("；");
}

export function renderPackage(data) {
  const lines = [];
  lines.push(`# ${data.title ?? "未命名短剧"}｜导演镜头单`, "");
  const format = data.format ?? {};
  lines.push(`- 画幅：${format.aspectRatio ?? "—"}｜${format.fps ?? "—"} fps`, `- 声音路线：${format.audioRoute ?? "—"}`, `- 生成模式：${format.generation?.mode ?? "—"}`, `- 环境：${format.soundPlan?.ambienceRoute ?? "—"}｜拟音：${format.soundPlan?.foleyRoute ?? "—"}｜音乐：${format.soundPlan?.musicRoute ?? "—"}`, `- 已登记音色资产：${arrayOf(data.voiceAssets).length}`, "");

  const bible = data.visualBible ?? {};
  lines.push("## 导演总则", "");
  lines.push(`- 类型与气质：${bible.genreTone ?? "—"}`, `- 摄影机人格：${bible.cameraPersonality ?? "—"}`, `- 焦段策略：${bible.lensStrategy ?? "—"}`, `- 构图策略：${bible.compositionStrategy ?? "—"}`, "");

  for (const episode of arrayOf(data.episodes)) {
    lines.push(`## 第 ${episode.ep} 集｜${episode.targetSeconds} 秒`, "");
    lines.push(`- 戏剧问题：${episode.dramaticQuestion}`, `- 冷开场：${episode.coldOpen}`, `- 转折：${arrayOf(episode.turnPoints).join("；")}`, `- 高潮：${episode.climax}`, `- 悬念：${episode.cliff}`, `- 情绪曲线：${arrayOf(episode.emotionCurve).join(" → ")}`, "");

    for (const scene of arrayOf(episode.scenes)) {
      lines.push(`### ${scene.sceneId}｜${scene.slug}`, "");
      lines.push(`**导演拆戏**：目标「${scene.objective}」；阻碍「${scene.obstacle}」；转折「${scene.turn}」；价值变化「${scene.valueShift}」；权力变化「${scene.powerShift}」。`, "");
      lines.push(`**空间与轴线**：${scene.geography}；${scene.axis}`, "");
      lines.push(`**调度**：${arrayOf(scene.blocking).join(" → ")}`, "");

      for (const clip of arrayOf(scene.clips)) {
        lines.push(`#### ${clip.clipId}｜${clip.duration} 秒`, "", `${clip.dramaticFunction}  \\`, `声音：${clip.audioPlan}`, "");
        lines.push("| 时间 | 镜头 | 节拍 | 景别/机位 | 摄影机 | 戏剧目的 | 构图与行动 | 转场 |", "|---|---|---|---|---|---|---|---|");
        for (const shot of arrayOf(clip.shots)) {
          const time = `${fixed(shot.start)}–${fixed(shot.start + shot.duration)}s`;
          const framing = `${shot.size}/${shot.angle}/${shot.lensMm ?? "—"}mm`;
          const action = `${shot.composition}；${shot.blocking}；${shot.action}`;
          lines.push(`| ${escapeCell(time)} | ${escapeCell(shot.shotId)} | ${escapeCell(arrayOf(shot.beatRefs).join(", "))} | ${escapeCell(framing)} | ${escapeCell(cameraSummary(shot.camera))} | ${escapeCell(shot.dramaticPurpose)} | ${escapeCell(action)} | ${escapeCell(shot.transition)} |`);
        }
        lines.push("");
        if (isFilled(clip.modelPrompt)) {
          lines.push("<details>", `<summary>${clip.clipId} 模型提示词</summary>`, "", "```text", clip.modelPrompt.trim(), "```", "", "</details>", "");
        }
      }
    }
  }

  if (arrayOf(data.assumptions).length) {
    lines.push("## 假设", "", ...data.assumptions.map((item) => `- ${item}`), "");
  }
  if (arrayOf(data.unresolvedRisks).length) {
    lines.push("## 未解决风险", "", ...data.unresolvedRisks.map((item) => `- ${item}`), "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function readJson(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function printValidation(result, jsonMode = false) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.ok ? "PASS｜导演镜头包通过结构质量门" : "FAIL｜导演镜头包未通过结构质量门");
  console.log(`统计：${result.stats.episodes} 集 / ${result.stats.scenes} 场 / ${result.stats.clips} 片段 / ${result.stats.shots} 镜头 / ${result.stats.totalSeconds.toFixed(2)} 秒`);
  for (const item of result.errors) console.log(`[ERROR ${item.code}] ${item.path}｜${item.message}`);
  for (const item of result.warnings) console.log(`[WARN  ${item.code}] ${item.path}｜${item.message}`);
  console.log(`结果：${result.errors.length} errors, ${result.warnings.length} warnings`);
}

function usage() {
  console.log(`short-drama-director toolkit

Usage:
  node scripts/director-kit.mjs seed <script.json> [--aspect 16:9] [--audio h3-native-reference] [--mode h3-ref2va]
  node scripts/director-kit.mjs validate <director-package.json> [--json]
  node scripts/director-kit.mjs render <director-package.json>
`);
}

async function main() {
  const [command, file, ...args] = process.argv.slice(2);
  if (!command || ["-h", "--help", "help"].includes(command)) {
    usage();
    return;
  }
  if (!file) throw new Error(`${command} 需要输入文件路径`);
  const resolved = path.resolve(file);
  const data = readJson(resolved);

  if (command === "seed") {
    const seeded = seedPackage(data, {
      source: resolved,
      aspectRatio: optionValue(args, "--aspect", undefined),
      audioRoute: optionValue(args, "--audio", undefined),
      mode: optionValue(args, "--mode", "model-agnostic")
    });
    console.log(JSON.stringify(seeded, null, 2));
    return;
  }
  if (command === "validate") {
    const result = validatePackage(data);
    printValidation(result, args.includes("--json"));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "render") {
    process.stdout.write(renderPackage(data));
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
