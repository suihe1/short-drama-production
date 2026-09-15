import assert from 'node:assert/strict';
import { gateReport, validateScript, renderHtml, seedFromOutline } from './novel-script.mjs';

// Synthetic standalone screenplay: a long speech, a quiet opening and a closed ending.
// No user's private screenplay is included in this regression fixture.
const doc = { source: '独立短片测试', episodes: [{ ep: 1, targetSeconds: 15, cliff: '', beatsClaimed: [], scenes: [{ sceneId: 'S01', characters: ['C01'], flow: [{ speaker: 'C01', line: '这段话需要保留完整的意思。'.repeat(8) }] }] }] };
const before = JSON.stringify(doc);
assert.deepEqual(validateScript(doc), []);
const gates = gateReport(doc);
assert.ok(!gates.some(g => ['duration', 'line-length', 'hook-cliff'].includes(g.id)), '创作门默认不运行');
assert.ok(renderHtml(doc).includes('时长待试读/剪辑核实'));
assert.ok(renderHtml(doc, { lang: 'en' }).includes('Runtime unmeasured'));
assert.equal(JSON.stringify(doc), before, 'validation and rendering must not rewrite content');
assert.ok(validateScript({ ...doc, reviewPolicy: 'strict', timingMode: 'legacy-estimate' }).length >= 4);
assert.ok(validateScript({ ...doc, reviewPolicy: 'strcit' }).some(p => p.includes('reviewPolicy')));
assert.ok(validateScript({ ...doc, params: { charsPerSecond: 0 } }).length);
const invalidSpeaker = structuredClone(doc);
invalidSpeaker.episodes[0].scenes[0].flow[0].speaker = 'C99';
assert.ok(validateScript(invalidSpeaker).some(p => p.includes('说话人')));
assert.ok(validateScript(doc, { outline: { characters: [] } }).some(p => p.includes('角色引用')));
assert.ok(validateScript(doc, { art: { scenes: [] } }).some(p => p.includes('场景')));
const emptyLine = structuredClone(doc);
emptyLine.episodes[0].scenes[0].flow[0].line = '';
assert.ok(validateScript(emptyLine).some(p => p.includes('空台词')));
assert.equal(seedFromOutline({ source: '创意', episodes: [] }).reviewPolicy, 'advisory');
console.log('PASS creative policy: closed ending and long dialogue preserved; strict opt-in; invalid data and references blocked; reports disclose advisories');
