# AI 视频投产与 H3 模式合同

结构化导演包先于模型提示词。模型字段变化时，只改适配层，不改戏剧意图、调度、镜头时间和节拍账本。

## 1. 生产拆分

每个生成片段应做到：

- 单一、连续、可描述的时空与表演任务。
- 角色数量、遮挡、镜面、手部道具和大幅度运动在模型可控范围内。
- 参考图角色与提示词角色一一对应。
- 参考图若出现多手、持物手错误、身体支撑不成立或空间方向错误，立即取消其姿势/构图控制资格；改用人物身份、空环境和干净道具等语义资产参考，由逐镜提示词完成调度。
- 片段首尾构图能与前后片段剪接。
- 需要后期 TTS 时，保留说话节奏、口型表演和环境声空间，但不让模型再生成重复对白。

复杂动作应通过调度和剪辑拆解，不要在一个提示词中堆叠多个互相冲突的连续动作。

## 2. 声音路线与固定人物音色

`h3-native-reference`：固定角色默认路线。给 H3 人物参考图和已批准声音母版，把 `<Audio N>` 绑定到 `<Subject N> (Sx)`，由 H3 参考音色和表达生成新对白。后期不再叠同一句 TTS。

`tts-guided-h3`：先用角色声音生成准确台词音频，再作为 `reference_audio` 输入 H3。逐字和节奏必须固定时使用 `partially_copy` 或 `fully_copy`，不要误写成只参考音色的 `reference`。

`h3-native-free`：H3 自行生成声音，只用于临时样片、无固定身份的群声或用户明确接受声音漂移的角色。

`tts-post`：对白由后期生成。模型提示词不得使用 H3 的 `<d>` 对白块；用“人物开口说话、节奏克制”等表演描述，具体文本保留在 `sourceBeats` 与配音表中。环境声可按项目决定由模型或后期提供，并在 `audioPlan` 写清。

`silent`：不生成对白和叙事性声音。`dialogueRefs` 为空，或明确仅作字幕/后期文本。

## 3. H3 共同限制

投产时采用以下保守合同：

- 单次视频时长为 4–15 秒整数。
- Ref2VA：参考图 ≤ 9；参考视频 ≤ 3、每条 2–15 秒且总计 ≤ 15 秒；参考音频同样 ≤ 3、每条 2–15 秒且总计 ≤ 15 秒；所有参考文件合计 ≤ 12。
- 参考音频不能作为唯一媒体输入，必须同时有参考图或参考视频。
- Ref2VA 的 `reference_image` / `reference_video` / `reference_audio` 与 `first_frame` / `last_frame` 互斥。
- 官方 `h3-prompt-writing` 要求执行提示词章节使用英文；中文只保留在对白、歌词和画面内可见文字。上游剧本、导演意图和自由形式 brief 可以是中文，但必须在投产前转换并校验为官方英文三段式/六段式。不得仅因 CompShare 按 Unicode 字符计数就把正式结构整体改成中文。
- 参考图身份、场景和关键道具只通过已上传引用表达，不使用不存在的引用编号。
- 每个镜头的动作、摄影机和声音必须落在该镜头时间窗中，不能只在提示词任意位置出现。

官方接口或模型版本变化时，先核对最新文档并更新此合同。

## 4. `h3-ref2va`：多参考图到视频

用于 1–9 张主体/场景/道具参考图。`referenceMode` 为 `multi-reference`，不要伪装成首帧时间锚点。参考图用于身份和视觉参考，不保证某图在某个切点成为精确画面。

`modelPrompt` 的六段式模板、字段含义和参考标签统一读取官方 h3-prompt-writing/references/ref-en.txt。本层只负责把导演 shot 的 start、duration、blocking、camera 和 dialogueRefs 对应到官方输出；不维护第二套模板。

不要使用“Picture 2 在 4.2 秒固定为关键帧”这类无官方依据的强时间钉。若必须精确首尾画面，改用 I2VA/FL2VA 或后期剪接。

逐镜章节使用官方标记。第一镜无时间戳，后续切镜精确到三位毫秒：

```text
[Shot 1] ...
[Shot 2] At 00:03.500, the camera cuts to...
```

`Shot N` 顺序必须与 JSON `shots` 顺序一致，后续镜头时间戳必须与 `start` 逐字对账。原生对白的 `<d>` 块必须位于所属镜头标记之后、下一镜标记之前，验证器按镜头块核对，而不是只检查整条提示词是否出现过。

人物声音绑定示例：

```text
<Audio 1> is the voice-timbre reference for <Subject 1> (S1).
<Audio 1>: reference - the target speaker follows <Audio 1>'s voice
timbre and controlled delivery without copying the original signal.
```

相同人物跨片段复用同一个声音文件哈希。参考音色不等于保证独立生成任务百分之百同声，仍要检查年龄感、共鸣、音高、气息、语速、发音、响度和房间感。

## 5. `h3-i2va`：首帧到视频

`referenceMode` 为 `first-frame`，且只有一张 `role: first_frame` 的参考图。固定首行与三段式模板统一读取官方 h3-prompt-writing/references/base-en.txt。

首帧已确定的构图和身份不要在后续无理由漂移。镜头运动从首帧状态出发。

## 6. `h3-fl2va`：首尾帧到视频

`referenceMode` 为 `first-last-frame`，恰好两张参考图，分别为 `first_frame` 和 `last_frame`。同样使用三段提示词。动作路径必须能从首帧物理合理地到达尾帧，避免人物、道具或机位瞬移。

首帧/尾帧模式不能再附 `reference_audio`。若固定人物音色比精确尾帧更重要，改用 Ref2VA 并由剪辑控制尾画面；若精确画面锚定更重要，使用 `tts-post` 或接受 H3 自由音色。

## 7. 提示词生成顺序

1. 从 `sourceBeats` 提取不可改写的动作和台词事实。
2. 从 `blocking`、`composition`、`camera`、`focus` 合成每镜描述。
3. 按 `start` 与 `duration` 排列镜头时间窗。
4. 按声音路线写对白/环境/音乐；固定角色绑定声音母版，不混用同一句 H3 原声与后期 TTS。
5. 加入参考图保持项和可变化项。
6. 反向逐镜核对：每个时间窗都有对应描述，每句原生对白只出现一次，每个引用都真实存在。

每镜先从 `motionPlan` 合成画面内运动，再从 `camera` 合成摄影机运动。按 `setup → trigger → development → settle` 描述主运动，静止镜头也必须有可见状态变化；运动结束必须落到一个可剪状态。若只写摄影机 Push In，而没有人物、道具或环境的动作相位，不能判定为运动设计完成。

Context-IR 是官方推荐的上下文预处理能力，但本流程已经通过官方 `h3-prompt-writing` 生成结构化执行提示词。是否再开启服务端 Context-IR 必须在项目的运动复杂样片上验证；中文自由 brief + Context-IR、英文结构化 prompt + Context-IR、英文结构化 prompt 直出是不同实验条件，不能混在一次 A/B 中归因。

避免空词：`cinematic`、`epic`、`beautiful lighting`、`dynamic camera`。把它们换成可执行信息，例如“35mm 近身中景，冷色顶光压低眼窝；她举起草图时缓推至中近景，停在草图与眼睛同一垂直线上”。
