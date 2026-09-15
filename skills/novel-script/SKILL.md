---
name: novel-script
description: 将分集大纲写成结构化场次、动作节拍和逐句台词，核对人物与美术引用、估算时长并交付剧本评审报告。用于写剧本、对白和场次修订；不分镜、不直接执行配音或视频生成。
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
  version: 1.2.0
  triggers:
  - novel-script
  - 剧本
  - 写剧本
  - 出剧本
  - 写台词
  - 场次
  - 写戏
  - screenplay
  - script
---

# novel-script

根据用户的创作目标写作、评审、润色或结构化剧本。先读输入；已有完整剧本默认保留主要事件、人物关系、主题和结局，只有用户授权重构时才改变这些内容。独立短片、连续短剧、长片片段可以有不同节奏与结尾形式。

## 输入与改动范围

- 已有剧本：按请求直接诊断、局部修改或整理；不要求先补一份大纲，不把附带的镜头、表演、声音意图丢掉。结构化时保留原文和定位，拍法可单独交接导演。
- 已有大纲：继承已接受的故事事实，补写场内行动与对白，不重复决定人物去留。
- 小说或想法：先确定本轮是改编方案、样场还是完整剧本；长篇改编需要方向选择时再使用 novel-outline，独立任务不强制安装它。

保留点和改动权限先从用户话语与既有约定确定。涉及未授权的删线、合人、变更结局或核心经历，先给具体位置、问题、改法或短样段及取舍，再请求决定。用户已授权的润色、结构化和自检直接完成；不要逐句请示。总控可用时遵循其 references/creative-agreement.md，独立使用也遵循本段。

## 写作与计时

模型负责人物、因果、潜台词和节奏，参考 references/script-pass.md。先完成适合用户审阅的剧本，再按需要结构化，避免边写边为字段凑戏。已有事实不重新编造，新增内容明确标为建议。

时长先作为预算；优先围读或临时音轨核实。对白、伴随动作、独立停顿和蒙太奇可能重叠，脚本的逐项相加不是剪辑时长。目标时长与内容冲突时，给保留内容延长、聚焦主线压缩等具体方案，不提高语速参数假装问题消失。

## 按需使用结构化工具

只做评审或文学修改时可交付 Markdown。进入制作、引用对账或用户需要报告时再交付 script.json；读 references/schema.md。{baseDir} 为本文件目录，Node 脚本零依赖。

```bash
node {baseDir}/scripts/novel-script.mjs seed <outline.json> --eps 1-3 > <workdir>/script.json
node {baseDir}/scripts/novel-script.mjs validate <script.json> --outline <outline.json> --art <art.json>
node {baseDir}/scripts/novel-script.mjs render <script.json> --md > <workdir>/script.md
node {baseDir}/scripts/novel-script.mjs render <script.json> --html > <workdir>/script-report.html
```

seed 仅适用于已有大纲；outline/art/cast 参数均按已有输入提供。未提供的引用对账属于跳过，不能称验证通过。角色 ID、场景 ID 和台词归属服务下游关联，不决定剧情。旁白需保留声音归属；当前 VO 模式将人物身份写入 delivery。

## 校验的两种级别

默认 `reviewPolicy: advisory`（省略时同样生效）：不运行台词长度、钩子/悬念、开场位置、动作表述和爽点等创作门；不是把旧要求换成警告继续催改。模型结合具体作品判断，不依赖固定清单。结构、说话人和已提供资产的引用错误仍会失败。

仅当项目已明确采用这些硬条件时使用 `reviewPolicy: strict`，它保留原版全部质量门。既有项目若依赖旧版拦截行为，迁移时显式设置 strict 并记录已有约定；不得为追求严格而替用户设置。批次大小按作品体量和审阅需要决定，1–3 集只是长剧的常用起点。

默认 `timingMode: off`，不使用每秒字数和每动作固定秒数，报告显示“时长待试读/剪辑核实”。没有音轨时可以给模型的暂定预算，但必须说明未验证，不能以此判定必须删词或延长。仅用户明确需要旧公式对照时设 `timingMode: legacy-estimate`。独立片可以省略 cliff，不虚构下一集悬念。技术通过不代表内容获批或实测时长通过。

## 交付与反馈

给当前版本、原文定位、关键差异、推荐理由和未解决问题；创作取舍保留用户决定。已有报告可主动打开并给绝对路径，说明看哪里、如何反馈；短稿直接在对话中展示即可。批准针对具体版本与范围，部分接受不等于全稿通过，下载 HTML/JSON 不算批准。只重新审阅实际改变的内容及受影响的依赖。

剧情确认后交导演与分镜适配生成限制，不在编剧层以模型单段时长删除叙事。单独要求剧本时，不自动出图、配音或调用付费生成。

修改工具后运行 `node {baseDir}/scripts/selftest.mjs` 与 `node {baseDir}/scripts/creative-policy-test.mjs`。自测验证程序行为，不验证文学质量。


涉及尚未授权的创作取舍时，给用户 2–3 个有具体差异的选项，说明收益、损失与推荐，允许保留原稿或自定义。模型先完成阅读、诊断和短样段，不把准备工作推给用户；已经明确授权的范围直接执行。未经用户选择，不把暂定片长预算升级成删词、删情绪段落的理由。
