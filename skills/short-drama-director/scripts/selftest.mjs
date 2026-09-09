#!/usr/bin/env node

import assert from "node:assert/strict";
import { renderPackage, seedPackage, validatePackage } from "./director-kit.mjs";

function makeShot(overrides = {}) {
  return {
    shotId: "E01-S01-C01-SH01",
    start: 0,
    duration: 4,
    beatRefs: ["E01-S01-B001"],
    audioCarryRefs: [],
    dramaticPurpose: "用公开空间中的靠近动作建立人物压力",
    size: "MWS",
    angle: "eye",
    lensMm: 35,
    camera: {
      move: "track",
      amplitude: "后退半米",
      speed: "平稳",
      trigger: "人物走入通道",
      path: "沿人物前进方向后退",
      endState: "停成双人中全景"
    },
    focus: "保持人物双眼清晰",
    composition: "前景宾客遮挡，人物位于纵深中心",
    blocking: "人物走近并把文件递到两人之间",
    eyeline: "两人平视",
    screenDirection: "left-to-right",
    axisAction: "keep",
    axisJustification: "",
    action: "文件进入画面中心",
    dialogueRefs: [],
    transition: "cut",
    framePrompt: "竖屏宴会通道，双人中全景，文件位于画面中心",
    motionPrompt: "人物逼近时摄影机短距离后退，结束为稳定双人构图",
    ...overrides
  };
}

function makeValidPackage() {
  const first = makeShot();
  const second = makeShot({
    shotId: "E01-S01-C01-SH02",
    start: 4,
    beatRefs: ["E01-S01-B002"],
    audioCarryRefs: [],
    dramaticPurpose: "留在听者反应上，使她识别文件中的隐藏威胁",
    size: "CU",
    angle: "eye",
    lensMm: 75,
    camera: { move: "static", amplitude: "", speed: "", trigger: "", path: "", endState: "" },
    focus: "眼睛到文件封口的短促摇焦",
    composition: "脸与文件封口沿竖向排列，背景人物虚化",
    blocking: "她不接文件，只用拇指压住封口",
    eyeline: "先看文件，再抬眼看对方",
    screenDirection: "neutral",
    action: "克制反应后抬眼",
    dialogueRefs: ["E01-S01-B002"],
    framePrompt: "竖屏近景，女人的眼睛与文件封口位于同一垂直线",
    motionPrompt: "机位静止，焦点从眼睛短促转到封口再回到眼睛"
  });
  return {
    schemaVersion: "1.0",
    title: "测试短剧",
    source: "selftest",
    format: {
      aspectRatio: "9:16",
      fps: 24,
      audioRoute: "tts-post",
      soundPlan: { ambienceRoute: "post", foleyRoute: "post", musicRoute: "post", fallbackDialogueRoute: "tts-post" },
      generation: { mode: "model-agnostic", minClipSeconds: 1, maxClipSeconds: 15, integerDuration: false }
    },
    visualBible: {
      genreTone: "都市悬疑，克制紧张",
      palette: "冷灰背景与暖色证据",
      contrast: "中高反差",
      cameraPersonality: "先观察，发现威胁后贴近",
      lensStrategy: "35mm 建立关系，75mm 捕捉认知",
      compositionStrategy: "竖向排列脸与证据",
      movementRules: ["人物施压时跟随，认知转折时静止"],
      continuityRules: ["维持通道主轴"],
      motifs: ["文件封口与眼睛同框"]
    },
    voiceAssets: [],
    episodes: [{
      ep: 1,
      targetSeconds: 8,
      dramaticQuestion: "她能否识别文件里的威胁？",
      coldOpen: "一份不能让媒体看见的文件被递到她面前",
      turnPoints: ["她看见封口上的名字"],
      climax: "她拒绝立刻接过文件",
      cliff: "她抬眼发现递文件的人正挡住出口",
      emotionCurve: ["疑惑", "受压", "警觉"],
      scenes: [{
        sceneId: "E01-S01",
        slug: "内景·宴会通道·夜",
        objective: "她要确认文件内容而不暴露不安",
        obstacle: "对方用时间和公众环境逼她服从",
        turn: "她从封口细节识别出威胁",
        valueShift: "被动接收→主动警觉",
        powerShift: "递文件者施压→她用拒绝接手暂停局势",
        geography: "狭窄通道连接宴会厅与后台",
        axis: "两人目光连线；保持宴会厅一侧",
        blocking: ["递文件者逼近", "她留在原位", "文件停在两人之间"],
        continuityIn: "她空手站在通道出口",
        continuityOut: "文件仍在对方手里，她抬眼锁定对方",
        sourceBeats: [
          { beatId: "E01-S01-B001", kind: "action", text: "男人走近并递出文件。" },
          { beatId: "E01-S01-B002", kind: "dialogue", speaker: "C01", text: "这是什么？", delivery: "压低声音" }
        ],
        inventedBeats: [],
        clips: [{
          clipId: "E01-S01-C01",
          duration: 8,
          dramaticFunction: "把公开场合转化成秘密施压空间",
          audioPlan: "宴会底噪；对白后期 TTS",
          referenceMode: "none",
          references: [],
          shots: [first, second],
          modelPrompt: ""
        }]
      }]
    }],
    assumptions: [],
    unresolvedRisks: []
  };
}

