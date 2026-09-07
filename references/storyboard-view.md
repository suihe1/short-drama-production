# 可视化审阅与多格图片故事板

本地 HTML 审阅页，读取现有分镜和生产状态快照，不访问生成 API。

```bash
node scripts/storyboard-view.mjs examples/offline/storyboard.json --out runs/storyboard-demo.html
node scripts/storyboard-view.mjs <storyboard.json> --production <production.json> --out <new-report.html>
node scripts/storyboard-view.mjs <storyboard.json> --segment E01-01 --out <new-segment-report.html>
node scripts/storyboard-view-test.mjs
```

输出路径必须不存在，避免覆盖已写笔记的报告。打开 HTML 后可按集数、场景、段号或动作筛选，点击时间带定位镜头，按时长顺序预览，切换同段不同任务版本，导出 JSON 返工笔记。笔记只在本页内存中，关闭前需导出；尚不支持导入笔记或回写审批。

输入兼容桥接器和标准分镜的 `episodes[].segments[].cuts[]`，时长读取 `seconds`。规划图优先取 `cut.planningImage`，否则查找分镜 JSON 同目录的 `<segment.id>/f<切序>.png`；缺图显示占位，不生成素材。规划图不自动加入模型参考。

生产任务按 episode 与 segment.id/sourceClipId 匹配；显示所有版本，不自动挑选胜出视频。实际参考来自任务 references，尚无任务时展示分镜计划参考。视频展示完整生成段；节奏预览只按规划时长切换卡片，不代表最终剪辑效果。

## 多格图片导出

页面顶部选择片段和列数，可预览并导出以下文件：

- 审阅版 PNG：每格画面、镜号、段内起止时间、景别、动作、运镜说明；缺图以占位标出，不掩盖缺口。
- 模型参考版 PNG：按从左到右、从上到下排列的干净画面，无新增标题、镜号、说明文字；保留窄分隔带。只在所有图片能解码且用户勾选验收后导出。源图若已有文字，导出器不会擦除，需在验收时处理。
- 单格 PNG：选择镜头，输出该图原始分辨率与比例；不裁切构图。
- 参考映射 JSON：记录片段、各格对应镜头、起止时间与像素区域；非完整 H3 提示词，不自动更改提交包。

若图与镜头内容不符，可用“替换选中单格”加载本机 PNG/JPEG/WebP，只更新当前页面的导出素材，不覆盖项目源图。替换后需重新检查；关闭前请导出 PNG。变化后的源文件需要在项目中单独登记并重新审批。

默认每格宽 640 像素，格内画幅遵循项目比例，以留边方式完整放入源图，不拉伸或裁掉手部；1–4 列可选，自动布局根据格数选择。每段最多 24 格，超过需拆分；奇数格最后一行留空区域没有镜头含义，映射只列实际格子。不固定九宫格，也不会因 CompShare 支持 30 秒而自动拉长分镜。

## 用于 H3

官方 Ref2VA 指南允许把图片定义为 storyboard/shot-planning reference。审核后可把模型参考版作为一张 Picture，明确各格对应哪些 Shot、提供视点/主体位置/镜头顺序。沿用官方六段式，并按映射写切点时刻；要求输出逐镜全屏画面，不输出拼贴、格线或说明。整张多格图不是 I2VA 首帧；也不意味着能强制模型准确执行每一格。人物/场景身份需要时仍由独立参考资产提供。

先对照各格检查剧情内容、姿态、手别、轴线和信息可读性；导出成功不等于审美或视频效果通过。坏图不能靠“禁止多手”等提示词修复。当前功能是将已有单格图排成故事板，不自动绘制缺失镜头。

## 本地与体积

用于 PNG 导出的规划图会以内嵌像素保存在 HTML，避免 file:// 跨源画布无法下载；支持 PNG/JPEG/WebP，单张上限 30 MB，总源图上限 96 MB，较大项目使用 `--segment` 局部生成。图片内嵌只进入生成报告，不进入 skill 指令或模型上下文。视频与任务参考仍使用本机文件路径，跨电脑分享需要复制媒体后重新生成。远程 URL 不自动加载，无外部字体、CDN 或服务依赖。

浏览器回归测试（仅开发时需要 Playwright）：`node scripts/sheet-export-browser-test.mjs`。覆盖真实 PNG 下载、像素顺序、尺寸、缺图拦截、本地替换、映射和窄屏布局。日常导出只需 Node.js 和浏览器，不需要安装 Playwright，也不访问生成 API。
