---
name: novel-storyboard
description: 将剧本与导演意图转成生成段、逐镜时间、参考素材计划和可校验分镜报告；使用官方 h3-prompt-writing 编写 H3 提示词，可导出投产包。用于技术分镜、镜头表和分镜修订；生成视频须另有明确任务与成本授权，不负责最终选片或剪辑。
allowed-tools:
- Read
- Write
- Bash
- Task
- Glob
metadata:
  license: Apache-2.0
  requires:
    bins:
    - node
    optional:
    - codex
  runtimes:
  - claude-code
  - codex
  version: 1.3.0
  triggers:
  - novel-storyboard
  - 分镜
  - 出分镜
  - 镜头表
  - 切镜
  - 首帧
  - storyboard
  - shot list
---

## novel-storyboard

  给 AI 短剧出**分镜**——管线里第一个直接面对视频模型的层。每个新增镜头都会增加参考准备、生成筛选、连续性与后期工作。先保持导演的观看逻辑与可剪性，再适配当前工具的单段上限（默认 15 秒），不为凑切点增加无意义镜头。

**核心机制：镜头认领节拍。** 每个镜头声明它覆盖剧本某场的哪几个连续节拍（`sceneIndex` + `beats: [起, 止]`），镜头不许跨场次——换景必换镜。这让分镜和剧本的关系变成可机械对账的：

| 交付 | 解决什么 |
| --- | --- |
| 节拍认领 | 每个节拍被恰好一个镜头认领、顺序不乱——剧本改了重跑 validate，失效的镜头当场点名 |
| 单镜头 ≤ 15 秒 | AI 视频单段生成上限，长对话在这里被强制拆镜（`params.maxShotSeconds` 按模型改） |
| 台词装得下 | 认领节拍的台词秒数 ≤ 镜头秒数——逐镜检查，不是拍脑袋 |
| 首帧 + 运动双提示词 | 首帧给图像模型（配合参考图），运动是模型无关的过程描述；景别、运镜是枚举，英文短语必须写进对应提示词 |
| **H3 视频提示词（每段一条）** | 分镜结构和候选素材先定稿；素材验收后，再由官方 `h3-prompt-writing` 按生成模式改写。Ref2VA 为六段式；I2VA/FL2VA/L2VA 才使用对应关键帧指令。**认领节拍的原生台词逐字进 `<d>[Chinese] …</d>` 块** |
| 生成批次单 | 同场景 + 同光照的镜头归一批，共用同一张环境参考图——AI 版的顺场表，脚本自动汇总 |
| 配音对齐单 | 每句台词对到镜号——TTS 音频贴到哪一段视频，脚本自动汇总 |
| **H3 API 投产（可选）** | 用户明确授权后，把单段提示词与分镜图提交给 CompShare；本地图以内嵌数据发送，避免临时图床缓存串图 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-storyboard.mjs`，零依赖，`node` 直接跑。

**边界（不做的事）**：不写戏不改台词（`novel-script` 的活）、不出场景/角色/道具设定图（`novel-art` / `novel-characters` 的活）、不自行发明或内化 H3 官方格式、不做剪辑合成。视频生成是可选投产步骤，只有用户明确要求并授权 API 成本后才执行。口型/唇形同步暂不管。

---

### Step 0 — 定输入与范围

**script.json 是硬前提**——分镜离开剧本没有意义，validate/render 都必须给 `--script`。其余上游按有则用：

- `--outline` / `--cast`：提示词禁人名检查 + 报告里 C01 显示成人名
- `--art`：报告里 S01 显示成场景名 + 批次单嵌场景设定图

已有导演包时，先继承其镜头目的、顺序、画幅、节拍与连续性；技术调整保留来源和偏差。总控选择导演桥接路线时不再重复本流程。

**一次切几集**：跟剧本的批次走（剧本写到哪就分到哪），默认一批 ≤ 3 集。

### Step 1 — seed 工作底稿

```bash
node {baseDir}/scripts/novel-storyboard.mjs seed <script.json> --eps 1-3 > <workdir>/storyboard.json
```

确定性展开：每场的节拍清单（编号、动作/台词、每拍秒数、说话人）进 `seedScenes`，这就是切镜时的工作底稿。**每拍秒数是上游估时基线；导演可依据围读、表演和镜头可读性调整，记录变化并复核总时长。** shots 留空，切镜才是模型的活。

### Step 2 — 逐集分段切镜

每集一份任务，能并发就并发。每份任务拿到：

- `{baseDir}/references/storyboard-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- 该集的 seedScenes 底稿 + 场景卡（art.json 的锚点与光照提示词）+ 角色卡（cast.json 的形象要点）

