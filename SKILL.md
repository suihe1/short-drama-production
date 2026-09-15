---
name: short-drama-production
description: 统筹 AI 短剧的阶段、依赖、审批、H3 任务、声音资产、粗剪和 QC，并用 production.json 追踪返工；默认支持 16:9。用于整部短剧生产、继续项目、状态检查或上游变更影响分析；单独创作大纲、角色、美术、剧本或分镜时使用对应专业 skill。
license: Apache-2.0
---

# Short Drama Production

这是生产总控，不替代编剧、导演、美术或分镜。它负责阶段路由、状态、依赖哈希、审批、付费边界和可执行任务。

路径均相对本 skill 目录。运行脚本时把工作目录设为本目录；项目文件传绝对路径。

## 按需读取

- 首次接手小说、剧本、想法或要求改写：先读 `references/creative-agreement.md`，按实际输入与任务路由，确定保留点、改动权限及需要用户选择的取舍。已有完整剧本可以直接审阅或进入导演阶段。
- 组织整剧或跨部门返工：读 `references/company-workflow.md`，明确内容所有者、阶段出口和选片/锁画职责。专业 skill 独立工作时不重复承担总控审批。
- 到达人工审批门、交付报告或继续待审项目：读 `references/review-handoff.md`。主动展示当前版本，说明检查重点和回复方式；不能只生成文件并静默等待。
- 首次安装或环境诊断：读 `references/getting-started.md`；运行 `scripts/doctor.mjs` 和 `scripts/offline-demo.mjs` 可离线检查与演练。
- 可视化审阅或多格图片故事板：读 `references/storyboard-view.md`，用 `scripts/storyboard-view.mjs` 生成本地 HTML，可按段导出审阅版/模型参考版/单格 PNG 和镜头映射。图片须与镜头内容逐格核对；通过验收的多格图可作为 Ref2VA shot-planning reference，不能把整张拼贴当 I2VA 首帧。规划图不自动进入参考包；返工笔记不自动变成审批。
- 新建、继续或变更项目：读 `references/pipeline.md` 和 `references/schema.md`。
- 现实主义或功能空间：美术出图前读 `references/reality-grounding.md`。
- 进入导演/技术分镜：读 `references/director-storyboard-handoff.md`。
- 涉及对白、音色或 Fish Audio：读 `references/sound-production.md`；实际调用 Fish 时再读 `references/fish-voice.md`。
- 调用 MiniMax 官方 H3：读 `references/h3-execution.md`。
- 调用 CompShare H3：读 `references/compshare-execution.md`。
- 进入粗剪或验收：读 `references/post-and-qc.md`。
- 改画幅或制作衍生版：读 `references/landscape-16x9.md`。

写、改或审 H3 提示词时使用可用的官方 `h3-prompt-writing` skill。若不可用，停在技术分镜，不自造近似格式。提交前核对提供方当前官方文档。

## 核心规则

1. `production.json` 是状态源；专业 JSON 是内容源，不复制大段正文。
2. 上游文件或依赖哈希变化后先 `refresh`；受影响下游必须重新审批。
3. 模型负责创作建议，用户决定方向与取舍；脚本负责结构和执行约束。公式时长及类型经验不能替代围读、审美和用户选择，不为校验通过静默改戏。
4. 付费提交、批量、重试、发布和覆盖成片必须落在用户明确授权的对象、范围与费用内；已有授权覆盖时不重复询问，超范围再确认。已创建任务先查询，不盲目重提。
5. 默认先做 1 个高暴露度样片，再扩到一场或一集；剧本、导演和分镜默认每批 1–3 集。
6. 优先继承用户与输入材料的规格；均未指定时才默认 16:9、1920×1080、24 fps、`landscape-ensemble`。初始化时显式传入已确定画幅；画幅变化使全部非源制品过期。
7. 现实题材设置 `policies.realityRequired: true` 并维护同目录 `reality-audit.json`；投产前运行 `reality-audit.mjs preflight`，三个验收项全部 `pass` 才可继续。先核对功能、设备、拓扑、人流和运行状态；“空景”不能删除现实必需设备和生活痕迹。
8. 分镜图提示词先于候选素材；最终 H3 提示词后于素材验收。错误姿态、手别、支撑点或不可读信息图不得进入参考包。
9. Ref2VA 与 I2VA/FL2VA/L2VA 分流；多张语义参考不是按切点强钉的关键帧。
10. 分别描述画面内运动与摄影机运动；节奏提速通过重新计时，不把正式成片整体倍速。
11. Context-IR 新项目先 `pilot`。A/B 每次只改一个变量；混合变量结果只能说明整体方案胜出。
12. 正式 H3 执行提示词遵守官方英文结构；中文保留在创作 brief、对白、歌词和可见文字中。

