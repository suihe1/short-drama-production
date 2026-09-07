# 可视化故事板

本地 HTML 审阅页，读取现有分镜和生产状态快照，不访问生成 API。

```bash
node scripts/storyboard-view.mjs examples/offline/storyboard.json --out runs/storyboard-demo.html
node scripts/storyboard-view.mjs <storyboard.json> --production <production.json> --out <new-report.html>
node scripts/storyboard-view-test.mjs
```

输出路径必须不存在，避免覆盖已写笔记的报告。打开 HTML 后可按集数、场景、段号或动作筛选，点击时间带定位镜头，按时长顺序预览，切换同段不同任务版本，导出 JSON 返工笔记。笔记只在本页内存中，关闭前需导出；尚不支持导入笔记或回写审批。

输入兼容桥接器和标准分镜的 `episodes[].segments[].cuts[]`，时长读取 `seconds`。规划图优先取 `cut.planningImage`，否则查找分镜 JSON 同目录的 `<segment.id>/f<切序>.png`；缺图显示占位，不生成素材。规划图不自动加入模型参考。

生产任务按 episode 与 segment.id/sourceClipId 匹配；显示所有版本，不自动挑选胜出视频。实际参考来自任务 references，尚无任务时展示分镜计划参考。视频展示完整生成段；节奏预览只按规划时长切换卡片，不代表最终剪辑效果。

仅加载现存本地媒体；远程 URL 不自动加载。报告使用本机绝对媒体路径，跨电脑分享需要复制媒体后重新生成；生成后项目变化也需要重新导出报告。无外部字体、CDN 或服务依赖。图片与视频仍需人工验收，页面不会自动判断多手或越轴。
