#!/usr/bin/env node
// novel-script 自测：不调模型、不花额度，只验确定性逻辑。
// 原则与仓库里其他 skill 一致：每道质量门都要有击穿用例——
// 证明它真的会拦，不是一个永远为真的假测试。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PARAMS,
  computeStats,
  gateReport,
  lineChars,
  paramsOf,
  renderHtml,
  renderMarkdown,
  sceneSeconds,
  seedFromOutline,
  slug,
  validateScript,
} from './novel-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, '../examples/渡口-script.json'), 'utf8'));
const OUTLINE = JSON.parse(readFileSync(join(here, '../../novel-outline/examples/渡口-outline.json'), 'utf8'));
const ART = JSON.parse(readFileSync(join(here, '../../novel-art/examples/渡口-art.json'), 'utf8'));
const CAST = JSON.parse(readFileSync(join(here, '../../novel-characters/examples/渡口-cast.json'), 'utf8'));
const CTX = { outline: OUTLINE, art: ART };

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
}
function eq(actual, expected, label) {
  assert.equal(actual, expected, `${label} — 期望 ${expected}，实际 ${actual}`);
  passed += 1;
}
const clone = (x) => structuredClone(x);
const gate = (doc, id, ctx = {}) => gateReport(doc, ctx).find((g) => g.id === id);

/* ---------------- 时长引擎 ---------------- */

eq(lineChars('你好，世界。'), 6, '标点算时间——停顿也是时间');
eq(lineChars('  你 好  '), 2, '空白不算字符');
eq(lineChars(''), 0, '空串为零');
eq(lineChars(null), 0, 'null 不崩');

const sc = {
  flow: [
    { action: '雾漫上来。' },
    { speaker: 'C01', line: '一二三四五六七八九' }, // 9 字 → 2 秒
    { action: '船离岸。' },
  ],
};
const sec = sceneSeconds(sc);
eq(sec.action, 5, '两个动作节拍 × 2.5 秒');
eq(sec.dialogue, 2, '9 字 ÷ 4.5 字每秒 = 2 秒');
eq(sec.total, 7, '总时长 = 台词 + 动作');
eq(sceneSeconds({ flow: [] }).total, 0, '空节拍流为零秒');

eq(paramsOf({}).charsPerSecond, DEFAULT_PARAMS.charsPerSecond, '默认参数生效');
eq(paramsOf({ params: { charsPerSecond: 6 } }).charsPerSecond, 6, 'params 可覆盖语速');
eq(paramsOf({ params: { charsPerSecond: 6 } }).tolerance, DEFAULT_PARAMS.tolerance, '只覆盖给出的键');
eq(sceneSeconds(sc, { ...DEFAULT_PARAMS, charsPerSecond: 9 }).dialogue, 1, '语速参数参与计算');

/* ---------------- computeStats ---------------- */

const stats = computeStats(FIXTURE);
eq(stats.totals.episodes, 6, '样例全六集');
eq(stats.totals.scenes, 9, '样例九场');
eq(stats.totals.lines, 123, '样例台词句数');
ok(stats.totals.estSeconds > 600 && stats.totals.estSeconds < 750, '预估总时长在目标带附近');
eq(stats.totals.targetSeconds, 720, '目标秒数汇总');
ok(stats.episodes.every((e) => e.est >= 102 && e.est <= 138), '每一集都落在 ±15% 容差带内');
ok(stats.episodes[0].dialogueSeconds > 0 && stats.episodes[0].actionSeconds > 0, '台词与动作分开计秒');
eq(stats.sceneTable.length, 9, '场次总表九行');
eq(stats.sceneTable[0].sceneId, 'S02', '场次总表按出场顺序');
ok(stats.sceneTable[0].lineCount > 0, '场次表带台词句数');
eq(stats.castLines.length, 6, '台词本六个说话人（含画外音，含第 6 集才开口的更夫）');
ok(stats.castLines[0].count >= stats.castLines[stats.castLines.length - 1].count, '台词本按句数降序');
const voEntry = stats.castLines.find((c) => c.id === 'VO');
ok(voEntry, '画外音单独成组');
eq(voEntry.lines[0].ep, 1, '台词条目带集号');
ok(voEntry.lines[0].sceneId === 'S01', '台词条目带场景');

