# script.json 数据合同

用于制作关联与报告，不是写戏模板。默认 reviewPolicy 为 advisory，创作公式与类型门不运行，也不以告警催促改写。timingMode 默认 off，时长统计为 null，报告显示未计时；null 不代表零秒。

## 文档和集

```json
{
  "source": "片名",
  "reviewPolicy": "advisory",
  "timingMode": "off",
  "episodes": [{
    "ep": 1,
    "targetSeconds": 100,
    "beatsClaimed": [],
    "scenes": [{
      "sceneId": "S01",
      "characters": ["C01"],
      "flow": [{"speaker": "C01", "line": "我记得。", "delivery": "没有抬头"}]
    }]
  }]
}
```

targetSeconds 是本轮约定的目标，不是实测结果；尚未确定目标时先以 Markdown 讨论，不为生成 JSON 猜一个数。ep 为唯一正整数。beatsClaimed 保留用于已给大纲的关联，无相关内容时为空数组。

hook、cliff、hookBeat 为可选的旧版叙事标注，默认不检查。独立片可省略，不为填字段制造悬念。结尾如何成立由创作判断和用户反馈决定。

## 场次与条目

- sceneId：S01 形式的稳定编号；提供 art.json 时需对应已登记场景。
- characters：本场人物 ID 数组；空镜可为空。
- lighting/props：可选；提供美术数据时核对状态及道具 ID。
- flow：有序内容条目。每条使用 action 或 line 二选一；这是数据区分，不要求动作与对白机械交替，也不意味着逐条顺序计时。
- action：可见行为、反应或画面内容。屏幕文字和引号不自动判为错误，真正供配音的对白应单独保存。
- speaker/line：人物 ID 和原台词。保留语言、长短和发言完整性；没有通用 35 字上限。
- delivery：可选的表演及伴随动作说明。
- VO：现有工具的画外音标记，声音所属人物需在 delivery 中注明，避免丢失身份。

结构化转换保留原稿与段落定位；原稿中的镜头意图可另附导演交接，不静默删除。人物编号用于关联，不强制重写大纲。

## 仅供明确要求的旧版比较

reviewPolicy: strict 恢复旧版创作门，只有用户明确要求整套旧标准时使用。timingMode: legacy-estimate 单独开启旧估时，两者互不隐含开启。

旧公式使用非空白字符数/params.charsPerSecond，加动作条目数×params.actionSeconds；标点计入且无法表达重叠，结果仅供对照。默认预设保留在代码中以便旧项目兼容，不是自然语速或生成能力声明。不得自动开启、通过修改参数凑时长，或据此删改剧情。实测应附试读音轨或剪辑计时依据，不把填入目标数当作测量。
