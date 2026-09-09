---
name: novel-outline
description: 把小说或故事改编为短剧大纲，确定人物去留、分集因果、剧情重点与资产预算，产出可校验 JSON、Markdown 和评审报告。用于短剧大纲、改编方案和现有大纲诊断；不写完整剧本或镜头方案。
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
  runtimes:
  - claude-code
  - codex
  version: 1.1.0
  triggers:
  - novel-outline
  - 改编大纲
  - 短剧大纲
  - 拆大纲
  - 小说转短剧
  - 大纲体检
  - adaptation outline
---

## novel-outline

输入一本小说 + 目标参数，输出短剧改编大纲五件套。**四件模型写、一件脚本算**（资产清单从分集数据自动汇总）。

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-outline.mjs`，零依赖，`node` 直接跑。

**边界（不做的事）**：不写剧本台词、不做分镜、不出图像/TTS 提示词。梗概是叙述体，出现引号对白就是越界——`validate` 会拦。想从小说拆角色设定（画像/形象提示词/设定图），那是 `novel-characters` 的活。

---

### Step 0 — 复用项目参数，补齐真正缺失的信息

先读取用户本轮与既有约定、production.json 和输入文本。能确定的参数直接复用；只有会改变整部改编的缺失项才集中询问，并继续阅读源文、整理人物与冲突等不依赖答案的工作。

| 参数 | 处理 |
| --- | --- |
| **总集数 × 单集时长** | 优先继承已有约定；确实未知且影响改编规模时询问 |
| **题材** | 从原文与创作要求确定；类型混合或目标不明时询问 |
| 改编幅度 | 默认**抽核**（忠实 / 抽核 / 借壳），告知即可 |
| 已有偏好 | 默认无（想保哪个角色、哪场戏） |

平台阈值不同可以带上 `params.thresholds` 覆盖（默认：主角组 ≤ 5、重要配角 ≤ 10、功能性角色 ≤ 10、爽点间隔 ≤ 3 集）。**主场景上限不用配，随集数自动算**：4 + ⌈集数/10⌉，夹在 5–15（60 集 → 10）。这是默认产能预算，不是影视行业通用标准；场景仍有设计、生成、审核、连续性与后期成本；显式给 `maxPrimaryScenes` 才覆盖。**短篇（20–30 集）建议收紧角色档的阈值**，默认值是按 60 集以上给的。

**如果用户有 novel-characters 的产出（cast.json）**，直接拿来当人物原料——角色、别名、关系都是现成的，不用重拆原文。分档按 `importance` 映射：protagonist/major → `lead`，supporting → `support`，minor → `functional`。

### Step 1 — 定位输入

材料优先级，写死：

1. 用户点名的**精读章节**
2. **章节目录 + 简介**
3. 全文**分卷摘要**（Step 2）

**禁止凭书名脑补内容**——一切判断基于给到的文本。落地手段：`adaptation.keep` 的关键取舍要附 `evidence`（原文逐字片段）。

直接粘正文的先落成 .txt。输出目录：用户指定就用，没指定用原书同级目录。

### Step 2 — 分卷摘要（长文本才需要）

**这一步是脚手架，不是交付物**——分卷摘要是给没读过原文的模型压缩用的。两种情况直接跳到 Step 3：

- 短篇，单卷装得下
- **当前会话已经通读过原文**（比如刚跑完 novel-characters 的分块扫描）——不用再压缩一遍，也不用事后补档

长篇且没读过原文：

```bash
node {baseDir}/scripts/novel-outline.mjs chunk <book.txt> <workdir>
```

按章节标题分卷（默认每卷 15 章，`--per-volume` 可调），识别不出章节就按字数切。打印 `{"volumes": N, ...}`；`truncated: true` 就明确告诉用户尾部没扫到，别闷着。

每卷一个子代理（支持并发就**同一条消息里全部发出**）：读 `{baseDir}/references/volume-pass.md`，读 `<workdir>/vol-NN.txt`，把卷摘要写到 `<workdir>/summary-NN.json`，只回一句「done NN」。

### Step 3 — 快版骨架 → 用户拍板 ⛔

读 `{baseDir}/references/outline-pass.md` 和 `{baseDir}/references/schema.md`，照着做。产出骨架四块（adaptation / characters / scenes / beats），写成 `<workdir>/outline.json`。

```bash
node {baseDir}/scripts/novel-outline.mjs validate <workdir>/outline.json --stage beats
```

过了 beats 档，**把三件事摆给用户拍板：砍了哪条线、合了哪些人、大爆点落在第几集**。不点头不进 Step 4——快版错了只损失一轮骨架，分集写完才发现方向错，全废。

### Step 4 — 细版骨架

吸收用户意见改骨架，再过一次 `validate --stage beats`。用户没意见就直接进 Step 5。

### Step 5 — 分集梗概（分批）

**每批 ≤ 10 集**。先固定各批交接状态：人物知情范围、道具归属、时间推进与前后钩子，再处理可独立的分集；存在未决因果的批次顺序编写。每个子代理拿到：拍板后的骨架四块、自己负责的集数区间、区间内的爽点，读 `{baseDir}/references/episode-pass.md` 照着写，产出写到 `<workdir>/eps-NN.json`。

合并时按 ep 排序拼进 outline.json 的 `episodes`。

### Step 6 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-outline.mjs validate <输出目录>/<书名>-outline.json
```