流程：**先按剧情单元分段**（每段 9–15 秒、不跨场），**普通叙事切 2–5 秒；一眼可读、无精确文字的 `insert/full-frame-content` 可短至 `minInformationCutSeconds`（默认 1.2 秒）**。每切写一条分镜图提示词。一个源节拍只由一个 cut 的 `beats` 主要认领；补充信息、主观内容或反应覆盖使用 `coverageOf`，不能为了多一个镜头而重复认领同一节拍。

此阶段只固定镜头事实、`frame`、姿态连续性、关键信息展示策略和参考素材需求；不要冻结最终 `h3Prompt`。可以临时留空，直到候选素材完成验收。

先写明 `generationMode`：`h3-t2va`、`h3-i2va`、`h3-fl2va`、`h3-l2va` 或 `h3-ref2va`。Ref2VA 必须同时写 `referenceMode: "multi-reference"` 和显式 `references`；提示词采用 `subject_definitions → summary → retention_analysis → detailed_description → overall_soundscape → non_diegetic_music` 六段式。参考图按职责选择身份、场景拓扑、关键道具、内容素材，动作/构图图仅在无法靠文字稳定说明且自身完全正确时使用。若候选构图图存在多手、手别、支撑点、姿势或轴线错误，设置 `referenceControlMode: "semantic-assets"`，只喂干净人物/环境/道具/内容资产，由提示词负责姿态、方位和镜头调度。I2VA/FL2VA/L2VA 才能声明首帧/尾帧并使用官方关键帧对齐句。`[Shot k]` 切点仍由分镜秒数推导并逐字核对；每切的运镜、动作、光线、表演和声音落在自己的时间窗。

切完把 `seedScenes` 删掉。

提速不等于成片倍速。技术分镜继承导演 `pacingPlan`：优先压缩已读懂的建立、重复信息和动作尾巴，保护关键内容最低可读时间与转折后的反应。总时长变化超过 15% 必须记录并审批导演偏差；分镜不得静默改变节奏意图。

### Step 3 — 方案检查（最终校验在素材与提示词完成后）

素材未生成、h3Prompt 仍为空时，先人工对账节拍覆盖、台词承载、轴线、时长与资产需求。可用 checkup 列诊断，但提示词/参考验收缺失属于未完成项，不能声称最终校验通过，也不能伪填 approved 或假提示词只为过门。现有 validate 是完整交付校验，没有草稿放行模式。

### Step 4 — 出分镜图（可选）

按项目画幅逐切准备构图规划图；只有选用关键帧模式时才称首/尾帧，走 codex 内置 `$imagegen`，读 `{baseDir}/references/frame.md` 照契约做。要点：

