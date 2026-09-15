<div align="center">

# 🎬 Short Drama Production

### 把 AI 视频生成，升级成可追踪、可审批、可返工的短剧生产管线

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)
![Node.js ≥ 18](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Python ≥ 3.10](https://img.shields.io/badge/Python-%E2%89%A53.10-3776AB?logo=python&logoColor=white)
![Tests: 22/22](https://img.shields.io/badge/tests-22%2F22-brightgreen)
![Default: 16:9](https://img.shields.io/badge/default-16%3A9-black)

**不是再写一条“万能 Prompt”。** 这是一个面向 Codex 的 AI 短剧生产总控 skill：把大纲、角色、美术、剧本、导演、技术分镜、H3 任务、声音、粗剪与 QC 串成一条有状态、有依赖、有审批边界的生产链。

**内置 MiniMax 官方与 CompShare H3 执行路径；采用 Apache-2.0，可自由二次开发，并按需扩展 ComfyUI API。**

`AI 短剧` · `短剧skill` · `MiniMax H3` · `Codex Skill` · `AI Video` · `ComfyUI`

</div>

---

## CompShare 注册福利

## [立即注册 CompShare，领取限时 300 积分 →](https://passport.compshare.cn/register?referral_code=8vFGBqRO6b7FYUaabHvGlW)

- MiniMax H3 API 低至 0.08 元/秒（可直出 1080P / 2K）。
- 单次最长生成 **30 秒视频**。
- 限时领取 300 积分。
- **首次购买 +10%**。
- 本项目已内置 CompShare H3 适配器；也可以依据现有任务合同改造成自己的 API，或新增 ComfyUI API 适配器。

> 当前仓库内置的是 MiniMax 官方接口和 CompShare 参考图任务接口；ComfyUI 属于可扩展接入方向，并非开箱即用的内置节点。价格、积分、适用模型和活动期限可能调整，请以 CompShare 注册页及控制台实时展示为准。

## 为什么需要它

AI 短剧最难的往往不是“生成一个镜头”，而是让几十个镜头在持续修改后仍然可控。

| 常见生产问题 | Short Drama Production 的处理方式 |
| --- | --- |
| 上游改了人物或场景，下游仍在使用旧素材 | 记录制品哈希和依赖关系，自动传播 `stale` 状态并要求重新审批 |
| 导演想法、技术分镜和模型提示词互相覆盖 | 导演意图与技术执行分层，保留偏差审计 |
| 一上来批量付费生成，错误被成倍放大 | 先做高暴露度样片；提交、批量、重试均需要明确确认 |
| “现实主义”只有滤镜，没有真实空间逻辑 | 在出图前审计功能、设备、拓扑、人流、运行状态和生活痕迹 |
| 参考图越堆越多，反而锁死动作或产生多手 | 区分语义参考与关键帧，按 T2VA / I2VA / FL2VA / L2VA / Ref2VA 分流 |
| 音色来源、授权范围和最终母版混在一起 | 将发现、试听、授权克隆、母版登记与使用范围分开管理 |
| 视频“能看”但无法稳定返工 | 用 `production.json` 记录任务、审批、失败原因、粗剪和 QC 状态 |

## 一条真正可执行的生产链

入口按已有材料选择：完整小说先确定改编范围；完整剧本直接评审、润色或进入导演设计；想法先做方向提案。未授权的删线、合人、改变主题或结局，先展示具体改法与取舍，由用户决定。既有授权覆盖的修改直接完成。详见 [创作范围与用户决策](references/creative-agreement.md)。

`novel-script` 与 `novel-outline` 默认不运行固定字数、钩子/悬念、角色数量、爽点间隔等创作门；结构与实际引用错误仍拦截。剧本默认不按字数和动作条数计秒，未实测显示待计时。只有用户明确需要旧版对照时才启用 `reviewPolicy: strict` 或剧本 `timingMode: legacy-estimate`，两者互不隐含。其他专业工具的模型接口与资产合同仍需满足；不把它们扩大成删改剧情的理由。下面是阶段依赖示意，不是每份材料必走的全流程。

```mermaid
flowchart LR
    A[需求 / 原著] --> B[大纲]
    B --> C[角色与美术]
    C --> D[剧本]
    D --> E[导演设计]
    E --> F[技术分镜]
    F --> G[H3 样片]
    G --> H{用户审批}
    H -->|通过| I[批量生成]
    H -->|退回| E
    I --> J[粗剪 / 声音 / 字幕]
    J --> K[QC 与返工]
    K --> L[交付]
```

核心状态只保存在 `production.json`。专业 JSON 负责内容，总控只保存路径、哈希、依赖、审批和任务状态，避免把大段创作内容重复塞进上下文。

## 核心能力

### 可视化故事板 · 免费离线审阅

镜头卡片并列展示构图规划、任务参考素材与生成视频，支持集数/关键词筛选、时间带定位、按规划时长预览、多版本切换和返工笔记导出。新增按段多格图片故事板：审阅版 PNG、模型参考版 PNG、单格 PNG 与镜头映射 JSON；可在页面替换单格图片。缺少媒体时显示占位，模型参考版要求图片齐全并完成人工检查，不调用生成 API。

```bash
node scripts/storyboard-view.mjs examples/offline/storyboard.json --out runs/storyboard-demo.html
```

打开生成的 HTML 即可使用。接入真实项目与功能边界见[故事板使用说明](./references/storyboard-view.md)。

进入人工审批节点时，agent 应主动打开当前报告、说明本轮范围与检查重点，并在对话中收取结论。用户可直接回复“通过 E01-01 分镜”或按镜号提出修改；不需要自行寻找 HTML 或运行命令。各阶段何时看、看什么、确认后如何继续见[审阅交接](./references/review-handoff.md)。页面中的验收框用于导出参考图，不替代项目审批或费用授权。

### 1. 制片级状态管理

- 制品登记、依赖哈希、过期传播与重新审批。
- 任务级风险、成本确认和失败原因记录。
- 上游变化后可准确定位受影响的下游，而不是整部剧从头检查。

### 2. 导演与技术分镜分层

- 保留戏剧意图、场面调度、景别、机位、运镜和节奏。
- 支持导演桥接包和标准 `novel-storyboard export` 两条独立路线。
- 分镜图提示词先于候选素材，最终 H3 提示词后于素材验收，避免“先出错图、再让提示词迁就素材”。

### 3. 现实题材真实性门

- 检查空间功能、设施设备、人物行为、动线、人流密度与运行状态。
- “空景”不会自动抹掉现实必需设备、办公生活痕迹或公共场所人流。
- 对车站、办公室、医院等功能空间，先验证结构合理，再评价画面美感。

### 4. MiniMax H3 多模态执行

- 使用官方 `h3-prompt-writing` skill 组织正式 H3 提示词。
- 支持 MiniMax 官方接口的图片、视频、音频参考、预检、提交、轮询与下载。
- 内置 CompShare 参考图任务适配器，支持 Context-IR 实验记录和提交前检查。
- 将画面内运动与摄影机运动分开描述；节奏调整通过镜头重新计时，不靠成片整体倍速。

### 5. 声音资产管理

- 支持 Fish Audio 公共音色筛选、试听、授权克隆和声音母版登记。
- 记录声音来源、授权范围和 `evaluation-only` 限制。
- 声音资产与角色、台词和最终视频任务解耦，便于替换而不破坏整条生产链。

### 6. 粗剪、QC 与成本边界

- 生成 FFmpeg 顺序粗剪计划，并可显式执行。
- 付费提交、批量任务、重试、发布和覆盖成片都需要用户当次确认。
- 已存在的外部任务先查询状态，不盲目重提。

## 快速开始

### 1. 安装

仓库包含生产总控和七个配套 skill。推荐从仓库根目录安装到一个新的 skills 目录，先预览再写入：

```bash
node scripts/install-bundle.mjs --dest <项目目录>/.agents/skills
node scripts/install-bundle.mjs --dest <项目目录>/.agents/skills --apply
```

八个 skill 安装为同级目录，保留跨 skill 引用。目标中已有同名目录时整次安装拒绝覆盖；更新前先备份旧版本，或安装到新的项目目录。单独使用总控时，也可只复制本仓库的 SKILL.md、agents、assets、references、scripts 和 LICENSE。

运行环境：

- Node.js 18+：核心状态、桥接、H3 官方适配器和测试。
- Python 3.10+：CompShare 客户端。
- FFmpeg / ffprobe：实际粗剪与媒体检查。
- 对应服务的 API 密钥：只存放在环境变量或本地 secrets 文件，禁止提交到仓库。

### 2. 在 Codex 中调用

首次安装，建议先运行免费离线演练：

```bash
node scripts/doctor.mjs
node scripts/offline-demo.mjs
```

检查器报告本机依赖；示例生成生产报告，并演示“大纲修改 → 剧本过期”。不需要 API 密钥，不调用生成接口。详见[首次运行与依赖说明](./references/getting-started.md)。

```text
$short-drama-production 为这个项目建立 16:9 短剧生产状态，先检查现有制品和依赖，不提交任何付费任务。
```

你也可以直接要求它继续项目、检查状态、分析上游变更影响、准备 H3 样片或组织粗剪。

### 3. 使用命令行检查状态

```bash
node scripts/production-kit.mjs init <project-dir> --title <剧名> --source <源文件> --aspect 16:9
node scripts/production-kit.mjs status <project>/production.json
node scripts/production-kit.mjs validate <project>/production.json
node scripts/production-kit.mjs refresh <project>/production.json
node scripts/production-kit.mjs render <project>/production.json > production-report.md
```

完整命令和数据结构见 [`SKILL.md`](./SKILL.md) 与 [`references/`](./references/)。

## 两条分镜接入路线

| 路线 | 适用情况 | 行为 |
| --- | --- | --- |
| 导演桥接 | 已有 `director-package.json` | 用 `storyboard-bridge.mjs` 保留导演意图与偏差审计，再同步 H3 任务 |
| 标准分镜包 | 已有 `novel-storyboard export/manifest.json` | 直接用 `jobs-sync-package` 接入，不再重复经过桥接器 |

两条路线是替代关系，不会把同一批分镜重复导入。

## 执行适配器

| 组件 | 已实现能力 | 当前边界 |
| --- | --- | --- |
| MiniMax 官方 H3 | 多模态参考、预检、确认提交、轮询、下载 | 需自行提供官方密钥 |
| CompShare H3 | 本地参考图内嵌、预检、Context-IR、确认提交；输出时长 4–30 秒 | 当前适配器仅支持参考图任务 |
| Fish Audio | 音色发现、试听、授权克隆、母版登记 | 不替代声音授权判断 |
| FFmpeg | 顺序粗剪计划、显式执行、基础媒体 QC | 不提供复杂多轨剪辑与调色 |

## 安全设计

- **默认不花钱**：dry-run、预检和样片优先；没有显式确认就不提交付费任务。
- **默认不泄密**：密钥只从环境变量或本地 secrets 文件读取，不写进项目、日志或仓库。
- **默认不盲目重试**：已有任务先查状态；重试视为新的付费动作。
- **审批与哈希绑定**：文件变化后旧审批失效，避免“内容已经换了，批准仍然有效”。
- **声音权利可追踪**：来源未明或授权不足的声音只能标记为评估用途。

## 项目结构

```text
short-drama-production/
├── SKILL.md                         # Codex 入口与核心工作规则
├── LICENSE                          # Apache License 2.0
├── agents/
│   └── openai.yaml                  # Skill UI 元数据
├── references/                      # 按阶段加载的专业工作流说明
├── scripts/
│   ├── production-kit.mjs           # 状态、依赖、审批和任务总控
│   ├── storyboard-bridge.mjs        # 导演包桥接
│   ├── h3-official.mjs              # MiniMax 官方 H3 适配器
│   ├── compshare-h3.py              # CompShare H3 适配器
│   ├── fish-voice.mjs               # Fish Audio 声音适配器
│   ├── post-kit.mjs                 # 粗剪与基础 QC
│   └── selftest.mjs                 # 确定性回归测试
└── README.md
```

## 验证

```bash
node scripts/selftest.mjs
node scripts/reality-gate-test.mjs
node scripts/storyboard-view-test.mjs
node scripts/post-workflow-test.mjs
node scripts/bundle-test.mjs
python scripts/compshare-offline-test.py
python scripts/compshare-h3.py --help
```

当前发布包包含 **22 项核心确定性测试**，覆盖初始化、依赖失效、审批、两条分镜接入路线、H3 预检、CompShare 时长边界、声音登记与粗剪；真实性投产门和可视化故事板另有独立离线测试。

## 推荐搭配

以下配套版本已包含在 skills/，安装器会与总控一起安装：

- `novel-outline`：改编大纲。
- `novel-characters`：角色设定与音色方向。
- `novel-art`：场景和叙事道具。
- `novel-script`：结构化剧本。
- `short-drama-director`：导演拆戏、场面调度、景别、机位与运镜。
- `novel-storyboard`：技术分镜与 H3 投产包。
- `h3-prompt-writing`：MiniMax H3 官方提示词结构。

缺失专业 skill 时仍可用 `manual` 制品接入总控，但不会冒充拥有对应专业质量门。

## 当前边界

当前发布版交付本地故事板审阅页面与基于已有单格图的多格 PNG 导出，不自动绘制缺失镜头或提交视频。返工笔记支持导出与合并导入；编辑会话可保存和恢复笔记、替换图片与布局，暂不回写项目。配套 skills 已随仓库分发，安装器和安装后的七套回归测试在 Windows/Linux CI 中验证。

升级后，CompShare 旧导出包需重新导出：新包包含 `integrityVersion` 和审计快照，防止继续使用已变化的审计。所有检查与示例均可离线运行；GitHub Actions 在 Windows/Linux 上运行离线测试，不配置生成密钥。

本项目不内置媒体生成模型，也不提供自动口型修复、声源分离、复杂多轨剪辑、调色或逐帧视觉检测。它解决的是生产组织、执行约束与可追踪返工；外部生成能力通过适配器或独立制品接入。

## License

本项目采用 [Apache License 2.0](./LICENSE)。你可以使用、复制、修改和分发本项目，也可以基于它开发自己的工作流；分发时需遵守许可证中的保留许可证、修改说明及相关声明要求。