function clone(value) {
  return structuredClone(value);
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("valid package passes", () => {
  const result = validatePackage(makeValidPackage());
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test("seed creates stable beat ids", () => {
  const seeded = seedPackage({ source: "样片", episodes: [{ ep: 2, targetSeconds: 60, hook: "谁拿走了证据？", cliff: "门外出现脚步声", scenes: [{ sceneId: "S09", lighting: "夜", flow: [{ action: "她关门。" }, { speaker: "C01", line: "谁？", delivery: "警觉" }] }] }] });
  assert.equal(seeded.episodes[0].scenes[0].sourceBeats[0].beatId, "E02-S01-B001");
  assert.equal(seeded.episodes[0].scenes[0].sourceBeats[1].kind, "dialogue");
  assert.equal(seeded.episodes[0].scenes[0].sourceSceneId, "S09");
  assert(Array.isArray(seeded.voiceAssets));
});

test("H3 seed defaults to approved-reference workflow", () => {
  const seeded = seedPackage({ source: "样片", episodes: [] }, { mode: "h3-ref2va" });
  assert.equal(seeded.format.audioRoute, "h3-native-reference");
  assert.equal(seeded.format.soundPlan.musicRoute, "post");
});

test("unclaimed beat fails", () => {
  const data = makeValidPackage();
  data.episodes[0].scenes[0].clips[0].shots.pop();
  data.episodes[0].scenes[0].clips[0].duration = 4;
  data.episodes[0].targetSeconds = 4;
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "BEAT_UNCLAIMED"));
});

test("missing camera motivation fails", () => {
  const data = makeValidPackage();
  data.episodes[0].scenes[0].clips[0].shots[0].camera.trigger = "";
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.path.endsWith("camera.trigger")));
});

test("timeline gap fails", () => {
  const data = makeValidPackage();
  data.episodes[0].scenes[0].clips[0].shots[1].start = 5;
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "SHOT_TIMELINE"));
});

test("unjustified axis cross fails", () => {
  const data = makeValidPackage();
  const shot = data.episodes[0].scenes[0].clips[0].shots[1];
  shot.axisAction = "cross";
  shot.axisJustification = "";
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.path.endsWith("axisJustification")));
});

