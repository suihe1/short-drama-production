# outline.json 结构

五件套的载体。**模型只管填这份 JSON**，Markdown 和 report.html 由 `render` 渲染出来，资产清单由脚本汇总——五件套是四件模型写 + 一件算出来的。

```json
{
  "source": "书名",
  "lang": "zh",
  "params": { "episodes": 60, "minutesPerEpisode": 2, "genre": "女频逆袭", "adaptMode": "抽核", "preferences": [] },
  "adaptation": { "core": "…", "keep": [], "cut": [], "merge": [], "risks": [] },
  "characters": [ { "id": "C01", "name": "…", "role": "…", "arc": "…", "from": ["原著…", "合并：…"] } ],
  "scenes": [ { "id": "S01", "name": "…", "primary": true, "reusePlan": "…" } ],
  "beats": [ { "id": "B01", "type": "打脸", "weight": "major", "episode": 3, "setup": "…", "payoff": "…" } ],
  "episodes": [ { "ep": 1, "synopsis": "…", "hook": "…", "suspense": "…", "sceneIds": ["S01"], "characterIds": ["C01"], "crowdPlan": "…", "warnings": [] } ]
}
```

## params

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `episodes` | 是 | 总集数，正整数。分集数量必须与它一致 |
| `minutesPerEpisode` | 是 | 单集时长（分钟） |
| `genre` | 是 | 题材，**决定爽点类型**，不许缺。投放平台的差异不单设字段，直接体现在 `thresholds` 上 |
| `adaptMode` | 是 | `忠实` / `抽核` / `借壳`，只能这三个 |
| `preferences` | 否 | 用户点名要保的角色、戏 |
| `thresholds` | 否 | 逐项覆盖质量门阈值：`maxLeads`(5) / `maxSupport`(10) / `maxFunctional`(10) / `maxBeatGap`(3) / `maxPrimaryScenes`（缺省不是常数，**随集数动态**：4 + ⌈集数/10⌉ 夹在 5–15，60 集 → 10。按 AI 短剧定的——场景是生成的，上限守的是一致性资产不是搭景钱）。短篇建议收紧角色档 |

## adaptation 改编说明

`core` 一句话核心，必填。`keep` / `cut` / `merge` 每条 `{what, why}`，`keep` 至少一条；**`adaptMode` 不是忠实时 `cut` 不能为空**。`keep` 可带 `evidence`——**原文逐字片段**，禁止凭书名脑补的对策就在这：关键取舍要能指回原文。`risks` 每条 `{what, plan}`。

两个可选的**决策补注**，报告的「关键决策」区块会展示：

- `cutNote` — 砍线的结论句（「这意味着：全剧终点是……原著后 30 章基本不用」这种），说清砍完之后故事的终点变成了什么
- `mergeNote` — 合人的补注，通常写主角组入选理由（谁有完整转变弧）

给了就不能是空字符串，`validate` 会拦。大爆点落点列表**不用写**——报告从 `beats` 里自动算。

## characters 人物表

每个字段都以校验器为准，一个不多一个不少：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | `C01` 格式，全局唯一，分集靠它引用 |
| `name` | 是 | 姓名；功能性角色用称呼标签（「急诊医生」） |
| `role` | 是 | 定位一句话：女主 / 搅局配角 / 渡口的报时人…… |
| `tier` | 是 | 三档之一，见下表 |
| `arc` | lead / support 必填 | 人物弧；functional 可省——医生就是来缝针的 |
| `from` | 是 | **← 改动记录**，非空数组：原著对应谁、合并了谁、纯原创写 `["原创"]` |

- `tier` 只能三档——一刀切的角色上限混淆了「观众要记住谁」和「制作要维护多少张脸」，分档把它拆开：

  | tier | 是谁 | 上限 | 规则 |
  | --- | --- | --- | --- |
  | `lead` | 主角组（男女主 + 主反派） | 1–5 人 | `arc` 必填 |
  | `support` | 有名字的重要配角（亲属、闺蜜、副反派） | ≤ 10 | `arc` 必填 |
  | `functional` | 功能性角色（医生、秘书、店员） | ≤ 10 | **占脸不占名**：`name` 用称呼标签（「急诊医生」）；`arc` 可省——医生就是来缝针的 |

  无名背景人不进表、不追踪、不限量。从 novel-characters 的 cast.json 映射：protagonist/major → `lead`，supporting → `support`，minor → `functional`

## scenes

- `id` 格式 `S01`，全局唯一；`name` 必填；`primary` 必填布尔（主场景上限随集数动态，见 `thresholds`）
- **在全剧只出现一次的场景必须带 `reusePlan`**（规避方案：复用哪个现有环境资产、换什么时段天气改出来）

## beats 爽点表

- `id` 格式 `B01`；`type` 自由文本（打脸/揭破/反转…）；`weight` 只能 `major` / `minor`（缺省算 minor）
- `episode` 是**唯一数据源**——分集不再列 beatIds，节奏条和资产清单都从这里算
- 硬规则：相邻爽点间隔 ≤ `maxBeatGap`，开头结尾无真空；**至少一个 major，且最早的 major 不能落在最后一集**

## episodes 分集梗概

- `ep` 从 1 连续编号，总数等于 `params.episodes`
- `synopsis` / `hook` / `suspense` 三栏**都必填**——【钩子】【悬念】空了视为未完成
- **叙述体**：三栏里出现 `「」『』“”` 引号对白就是在写剧本，越界，validate 会拦
- `sceneIds` / `characterIds` 必填且必须指向已登记的 id；每个角色至少出现一集、每个场景至少用一次
- `characterIds` ≥ 3 的集必须写 `crowdPlan`（同框拆解方案）。**校验按人数判，是代理指标**——如果这一集三人实际不同框（分处不同场次），把这个事实写成方案即可：「三人分处两场，无同框，分场拍」，照样通过
- `warnings`：梗概里扫到生成难点关键词（雨戏/肢体接触/人群/手部特写）就必须列进来，宁可多报

## 校验

```bash
node scripts/novel-outline.mjs validate outline.json --stage skeleton|beats|full
node scripts/novel-outline.mjs checkup outline.json   # 只打印 13 道质量门 ✓/✗
```

stage 就是流程门：骨架拍板前过 `skeleton`，**写分集之前必须过 `beats`**（爽点间隔和 major 时机错了，分集写完全废），交付前过 `full`。
