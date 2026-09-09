# storyboard.json 结构

三层：**集 → 段（segment）→ 分镜（cut）**。

- **段** = 一次视频生成调用，总时长 ≤ `maxSegmentSeconds`（默认 15 秒），不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，`minCutSeconds`–`maxCutSeconds`（默认 2–5 秒），各自认领剧本节拍、带景别运镜和一张分镜图
- **分镜图** = 每个 cut 的构图/动作规划候选图。I2VA/FL2VA/L2VA 才把真实首尾帧作为时间锚；Ref2VA 只从候选图中选择职责互补且通过 QC 的参考，不按 cut 数量机械投喂。**每段一个文件夹**：参考图 + `prompt.md`。

```json
{
  "source": "渡口",
  "style": "realistic",
  "promptLang": "en",
  "params": { "maxSegmentSeconds": 15, "minCutSeconds": 2, "minInformationCutSeconds": 1.2, "maxCutSeconds": 5, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`promptLang` 可省略并按 `en` 解释。H3 模式下只允许 `en`：官方 `h3-prompt-writing` 要求三段式/六段式执行提示词使用英文，中文对白、歌词和可见文字保留原文。中文创意 brief 可以作为独立 Context-IR 实验输入，但不能冒充正式执行 prompt。`style` 可省略（默认 `realistic`），预设与角色/场景 skill 同名对齐（`realistic` / `ghibli`）。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是素材文件名（`E01-01.mp4` / `E01-01-f1.png`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存**——少一处会漂的冗余 |
| `generationMode` | string | `h3-t2va` / `h3-i2va` / `h3-fl2va` / `h3-l2va` / `h3-ref2va` |
| `referenceMode` | string | 与生成模式对应；Ref2VA 为 `multi-reference` |
| `referenceControlMode` | string | 可选；`semantic-assets` / `mixed` / `composition-led`。构图候选有瑕疵时使用 `semantic-assets` |
| `references` | object[] | 最终审核通过的参考文件、唯一 `purpose` 和可选 QC 记录 |
| `referenceQcRequired` | boolean | 为 true 时，导出前每个参考必须 `reviewStatus: approved` 且通过所列检查 |
| `h3Prompt` | string | **一段一条 H3 视频提示词**，正文使用官方英文执行合同；中文仅保留对白/可见文字，结构见 `references/h3-prompt.md` |
| `note` | string | 备注，可选 |

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 主要认领该场第几拍到第几拍（含两端）。每个节拍必须被恰好一个分镜主要认领；补充覆盖镜头可省略 |
| `coverageOf` | [int, int] | 可选；证据插入、主观内容或反应镜头覆盖哪个已主要认领的节拍，不参与唯一认领计数 |
| `seconds` | number | 普通分镜 2–5 秒；无精确文字的 `insert/full-frame-content` 可短至 `minInformationCutSeconds`。台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写 |
| `camera` | enum | 运镜，**直接用 H3 官方词表**（原样字符串）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise` |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `frame` | string | **分镜图英文提示词**：这一格关键帧的样子。景别英文短语必须在里面；禁角色名 |
| `pose` | object | 可选；姿态、支撑点、持物手等连续性事实 |
| `information` | object | 可选；信息载体、重要性、展示策略、观众必须看清的元素和最小画面占比 |
| `note` | string | 备注，可选 |

`beats` 与 `coverageOf` 必须至少存在一个，不能同时存在。`coverageOf` 必须指向同场已由其他 cut 主要认领的节拍。

`information.displayStrategy` 使用 `contextual`、`insert`、`full-frame-content`、`post-composite`。`plot-essential` 信息必须列出 `requiredReadableElements`，不能使用 `contextual`；`insert` 的 `minFrameCoverage` ≥ 0.5，`full-frame-content` ≥ 0.9；同时用 `coverageMetric` 指明按 `frame-height`、`frame-width` 或 `frame-area` 测量。竖屏手机在 16:9 中通常按 `frame-height`。`exactText: true` 必须走 `post-composite`。

每项 Ref2VA 参考可填写 `controlType`：`identity`、`environment`、`prop`、`content`、`pose`、`composition`、`audio`。当 `referenceControlMode: semantic-assets` 时只允许前四类图像控制，不允许 `pose` 或 `composition`；设定图只用于外观，不继承站姿、拼版布局或展示角度。

`pose` 示例：

```json
{
  "posture": "lying-on-right-side",
  "supportPoints": ["right elbow on pillow", "right hip and legs contacting mattress"],
  "propHands": {"P01": "left"}
}
```

## h3Prompt 的结构与生成时机

写法与模式路由见 `references/h3-prompt.md`。分镜图提示词 `frame` 先于候选素材；最终 `h3Prompt` 后于素材验收，并必须调用官方 `h3-prompt-writing`。

- Ref2VA 使用官方六段式，普通参考图不是切点时间锚。
- I2VA/FL2VA/L2VA 才使用对应的三段式和真实首尾帧关系。
- 每个 `[Shot k]`（k ≥ 2）带 `At 00:0X.XXX,`，等于前面 cut 秒数累计。
- 主要认领节拍的每句原生台词逐字进入所属镜头 `<d>[Chinese] …</d>`。
- 最终 prompt 的 `<Picture N>` 顺序必须等于审核通过的 `references` 顺序。

## 时长约束链

台词秒数（按剧本语速折算）≤ 分镜 `seconds` ≤ 5 秒；普通镜头下限为 `minCutSeconds`，非精确文字信息插入下限为 `minInformationCutSeconds`；段 Σ分镜 ≤ 15 秒；集 Σ段 落在剧本 `targetSeconds` ±15%。全部由 validate 逐级对账。
