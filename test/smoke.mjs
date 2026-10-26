/**
 * 冒烟测试：不依赖 DSH 运行时，直接验证插件对外暴露的纯函数与工具定义。
 *
 * 运行：node test/smoke.mjs（或 pnpm test）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  apply,
  buildAdversaryTools,
  bundledSkillsDir,
  parseSkillFile,
  resolveAdversaryConfig,
  DEFAULT_MAX_PERSONAS,
  SKILL_NAMES,
} from '../lib/index.js';
import { PERSONAS, DEFAULT_PERSONA_IDS, PERSONA_STYLES, PERSONA_STANCES, resolvePersona, resolvePersonas, normalizeCustomPersona } from '../lib/personas.js';
import { DELIVERABLE_TYPES, INTENSITIES, buildReviewPlan, renderBrief, renderPersonaCatalog, inspectDeliverable } from '../lib/review.js';

let checks = 0;
function ok(label, fn) {
  fn();
  checks += 1;
  console.log('  ✓ ' + label);
}

function findTool(tools, name) {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, '缺少工具 ' + name);
  return tool;
}

console.log('dsh-adversary 冒烟测试');

// ---- 角色卡 ----
ok('内置角色卡数量 >= 12', () => {
  assert.ok(PERSONAS.length >= 12, '角色卡太少：' + PERSONAS.length);
});

ok('角色卡 id 唯一', () => {
  const ids = PERSONAS.map((persona) => persona.id);
  assert.equal(new Set(ids).size, ids.length);
});

ok('每张卡字段完整且取值合法', () => {
  for (const persona of PERSONAS) {
    assert.equal(typeof persona.id, 'string');
    assert.ok(persona.id.length > 0);
    assert.equal(typeof persona.label, 'string');
    assert.ok(persona.label.length > 0, persona.id + ' 缺 label');
    assert.equal(typeof persona.role, 'string');
    assert.ok(Array.isArray(persona.focus) && persona.focus.length > 0, persona.id + ' 缺 focus');
    assert.ok(PERSONA_STYLES.includes(persona.style), persona.id + ' 的 style 非法：' + persona.style);
    assert.ok(PERSONA_STANCES.includes(persona.stance), persona.id + ' 的 stance 非法：' + persona.stance);
    assert.ok(Array.isArray(persona.questions));
    assert.ok(Array.isArray(persona.triggers));
    assert.ok(Array.isArray(persona.aliases));
  }
});

ok('默认角色组合全部可解析', () => {
  const { found, unknown } = resolvePersonas(DEFAULT_PERSONA_IDS);
  assert.equal(unknown.length, 0);
  assert.equal(found.length, DEFAULT_PERSONA_IDS.length);
});

ok('id / 中文标签 / 别名都能解析到同一张卡', () => {
  const byId = resolvePersona('strict-boss');
  const byLabel = resolvePersona('严厉领导');
  const byAlias = resolvePersona('老板');
  assert.equal(byId?.id, 'strict-boss');
  assert.equal(byLabel?.id, byId?.id);
  assert.equal(byAlias?.id, byId?.id);
  assert.equal(resolvePersona('不存在的角色'), undefined);
});

ok('resolvePersonas 去重且保留未知项', () => {
  const { found, unknown } = resolvePersonas(['strict-boss', '老板', 'picky-client', '查无此人']);
  assert.equal(found.length, 2);
  assert.deepEqual(unknown, ['查无此人']);
});

ok('自定义卡缺 label 时被拒绝', () => {
  assert.equal(normalizeCustomPersona({}), undefined);
  assert.equal(normalizeCustomPersona({ label: '   ' }), undefined);
});

ok('自定义卡补全默认值', () => {
  const card = normalizeCustomPersona({ label: '只关心预算的副总' });
  assert.equal(card.label, '只关心预算的副总');
  assert.equal(card.id, 'custom:只关心预算的副总');
  assert.ok(card.focus.length > 0);
  assert.ok(PERSONA_STYLES.includes(card.style));
  assert.equal(card.custom, true);
});

// ---- 配置 ----
ok('空配置给出安全默认值', () => {
  const config = resolveAdversaryConfig();
  assert.deepEqual(config.defaultPersonas, DEFAULT_PERSONA_IDS);
  assert.equal(config.maxPersonas, DEFAULT_MAX_PERSONAS);
  assert.equal(config.intensity, 'normal');
  assert.equal(config.showDisclaimer, true);
});

ok('非法配置被夹紧而不是报错', () => {
  const config = resolveAdversaryConfig({ maxPersonas: 999, maxDeliverableChars: -5, intensity: '疯狗' });
  assert.equal(config.maxPersonas, 8);
  assert.equal(config.maxDeliverableChars, 500);
  assert.equal(config.intensity, 'normal');
});

ok('maxPersonas 下限为 1', () => {
  assert.equal(resolveAdversaryConfig({ maxPersonas: 0 }).maxPersonas, 1);
});

// ---- 任务书 ----
const sample = [
  '关于 Q4 投放预算调整的说明',
  '',
  '本季度我们把预算从 80 万压到 50 万，主要投向短视频。',
  '调整后预计 ROI 提升 30%，这是行业里唯一有效的做法。',
  '请领导尽快批复。',
].join('\n');

ok('inspectDeliverable 统计字数与行数', () => {
  const stats = inspectDeliverable(sample);
  assert.ok(stats.chars > 0);
  assert.equal(stats.tooLong, false);
  assert.equal(inspectDeliverable('  ').lines, 0);
});

ok('单角色任务书包含四段引导与原文', () => {
  const plan = buildReviewPlan({ deliverable: sample, personas: ['strict-boss'], deliverableType: '文件' });
  assert.equal(plan.ok, true);
  const brief = renderBrief(plan);
  assert.ok(brief.includes('假想敌预演任务书'));
  assert.ok(brief.includes(sample.trim()), '任务书必须原样包含交付物');
  assert.ok(brief.includes('第一反应'));
  assert.ok(brief.includes('最可能被抓住的薄弱点'));
  assert.ok(brief.includes('一条修改建议'));
  assert.ok(!brief.includes('多角度异议总表'), '单角色不应出现汇总表');
});

ok('多角色任务书包含汇总规则', () => {
  const plan = buildReviewPlan({ deliverable: sample, personas: ['strict-boss', 'picky-client', 'contrarian-peer'], deliverableType: '文件' });
  const brief = renderBrief(plan);
  assert.ok(brief.includes('多角度异议总表'));
  assert.ok(brief.includes('共同指向'));
  assert.ok(brief.includes('最可能被截图的一句话'));
});

ok('交付物类型影响重点提示', () => {
  const plan = buildReviewPlan({ deliverable: sample, personas: ['passerby'], deliverableType: '抖音' });
  const brief = renderBrief(plan);
  assert.ok(brief.includes('前 3 秒') || brief.includes('截出来'));
});

ok('空交付物判定为不可执行', () => {
  const plan = buildReviewPlan({ deliverable: '   ', personas: ['strict-boss'] });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, '交付物为空');
});

ok('没有可用角色时判定为不可执行', () => {
  const plan = buildReviewPlan({ deliverable: sample, personas: ['不存在'] });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, '没有可用的角色卡');
});

ok('角色清单可渲染', () => {
  const catalog = renderPersonaCatalog();
  assert.ok(catalog.includes('严厉领导'));
  assert.ok(catalog.includes('默认组合'));
});

// ---- 工具 ----
const tools = buildAdversaryTools(resolveAdversaryConfig());

ok('注册两个工具且定义完整', () => {
  assert.equal(tools.length, 2);
  for (const tool of tools) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.parameters.type, 'object');
    assert.equal(typeof tool.output.render, 'function');
    assert.equal(typeof tool.execute, 'function');
  }
});

ok('adversary_personas 返回全部角色卡', () => {
  const tool = findTool(tools, 'adversary_personas');
  const value = tool.execute({});
  assert.equal(value.ok, true);
  assert.equal(value.personas.length, PERSONAS.length);
  const content = tool.output.render({}, value);
  assert.equal(content[0].type, 'text');
  assert.ok(content[0].text.includes('严厉领导'));
});

ok('adversary_personas 支持子集与未知项', () => {
  const tool = findTool(tools, 'adversary_personas');
  const value = tool.execute({ ids: ['strict-boss', '胡说'] });
  assert.equal(value.personas.length, 1);
  assert.deepEqual(value.unknown, ['胡说']);
  const content = tool.output.render({}, value);
  assert.ok(content[0].text.includes('没找到这些角色'));
});

ok('adversary_review 正常出任务书', () => {
  const tool = findTool(tools, 'adversary_review');
  const value = tool.execute({ deliverable: sample, personas: ['strict-boss', 'troll'], deliverableType: '文件', intensity: 'brutal' });
  assert.equal(value.ok, true);
  assert.deepEqual(value.personaIds, ['strict-boss', 'troll']);
  assert.equal(value.intensity, 'brutal');
  assert.ok(value.brief.includes('假想敌预演任务书'));
  const content = tool.output.render({}, value);
  assert.ok(content[0].text.includes('压力测试'));
});

ok('adversary_review 空文本给出可读错误', () => {
  const tool = findTool(tools, 'adversary_review');
  const value = tool.execute({ deliverable: '' });
  assert.equal(value.ok, false);
  assert.equal(value.brief, '');
  const content = tool.output.render({}, value);
  assert.ok(content[0].text.includes('无法开始预演'));
});

ok('adversary_review 默认使用插件配置的角色与强度', () => {
  const custom = buildAdversaryTools(resolveAdversaryConfig({ maxPersonas: 2, intensity: 'gentle' }));
  const tool = findTool(custom, 'adversary_review');
  const value = tool.execute({ deliverable: sample });
  assert.equal(value.ok, true);
  assert.equal(value.intensity, 'gentle');
  assert.equal(value.personaIds.length, 2);
  assert.deepEqual(value.droppedPersonas.length, 1);
});

ok('adversary_review 超长交付物被截断并标注', () => {
  const custom = buildAdversaryTools(resolveAdversaryConfig({ maxDeliverableChars: 500 }));
  const tool = findTool(custom, 'adversary_review');
  const value = tool.execute({ deliverable: '很长的内容。'.repeat(200), personas: ['strict-boss'] });
  assert.equal(value.truncated, true);
  assert.equal(value.chars, 500);
  const content = tool.output.render({}, value);
  assert.ok(content[0].text.includes('已截断'));
});

ok('adversary_review 支持自定义角色卡', () => {
  const tool = findTool(tools, 'adversary_review');
  const value = tool.execute({
    deliverable: sample,
    personas: ['strict-boss'],
    customPersonas: [{ label: '只关心预算的副总', focus: ['预算'], style: '直接开火', voice: '这钱从哪出？' }],
  });
  assert.equal(value.ok, true);
  assert.equal(value.personaLabels.length, 2);
  assert.ok(value.personaLabels.includes('只关心预算的副总'));
  assert.ok(value.brief.includes('这钱从哪出？'));
});

ok('adversary_review 去重同一角色的不同写法', () => {
  const tool = findTool(tools, 'adversary_review');
  const value = tool.execute({ deliverable: sample, personas: ['strict-boss', '严厉领导', '老板'] });
  assert.deepEqual(value.personaIds, ['strict-boss']);
});

// ---- 技能 ----
ok('技能文件存在且 frontmatter 可解析', () => {
  const skillName = SKILL_NAMES[0];
  const text = readFileSync(join(bundledSkillsDir(), skillName, 'SKILL.md'), 'utf8');
  const parsed = parseSkillFile(text);
  assert.equal(parsed.name, 'adversary');
  assert.equal(parsed.description.length > 40, true);
  assert.equal(parsed.content.length > 1000, true);
  assert.ok(!parsed.content.startsWith('---'), 'frontmatter 不应残留');
});

ok('parseSkillFile 容忍缺失 frontmatter', () => {
  const parsed = parseSkillFile('# 只有正文');
  assert.equal(parsed.name, '');
  assert.equal(parsed.content, '# 只有正文');
});

// ---- apply 装配 ----
ok('apply 注册技能与工具，并在 dispose 时释放', () => {
  const registered = { tools: [], skills: [] };
  const handlers = {};
  const ctx = {
    logger: { warn() {} },
    tools: {
      register(definition) {
        registered.tools.push(definition);
        return () => {};
      },
    },
    skills: {
      register(definition) {
        registered.skills.push(definition);
        return () => {};
      },
    },
    on(event, handler) {
      handlers[event] = handler;
    },
  };
  apply(ctx, {});
  assert.equal(registered.tools.length, 2);
  assert.equal(registered.skills.length, 1);
  assert.equal(registered.skills[0].name, 'adversary');
  assert.equal(typeof handlers.dispose, 'function');
  handlers.dispose();
});

ok('技能缺失时 apply 不抛异常', () => {
  const ctx = {
    logger: { warn() {} },
    tools: { register: () => () => {} },
    skills: { register() { throw new Error('模拟技能目录缺失'); } },
    on() {},
  };
  assert.doesNotThrow(() => apply(ctx, {}));
});

ok('工具枚举与配置一致', () => {
  assert.ok(DELIVERABLE_TYPES.length >= 5);
  assert.ok(INTENSITIES.length === 3);
});

console.log('\n全部通过：' + checks + ' 项检查。');