## 生产流程

每个既有人工审批门都要完成交接：先自检和修复已知问题，再打开可审阅报告、给出绝对路径链接，明确本轮范围、最多三个检查重点、已知缺口及确认后的下一步，并在对话中主动请求具体结论。已有授权覆盖当前内容时直接使用，不重复询问。用户未确认时只等待依赖该决策的工作，继续可独立完成的准备。详细阶段入口、反馈和哈希复核见 `references/review-handoff.md`。

```text
需求 → 大纲 → 角色/美术 → 剧本 → 导演 → 技术分镜
    → H3 样片 → 批量生成 → 粗剪/声音/字幕 → QC → 交付
```

上图是可选阶段的依赖顺序，不要求每份输入从需求重跑。已有剧本或分镜先检查可用范围，按实际制品登记依赖，不伪造大纲和审批；只做诊断或创作讨论时不强制建立完整生产项目。

导演到技术分镜只选一条接入路线：

- **导演桥接**：已有 `director-package.json` 时，用 `storyboard-bridge.mjs` 保留镜头意图和偏差审计，再用 `jobs-sync`。
- **标准分镜包**：已有 `novel-storyboard export` 的 `manifest.json` 时直接用 `jobs-sync-package`，不再经过桥接器。

专业 skill 缺失时可以人工产出同一 JSON 合同，并把 `producer` 记为 `manual`；不得声称拥有缺失的专业质量门。

## 核心命令

```bash
node scripts/production-kit.mjs init <project-dir> --title <剧名> --source <源文件> --aspect 16:9
node scripts/production-kit.mjs status <project>/production.json
node scripts/production-kit.mjs validate <project>/production.json
node scripts/production-kit.mjs register <production.json> --id <id> --kind <kind> --stage <stage> --path <file> --depends <ids>
node scripts/production-kit.mjs refresh <production.json>
node scripts/production-kit.mjs approve <production.json> --id <artifact-id> --by user --note <确认内容>
node scripts/production-kit.mjs render <production.json> > production-report.md
```

两条分镜接入路线的命令见 `references/director-storyboard-handoff.md` 与 `references/compshare-execution.md`。只有用户确实确认当前哈希时才执行 `approve` 或 `job-approve`。`validate` 通过不代表表演、声音或审美合格。

## 可选执行适配器

- MiniMax 官方 H3：`scripts/h3-official.mjs`，支持多模态参考、预检、显式确认提交、轮询和下载。
- CompShare H3：`scripts/compshare-h3.py`；先用 `production-kit.mjs job-export-compshare` 导出，当前只支持参考图任务。
- CompShare 输出时长支持 4–30 秒整数；按戏剧节奏选择时长，不自动延长旧段。超过 15 秒时见 `references/compshare-execution.md` 的提示词时长兼容说明。
- Fish Audio：`scripts/fish-voice.mjs`，支持 dry-run、公共音色筛选、试听、授权克隆和声音母版登记。
- 粗剪：`scripts/post-kit.mjs` 生成顺序剪辑计划；只有 `--execute` 才调用本机 FFmpeg 写输出。

密钥只能来自环境变量或用户本地 secrets 文件，不得写进项目、日志或仓库。免费或来源未授权声音只能登记为 `evaluation-only`。

## 边界

本 skill 交付 `production.json`、状态报告、可审计任务、顺序粗剪计划和 QC/返工记录。跨模型素材生成、口型修复、声源分离、复杂多轨剪辑、调色和逐帧视觉检测不在范围内；使用外部工具时登记为独立制品。

用户只要求检查状态时保持只读，不擅自推进创作或调用外部服务。
