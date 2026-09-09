# CompShare MiniMax H3 API

仅在用户明确要求调用 API 生成视频时读取本页。分镜、导出提示词和生成分镜图本身不需要 API。

## 能力与边界

- 接口：`https://cp.compshare.cn/minimax/v2/video_generation`
- 模型：`MiniMax-H3`
- 单段：4–15 秒
- 画幅：`adaptive`、`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`
- 分辨率：`768P` 或 `2K`，以用户选择和平台当时支持为准
- 支持最多 9 张参考图；`reference_image` 不与 `first_frame`/`last_frame` 模式混用
- MiniMax H3 官方端点允许最多 7000 字符，但 CompShare 网关对实际提交的组合文本（提示词 + `promptSuffix`）限制为 5000 个 Unicode 字符；客户端必须按更严格的 5000 字符预检
- 提交会上传提示词与参考素材，并可能立即产生费用。没有当次明确授权不得提交或重试。

## 密钥

脚本按顺序读取：

1. 环境变量 `COMPSHARE_H3_API_KEY`
2. `COMPSHARE_H3_KEY_FILE` 指向的本地文件
3. `~/.codex/secrets/compshare-h3.key`

密钥不得出现在 job JSON、命令输出、聊天回复、截图或版本库中。

首次配置可在交互式 PowerShell 运行：

```powershell
& {baseDir}/scripts/save-h3-key.ps1
```

脚本使用隐藏输入并写入全局用户配置，换题材或换项目目录后仍可复用。

## Job JSON

路径相对于 job 文件所在目录解析：

```json
{
  "segment": "E01-01",
  "promptFile": "../E01-01/prompt.md",
  "promptSuffix": "Optional output constraints.",
  "resolution": "768P",
  "ratio": "9:16",
  "duration": 12,
  "useContextIr": true,
  "minimumReferences": 4,
  "referenceImages": [
    {"role": "reference_image", "path": "../E01-01/f1.jpg"},
    {"role": "reference_image", "path": "../E01-01/f2.jpg"},
    {"role": "reference_image", "path": "../E01-01/f3.jpg"},
    {"role": "reference_image", "path": "../E01-01/f4.jpg"}
  ],
  "aigcWatermark": false,
  "output": "../output/E01-01.mp4"
}
```

`useContextIr` 必须是布尔值。设为 `true` 时，客户端在 CompShare 请求顶层发送 `"use_context_ir": true`，由服务端先执行 Context-IR 提示词优化再进入视频生成；省略时默认 `false`。它不属于提示词正文，也不计入 5000 字符组合文本。

预检会同时输出主提示词、后缀、剩余额度与 Ref2VA 六段字符占用；六个字段缺失、顺序错误或重复出现会在付费提交前失败。`useContextIr=true` 时保存 state 中的返回 prompt 并与提交文本做逐字比较。若两者完全相同，只能判定接口回显了输入，不能声称拿到了 Context-IR 的内部改写；此时以同参数、独立 job 的视频 A/B 为判断依据。

优先使用 `path`。脚本会读取 JPG/PNG/WebP，计算 SHA-256、拒绝重复图片，再作为 Data URL 内嵌到请求；这样不依赖临时图床。

也可把单项 `path` 换成公网 `url`，但必须是真正的图片直链。多个 URL 的末级文件名必须不同，禁止四个链接都以 `/download` 结尾。

干净画面可使用：

```text
STRICT VISUAL OUTPUT CONSTRAINT: Spoken dialogue is audio only. Do not render dialogue as text. No subtitles, captions, burned-in text, title cards, logos, interface text, or watermarks anywhere in the video.
```

这只是生成约束，不能代替成片检查。

## 命令

`{baseDir}` 为 skill 目录，`<job.json>` 为本次项目中的 job：

```bash
python {baseDir}/scripts/h3-api.py preflight --job <job.json>
python {baseDir}/scripts/h3-api.py submit --job <job.json> --dry-run
python {baseDir}/scripts/h3-api.py submit --job <job.json>
python {baseDir}/scripts/h3-api.py status --task-id <task-id>
python {baseDir}/scripts/h3-api.py wait --state <state.json> --poll 10 --timeout 3600
python {baseDir}/scripts/h3-api.py cancel --task-id <task-id>
```

`submit` 成功后会写一个不含密钥和 Data URL 的 state JSON。`wait` 只在 `succeeded` 时下载成片；`failed` 或 `cancelled` 立即停止。

## 投产顺序

1. 从 export 的一个段复制 `prompt.md` 和按 Picture 顺序排列的关键帧路径，建立 job。
2. 运行 `preflight`；确认参考图数量、哈希不重复、`ratio`、`resolution`、`duration`、输出路径。
3. 运行 `submit --dry-run`；确认 payload 结构，图片地址会被安全遮盖。
4. 获得用户对本次付费提交的明确授权后，仅提交这一段。
5. `wait` 到终态并下载。
6. 核对时长、实际像素尺寸、画幅、人物/场景一致性、镜头切点、音画、字幕/水印。
7. 用户看过测试片并明确同意后，才为更多段建立 job 并批量提交。

平台 UI 显示异常时，不要继续排队。先比较本地 SHA-256、远端下载 SHA-256、请求中的引用顺序和后台缩略图；未确认根因前停止付费任务。
