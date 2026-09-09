# `director-package.json` 合同

本文件定义最小可交付结构。字段允许扩展，但不要改名或删除必填字段；结构化 JSON 是事实源，Markdown 只由它渲染。

## 顶层

```json
{
  "schemaVersion": "1.0",
  "title": "作品名",
  "source": "上游文件或文本说明",
  "format": {
    "aspectRatio": "9:16",
    "fps": 24,
    "audioRoute": "h3-native-reference",
    "soundPlan": {
      "ambienceRoute": "h3-native",
      "foleyRoute": "hybrid",
      "musicRoute": "post",
      "fallbackDialogueRoute": "tts-post"
    },
    "generation": {
      "mode": "h3-ref2va",
      "minClipSeconds": 4,
      "maxClipSeconds": 15,
      "integerDuration": true
    }
  },
  "voiceAssets": [
    {
      "voiceAssetId": "V-C01-MASTER",
      "characterId": "C01",
      "path": "voices/C01-master.wav",
      "sha256": "声音文件哈希",
      "durationSeconds": 10,
      "language": "zh",
      "rights": "synthetic",
      "status": "approved"
    }
  ],
  "visualBible": {
    "genreTone": "都市情感复仇，冷静而锋利",
    "palette": "冷灰公共空间对比暖色私人证据",
    "contrast": "中高反差，脸部保留层次",
    "cameraPersonality": "前半观察克制，权力逆转后贴近女主",
    "lensStrategy": "35/50mm 建关系，75mm 留给认知转折",
    "compositionStrategy": "利用竖向门框和前景人物分割权力",
    "movementRules": ["人物越过权力边界时才主动推进"],
    "continuityRules": ["主关系轴为舞台与台阶连线"],
    "motifs": ["署名与脸同框，展示身份被夺回"]
  },
  "episodes": [],
  "assumptions": [],
  "unresolvedRisks": []
}
```

`audioRoute` 使用 `h3-native-reference`、`h3-native-free`、`tts-guided-h3`、`tts-post`、`silent`；旧值 `native` 只为兼容旧包，等价于没有固定声音资产的原生声音并触发警告。`generation.mode` 使用 `model-agnostic`、`h3-ref2va`、`h3-i2va`、`h3-fl2va`。

固定角色采用 `h3-native-reference` 时，`voiceAssets` 必须包含每位说话角色的已批准声音母版。声音母版建议 6–12 秒干声；H3 接口硬范围为 2–15 秒。`soundPlan.musicRoute` 默认 `post`，避免独立片段生成互不连续的音乐。

## 集与场

```json
{
  "ep": 1,
  "targetSeconds": 90,
  "dramaticQuestion": "女主能否在公开场合夺回署名？",
  "coldOpen": "签字文件贴着她的名字，却不让媒体看见",
  "turnPoints": ["看见主创署名被替换", "草图证明创意被盗"],
  "climax": "她把原始草图举到终稿旁公开质问",
  "cliff": "对手设备中出现她未公开的手绘页",
  "emotionCurve": ["克制", "受辱", "确认背叛", "反击", "更深威胁"],
  "scenes": []
}
```

场结构：

```json
{
  "sceneId": "E01-S01",
  "slug": "内景·颁奖晚宴·夜",
  "objective": "许知意要阻止他人以自己的设计领奖",
  "obstacle": "顾承泽维护公司体面并封锁她的发言位置",
  "turn": "她在展板上确认署名被替换并找到草图证据",
  "valueShift": "怀疑→确认背叛",
  "powerShift": "顾承泽的秩序控制→许知意用证据夺回公众注意",
  "geography": "舞台在上、观众席在下、展板沿舞台侧边排列",
  "axis": "舞台台阶与观众席之间的主关系轴；默认保持观众侧",
  "blocking": [
    "许知意从台阶下走向展板",
    "顾承泽横向挡在她与舞台之间",
    "许知意把草图举到终稿旁，重建两人对峙轴"
  ],
  "continuityIn": "许知意抱手绘本，顾承泽持协议夹",
  "continuityOut": "手绘本打开在回雨槽页，苏曼琳仍持奖杯",
  "sourceBeats": [],
  "inventedBeats": [],
  "clips": []
}
```

`sourceBeats` 由 `seed` 生成：

```json
{"beatId":"E01-S01-B001","kind":"action","text":"她翻开手绘本。"}
{"beatId":"E01-S01-B002","kind":"dialogue","speaker":"C01","text":"这一笔只在我的本子里。","delivery":"震惊转为清醒"}
```

