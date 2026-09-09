**中文** · [English](README.en.md)

# novel-storyboard

给 AI 短剧出**分镜**：把 novel-script 的节拍流切成可以直接下单给视频模型的生成任务单。这是管线里第一个直接面对视频模型的层，前提刻在骨子里：**镜头是生成出来的，多切一刀的成本几乎为零**，短剧观众的注意力节奏是 3 秒左右一切。所以结构是三层：

```
段（segment）＝ 一次视频生成调用，≤ 15 秒，不跨场次
 ├─ 分镜（cut）× 3–5 ＝ 段内剪切，每切 2–5 秒（硬门），各自认领剧本节拍
 ├─ 分镜图 ＝ 每切一张候选规划图；是否成为首尾帧或普通参考由生成模式与 QC 决定
 └─ H3 提示词 ＝ 一段一条，多图对齐指令 + [Shot k] 切点时刻逐字对账
```

- **两人对话的正反打在一段里一次生成**——全景、A 近景、B 近景各是一个 2–5 秒的分镜，每格构图由自己的分镜图控制，不靠文字赌
- **对齐指令是推导出来的，不是写出来的** — 多图对齐句式（`Picture 2 aligns with the 3.00-second mark…`）和 `[Shot k] At 00:0X.XXX` 切点时刻全部由分镜秒数推导，validate **逐字对账**：改了秒数忘改提示词，当场拦
- **提示词按官方口径默认英文、逐镜换行** — 每个镜头独立一行、切点时刻开头；台词/歌词/画面文字按官方规定保留原文（`<d>[Chinese] …</d>` 逐字）。`promptLang: 'zh'` 可切整条中文（对齐指令、字段名、镜头标记都有中文版）。写法规范已内化为 `references/h3-prompt.md`——**本 skill 自包含，不依赖任何外部 skill**
- **分镜图是资产合成，不是凭空画** — 出图挂场景/角色/道具设定图当参考图，novel-art 和 novel-characters 的图在这一步真正被消费。有 codex 就真出图（可选）

产出 `storyboard.json` + Markdown + 一个双击就能开的 `storyboard-report.html`：

![storyboard-report.html](assets/report.webp)

## 质量门：19 道，全是代码

与仓库里另外四个 skill 同一主张：**checklist 交给模型自觉是靠不住的**。

| 门 | 规则 |
| --- | --- |
| **节拍全覆盖** | 剧本每个节拍被恰好一个分镜认领、按顺序、连续、不跨场 |
| 段时长 | 0 < Σ分镜 ≤ 15 秒（一次生成的上限，`params.maxSegmentSeconds` 按模型改） |
| **分镜时长** | 每切 2–5 秒——3 秒左右的短剧节奏是**硬门**不是建议 |
| 台词装得下 | 认领节拍的台词秒数 ≤ 分镜秒数，逐切检查 |
| 每集总时长 | Σ段 落在剧本 `targetSeconds` ±15% 内 |
| 同框上限 | 单个分镜 ≤ 3 人，超了必须带拆解说明 |
| 段号纪律 | `E01-01` 格式、按顺序连号——段号就是素材文件名 |
| 景别短语 | `close-up` 这类英文短语必须出现在分镜图提示词里 |
| 运镜词表 | 运镜直接用 H3 官方词表（`Push In` / `Pan Left` / `Tracking Shot`…），且必须出现在**自己的 [Shot k] 段落**里 |
| **H3 结构** | 首行对齐指令**由分镜结构按语言推导、逐字对账**；三字段按序；每个 `[Shot k]` 的切点时刻等于前面分镜秒数的累计 |
| **H3 台词逐字** | 认领的每句台词逐字出现在 `<d>` 块里，改一个标点都过不去 |
| **提示词语言一致** | 正文语言与 `promptLang` 双向对账：设定中文写成英文、设定英文混进中文，都拦 |
| **风格短语统一** | `style` 预设（realistic / ghibli，与角色/场景 skill 同名对齐）的英文短语必须出现在每条分镜图提示词里——同剧不许画风漂 |
| 分镜图提示词卫生 | 全英文非空 |
| 提示词不含角色名 | 分镜图提示词恒查；H3 提示词仅英文模式查（中文放行，身份靠分镜图锚定）。给 `--outline` / `--cast` 才查，不给**明说跳过** |
| 引用对账 | 场次/人物/道具全部对账剧本该场 |

自测里每道门都有**击穿用例**——证明它真的会拦。

## 报告长什么样

业内评审用的单页报告，页宽 1600：

