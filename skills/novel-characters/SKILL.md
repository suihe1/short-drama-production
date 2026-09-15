---
name: novel-characters
description: 从故事中整理人物身份、关系、外观和声线设计，产出角色卡、图像提示词与评审报告，可按需生成设定图。用于角色分析、人物画像和角色母本；短剧制作中按已批准大纲与当前批次选角。
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
  version: 1.8.0
  triggers:
  - novel-characters
  - 拆角色
  - 拆书角色
  - 小说角色
  - 人物画像
  - 角色卡
  - 三视图
  - character sheet from novel
---

## 输入与创作权限

先读用户实际材料与目标，复用已确定的事实和规格；已有剧本、资产或分镜直接进入相关工作，不为流程完整重写上游。未授权的删线、合人、改变人物身份、主题、结局或重要表演意图，先展示原位置、具体方案与得失，再由用户选择；已授权的局部修正直接完成。

下面的类型经验、批次和创作预算是适配起点，不是用户接受过的创作要求。旧校验器可能仍将部分经验规则报为失败：区分实际数据/引用/模型接口错误与创作建议，说明不适用项，保留原稿；不伪造字段、不静默改戏或降低技术投产要求。总控可用时参考其 references/creative-agreement.md；独立任务按本段处理，不强制依赖总控。


## novel-characters

输入一篇小说/短故事，输出每个角色的：人物画像、形象提示词、音色提示词、角色设定图。

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-characters.mjs`，零依赖，`node` 直接跑。

**运行环境**：Claude Code 和 codex 都能跑。差别只在第 8 步出图——见 `references/sheet.md`。

---

### Step 0 — 确定报告语言

用户可以指定语言，比如「用英文」「--lang en」「日本語で」。**没说就是中文（`zh`）。**

这个 `lang` 会一路传下去：第二趟生成角色卡时决定人类可读字段用什么语言，`validate` 和 `render` 也都要带上。

**界面文案分两种情况：**

- `zh` / `en` / `ja` —— 内置，不用管
- **其他任何语言** —— 你要现场翻一份。跑

  ```bash
  node {baseDir}/scripts/novel-characters.mjs ui-template <lang>
  ```

  它打印一份英文骨架，把每个值翻译成目标语言，整块放进 `cast.json` 顶层的 `ui` 字段。渲染时会合并进内置表。

  **不给 `ui` 的话 `validate` 会直接报错**——否则报告会是「角色内容是法语、界面标签是英文」的半吊子状态。

支持的语言不受内置表限制，法语韩语西班牙语都能出完整报告。

### Step 0.5 — 确定画风

用户可以指定出图风格：**默认 `realistic`**（半写实厚涂），想要动画质感就用 `ghibli`（吉卜力式手绘赛璐璐）。

```bash
node {baseDir}/scripts/novel-characters.mjs styles   # 打印预设的完整内容
```

读 `{baseDir}/references/style-presets.md`。**换风格是整套换**——每个预设自带 render / surface / lighting / negative / tags 五块，整块取用，不要混搭。

最容易搞反的是反向提示词：`realistic` 绝不能禁 `photorealistic`，`ghibli` 必须禁。`validate` 会拦这个。

版面规则（16:9 三区、比例、细节让位）**不随风格变**，变的只有渲染质感。

### Step 1 — 定位输入

用户给文件路径就直接用。直接粘正文的，**先落到一个临时 .txt**——后面校验「引文是否逐字」要拿原文比对，没有原文文件这步就没法做。

确定输出目录：用户指定就用；没指定就用原书同级目录。

### Step 2 — 分块

```bash
node {baseDir}/scripts/novel-characters.mjs chunk <book.txt> <workdir>
```

打印 `{"chunks": N, ...}`。

- **N == 1**：跳过 Step 3，直接在当前会话读原文做第一趟，结果自己写成 `<workdir>/roster-00.json`
- **N > 1**：进 Step 3
- `truncated: true`：明确告诉用户尾部没扫到，别闷着

### Step 3 — 第一趟扫描（仅 N > 1）

**当前环境支持子代理就并发**（Claude Code 的 Task、codex 的 subagent）：每块一个子代理，**所有调用放在同一条消息里**才是真并发。不支持就一块一块串行读，结果一样，只是慢。

每个子代理的任务：
1. 读 `{baseDir}/references/roster-pass.md`，照它执行
2. 读 `<workdir>/chunk-NN.txt`
3. 把 roster JSON 写到 `<workdir>/roster-NN.json`
4. 只回一句「done NN，抽到 X 个角色」

### Step 4 — 归并 + 复核

```bash
node {baseDir}/scripts/novel-characters.mjs merge <workdir> | tee <workdir>/merged.json
```

落到 `merged.json` 不只是留档：Step 6 的 assemble 靠它拿同档角色的戏份顺序。

按名字+别名精确收敛（某块把「陆」列成「陆行远」的别名，两条就并成一个人），notes 累加、quotes 去重，按出现块数降序——出现的块越多戏份越重。

输出是 `{ "characters": [...], "mergeCandidates": [...] }`。**`mergeCandidates` 要逐条复核**：精确匹配只能收敛两块恰好写了相同称呼的情况，剩下的是语义判断，脚本做不了。候选来自名字包含关系（`「陆」⊂「陆行远」`）——是强信号不是判决，同姓的父子、兄弟就不能合。候选之外你自己看出来的同人（「陆先生」和「行远」没有包含关系，不会进候选）也要合。

要合并就写一份 merges.json 再落地：

```json
{ "merges": [{ "keep": "陆行远", "absorb": ["陆", "陆先生"] }] }
```

```bash
node {baseDir}/scripts/novel-characters.mjs merge <workdir> --apply merges.json | tee <workdir>/merged.json
```

`keep`/`absorb` 用名字或任一别名定位都行，找不到会直接报错。输出仍带 `mergeCandidates`，剩下的都确认是不同的人（或清空）再进下一步。没有要合的就直接往下走——但 `merged.json` 必须留着。

### Step 5 — 选角

独立原文分析可按用户指定 N 位（未指定最多 30 位）整理。短剧制作中，以已批准大纲保留的角色为准，不把原著戏份排名当投产名单；原著扫描仅供改编取舍，不在大纲锁定前给所有原著角色批量出图。

### Step 6 — 第二趟出卡

每个角色一份，同样能并发就并发。

每份任务拿到：
- `{baseDir}/references/profile-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- **报告语言 `lang`**（Step 0 定的）
- 该角色归并后的 `name` / `aliases` / `notes` / `quotes`
- **同批其他角色的名字**（避免长相声线撞车）