新增戏剧事实只能放入 `inventedBeats`，格式与 `sourceBeats` 相同，并额外填写 `reason`。若只是摄影机、构图、细化表演动作，不算新增剧情事实。

## 生成片段与镜头

```json
{
  "clipId": "E01-S01-C01",
  "duration": 8,
  "dramaticFunction": "从公开秩序切入女主被秘密施压",
  "audioPlan": "宴会环境声；对白后期 TTS；掌声在片尾进入",
  "pacingPlan": {
    "baselineSeconds": 12,
    "targetSeconds": 9,
    "compressionRatio": 0.75,
    "method": "retime-shots",
    "protectedHolds": ["信息插入至少 1.5 秒", "转折后的反应至少 3 秒"]
  },
  "referenceMode": "none",
  "references": [],
  "speakerBindings": [],
  "shots": [],
  "modelPrompt": ""
}
```

`referenceMode` 使用 `none`、`first-frame`、`first-last-frame`、`multi-reference`。`references` 每项：

```json
{"refId":"IMG-C01","role":"reference_image","path":"characters/C01.png","subjectId":"C01"}
{"refId":"AUD-C01","role":"reference_audio","path":"voices/C01-master.wav","voiceAssetId":"V-C01-MASTER","durationSeconds":10,"relation":"reference"}
```

H3 首帧/尾帧模式的 `role` 为 `first_frame` / `last_frame`；全能参考模式使用官方 API 角色 `reference_image`、`reference_video`、`reference_audio`。两类模式互斥。旧的 `subject_reference` 只为兼容旧包，不再用于新产物。

声音绑定：

```json
{
  "characterId": "C01",
  "speakerId": "S1",
  "voiceAssetId": "V-C01-MASTER",
  "audioRefId": "AUD-C01"
}
```

`h3-native-reference` 中，每个实际说话角色必须有一条 `speakerBindings`，同时绑定已批准 `voiceAssetId` 和片段内真实存在的 `reference_audio`。声音母版关系使用 `reference`；准确台词音频路线 `tts-guided-h3` 使用 `partially_copy` 或 `fully_copy`。

镜头结构：

```json
{
  "shotId": "E01-S01-C01-SH01",
  "start": 0,
  "duration": 3,
  "beatRefs": ["E01-S01-B001"],
  "coverageRefs": [],
  "audioCarryRefs": [],
  "dramaticPurpose": "建立顾承泽以文件和身体位置同时施压",
  "size": "MWS",
  "angle": "eye",
  "lensMm": 35,
  "camera": {
    "move": "track",
    "amplitude": "短距离平稳后退",
    "speed": "随人物快步节奏",
    "trigger": "顾承泽穿过宾客走向许知意",
    "path": "沿通道后退并保持协议夹在画面下部",
    "endState": "停成两人中全景，许知意被压在画面边缘"
  },
  "motionPlan": {
    "primaryMotion": "协议夹由画外进入两人之间并停稳",
    "secondaryMotion": ["女主视线从对手移到封口"],
    "phases": {
      "setup": "两人位置稳定，协议夹尚未入画",
      "trigger": "顾承泽抬起右手",
      "development": "协议夹沿胸前高度进入画面中央",
      "settle": "协议夹停在两人之间，女主视线落到封口"
    },
    "motionLoad": "medium"
  },
  "focus": "顾承泽到位后由协议夹移到许知意眼睛",
  "composition": "顾承泽居中逼近，宾客形成前景遮挡，许知意位于上方右侧负空间尽头",
  "blocking": "顾承泽快步到位并把协议夹递到两人之间，许知意不后退",
  "poseContinuity": {
    "posture": "standing-square-to-opponent",
    "supportPoints": ["both feet planted on the floor"],
    "propHands": {"P01": "right"}
  },
  "informationPlan": {
    "carrier": "document",
    "criticality": "plot-essential",
    "displayStrategy": "insert",
    "requiredReadableElements": ["the replaced signature"],
    "coverageMetric": "frame-area",
    "minFrameCoverage": 0.6,
    "exactText": false
  },
  "eyeline": "两人平视；顾承泽先看文件再锁定她",
  "screenDirection": "left-to-right",
  "axisAction": "keep",
  "axisJustification": "",
  "action": "协议夹进入两人之间，结束时遮住许知意半个身体",
  "dialogueRefs": [],
  "transition": "cut",
  "framePrompt": "可供画面生成器使用的静态关键帧描述",
  "motionPrompt": "可供视频生成器使用的动作和摄影机描述"
}
```

