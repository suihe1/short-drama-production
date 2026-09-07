# `production.json` 合同

`production.json` 只保存生产状态与引用，不复制大纲、剧本或分镜正文。

## 1. 顶层示例

```json
{
  "schemaVersion": "1.0",
  "project": {
    "id": "my-drama",
    "title": "我的短剧",
    "createdAt": "2026-08-23T00:00:00.000Z",
    "updatedAt": "2026-08-23T00:00:00.000Z",
    "format": {
      "aspectRatio": "16:9",
      "orientation": "landscape",
      "deliveryWidth": 1920,
      "deliveryHeight": 1080,
      "fps": 24,
      "compositionProfile": "landscape-ensemble",
      "safeArea": { "action": 0.95, "title": 0.90 },
      "generationResolution": "768P",
      "episodeCount": null,
      "episodeSeconds": null,
      "targetModel": "MiniMax-H3"
    }
  },
  "policies": {
    "batchEpisodes": 3,
    "pilotJobs": 1,
    "videoProvider": "minimax-official",
    "defaultDialogueRoute": "h3-native-reference",
    "ambienceRoute": "h3-native",
    "foleyRoute": "hybrid",
    "musicRoute": "post",
    "contextIrPolicy": "pilot",
    "paidGenerationRequiresApproval": true
  },
  "artifacts": [],
  "voiceAssets": [],
  "jobs": [],
  "approvals": [],
  "risks": []
}
```

`contextIrPolicy` 使用 `off`、`pilot`、`selective`、`on`：新项目默认 `pilot`；完成受控样片后，只有同类镜头实测获益且未损失硬约束时才改为 `selective` 或 `on`。`selective` 表示逐 job 显式设置，适合运动复杂但精确文字、手部或连续性风险不一致的短剧。

新建项目默认使用上述 16:9 合同。`aspectRatio` 改变时，`orientation`、交付尺寸、构图配置和安全区必须一起按预设更新，并使全部非源制品过期。`generationResolution` 仅允许 `768P` / `2K`；它是 H3 生成档位，不是最终交付尺寸。

## 2. 制品 `artifacts`

```json
{
  "id": "director-e01-e03",
  "kind": "director",
  "stage": "director",
  "producer": "short-drama-director",
  "path": "director/e01-e03/director-package.json",
  "episodes": "1-3",
  "dependsOn": ["script-e01-e03", "cast", "art"],
  "status": "approved",
  "sha256": "当前文件哈希",
  "approvedSha256": "审批时文件哈希",
  "approvedDependencyHashes": {
    "script-e01-e03": "审批时上游哈希",
    "cast": "审批时上游哈希",
    "art": "审批时上游哈希"
  },
  "updatedAt": "ISO 时间",
  "notes": []
}
```

字段：

- `id`：全项目唯一、稳定，允许小写字母、数字、点、下划线和短横线。
- `kind`：`source`、`outline`、`cast`、`art`、`script`、`director`、`storyboard`、`frames`、`video`、`audio`、`edit`、`qc`、`delivery`。
- `stage`：与 `kind` 对应的生产阶段；必要时可把多个文件归在同一阶段。
- `producer`：专业 Skill 名或 `manual`。
- `path`：相对 `production.json` 的路径；项目外来源可以是绝对路径。
- `episodes`：`all`、`1`、`1-3` 等可读范围。
- `dependsOn`：上游制品 ID，不得形成环。
- `status`：`planned`、`working`、`review`、`approved`、`stale`、`missing`、`blocked`、`failed`、`skipped`。

`approve` 捕获 `approvedSha256` 与 `approvedDependencyHashes`。`refresh` 发现本文件改变时标记 `review`，发现上游改变时标记 `stale`。

## 3. 声音资产 `voiceAssets`

```json
{
  "voiceAssetId": "V-C01-MASTER",
  "characterId": "C01",
  "path": "voices/C01-master.wav",
  "sha256": "文件哈希",
  "language": "zh",
  "durationSeconds": 10,
  "sampleType": "voice-master",
  "rights": "synthetic",
  "licenseScope": "evaluation-only",
  "provider": "fish-audio",
  "providerModel": "s2.1-pro-free",
  "providerVoiceId": "Fish reference_id",
  "sourceType": "voice-design-private-clone",
  "status": "approved",
  "notes": "女中音，克制，句尾不明显上扬"
}
```