- **没有 codex 就整步跳过**，只交提示词，报告显示占位不装有
- **参考图按职责而不是按数量选择**：默认优先干净的人物身份、场景全局方位/拓扑、关键道具和内容资产。动作/构图参考是高风险可选项，只有肢体、支撑点、持物手、屏幕方向和空间轴线全部正确才可使用。相近的人脸特写、同角度重复图和互相冲突的手别/服装不得进入 Ref2VA；必要时改用 `semantic-assets`，让提示词调度镜头
- 一格一次调用绝不批量；输出 `./<段号>/f<切序>.png`（f1 = 主分镜图，每段一个文件夹）
- **默认先出第一段的整套分镜图给用户看效果**（3–5 张），确认画风和正反打构图再往后补——一集约 30–40 格，错了浪费的是整批
- 候选图先做资产 QC：人物身份、场景拓扑、躺/坐/站、身体支撑点、持物手、屏幕方向和关键信息占比逐项检查。画面裁掉了证明姿态所需的接触点，就不能因为“看起来好看”而通过
- 手机/电脑/文件承载剧情关键信息时，按 `information.displayStrategy` 生成插入镜头、全屏内容素材或可跟踪屏幕；精确文字走后期合成
- 单个失败跳过不阻断，最后汇总说明

### Step 4.5 — 素材验收后写最终 H3 提示词

只有候选素材的真实文件、顺序、职责与 QC 状态已确定，才写每段最终 `h3Prompt`。必须同时使用 MiniMax 官方 `h3-prompt-writing` skill，并完整读取当前模式参考。`{baseDir}/references/h3-prompt.md` 只负责输入映射和质量门衔接。

Ref2VA 把审核通过的参考写入显式 `references`；设置 `referenceQcRequired: true` 时，每项还要列出 `requiredChecks`、`checks` 和 `reviewStatus: approved`。最终提示词必须描述真实图片里存在的姿态和构图，不能用文字强行纠正一张已经错误的参考图。

### Step 4.6 — 完整校验与投产前复核

素材、参考顺序与最终提示词完成后运行：

```bash
node {baseDir}/scripts/novel-storyboard.mjs validate <storyboard.json> --script <script.json> --outline <outline.json> --cast <cast.json> --art <art.json>
```

修复结构、节拍、切点、声音与模式错误后再 export。只有 T2VA 可没有输入图片；需要参考的模式缺图时交付未完成清单。不要把每切规划图全部塞入 Ref2VA。官方结构以 h3-prompt-writing 为准，本地 references/h3-prompt.md 仅管字段映射与工具约束。

### Step 5 — 输出与汇报

```bash
cd <输出目录>
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --md \
  --script <script.json> --outline <outline.json> --art <art.json> > <剧名>-storyboard.md
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --html \
  --script <script.json> --outline <outline.json> --art <art.json> > storyboard-report.html
```

报告界面语言用 `--lang zh|en` 指定（优先级 `--lang` > JSON 顶层 `lang` 字段 > 默认中文）——只切界面标签，与 `promptLang`（H3 提示词语言）互相独立。`render` 自动去 `images/<镜号>-frame.png` 找首帧（批次单还会找场景设定图），**先出图再 render**。报告含：KPI 带、分镜节奏带（粗分隔 = 段边界、片宽 = 分镜时长占比、颜色深浅 = 景别远近、点击跳段卡）、分集分镜表（主分镜图 + 子分镜条 + 逐切分镜行 + 分镜图/H3 提示词复制按钮）、生成批次单、配音对齐单、质量门、导出 JSON。Markdown 版每段附完整 H3 提示词，直接复制可用。

汇报一句话说清：几集几镜、总时长 vs 目标、几个生成批次、出了几张首帧、报告路径；没过的门和没出的图明说。

最终落地：

```
<输出目录>/
├── <剧名>-storyboard.json
├── <剧名>-storyboard.md
├── storyboard-report.html         ← 双击就能开
├── manifest.json                  ← export 生成
└── E01-01/                        ← 一段一个文件夹 = 一次 H3 生成的全部材料
    ├── ref-*.png                  ← Ref2VA 按职责命名的参考图；不代表切点关键帧
    ├── f1.png / f2.png …          ← 仅在关键帧模式或评审需要时保留
    └── prompt.md                  ← H3 提示词（export 生成）
```