- **KPI 带**：生成段数 / 分镜数与平均秒数 / 总时长 vs 目标 / 生成批次数 / 台词段数
- **分镜节奏带**（招牌图）：每集一行色带，**粗分隔 = 段边界（一次生成）**，片宽 = 分镜时长占比、颜色深浅 = 景别远近——深浅相间、长短相间就是好节奏；点一片跳到那张段卡
- **分集分镜表**：每段一张卡——**主分镜图** 16:9（缺图显示提示词占位，**不装有**）、**子分镜条**缩略格、下方**五五分栏**：左列逐切分镜行（起点秒 · 秒数 · 景别 · 运镜 · 画面摘要**从剧本认领的节拍自动带出**），右列 H3 提示词面板——逐镜换行直接可读，一键复制
- **生成批次单**：同场景 + 同光照的段归一批，共用同一张环境参考图——批次卡嵌场景设定图，列出需要的角色设定图和道具
- **配音对齐单**：每句台词对到**段号#切序**——TTS 音频贴到哪一段的第几切，全自动
- **质量门**面板 + 页眉徽章 + **导出 JSON**（下载的就是 `storyboard.json` 原样）
- 全部图形内联 CSS/SVG，零外部依赖，离线双击能开
- 报告界面默认中文，`render --lang en` 输出全英文界面（内置 zh / en 两套）——只切界面标签，与 `promptLang`（H3 提示词语言，默认英文）互相独立。英文界面下质量门标签同样翻译（阈值原样），门的失败详情与数据内容保持原文

## 五个 skill 的接力（管线到此闭环）

```
novel-characters → cast.json       （谁：角色设定图）
novel-outline    → outline.json    （什么：结构与分集）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：段、分镜、分镜图、H3 提示词）
```

- `seed <script.json> --eps 1-3` 确定性展开每场的节拍清单（编号、每拍秒数、说话人）当切镜底稿——**每拍几秒是算出来的，不让模型重新估**
- `validate --script` 是硬前提（分镜离开剧本没有意义）；`--outline` / `--cast` 查提示词人名，`--art` 让报告显示场景名并在批次单嵌设定图
- 分镜图出图走 codex `$imagegen`，场景/角色/道具设定图当 `-i` 参考图；H3 提示词 + 整套分镜图直接下单给 MiniMax H3

## 命令行直接用

```bash
node scripts/novel-storyboard.mjs seed script.json --eps 1     # 切镜底稿
node scripts/novel-storyboard.mjs validate sb.json \
     --script script.json --outline outline.json --cast cast.json
node scripts/novel-storyboard.mjs checkup sb.json --script script.json
node scripts/novel-storyboard.mjs render sb.json --html \
     --script script.json --outline outline.json --art art.json > storyboard-report.html
node scripts/novel-storyboard.mjs render sb.json --html --lang en \
     --script script.json --outline outline.json --art art.json > storyboard-report.html   # 英文界面报告
node scripts/novel-storyboard.mjs export sb.json --script script.json   # H3 投产包
```

`export` 的投产结构固定：**每段一个文件夹** `E01-01/`。`prompt.md` 只保存可直接提交的官方提示词正文，不混入 Markdown 标题或参考清单；Picture 顺序、purpose 与 controlType 保存在根部 `manifest.json`。Ref2VA 不伪造首帧或逐切时间锚；I2VA/FL2VA/L2VA 才按真实首尾帧导出。manifest 的 prompt、pictures 和 missing 一律相对包根目录，避免下游再次拼接 `h3-package/`。

## 边界

- 不写戏不改台词、不出设定图、不做视频生成与剪辑合成
- 口型/唇形同步暂不管——那是生成管线的事
- 秒数是**下给视频模型的生成时长**不是估算；段上限、分镜节奏区间都在 `params` 里按模型调
- 报告界面内置中英（`--lang`，默认中文）；提示词语言由 `promptLang` 单独控制（默认英文）
- 分镜图默认先出第一段的整套（3–5 张）看效果，确认画风和构图再往后补——一集约 30–40 格，方向错了整批重来

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  novel-storyboard.mjs   seed / validate / checkup / render / export / slug
  selftest.mjs           确定性断言，不调模型
references/
  schema.md              storyboard.json 结构 + 时长约束链
  h3-prompt.md           H3 提示词写法规范（官方方法论内化版）
  storyboard-pass.md     切镜：分段规则、导演运镜手感、常见病
  frame.md               分镜图出图的 codex 调用契约
  report-style.md        报告的设计约定
examples/
  渡口-storyboard.json    《渡口》第 1 集完整分镜（10 段 34 切认领 35 拍），全部质量门通过，也是自测夹具
assets/
  report.webp            报告截图
```

## 自测

```bash
node scripts/selftest.mjs
```

确定性断言覆盖节拍展开 / H3 骨架推导 / 信息与姿态 QC / 质量门逐项击穿 / seed / 渲染 / 导出。不调模型、不花额度。改完脚本先跑这个。

**只在 macOS + Node 24 上实测过。** 代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但**没验过**。