13 道质量门全部是代码，不是给你读的清单：主角组 1–5 人、重要配角 ≤ 10、功能性角色 ≤ 10、主场景不超上限（随集数动态，60 集 → 10）、一次性场景有规避方案、爽点间隔 ≤ 3 集无真空、第 1 集有钩子、大爆点不压最后一集、每集三栏齐全、三人同框有拆解、生成难点进预警、引用完整无失业角色、叙述体无对白。

结构与引用错误必须修复；题材或平台节奏与默认阈值冲突时，先记录创作依据，再用已支持的 params.thresholds 调整并重新校验，不能为过门硬塞爽点或删掉必要角色。

### Step 7 — 输出与汇报

```bash
cd <输出目录>
node {baseDir}/scripts/novel-outline.mjs render <书名>-outline.json --md   > <书名>-outline.md
node {baseDir}/scripts/novel-outline.mjs render <书名>-outline.json --html > outline-report.html
```

报告界面默认中文；用户要英文界面就加 `--lang en`（或在 outline.json 顶层写 `lang` 字段，`--lang` 优先）。只翻译界面文案，数据内容（爽点类型、梗概、质量门文案）原样出。

report 里自带：KPI 带、关键决策（拍板三件事，大爆点列表和角色位统计自动算）、爽点时间轴（空档标在轴上，超阈值变红）、每集调度矩阵、场景概览卡、资产量折算、质量门（✓/✗ 烘进页面，未过弹病灶横幅）、导出 JSON 按钮（下载的就是 outline.json 原样）。

汇报一句话说清：几集、几个角色几个场景、爽点分布、报告路径；被截断或有没过的门要明说。

最终落地：

```
<输出目录>/
├── <书名>-outline.json
├── <书名>-outline.md
└── outline-report.html            ← 双击就能开
```

---

## 体检模式

用户贴一份**已有大纲**只想要诊断：转成 outline.json（缺的字段问用户或标注缺失），然后：

```bash
node {baseDir}/scripts/novel-outline.mjs checkup <outline.json>   # 终端 ✓/✗
node {baseDir}/scripts/novel-outline.mjs render <outline.json> --html > outline-report.html
```

质量门面板就是诊断书。未过的门不阻止渲染——要的就是把病灶摆出来看。

## 联动更新

用户改了上游就跑一次 `validate`，报错会点名下游哪里断了：合并人物后哪些集还引用着被删的 ID、砍场景后哪些集空转、爽点挪动后哪里出现真空区。**不要靠记忆提示联动，靠校验器。**

## 边界

- 单次上限 60 卷（每卷 15 章约 900 章）。超了明确报 `truncated`，不静默截断
- 阈值是参数不是圣旨：平台不同就用 `params.thresholds` 覆盖，别改代码
- 报告界面内置中英（`--lang`，默认中文、或跟 outline.json 的 `lang` 字段）：界面文案与质量门标签翻译，数据内容（爽点类型、梗概、人名）与门的失败详情保持原文
- 五件套的第五件（资产清单）永远是算出来的，模型手写必漏

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

219 项断言，不调模型、不花额度。13 道质量门每一道都有击穿用例——证明它真的会拦。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口-outline.json`：把短故事《渡口》（novel-characters 的自带样例）改编成 6 集 × 2 分钟的微型大纲，四角色三场景四爽点，全部质量门通过。当质量基准，也是自测夹具。


## 制作交接

独立使用时，自检后主动打开当前报告并给绝对路径链接，说明本轮范围、检查重点和下一步；需要锁定内容时在对话中收取通过或修改结论。已有确认覆盖当前版本就不重复询问，打开页面或下载 JSON 不算批准。总控已接管时，由总控统一收取这次结论，不另开重复审批。当前内容、依赖或源图改变后，不因旧文件仍存在就跳过复核；输出新版本并保留原审阅笔记。

本项目的阶段职责、变更记录和交付顺序由 `short-drama-production` 的 `references/company-workflow.md` 统一维护；未安装总控时按本 skill 的输入和交付范围独立完成，不将总控变成硬依赖。