/* ---------------- 质量门：全绿基线 ---------------- */

ok(gateReport(FIXTURE, CTX).every((g) => g.ok), '样例带上游全部门通过');
ok(gateReport(FIXTURE).every((g) => g.ok), '不带上游也全部通过（对账门跳过）');
eq(gateReport(FIXTURE).length, 10, '十道门');

/* ---------------- 质量门：逐门击穿 ---------------- */

// duration — 写超
{
  const doc = clone(FIXTURE);
  for (let i = 0; i < 30; i++) doc.episodes[0].scenes[0].flow.push({ action: `加戏第 ${i} 拍。` });
  const g = gate(doc, 'duration');
  ok(!g.ok, '写超时长被拦');
  ok(g.detail.includes('超'), '超时报得出秒数');
}
// duration — 写欠
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes = [doc.episodes[0].scenes[0]];
  const g = gate(doc, 'duration');
  ok(!g.ok, '写欠时长被拦');
  ok(g.detail.includes('欠'), '欠时报得出秒数');
}
// duration — 容差可配
{
  const doc = clone(FIXTURE);
  doc.params = { tolerance: 0.01 };
  ok(!gate(doc, 'duration').ok, '容差收紧到 1% 后原样例不再达标');
}
// line-length
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ speaker: 'C03', line: '这句台词故意写得非常非常长，长到一口气根本读不完，纯粹为了击穿单句上限这道门而存在。' });
  const g = gate(doc, 'line-length');
  ok(!g.ok, '超长台词被拦');
  ok(g.detail.includes('字'), '报出字数');
}
// speaker
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ speaker: 'C99', line: '我不在这场里。' });
  ok(!gate(doc, 'speaker').ok, '不在本场的说话人被拦');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ speaker: 'VO', line: '画外音不受本场人物限制。' });
  ok(gate(doc, 'speaker').ok, 'VO 合法');
}
// hook-cliff
{
  const doc = clone(FIXTURE);
  doc.episodes[0].hook = ' ';
  ok(!gate(doc, 'hook-cliff').ok, '空钩子被拦');
}
{
  const doc = clone(FIXTURE);
  delete doc.episodes[0].cliff;
  ok(!gate(doc, 'hook-cliff').ok, '缺结尾悬念被拦');
}
// hook-open — 钩子必须在全集前 3 拍内兑现（认领机制）
{
  const doc = clone(FIXTURE);
  delete doc.episodes[0].hookBeat;
  const g = gate(doc, 'hook-open');
  ok(!g.ok, '缺 hookBeat 被拦');
  ok(g.detail.includes('hookBeat'), '报出缺的字段');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].hookBeat = [2, 1]; // 第 2 场第 1 拍 = 全集第 14 拍
  const g = gate(doc, 'hook-open');
  ok(!g.ok, '钩子落在第 14 拍被拦——冷开场是门不是建议');
  ok(g.detail.includes('第 14 拍'), '报出实际位置');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].hookBeat = [9, 9];
  ok(gate(doc, 'hook-open').detail.includes('不存在'), '指向不存在的节拍被拦');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].hookBeat = [2, 1];
  doc.params = { hookWindow: 20 };
  ok(gate(doc, 'hook-open').ok, '钩子窗口可按需放宽');
}
// has-action
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow = doc.episodes[0].scenes[0].flow.filter((b) => typeof b.line === 'string');
  const g = gate(doc, 'has-action');
  ok(!g.ok, '纯对白的场（广播剧）被拦');
  ok(g.detail.includes('S02'), '点名到场');
}
// action-prose
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ action: '老周说「坐稳了」，随即撑篙。' });
  ok(!gate(doc, 'action-prose').ok, '动作里混台词引号被拦');
}
// beats-claimed
{
  const doc = clone(FIXTURE);
  doc.episodes[0].beatsClaimed = [];
  ok(!gate(doc, 'beats-claimed', CTX).ok, '大纲爽点没认领被拦');
  ok(gate(doc, 'beats-claimed').ok, '没给大纲时本门跳过');
  ok(gate(doc, 'beats-claimed').detail.includes('跳过'), '跳过要明说，不静默');
}
// refs-characters
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].characters.push('C99');
  ok(!gate(doc, 'refs-characters', CTX).ok, '大纲里没有的角色被拦');
  ok(gate(doc, 'refs-characters').ok, '没给大纲时本门跳过');
}
// refs-scenes：场景 / 光照 / 道具三个方向都要拦
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].sceneId = 'S99';
  ok(!gate(doc, 'refs-scenes', CTX).ok, '不存在的场景被拦');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].lighting = '正午烈日';
  const g = gate(doc, 'refs-scenes', CTX);
  ok(!g.ok, '没登记过的光照状态被拦');
  ok(g.detail.includes('正午烈日'), '光照违规点得出名');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].props.push('P99');
  ok(!gate(doc, 'refs-scenes', CTX).ok, '不存在的道具被拦');
  ok(gate(doc, 'refs-scenes').ok, '没给美术设定时本门跳过');
}

