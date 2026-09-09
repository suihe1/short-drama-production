# 设定图出图（场景 + 道具）· codex `$imagegen`

出图走 codex 内置的 `$imagegen` 系统 skill，**不需要任何 API key**——用本机 codex 登录态。**没有 codex 就整步跳过**，只交提示词，其余产出照常。

## 每个场景、每件道具各一张图

### 场景

一张 16:9 横构图，主视角大图 + **底部和右侧的 L 形细节边框**，细线分隔：

```
┌─────────────────────────────┬───────┐
│                             │ 细节 1 │
│      主视角（标准取景）        ├───────┤
│      场景的标准长相            │ 细节 2 │
│      ~72% 宽 × 70% 高        │       │
├─────────┬─────────┬─────────┼───────┤
│  细节 3  │  细节 4  │  细节 5  │       │
└─────────┴─────────┴─────────┴───────┘
```

- **主区（左上，约 72% 宽 × 70% 高）**：主视角 = 这个场景的标准取景 + 第一个光照状态，这就是「这个场景长什么样」的唯一标准答案
- **右列 + 底行**：全部是**细节特写**——一致性锚点和关键材质的近景，右列 2 格、底行 3 格左右
- 每个细节格都必须是主视角那个空间的裁切放大，**不许出现主视角里没有的东西**——提示词里写死 `nothing invented that is not present in the master view`

### 道具

同一套 L 形版面，差别三处：**纯白背景**（每个面板都是，要抠图）、主视角是主状态的四分之三角度、底行放**其他状态 + 侧面正交视图**。全图**无人且无手**——拿着道具的手是最常见污染，出现就重生成。尺度短语（handheld scale 等）必须在提示词里，否则皮箱会被画成衣柜。

提示词字段 `image.sheet`，场景和道具都落到 `./images/<slug>-sheet.png`（`slug` 命令生成安全文件名）。

## 三条硬要求

1. **全图空景无人。**提示词里 `Absolutely no people anywhere` 必须在，反向提示词禁人必须在。生成图里出现一个人影就重生成——环境资产里的人洗不掉。
2. **一张图里只能有一个空间。**角色设定图最容易出「一张图两个长相」，环境图的对应崩法是**面板之间空间对不上**（左边六排坐板、右上变成四排）。提示词里写死 `THE SPACE MUST BE IDENTICAL ACROSS ALL PANELS`。拿到图先核对锚点：每个锚点在主视角里找得到吗？
3. **透视要稳。**环境图最常见的废图是几何融化、透视歪斜。反向提示词里 `warped perspective, melted geometry` 必须在（预设自带）。

## 调用契约（与 novel-characters 相同）

- **跑在 codex 里**：直接用 `$imagegen`，不要再 shell 出去调 `codex exec`
- **跑在 Claude Code**：shell 调本机 codex，**先探测版本最高的 binary**（旧版直接报错），探测脚本抄 `novel-characters/references/sheet.md` 的 `find_codex`
- 所有调用套 `env -u NODE_OPTIONS`（codex 继承坏的 NODE_OPTIONS 会启动即崩）
- **一个场景一次调用，绝不批量**（PNG 字节会撑爆 rollout）
- 用了 `-i/--image` 这类变长参数时 **prompt 必须走 stdin**
- 提示词里明写「copy to ./images/<slug>-sheet.png」，别让图留在 codex 默认目录
- 单个失败跳过不阻断，最后汇总说明
- **不碰 CLI fallback**（要 `OPENAI_API_KEY`）

## 变体场景的出图

`variantOf` 的场景**拿母场景的成图当参考图**（codex 的 `-i` 参数），提示词 = 母场景主视角 + `changes` 的改动描述 + 一句 `keep the structure, materials and wear identical to the reference image`。这比从零生成一致得多——变体机制的意义就在这。

## 画风一致性

同一部剧的所有场景应该像同一个美术组画的。压不住的话，拿第一个主场景的成图当风格参考喂给后面的场景（同样走 `-i` + stdin）。代价与角色 skill 相同：第一张定基调，出得不好就得重来。