- `sampleType`：`voice-master`、`exact-line`、`performance-reference`、`ambience`、`music`。
- `rights`：`synthetic`、`owned`、`licensed`、`consented`、`unknown`。
- `status`：`draft`、`approved`、`rejected`、`missing`。
- `licenseScope`：`evaluation-only` 或 `commercial`。`s2.1-pro-free` 强制为 `evaluation-only`。
- `provider` / `providerModel` / `providerVoiceId`：记录生成服务、模型和可复用声音 ID；不得保存 API key。
- `sourceType`：例如 `voice-design-private-clone`、`owned-clone`、`licensed-library` 或 `manual`。

用于付费任务的真实人物音频不得为 `rights=unknown`。声音母版建议 6–12 秒干声；H3 接口硬范围为 2–15 秒。
评估声音可以用于内部 H3 样片，但任何已批准 `delivery` 不得引用 `evaluation-only` 声音；升级时必须重生成 WAV 并重新审批哈希。

## 4. 生成任务 `jobs`

```json
{
  "jobId": "H3-E01-C01",
  "episode": 1,
  "clipId": "E01-S01-C01",
  "model": "MiniMax-H3",
  "mode": "h3-ref2va",
  "duration": 8,
  "sourceDurationSeconds": 8.4,
  "durationAdjustmentSeconds": -0.4,
  "durationPolicy": "nearest",
  "sequence": 1,
  "ratio": "16:9",
  "resolution": "768P",
  "useContextIr": false,
  "experiment": {
    "groupId": "E01-01-context-ir",
    "baselineJobId": "H3-E01-C01",
    "hypothesis": "Context-IR improves subject and prop motion without losing posture continuity",
    "changedVariables": ["useContextIr"],
    "result": {
      "winnerJobId": null,
      "observedAdvantages": [],
      "causalConclusion": "pending"
    }
  },
  "provider": "minimax-official",
  "dialogueRoute": "h3-native-reference",
  "ambienceRoute": "h3-native",
  "musicRoute": "post",
  "promptPath": "storyboard/E01-01/prompt.md",
  "dependsOn": ["storyboard-e01-e03", "frames-e01-e03"],
  "references": [
    {
      "refId": "IMG-C01",
      "role": "reference_image",
      "path": "cast/images/C01.png",
      "characterId": "C01"
    },
    {
      "refId": "AUD-C01",
      "role": "reference_audio",
      "path": "voices/C01-master.wav",
      "voiceAssetId": "V-C01-MASTER",
      "durationSeconds": 10,
      "relation": "reference"
    }
  ],
  "speakers": [
    {
      "characterId": "C01",
      "speakerId": "S1",
      "voiceAssetId": "V-C01-MASTER",
      "audioRefId": "AUD-C01"
    }
  ],
  "costApproved": false,
  "status": "planned",
  "outputPath": "video/E01-C01.mp4",
  "inputHashes": {},
  "attempt": 0,
  "execution": {
    "provider": "minimax-official",
    "taskId": null
  },
  "qc": {
    "status": "pending",
    "issues": []
  }
}
```

`dialogueRoute`：

- `h3-native-reference`：H3 参考声音母版生成新台词。
- `h3-native-free`：H3 自行生成声音，只用于无固定声音或临时测试。
- `tts-guided-h3`：先有准确台词音频，再由 H3 复用/参考并生成表演。
- `tts-post`：H3 不生成对白，后期配音。
- `silent`：无对白。

任务状态：`planned`、`approved`、`submitted`、`running`、`succeeded`、`failed`、`cancelled`、`rejected`。

- `sequence`：全项目粗剪顺序；同一集按此排序。
- `ratio`：Ref2VA 继承项目画幅；I2VA / FL2VA 必须为 `adaptive`，实际画幅由输入帧决定。
- `resolution`：`768P` 或 `2K`。
- `provider`：`minimax-official` 或 `compshare`。模型同为 MiniMax-H3 不代表两者共享密钥或提交端点。
- `useContextIr`：可选布尔值；CompShare 为 `true` 时在请求顶层发送 `use_context_ir=true`，先执行 Context-IR 提示词优化。对比生成应使用独立 job ID 与输出路径。
- `experiment`：可选的 A/B 审计。`changedVariables` 使用 `promptText`、`promptLanguage`、`referenceSet`、`useContextIr`、`duration`、`resolution`、`seed`。超过一个变化变量时仍可比较整体方案，但验证器会标记 `EXPERIMENT_CONFOUNDED`，禁止把胜因归给单个参数。
- `sourceDurationSeconds` / `durationAdjustmentSeconds` / `durationPolicy`：从分镜小数总时长量化到 H3 整数时长的审计记录；不得悄悄舍入。
- `execution`：外部任务 ID、远端状态、用量与提交/下载时间；不得保存 API key。
- `outputSha256`：成功下载后记录，供剪辑计划与返工追踪。