/* ---------------- validateScript 结构检查 ---------------- */

eq(validateScript(FIXTURE, CTX).length, 0, '样例零违规');
ok(validateScript(null).length > 0, 'null 不崩');
ok(validateScript({}).some((p) => p.includes('source')), '缺 source 报出来');
ok(validateScript({ source: 'x', episodes: [] }).some((p) => p.includes('episodes')), '空 episodes 报出来');
{
  const doc = clone(FIXTURE);
  doc.episodes.push(clone(doc.episodes[0]));
  ok(validateScript(doc).some((p) => p.includes('重复')), '重复集号报出来');
}
{
  const doc = clone(FIXTURE);
  delete doc.episodes[0].targetSeconds;
  ok(validateScript(doc).some((p) => p.includes('targetSeconds')), '缺目标秒数报出来');
}
{
  const doc = clone(FIXTURE);
  delete doc.episodes[0].beatsClaimed;
  ok(validateScript(doc).some((p) => p.includes('beatsClaimed')), '缺爽点认领字段报出来');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].sceneId = '船舱';
  ok(validateScript(doc).some((p) => p.includes('S01 这种格式')), 'sceneId 格式报出来');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow = [];
  ok(validateScript(doc).some((p) => p.includes('节拍流为空')), '空节拍流报出来');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ action: '动作', line: '台词', speaker: 'C01' });
  ok(validateScript(doc).some((p) => p.includes('二选一')), '节拍不许既是动作又是台词');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ delivery: '只有语气' });
  ok(validateScript(doc).some((p) => p.includes('二选一')), '两头都不是也拦');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ speaker: 'C03', line: '   ' });
  ok(validateScript(doc).some((p) => p.includes('空台词')), '空台词报出来');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ line: '没有说话人。' });
  ok(validateScript(doc).some((p) => p.includes('speaker')), '台词缺说话人报出来');
}
{
  const doc = clone(FIXTURE);
  doc.episodes[0].scenes[0].flow.push({ action: '  ' });
  ok(validateScript(doc).some((p) => p.includes('空动作')), '空动作节拍报出来');
}
ok(validateScript(clone(FIXTURE)).length === 0, '不带上游校验也通过');

/* ---------------- seed ---------------- */