`beatRefs` 负责唯一认领源节拍。额外的反应、插入、主观内容或证据覆盖镜头不重复认领同一节拍，而使用 `coverageRefs`；两者至少一个非空。`coverageRefs` 只能引用已存在、且已被其他镜头主要认领的节拍。

`pacingPlan` 仅在重新计时或节奏实验时填写。`targetSeconds` 必须等于当前 `clip.duration`，`compressionRatio` 等于 `targetSeconds / baselineSeconds`；`method` 使用 `retime-shots`、`rewrite-blocking` 或仅供内部预览的 `post-speed-preview`。生产返工优先前两种，后者不得直接作为正式生成方案。

运动显著影响成片时填写 `motionPlan`。它与 `camera` 分工：`motionPlan` 管画面内运动和动作相位，`camera` 管机身运动。摄影机为 `static` 时仍可有完整 `motionPlan`。

`informationPlan.displayStrategy` 使用 `contextual`、`insert`、`full-frame-content`、`post-composite`。剧情关键载体必须填写 `requiredReadableElements`；`insert` 的 `minFrameCoverage` 不低于 `0.5`，`full-frame-content` 不低于 `0.9`，并用 `coverageMetric` 指明按 `frame-height`、`frame-width` 或 `frame-area` 测量。竖屏手机进入 16:9 横屏时通常按画面高度评估。精确文字使用 `post-composite`。

姿态会影响参考图或连续性时填写 `poseContinuity`：明确躺/坐/站、可见支撑点和持物手。只写“人物在床上”不足以证明侧躺状态。

枚举：

- `size`: `EWS`、`WS`、`MWS`、`MS`、`MCU`、`CU`、`ECU`、`INSERT`、`OTS`、`TWO_SHOT`、`POV`。
- `angle`: `eye`、`high`、`low`、`overhead`、`dutch`、`ground`。
- `camera.move`: `static`、`pan`、`tilt`、`push`、`pull`、`truck`、`pedestal`、`track`、`arc`、`handheld`、`crane`、`whip_pan`、`roll`。
- `screenDirection`: `left-to-right`、`right-to-left`、`neutral`。
- `axisAction`: `keep`、`reset`、`cross`。`cross` 必须说明理由；`reset` 必须在画面中交代新关系。
- `transition`: `cut`、`cut_on_action`、`reaction_cut`、`match_cut`、`J_cut`、`L_cut`、`dissolve`、`whip`、`fade`。

## 时间与覆盖规则

- 一个 `clip` 内镜头 `start` 从 0 开始连续累加，不得重叠或留空。
- 镜头时长之和必须等于 `clip.duration`。
- `clip.duration` 必须符合 `format.generation` 的上下限；要求整数时长的模型不得使用小数。
- 同一场的每个 `sourceBeat.beatId` 必须在 `beatRefs` 中作为主节拍出现一次。台词跨镜、画外继续或声画错位使用 `audioCarryRefs`，不重复主认领。
- `beatRefs`、`audioCarryRefs`、`dialogueRefs` 不得引用不存在的节拍。
- 新增事实用 `inventedBeats`，同样需要被镜头认领。
- H3 `reference_image` ≤ 9；`reference_video` ≤ 3、单条 2–15 秒且总计 ≤ 15 秒；`reference_audio` 同样 ≤ 3、单条 2–15 秒且总计 ≤ 15 秒；参考文件合计 ≤ 12。
- H3 参考音频不能单独输入，必须同时包含参考图或参考视频。
- 使用 `reference_audio` 时不能同时使用 `first_frame` 或 `last_frame`。
- H3 全参考提示词使用官方六字段冒号格式；基础/首尾帧模式使用官方三字段冒号格式。逐镜标记与切点必须按官方 `[Shot N] At MM:SS.mmm,` 规则对账。

## 错误与警告

验证器把以下问题视为错误：缺失必填结构、未知枚举、ID 重复、时间不连续、源节拍漏拍或重复主认领、移动镜头缺触发/路径/终点、越轴无理由、H3 模式合同不匹配、声音路线与提示词冲突。

以下视为警告，必须由导演复盘而非盲目自动修复：近景/特写比例过高、运动镜头比例过高、长场景只有一个景别、转折附近没有明确反应/揭示功能、全片焦段无层级、抽象或过短的镜头目的。
