# 安装后的第一次运行

在本仓库根目录执行，以下命令均不联网、不生成视频、不产生 API 费用：

```bash
node scripts/doctor.mjs
node scripts/offline-demo.mjs
```

示例打印新建目录，默认位于 `runs/`。查看 `before-change.md` 与 `production-report.md`：大纲文件变化后从 approved 变成 review，依赖它的剧本变成 stale。`production.json` 中没有视频任务。示例使用简化的手工制品，只演示总控合同，不宣称通过专业剧本质量门；演示审批标记为 offline-demo，不代表用户真实审批。

可指定一个不存在的输出目录：`node scripts/offline-demo.mjs --out runs/my-first-demo`。目录已存在时会拒绝覆盖。核心只需要 Node.js 18+。

## 依赖如何准备

| 使用场景 | 所需组件 |
| --- | --- |
| 状态管理、离线示例 | Node.js 18+；无需密钥 |
| CompShare 客户端 | Python 3.10+ |
| 顺序粗剪 | FFmpeg 与 ffprobe，均应在 PATH 中 |
| 正式 H3 提示词 | 官方 h3-prompt-writing skill |
| 大纲、角色、美术、剧本、导演、分镜创作 | 对应专业 skill，或按合同接入 manual 制品 |

检查器在用户 skills 目录、当前目录及祖先目录的 `.agents/skills` 和本 skill 的同级目录查找专业 skill。也可传 `--skills-dir <目录>`；`--json` 输出机器可读结果。检测到文件只说明已安装，不代表版本或行为兼容。

本仓库地址：https://github.com/suihe1/short-drama-production 。推荐搭配的专业 skills 没有随本仓库分发；目前没有在本仓库中验证过的一键安装源或固定版本锁定清单。请从各 skill 的原始发布方获取，安装后再运行检查器。不得把本机私有路径当作公共下载地址，也不要把不明来源的同名 skill 视为官方版本。官方 h3-prompt-writing 缺失时停在技术分镜准备阶段。

Python、FFmpeg 缺失不会阻止离线总控示例。检查器只检查程序版本和文件，不检查余额、密钥有效性或在线 API 是否可用。