test("pose support and information coverage metric are enforced", () => {
  const data = makeValidPackage();
  const shot = data.episodes[0].scenes[0].clips[0].shots[0];
  shot.poseContinuity = { posture: "lying-on-right-side", supportPoints: [], propHands: { P01: "left" } };
  shot.informationPlan = {
    carrier: "phone-screen",
    criticality: "plot-essential",
    displayStrategy: "insert",
    requiredReadableElements: ["steaming food"],
    minFrameCoverage: 0.85,
    exactText: false
  };
  let result = validatePackage(data);
  assert(result.errors.some((item) => item.path.endsWith("poseContinuity.supportPoints")));
  assert(result.errors.some((item) => item.code === "COVERAGE_METRIC"));
  shot.poseContinuity.supportPoints = ["right elbow on pillow", "right hip on mattress"];
  shot.informationPlan.coverageMetric = "frame-height";
  result = validatePackage(data);
  assert(!result.errors.some((item) => item.code === "POSE_CONTINUITY" || item.code === "COVERAGE_METRIC"));
});

test("pacing and in-frame motion plans are deterministic", () => {
  const data = makeValidPackage();
  const clip = data.episodes[0].scenes[0].clips[0];
  const shot = clip.shots[0];
  clip.pacingPlan = {
    baselineSeconds: 10,
    targetSeconds: clip.duration,
    compressionRatio: clip.duration / 10,
    method: "retime-shots",
    protectedHolds: ["reaction hold"]
  };
  shot.motionPlan = {
    primaryMotion: "the folder enters and settles",
    secondaryMotion: ["her gaze drops to the seal"],
    phases: { setup: "folder off-screen", trigger: "hand rises", development: "folder crosses frame", settle: "folder stops between them" },
    motionLoad: "medium"
  };
  let result = validatePackage(data);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  clip.pacingPlan.compressionRatio = 0.5;
  shot.motionPlan.phases.settle = "";
  result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "PACING_RATIO_MISMATCH"));
  assert(result.errors.some((item) => item.path.endsWith("motionPlan.phases.settle")));
});

test("H3 Ref2VA mode and approved reference voice pass", () => {
  const data = makeValidPackage();
  data.format.audioRoute = "h3-native-reference";
  data.format.generation = { mode: "h3-ref2va", minClipSeconds: 4, maxClipSeconds: 15, integerDuration: true };
  data.voiceAssets = [{
    voiceAssetId: "VA-C01",
    characterId: "C01",
    path: "C01-voice.wav",
    durationSeconds: 6,
    language: "zh-CN",
    rights: "consented",
    status: "approved",
    sha256: "a".repeat(64)
  }];
  const clip = data.episodes[0].scenes[0].clips[0];
  clip.referenceMode = "multi-reference";
  clip.references = [
    { refId: "R01", role: "reference_image", path: "C01.png", subjectId: "C01" },
    { refId: "RA01", role: "reference_audio", path: "C01-voice.wav", durationSeconds: 6, relation: "reference", voiceAssetId: "VA-C01" }
  ];
  clip.speakerBindings = [{ characterId: "C01", speakerId: "S1", voiceAssetId: "VA-C01", audioRefId: "RA01" }];
  clip.modelPrompt = `subject_definitions:\nWoman C01 wears a charcoal suit and holds a sealed folder. <Audio 1> is the voice-timbre reference for <Subject 1> (S1).\nsummary:\nA public corridor becomes a private pressure chamber.\nretention_analysis:\nRetain her face, charcoal suit, sealed folder, corridor geometry, cool overhead light, and S1 voice identity.\ndetailed_description:\n[Shot 1] A 35mm medium-wide track retreats as a man approaches and places the folder between them, ending in a stable two-shot.\n[Shot 2] At 00:04.000, Cut to a static 75mm close-up. Focus moves from her eyes to the seal and back. S1 asks with restrained suspicion: <d>这是什么？</d>\noverall_soundscape:\nMuted banquet ambience, cloth movement, paper friction, spatially grounded Chinese dialogue.\nnon_diegetic_music:\nNone`;
  const result = validatePackage(data);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert(result.warnings.some((item) => item.code === "H3_PROMPT_THIN"));
  const unboundPrompt = clone(data);
  unboundPrompt.episodes[0].scenes[0].clips[0].modelPrompt = unboundPrompt.episodes[0].scenes[0].clips[0].modelPrompt.replace("<Audio 1> is the voice-timbre reference for <Subject 1> (S1).", "Voice reference supplied.");
  const unboundResult = validatePackage(unboundPrompt);
  assert(unboundResult.errors.some((item) => item.code === "H3_PROMPT_VOICE_BINDING"));
});