角色卡 JSON 写到 `<workdir>/card-<slug>.json`。**断点续跑**：只有对应源文、角色去留、设计与画风未变化时，才复用已存在的角色卡。

**同时写一段故事摘要**：用 `lang` 指定的语言，3–5 句，交代时空背景、核心情境、这几个人聚在一起的由头。短篇直接从原文写；长篇从各块的 roster note 归纳。不剧透结局，不写成推荐语。写到 `<workdir>/summary.txt`。非内置语言的话，把 Step 0 翻好的 ui 整块存成 `<workdir>/ui.json`。

然后合成 cast.json——**用 assemble，不要手拼**（手拼会丢字段、写错顶层键）：

```bash
node {baseDir}/scripts/novel-characters.mjs assemble <workdir> \
  --source <书名> --lang <lang> --style <style> \
  --out <输出目录>/<书名>-cast.json
```

坏卡会被逐个点名——哪份 `card-*.json` 坏了就只重跑那个角色，其他不用动。

同档角色的先后是戏份顺序，来自 Step 4 留下的 `<workdir>/merged.json`（assemble 自动读，也可用 `--order` 指别的文件）。报告左栏「按戏份排序」的序号就靠它——看到「同档角色将按文件名序」的警告说明 merged.json 丢了，回 Step 4 重新生成。

