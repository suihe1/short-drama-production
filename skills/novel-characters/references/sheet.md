# 角色设定图出图 · codex `$imagegen`

出图走 codex 内置的 `$imagegen` 系统 skill。**这条路不需要任何 API key**——用的是本机 codex 登录态（订阅额度）。

**没有 codex 就跳过整个第 8 步**，只交提示词，其余产出照常。这是可选能力，不是硬依赖。

## 每个角色一张图

一张横构图，内部左右分栏：

```
┌──────────┬────────────────────────────┐
│          │   正视    侧视    背视       │
│  半身像   │                            │
│ （证件照） ├────────────────────────────┤
│  面部基准  │  细节 · 细节 · 细节 · 细节   │
│   ~34%   │                            │
└──────────┴────────────────────────────┘
                    16:9
```

提示词字段 `image.sheet`，落到 `./images/<slug>-sheet.png`。

左栏的半身像是**面部设计的基准**，右栏三视图的脸照着它画。提示词里要明确要求两边一致，否则一张图里会出现两个长相。

---

## 情况 A：本 skill 正跑在 codex 里

直接用 `$imagegen`，**不要再 shell 出去调 `codex exec`**——那是自己套自己。

把 `image.sheet` 的内容作为图像规格交给 `$imagegen`，生成后把选定的 PNG 复制到 `<输出目录>/images/<slug>-sheet.png`。

## 情况 B：跑在 Claude Code 或其他环境里

shell 调用本机 codex。

### 先找对 binary ⚠️

机器上可能装了多个 codex，**版本不够新的会直接报错**「requires a newer version of Codex」。取版本最高的那个：

```bash
find_codex() {
  local best="" best_n=0 c v n
  # command -v 放第一个：尊重用户的 PATH；后面几个是常见安装位置兜底
  for c in "$(command -v codex 2>/dev/null)" \
           "$HOME/.npm-global/bin/codex" \
           "$HOME/.local/bin/codex" \
           "$(npm prefix -g 2>/dev/null)/bin/codex" \
           /opt/homebrew/bin/codex \
           /usr/local/bin/codex; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    v=$("$c" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    [ -n "$v" ] || continue
    n=$(echo "$v" | awk -F. '{printf "%d%03d%03d", $1, $2, $3}')
    [ "$n" -gt "$best_n" ] && { best_n=$n; best=$c; }
  done
  [ -n "$best" ] && echo "$best"
}
CODEX=$(find_codex)
```

`$CODEX` 为空就跳过出图。

### 调用

**一个角色一次调用，绝不批量。** built-in 通路会把 PNG 字节写进 rollout，批量会把上下文撑爆——这是官方 `hatch-pet` skill 踩出来的经验。

```bash
cd <输出目录> && mkdir -p images
env -u NODE_OPTIONS "$CODEX" exec --skip-git-repo-check --sandbox workspace-write \
  'Use $imagegen to generate this character model sheet, then copy the final selected PNG to ./images/<slug>-sheet.png in the current working directory. Reply with only the file path — no base64, no markdown image preview.

<image.sheet 的内容>' < /dev/null
```

想让一批角色画风统一，就拿第一个角色出好的图当参考图喂给后面几个——**用 `-i` 时 prompt 必须走 stdin**，见下面「变长参数」。

三个参数都是必需的，缺一个就挂：

| 参数 | 为什么 |
| --- | --- |
| `--skip-git-repo-check` | 输出目录不是 git 仓库时，codex 会拒绝运行 |
| `--sandbox workspace-write` | 不给就没法往 cwd 写文件 |
| `< /dev/null` | 不关 stdin，codex 会一直等输入 |

---

## 画风一致性 ⚠️ 已知短板

同一批角色各自独立出图，**画风可能有差异**。早期用「扁平矢量卡通」时漂得很厉害——同一批出成动画感／半写实／水墨写实三种，摆在一起不像同一部片子。换成明确的风格预设（见 `style-presets.md`）后好了很多，但不能保证完全一致。

想压住的话，把**第一个角色的成图当风格参考**喂给后面几个（codex 的 `-i/--image` 就是干这个的）：

**用 `-i` 时 prompt 必须走 stdin**（见下面「变长参数」）：

```bash
printf '%s' "$PROMPT
Match the art style, line weight, shading and colour treatment of the reference
image exactly — these characters must belong to the same production." \
| "$CODEX" exec --skip-git-repo-check --sandbox workspace-write \
    -i ./images/<第一个角色>-sheet.png
```