test("H3 prompt must keep dialogue in its shot block", () => {
  const data = makeValidPackage();
  data.format.audioRoute = "h3-native-free";
  data.format.generation = { mode: "h3-ref2va", minClipSeconds: 4, maxClipSeconds: 15, integerDuration: true };
  const clip = data.episodes[0].scenes[0].clips[0];
  clip.referenceMode = "multi-reference";
  clip.references = [{ refId: "R01", role: "reference_image", path: "C01.png" }];
  clip.modelPrompt = `subject_definitions:\nC01.\nsummary:\nPressure.\nretention_analysis:\nRetain identity.\ndetailed_description:\n[Shot 1] <d>这是什么？</d>\n[Shot 2] At 00:04.000, She reacts.\noverall_soundscape:\nRoom.\nnon_diegetic_music:\nNone`;
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "H3_DIALOGUE_WINDOW"));
});

test("H3 reference voice requires explicit speaker binding", () => {
  const data = makeValidPackage();
  data.format.audioRoute = "h3-native-reference";
  data.format.generation = { mode: "h3-ref2va", minClipSeconds: 4, maxClipSeconds: 15, integerDuration: true };
  const clip = data.episodes[0].scenes[0].clips[0];
  clip.referenceMode = "multi-reference";
  clip.references = [{ refId: "R01", role: "reference_image", path: "C01.png" }];
  clip.modelPrompt = `subject_definitions:\nC01.\nsummary:\nPressure.\nretention_analysis:\nRetain identity.\ndetailed_description:\n[Shot 1] A folder enters frame.\n[Shot 2] At 00:04.000, S1 asks <d>这是什么？</d>\noverall_soundscape:\nRoom.\nnon_diegetic_music:\nNone`;
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "H3_SPEAKER_BINDING"));
});

test("H3 audio reference cannot be the only media", () => {
  const data = makeValidPackage();
  data.format.audioRoute = "h3-native-free";
  data.format.generation = { mode: "h3-ref2va", minClipSeconds: 4, maxClipSeconds: 15, integerDuration: true };
  const clip = data.episodes[0].scenes[0].clips[0];
  clip.referenceMode = "multi-reference";
  clip.references = [{ refId: "RA01", role: "reference_audio", path: "voice.wav", durationSeconds: 4, relation: "reference" }];
  clip.modelPrompt = `subject_definitions:\nC01.\nsummary:\nPressure.\nretention_analysis:\nRetain identity.\ndetailed_description:\n[Shot 1] A folder enters frame.\n[Shot 2] At 00:04.000, S1 asks <d>这是什么？</d>\noverall_soundscape:\nRoom.\nnon_diegetic_music:\nNone`;
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "H3_AUDIO_ONLY_REFERENCE"));
});

test("TTS route rejects native dialogue blocks", () => {
  const data = makeValidPackage();
  data.episodes[0].scenes[0].clips[0].modelPrompt = "<d>这是什么？</d>";
  const result = validatePackage(data);
  assert(result.errors.some((item) => item.code === "AUDIO_ROUTE_CONFLICT"));
});

test("render produces operational shot table", () => {
  const markdown = renderPackage(makeValidPackage());
  assert(markdown.includes("# 测试短剧｜导演镜头单"));
  assert(markdown.includes("E01-S01-C01-SH02"));
  assert(markdown.includes("权力变化"));
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack ?? error.message);
  }
}

console.log(`${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exitCode = 1;