const seeded = seedFromOutline(OUTLINE);
eq(seeded.source, '渡口', 'seed 带书名');
eq(seeded.episodes.length, 6, 'seed 全六集');
eq(seeded.episodes[0].targetSeconds, 120, '目标秒数 = 每集分钟 × 60');
eq(seeded.episodes[0].hook, OUTLINE.episodes[0].hook, '钩子从大纲搬');
eq(seeded.episodes[0].cliff, OUTLINE.episodes[0].suspense, '悬念从大纲搬');
eq(seeded.episodes[0].beatsClaimed.join(','), '悬念钩', '第 1 集预填悬念钩');
eq(seeded.episodes[2].beatsClaimed.join(','), '身份揭破', '第 3 集预填身份揭破');
eq(seeded.episodes[1].beatsClaimed.length, 0, '没有爽点的集为空数组');
eq(seeded.episodes[0].scenes.length, 0, 'scenes 留空给模型写戏');
ok(seeded.episodes[0].seedNote.includes('S01'), 'seedNote 带候选场景');
ok(seeded.episodes[0].seedNote.includes(OUTLINE.episodes[0].synopsis.slice(0, 10)), 'seedNote 带梗概');
eq(seedFromOutline(OUTLINE, [3, 5]).episodes.map((e) => e.ep).join(','), '3,4,5', '--eps 区间过滤');
eq(seedFromOutline(OUTLINE, [2, 2]).episodes.length, 1, '单集区间');
eq(seedFromOutline({}).episodes.length, 0, '空大纲不崩');
eq(seedFromOutline({ params: {} }).episodes.length, 0, '缺分钟数用默认值不崩');

/* ---------------- slug ---------------- */

eq(slug('渡口'), '渡口', '中文原样');
eq(slug('a b/c'), 'a-b-c', '空格斜杠转短横');
eq(slug('  '), 'script', '空名兜底');

/* ---------------- render markdown ---------------- */

const md = renderMarkdown(FIXTURE, CTX);
ok(md.includes('# 渡口 · 剧本（第 1–6 集）'), 'md 标题带集数区间');
ok(md.includes('第 1 场 · 渡口栈桥（浓雾清晨）'), 'md 场头显示场景名与光照');
ok(md.includes('**老周**'), 'md 说话人显示名字不是 ID');
ok(md.includes('**画外音**'), 'md 里 VO 显示成画外音');
ok(md.includes('场次总表'), 'md 带场次总表');
ok(md.includes('台词本'), 'md 带台词本');
ok(md.includes('第 1 场第 1 拍兑现'), 'md 钩子行带认领位置');
const mdBare = renderMarkdown(FIXTURE);
ok(mdBare.includes('**C03**'), '不给上游时退回裸 ID');
ok(mdBare.includes('S02'), '场景同样退回 ID');

/* ---------------- render html ---------------- */