### Step 7 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-characters.mjs validate <cast.json> <book.txt>
```

记得带上 `--lang`（Step 0 定的）。检查：结构、`importance` 枚举、**引文逐字**、**出图提示词不含人名**、**语言分工**（人类字段跟随 `lang`、出图/TTS 提示词永远英文）、以及**非内置语言必须带 `ui`**。

**有违规就按报错逐条修，改完重跑，直到通过。** 这四类错模型真的会犯——这套检查就是被真实输出打出来的。

### Step 8 — 出图（可选，每个角色都出）

**每个角色一张**，用 `image.sheet`，落到 `./images/<slug>-sheet.png`。一张横构图内部左右分栏：

```
┌──────────┬────────────────────────────┐
│  半身像   │   正视    侧视    背视       │
│ （证件照） ├────────────────────────────┤
│  面部基准  │  细节 · 细节 · 细节 · 细节   │
│   ~34%   │            16:9            │
└──────────┴────────────────────────────┘
```

左栏半身像是面部设计基准，右上三视图的脸照它画，右下是关键细节的小特写。**两条硬要求**：三视图的脸必须与半身像一致（否则一张图两个长相）；三个全身像的比例必须协调（模型会为了塞下细节把人压扁）。

读 `{baseDir}/references/sheet.md`，照它的调用契约做。要点：

- **没有 codex 就整步跳过**，只交提示词，后面照常走
- 跑在 codex 里就直接用 `$imagegen`；跑在别处就 shell 调 codex，先按那里的脚本探测版本最高的 binary（旧版会直接报错）
- **一个角色一次调用，绝不批量**
- 单个失败就跳过，不阻断；最后汇总说明
- **断点续跑**：先检查母本、服装和画风是否变化；仅复用当前版本仍适用的图，失败或过期才补做

出图数量由已授权范围和当前制作批次决定：先做主角及本批关键配角的样张验证风格，再补其余需要跨镜保持身份的角色；功能性背景人物按群体规范处理。用户已明确要求全角色出图时按约执行，不重复索取相同授权。声线文字只是设计方向，不等于已生成或已批准的声音母版。

### Step 9 — 输出

```bash
cd <输出目录>
node {baseDir}/scripts/novel-characters.mjs render <cast.json> --md   > <书名>-cast.md
node {baseDir}/scripts/novel-characters.mjs render <cast.json> --html > report.html
```

语言取 `cast.json` 里的 `lang`，要临时覆盖就加 `--lang <code>`。

`render` 会自动去 `images/<slug>-sheet.png` 找图。所以**先出图再 render**。

report.html 的样式约定见 `{baseDir}/references/report-style.md`——要改样式先读它，别把它改回通用卡片墙。

最终落地：

```
<输出目录>/
├── <书名>-cast.json
├── <书名>-cast.md
├── report.html                    ← 双击就能开
└── images/
    └── <slug>-sheet.png           ← 有 codex 才有
```

### Step 10 — 汇报

一句话说清：角色数、出图数、报告路径。校验一次没过的话，说明修了什么。有角色出图失败、被截断、或因为没有 codex 而没出图，明确说清楚。

---

## 边界

- 单次上限 24 块（净覆盖约 93 万字符），超了会明确报 `truncated`，不静默截断
- 人类可读字段跟随 `--lang`（默认中文）；出图和 TTS 提示词**永远英文**，那些引擎吃英文最稳
- 设定图最容易出的两个问题：**一张图里两个长相**、**为了塞细节把人物压扁**。拿到图先扫一眼，见 `references/sheet.md`
- 出图只走 codex built-in `$imagegen`。**不用它的 CLI fallback**（要 `OPENAI_API_KEY`）
- 想要能实时编辑、边跑边看的交互界面，那是另一个东西，不在这个 skill 里

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

310 项断言，不调模型、不花额度，覆盖分块 / 归并 / 合成 / 多语言 / 校验 / 渲染的全部确定性逻辑。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口.txt` 是一篇短故事，4 个角色，其中货郎全程只有绰号、船夫只被叫过「老伯」——专门用来验别名归并。对应产出 `渡口-cast.json` / `渡口-cast.md` 可以当质量基准，也是校验的自检夹具。


## 制作交接

独立使用时，自检后主动打开当前报告并给绝对路径链接，说明本轮范围、检查重点和下一步；需要锁定内容时在对话中收取通过或修改结论。已有确认覆盖当前版本就不重复询问，打开页面或下载 JSON 不算批准。总控已接管时，由总控统一收取这次结论，不另开重复审批。当前内容、依赖或源图改变后，不因旧文件仍存在就跳过复核；输出新版本并保留原审阅笔记。

本项目的阶段职责、变更记录和交付顺序由 `short-drama-production` 的 `references/company-workflow.md` 统一维护；未安装总控时按本 skill 的输入和交付范围独立完成，不将总控变成硬依赖。


涉及尚未授权的创作取舍时，给用户 2–3 个有具体差异的选项，说明收益、损失与推荐，允许保留原稿或自定义。模型先完成阅读、诊断和短样段，不把准备工作推给用户；已经明确授权的范围直接执行。未经用户选择，不把暂定片长预算升级成删词、删情绪段落的理由。