### Step 6 — CompShare H3 API 投产（可选、需明确授权）

用户要求“生成视频、调用 API、提交 H3”时，先读 `{baseDir}/references/h3-api.md`，使用
`{baseDir}/scripts/h3-api.py`。API 调用会上传参考图并消耗积分，不能从“出分镜”自动推断授权。

固定风控：

- 默认只提交一个 4–15 秒段做测试；用户看过成片并明确同意后才批量。
- 优先在 job 中用本地 `path`；脚本把图片编码成 Data URL 并校验 SHA-256，发现重复图直接拒绝。
- 公网 `url` 仅用于稳定直链；多个链接的末级文件名相同（例如都叫 `/download`）时拒绝提交，避免平台缓存串图。
- API key 只从 `COMPSHARE_H3_API_KEY`、`COMPSHARE_H3_KEY_FILE` 或 `~/.codex/secrets/compshare-h3.key` 读取；不得写进 job、提示词、日志或交付物。
- 提交前运行 `preflight` 和 `submit --dry-run`；核对参考图数量、不同哈希、画幅、分辨率、时长和输出路径。
- 用户要求干净画面时，在 `promptSuffix` 明写禁止字幕、标题、Logo、水印；生成后仍需看成片验证，不能只凭提示词宣称成功。
- API 返回 `failed`/`cancelled` 就停止，不自动重试付费任务。只有连接失败且确认服务端未创建任务时，才可在用户授权范围内重试。

---

## 创作到生产的交接

```
novel-characters → cast.json       （谁：角色设定图）
novel-outline    → outline.json    （什么：结构与分集）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：镜头、首帧、批次）
```

分镜消费剧本和已批准导演意图；采用总控导演桥接路线时不再重复执行本 skill 重切。标准分镜路线则保留导演来源与偏差说明。投产包交总控完成成本授权、任务执行、选片、剪辑和 QC；技术分镜交付不等于整剧闭环，台词清单也不默认触发全剧 TTS。

## 边界

- 报告界面内置中英（`--lang`，默认中文）；H3 执行提示词 `promptLang` 固定为 `en`，中文只保留对白、歌词和可见文字。中文自由 brief 可在独立 Context-IR 实验中使用，但不是正式六段式输出
- 秒数是**下给视频模型的生成时长**不是估算——段上限按你的模型改 `params.maxSegmentSeconds`，切的节奏区间改 `min/maxCutSeconds`
- 口型/唇形同步暂不管——那是生成管线的事
- 分镜图按用途验收：审阅图可带明确缺口，模型参考图必须满足当前镜头的身份、姿态与信息要求；不能把未解决问题默认推给付费重生成
- API 调用不是分镜交付的默认步骤；任何提交、重试、批量生成都受用户当次授权和成本边界约束

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

自测不调模型、不花额度。19 道质量门每一道都有击穿用例。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口-storyboard.json`：《渡口》第 1 集完整分镜——10 段 34 切认领剧本全部 35 拍，平均 3.5 秒一切，共 119 秒 / 目标 120 秒，2 个生成批次，每段带完整的 H3 视频提示词（多图对齐 + 切点时刻全部对账通过）。当质量基准，也是自测夹具。


## 制作交接

独立使用时，自检后主动打开当前报告并给绝对路径链接，说明本轮范围、检查重点和下一步；需要锁定内容时在对话中收取通过或修改结论。已有确认覆盖当前版本就不重复询问，打开页面或下载 JSON 不算批准。总控已接管时，由总控统一收取这次结论，不另开重复审批。当前内容、依赖或源图改变后，不因旧文件仍存在就跳过复核；输出新版本并保留原审阅笔记。

本项目的阶段职责、变更记录和交付顺序由 `short-drama-production` 的 `references/company-workflow.md` 统一维护；未安装总控时按本 skill 的输入和交付范围独立完成，不将总控变成硬依赖。