H3 Ref2VA 合同：

- `duration`：CompShare 为 4–30 秒整数；MiniMax 官方适配器仍按已配置的 4–15 秒整数检查。参考音频/视频的时长限制不随输出时长扩大。
- `reference_image` ≤ 9。
- `reference_video` ≤ 3；每条 2–15 秒，总计 ≤ 15 秒。
- `reference_audio` ≤ 3；每条 2–15 秒，总计 ≤ 15 秒。
- 参考文件合计 ≤ 12。
- 出现 `reference_audio` 时必须同时有参考图或参考视频。
- 参考角色模式与 `first_frame` / `last_frame` 互斥。
- `h3-native-reference` 的每位说话人都必须绑定已批准声音资产和实际 `reference_audio`。
- `tts-guided-h3` 使用 `partially_copy` 或 `fully_copy`；普通声音母版使用 `reference`。
- `submitted`、`running`、`succeeded` 必须已经有成本授权。
- 正式执行提示词按官方 `h3-prompt-writing` 输出英文结构；中文对白、歌词和可见文字保留原文。中文自由 brief + Context-IR 属于另一实验条件，不得与参考集、时长或导演镜头同时改动后声称“中文更好”。

## 5. 导演桥接分镜

`storyboard-bridge.mjs` 产出的 `storyboard.json` 在原分镜核心字段之外增加：

```json
{
  "schemaVersion": "1.1-director-bridge",
  "aspectRatio": "16:9",
  "compositionProfile": "landscape-ensemble",
  "handoff": {
    "sourceDirector": "director-package.json",
    "sourceScript": "script.json",
    "policy": "director-authoritative"
  },
  "episodes": [{
    "ep": 1,
    "segments": [{
      "id": "E01-01",
      "sourceClipId": "E01-S01-C01",
      "generationMode": "h3-ref2va",
      "references": [],
      "speakerBindings": [],
      "promptPath": "h3/E01-01/prompt.md",
      "deviations": [],
      "cuts": [{
        "sourceShotId": "E01-S01-C01-SH01",
        "dramaticPurpose": "原导演镜头目的",
        "size": "wide",
        "angle": "eye",
        "lensMm": 35,
        "cameraPlan": {},
        "screenDirection": "left-to-right",
        "axisAction": "keep",
        "directorIntent": {
          "originalSize": "MWS",
          "angle": "eye",
          "lensMm": 35,
          "camera": {},
          "screenDirection": "left-to-right",
          "axisAction": "keep"
        }
      }]
    }]
  }]
}
```

桥接质量门以 `sourceShotId` 为键核对覆盖、节拍、戏剧目的、景别、角度、焦段、运镜、屏幕方向和轴线。`directorIntent` 是不可篡改的原导演快照；技术字段需要改变时，新增 `deviations`，并明确 `fields`、原因、原方案、修改、戏剧影响、状态和审批人。只有 `status=approved` 且 `approvedBy` 非空的偏差可以通过质量门。

## 6. 审批与风险

审批记录：

```json
{
  "approvalId": "APR-0001",
  "artifactId": "outline",
  "by": "user",
  "at": "ISO 时间",
  "sha256": "审批对象哈希",
  "dependencyHashes": {},
  "note": "确认砍掉支线并将大爆点放在第18集"
}
```

风险记录：

```json
{
  "riskId": "RISK-001",
  "severity": "high",
  "stage": "generate",
  "status": "open",
  "description": "四人同场超过 H3 三条音频参考上限",
  "mitigation": "拆成双人关系镜头，画外台词后期处理"
}
```

`severity`：`low`、`medium`、`high`、`critical`；`status`：`open`、`mitigated`、`accepted`、`closed`。