代价是第一张的画风就定了全片基调，出得不好就得重来。用户在意统一性就上参考图，只是要几张草图就不必。

## ⚠️ 先清掉 NODE_OPTIONS

codex 自己也是个 Node CLI，**会继承父进程的 `NODE_OPTIONS`**。如果调用方环境里设了 `--require` 之类的预加载，而那个文件不在了（临时目录被清理是常见情况），codex 会在启动阶段就崩掉，报的是 `Cannot find module .../restore-node-options.cjs`，跟出图毫无关系，很难联想。

所有 codex 调用都套一层 `env -u NODE_OPTIONS`：

```bash
env -u NODE_OPTIONS "$CODEX" exec --skip-git-repo-check --sandbox workspace-write ...
```

## ⚠️ 变长参数会吞掉 prompt

`--disallowed-tools <tools...>` 和 `-i/--image <FILE>...` 都是变长的，**后面跟的位置参数会被它们当成自己的值吃掉**，报错是莫名其妙的 `No prompt provided via stdin`。

两条规矩：

- 只要用了任何变长参数，**prompt 一律用 `printf '%s' "$P" | codex exec ...` 走 stdin**
- 不用变长参数时才可以把 prompt 当位置参数传，并且要 `< /dev/null` 关掉 stdin

## 背景：白底

设定图一律**纯白背景**。理由有三个：抠图干净、印出来是设定表该有的样子、在深色报告里也能读。

### 分区光照

设定表要平光（抠图、量比例），写实要方向光（体积感）。两者矛盾，所以**分区解决**：左栏半身像给柔和方向主光 + 环境遮蔽，右侧三视图和细节条保持平光正交。提示词里是两句独立的 `LIGHTING IN THE LEFT ZONE ONLY` / `LIGHTING IN THE RIGHT ZONES`，不要合并成一句全局光照。

### 比例 ⚠️

这个版面最容易崩的就是比例——模型为了把细节条塞进去，会把三个全身像压扁或拉长。提示词里已经写死了 `PROPORTIONS ARE CRITICAL`、`no stretching, squashing or foreshortening`、`the detail studies give way, not the figures`。**拿到图先量一眼三个全身像是不是等高、头身比正不正常。**

### 左栏的收口 ⚠️

模型默认会把半身像的两侧肩膀裁掉、底边做成圆角或渐隐晕影，看着很别扭。提示词里必须显式禁掉：肩膀完整、两侧留空、底边齐平直切。这条不写就一定会出问题。

### 面部一致性 ⚠️

一张图里出现两个长相是这个版面最容易出的问题——左栏画一个人、右栏画另一个人。提示词里必须写死 `must match the bust portrait exactly — same features, same hairstyle, same expression`。拿到图先扫一眼两边是不是同一个人，不是就重生成。`image.sheet` 的提示词里已经写死了 `plain pure white background`，不要改成灰底或场景背景。

### 想要真透明背景

`$imagegen` 的 built-in 通路（`gpt-image-2`）**不支持** `background=transparent`。官方给的路子是：提示词里要一块平整的 chroma-key 底色，生成后用本地脚本抠掉：

```bash
python3 "$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py" <in.png> <out.png>
```

真·原生透明只有 CLI fallback 的 `gpt-image-1.5 --background transparent` 能做，**那条路要 `OPENAI_API_KEY`**，本 skill 不走。用户明确要透明就告诉他这个取舍，别自己决定。

## 必须显式指定目标路径

`$imagegen` 默认把图落在 `$CODEX_HOME/generated_images/<session>/`。官方规则明确要求：**项目资产不能只留在默认路径**。所以提示词里一定要写「copy to ./images/xxx.png」，让 codex 自己搬过来。

## 其他约束

- worker **只回文件路径**，不要 base64、不要 markdown 图片预览
- **不要逐张打开** 生成的 PNG 看——只看最终 report.html
- **不碰 CLI fallback**（`scripts/image_gen.py`，要 `OPENAI_API_KEY`）。built-in 不可用就如实报告，不要静默降级
- 出图失败**不阻断**整个流程：跳过这个角色，最后汇总说明哪些没出成

## 文件名

用 `node scripts/novel-characters.mjs slug "<角色名>"` 生成安全文件名（中文会保留）。`render` 会自动去 `images/<slug>-sheet.png` 找图，找到就嵌进 report.html——所以**先出图，再 render**。