const html = renderHtml(FIXTURE, CTX);
ok(html.includes('<!doctype html>'), 'html 完整文档');
ok(!/src="http|href="http|@import|url\(http/.test(html), '零外部资源');
ok(html.includes('时长仪表'), '01 时长仪表');
ok(html.includes('分集剧本'), '02 分集剧本');
ok(html.includes('场次总表'), '03 场次总表');
ok(html.includes('台词本'), '04 台词本');
ok(html.includes('质量门'), '05 质量门');
ok(html.includes('✓ 质量门 10 / 10'), '页眉徽章全绿');
ok(html.includes('class="band"'), '时长条带目标区间');
ok(html.includes('导出 JSON'), '导出按钮在');
ok(html.includes('id="script-data"'), '数据内嵌');
ok(html.includes('渡口-script.json'), '导出文件名');
ok(html.includes('data-copy'), '复制按钮在');
ok(html.includes('复制全部台词'), '台词本整组复制');
ok(html.includes('@media print'), '打印样式在');
ok(html.includes('prefers-reduced-motion'), '动效可关');
ok(html.includes('class="eps"'), '分集剧本一排两集网格');
ok(html.includes('class="scenes clip"'), '场次区默认最多 300px 截断');
ok(html.includes('展开全部场次'), '每集自带展开与收起按钮');
ok(html.includes('class="casts"'), '台词本一排两个网格');
ok(html.includes('max-height:186px'), '台词列表六行高，纵向滚动');
{
  const solo = renderHtml({ source: '渡口', episodes: [clone(FIXTURE.episodes[0])] }, CTX);
  ok(solo.includes('eps solo'), '单集单列，不留空半栏');
  ok(solo.includes('剧本（第 1 集）'), '单集标题不带区间');
}
ok(html.includes('老周'), 'html 里 ID 换成名字');
ok(html.includes('晨雾'), '光照 chips 在');
ok(html.includes('第 1 场第 1 拍兑现'), '钩子行带认领徽章');
ok(html.includes('act-line hooked'), '认领的节拍在正文里高亮');
ok(!html.includes('音色提示词'), '不给 --cast 就没有音色按钮——不猜');
{
  const withCast = renderHtml(FIXTURE, { ...CTX, cast: CAST });
  ok(withCast.includes('音色提示词'), '给了 --cast 台词本带音色提示词按钮');
  ok(withCast.includes('A young female voice'), '音色提示词是 cast 的 voice.prompt 原文');
}
ok(html.includes('lang="zh"'), '默认报告 html lang 是 zh');

/* ---------------- render — 英文界面 ---------------- */

{
  const en = renderHtml(FIXTURE, { ...CTX, lang: 'en' });
  ok(en.includes('lang="en"'), 'en 报告的 html lang 属性正确');
  ok(en.includes('Export JSON'), 'en 导出按钮标签');
  ok(en.includes('Quality gates 10 / 10'), 'en 页眉徽章全绿');
  ok(en.includes('Line book'), 'en 台词本标题');
  ok(en.includes('Duration gauge'), 'en 时长仪表标题');
  ok(!en.includes('导出 JSON'), 'en 报告不含中文导出标签');
  ok(!en.includes('质量门'), 'en 报告不含中文质量门标签');
  ok(!en.includes('台词本'), 'en 报告不含中文台词本标签');
}
{
  const mdEn = renderMarkdown(FIXTURE, { ...CTX, lang: 'en' });
  ok(mdEn.includes('## Episode 1'), 'en md 分集标题是英文');
  ok(mdEn.includes('## Line book'), 'en md 台词本标题是英文');
}
{
  const doc = clone(FIXTURE);
  doc.lang = 'en';
  ok(renderMarkdown(doc, CTX).includes('## Episode 1'), 'script.json 顶层 lang 字段生效');
  ok(renderMarkdown(doc, { ...CTX, lang: 'zh' }).includes('## 第 1 集'), '--lang 优先于 JSON 的 lang 字段');
}
{
  let threw = false;
  try { renderHtml(FIXTURE, { ...CTX, lang: 'fr' }); } catch { threw = true; }
  ok(threw, '非内置语言直接抛错，不静默回退');
}

// 病灶横幅
{
  const doc = clone(FIXTURE);
  doc.episodes[1].hook = ''; // 击穿 hook-cliff 门
  const h = renderHtml(doc, CTX);
  ok(h.includes('class="galert"'), '有门未过时页顶挂病灶横幅');
  ok(h.includes('gatepill fail'), '徽章翻红');
}

// XSS：模型数据全部过 esc
{
  const doc = clone(FIXTURE);
  doc.source = '<script>alert(1)</script>';
  doc.episodes[0].scenes[0].flow.push({ speaker: 'C03', line: '<img src=x onerror=alert(1)>' });
  const h = renderHtml(doc);
  ok(!h.includes('<script>alert(1)</script>'), '标题被转义');
  ok(!h.includes('<img src=x'), '台词被转义');
  ok(h.includes('\\u003c'), '内嵌 JSON 的 < 转成 \\u003c，防 </script 截断');
}

// 质量门面板是报告的一部分：英文界面下门标签也要翻译（阈值由门自己算，原样保留）
{
  const gateEn = renderHtml(FIXTURE, { ...CTX, lang: 'en' });
  ok(gateEn.includes('Episode duration within'), 'EN 报告的质量门标签翻译且阈值原样保留');
  ok(!gateEn.includes('每集时长在目标'), 'EN 报告不再出现中文门标签');
}
console.log(`✓ ${passed} 项自测全部通过`);
