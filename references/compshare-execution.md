# CompShare H3 执行合同

仅在项目明确选择 CompShare 作为 H3 提供方时使用。目标模型仍是 MiniMax-H3，但端点、密钥和任务客户端均不同于 MiniMax 官方 API。

## 密钥与客户端

- 密钥按顺序读取 `COMPSHARE_H3_API_KEY`、`COMPSHARE_H3_KEY_FILE`、`~/.codex/secrets/compshare-h3.key`。
- 不读取或要求 `MINIMAX_API_KEY`；不得把任何密钥写入项目 JSON、日志、报告或聊天。
- 执行客户端使用内置 `scripts/compshare-h3.py`，接口为 `https://cp.compshare.cn/minimax/v2/video_generation`。`job-export-compshare` 只支持参考图任务；含参考音频或参考视频的任务改用 MiniMax 官方适配器，不能静默丢弃媒体。

## 从投产包建立任务

```bash
node scripts/production-kit.mjs jobs-sync-package <production.json> \
  --manifest <storyboard/h3-package/manifest.json> \
  --segments E01-16 --provider compshare \
  --depends storyboard,frames-pilot-e01-16 --duration-policy nearest

node scripts/production-kit.mjs job-approve <production.json> \
  --id H3CS-E01-16 --by user --note <本次费用与输入已确认>

node scripts/production-kit.mjs job-export-compshare <production.json> \
  --id H3CS-E01-16 --out <storyboard/h3-package/jobs/E01-16.compshare.json>
```

只允许显式指定片段；参考图缺失即失败。默认一次只建一个样片任务。分镜总时长若为小数，量化为 4–30 秒整数，并在总控与 CompShare job 中保留原时长和调整量。导出必须放在 `job-approve` 之后；客户端会检查导出文件内的 `sourceStatus=approved` 与 `costApproved=true`，旧文件需要重新导出。

2026-09-07 核对 [CompShare H3 API 文档](https://www.compshare.cn/docs/modelverse/models/video_api/minimax-h3-video-api)：输出 `duration` 为 4–30 秒；旧工作台指南的 15 秒不是当前 API 上限。30 秒是上限，不是默认时长，不自动拼接或拉长旧镜头。大于 15 秒的 CompShare 提示词沿用官方六段式结构，但按真实总时长重新计时；本机官方提示词 skill 的旧 15 秒范围在此提供方场景下由已核实的 API 能力覆盖。外部 novel-storyboard 若仍限制 15 秒，需升级其导出器或人工提供已审查包，不假定它已同步升级。

## 无费用预检

CompShare 对 H3 实际提交的组合文本（提示词 + `promptSuffix`）限制为 5000 个 Unicode 字符，低于 MiniMax 官方端点的 7000 字符。预检、审批与提交必须核对组合文本，不得只统计主提示词。

需要启用服务端提示词优化时，在总控 job 中设置 `"useContextIr": true`；导出的 CompShare job 保留该字段，执行客户端在请求顶层发送 `"use_context_ir": true`。省略时默认为 `false`。对比测试必须使用新的 job ID 和输出路径，不得覆盖原成片。

MiniMax 官方把 Context-IR 视为完整 H3 工作流的重要模块并建议纳入流水线；本项目同时使用官方 `h3-prompt-writing` 生成结构化执行提示词，因此采用项目级策略，而非一律开或一律关：`off`、`pilot`、`selective`、`on`。新项目默认 `pilot`；运动复杂样片获益后，可对相似片段设为 `selective`。精确文字、复杂手部、严格轴线或跨镜同物连续性仍需逐段判断。

正式 Ref2VA 执行提示词保持官方英文六段式。中文可以作为上游 brief、对白和可见文字；“中文自由 brief + Context-IR”是合法实验，但不是默认投产格式。若测试语言，只允许改变 `promptLanguage`，不得同时换参考图、重写镜头或改变时长。

每次 A/B 在 job 的 `experiment.changedVariables` 登记实际变化。若超过一项，只能说某个整体方案胜出，不能把结果单独归因给 Context-IR、语言或参考数量。任务完成后将 state 的返回 prompt 与源 prompt 逐字比较；若完全相同，只代表接口回显输入，不能据此声称拿到了内部优化文本，必须以视频 A/B 为判断依据。

```bash
python scripts/compshare-h3.py preflight --job <job.json>
python scripts/compshare-h3.py submit --job <job.json> --dry-run
```

预检必须确认：画幅、分辨率、整数时长、参考图数量与哈希、提示词、输出路径。`dry-run` 会遮盖媒体地址，不产生外部任务。

## 付费边界

真实 `submit` 前必须同时满足：当前制品已批准、总控 job 已获得成本授权、用户当次明确同意提交该 job ID，并在命令中写 `--confirm-submit <sourceJobId>`。提交成功后只查询原任务；失败不自动重试或批量扩展。取消任务同样要求 `--confirm-cancel <task-id>`。
