/**
 * dsh-adversary —— 「假想敌」：交付物发布前的对抗性预演。
 *
 * 插件注册两项能力：
 *   1. 技能 adversary（完整 SOP，SKILL.md 随包分发，按需加载）
 *   2. 工具 adversary_personas（查角色卡）、adversary_review（生成审查任务书）
 *
 * 立场：这是压力测试，不是预测。工具只负责把「该用什么视角、按什么格式开火」
 * 组织成一份可直接执行的任务书，真正的扮演由主模型完成。
 *
 * 纯 ESM、零运行时依赖：不 import 任何 Harness 包，避免宿主 bundle 解析失败。
 *
 * @module dsh-adversary
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { PERSONAS, DEFAULT_PERSONA_IDS, PERSONA_STYLES, PERSONA_STANCES } from './personas.js';
import {
  DELIVERABLE_TYPES,
  INTENSITIES,
  buildReviewPlan,
  renderBrief,
  renderPersonaCatalog,
  inspectDeliverable,
} from './review.js';

export const name = 'dsh-adversary';
/** apply 里会用到 ctx.tools 与 ctx.skills。 */
export const inject = ['tools', 'skills'];

export const SKILL_NAMES = ['adversary'];

export const DEFAULT_MAX_PERSONAS = 3;
export const DEFAULT_MAX_DELIVERABLE_CHARS = 20000;
export const DEFAULT_INTENSITY = 'normal';

function clampInt(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** 归一化插件配置，缺字段时给安全默认值。 */
export function resolveAdversaryConfig(config = {}) {
  const source = config !== null && typeof config === 'object' ? config : {};
  const defaultPersonas = Array.isArray(source.defaultPersonas) && source.defaultPersonas.length > 0
    ? source.defaultPersonas.filter((item) => typeof item === 'string' && item.trim() !== '')
    : [...DEFAULT_PERSONA_IDS];
  return {
    defaultPersonas,
    maxPersonas: clampInt(source.maxPersonas, DEFAULT_MAX_PERSONAS, 1, 8),
    maxDeliverableChars: clampInt(source.maxDeliverableChars, DEFAULT_MAX_DELIVERABLE_CHARS, 500, 200000),
    intensity: INTENSITIES.includes(source.intensity) ? source.intensity : DEFAULT_INTENSITY,
    showDisclaimer: source.showDisclaimer !== false,
  };
}

function oneText(text) {
  return [{ type: 'text', text }];
}

const personaCardSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    role: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' } },
    style: { type: 'string' },
    stance: { type: 'string' },
    voice: { type: 'string' },
    custom: { type: 'boolean' },
  },
  additionalProperties: true,
};

const personasResultSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    personas: { type: 'array', items: personaCardSchema },
    defaultPersonas: { type: 'array', items: { type: 'string' } },
    unknown: { type: 'array', items: { type: 'string' } },
    availableStyles: { type: 'array', items: { type: 'string' } },
    availableStances: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

const reviewResultSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    brief: { type: 'string' },
    deliverableType: { type: 'string' },
    intensity: { type: 'string' },
    personaIds: { type: 'array', items: { type: 'string' } },
    personaLabels: { type: 'array', items: { type: 'string' } },
    chars: { type: 'integer' },
    truncated: { type: 'boolean' },
    droppedPersonas: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

function renderPersonaResult(value) {
  if (!value.ok) return oneText(value.reason ?? '角色卡查询失败。');
  const intro = value.unknown.length > 0
    ? '没找到这些角色：' + value.unknown.join('、') + '。下面是可用角色：\n\n'
    : '';
  const catalog = renderPersonaCatalog();
  const footer = '\n\n传参方式：adversary_review 的 personas 填上面的 id 或中文名；要模拟清单外的人，用 customPersonas 传 {label, role, focus, style}。';
  return oneText(intro + catalog + footer);
}

function renderReviewResult(value) {
  if (!value.ok) return oneText('无法开始预演：' + (value.reason || '原因未知') + '\n\n用法：把交付物全文放进 deliverable，再用 personas 指定想模拟的 1–3 个角色。');
  const notes = [];
  if (value.truncated) notes.push('交付物很长，已截断到 ' + value.chars + ' 字参与审查。');
  if (value.droppedPersonas.length > 0) notes.push('角色数超过上限，本轮忽略：' + value.droppedPersonas.join('、') + '（需要更多请调大 maxPersonas 或分批跑）。');
  const prefix = notes.length > 0 ? notes.join('\n') + '\n\n' : '';
  return oneText(prefix + value.brief);
}

/** 构建两个工具的定义；不依赖 defineTool，直接给注册表所需的对象。 */
export function buildAdversaryTools(config) {
  const maxPersonas = config.maxPersonas;
  const maxChars = config.maxDeliverableChars;
  const defaultPersonas = config.defaultPersonas;

  return [
    {
      name: 'adversary_personas',
      description:
        'List the built-in "adversary" persona cards of dsh-adversary (身份标签 / 关注焦点 / 异议风格 / 初始立场), so the user can pick who should review a deliverable. Use before adversary_review when the right adversary is unclear. 中文：列出「假想敌」内置角色卡（严厉领导、挑剔客户、爱抬杠的同行、路人网友、杠精、把关人、财务、法务、截图传播者、竞争对手、平级同事、评审专家），供挑选本轮要模拟谁。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional subset by id or Chinese label, e.g. ["strict-boss","挑剔客户"]. Omit to list every card.',
          },
        },
        additionalProperties: false,
      },
      output: { schema: personasResultSchema, render: (_args, value) => renderPersonaResult(value) },
      execute(args = {}) {
        const requested = Array.isArray(args.ids) ? args.ids.filter((item) => typeof item === 'string' && item.trim() !== '') : [];
        const unknown = [];
        const personas = [];
        if (requested.length === 0) {
          for (const persona of PERSONAS) personas.push(persona);
        } else {
          for (const key of requested) {
            const hit = PERSONAS.find((persona) => persona.id === key.trim() || persona.label === key.trim() || (persona.aliases ?? []).includes(key.trim()));
            if (hit === undefined) {
              unknown.push(key);
              continue;
            }
            if (!personas.includes(hit)) personas.push(hit);
          }
        }
        return {
          ok: true,
          personas,
          defaultPersonas,
          unknown,
          availableStyles: PERSONA_STYLES,
          availableStances: PERSONA_STANCES,
        };
      },
    },
    {
      name: 'adversary_review',
      description:
        'Build an adversarial rehearsal brief for a deliverable that is about to be sent out: given the deliverable text and 1–3 adversary personas, return a ready-to-execute task book that makes the model play each persona separately (第一反应 / 会提出的异议 / 最可能被抓住的薄弱点 / 一条修改建议) and then merge everything into a deduplicated 异议总表. This is a stress test, not a prediction. 中文：为即将发出的文件、文案、视频脚本、朋友圈或抖音生成「假想敌预演」任务书——逐个角色扮演、挑毛病、最后汇总成一张多角度异议总表。不是预测对方真实反应，而是提前把最可能被攻击的裂缝暴露一遍。',
      parameters: {
        type: 'object',
        properties: {
          deliverable: { type: 'string', required: true, description: 'The full text of the deliverable being reviewed (file content, copy, video script, social post). Paste as-is; do not summarize it first.' },
          personas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Persona ids or Chinese labels, e.g. ["strict-boss","picky-client"]. 1–' + maxPersonas + ' entries; omit to use the plugin default set.',
          },
          deliverableType: {
            type: 'string',
            enum: DELIVERABLE_TYPES,
            description: 'What kind of deliverable this is; decides which failure modes matter. Default 其他.',
          },
          intensity: {
            type: 'string',
            enum: INTENSITIES,
            description: 'How blunt the adversaries are: gentle / normal (default) / brutal.',
          },
          customPersonas: {
            type: 'array',
            description: 'Personas that are not in the built-in catalog. Each entry: {label (required), role, focus: string[], style, stance, voice}.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '身份标签, e.g. 只关心预算的副总' },
                role: { type: 'string', description: '一句话说明他站在什么位置看这份东西' },
                focus: { type: 'array', items: { type: 'string' }, description: '关注焦点' },
                style: { type: 'string', enum: PERSONA_STYLES, description: '异议风格' },
                stance: { type: 'string', enum: PERSONA_STANCES, description: '初始立场（仅评论区模拟用）' },
                voice: { type: 'string', description: '一句语气示范' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['deliverable'],
        additionalProperties: false,
      },
      output: { schema: reviewResultSchema, render: (_args, value) => renderReviewResult(value) },
      execute(args = {}) {
        const raw = typeof args.deliverable === 'string' ? args.deliverable : '';
        const stats = inspectDeliverable(raw);
        const truncated = stats.chars > maxChars;
        const deliverable = truncated ? raw.slice(0, maxChars) : raw;

        const plan = buildReviewPlan({
          deliverable,
          deliverableType: args.deliverableType,
          intensity: typeof args.intensity === 'string' && args.intensity !== '' ? args.intensity : config.intensity,
          personas: args.personas,
          customPersonas: args.customPersonas,
        });

        if (!plan.ok) {
          return {
            ok: false,
            reason: plan.reason,
            brief: '',
            deliverableType: plan.deliverableType,
            intensity: plan.intensity,
            personaIds: [],
            personaLabels: [],
            chars: truncated ? maxChars : stats.chars,
            truncated,
            droppedPersonas: [],
          };
        }

        const dropped = plan.personas.slice(maxPersonas);
        plan.personas = plan.personas.slice(0, maxPersonas);

        let brief = renderBrief(plan);
        if (config.showDisclaimer) {
          brief += '\n\n---\n提醒用户：以上是压力测试结果，用于提前准备应对，不代表对方真实会这么说。';
        }

        return {
          ok: true,
          reason: '',
          brief,
          deliverableType: plan.deliverableType,
          intensity: plan.intensity,
          personaIds: plan.personas.map((persona) => persona.id),
          personaLabels: plan.personas.map((persona) => persona.label),
          chars: truncated ? maxChars : stats.chars,
          truncated,
          droppedPersonas: dropped.map((persona) => persona.label),
        };
      },
    },
  ];
}

/** 随包分发的技能目录绝对路径。 */
export function bundledSkillsDir() {
  return fileURLToPath(new URL('../skills/', import.meta.url));
}

/** 极简 frontmatter 解析（只读 name / description 两个单行字段）。 */
export function parseSkillFile(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(normalized);
  if (match === null) return { name: '', description: '', content: normalized };
  let name = '';
  let description = '';
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line);
    if (keyMatch === null) continue;
    let value = keyMatch[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }
    if (keyMatch[1] === 'name') name = value;
    else if (keyMatch[1] === 'description') description = value;
  }
  return { name, description, content: normalized.slice(match[0].length).trimStart() };
}

/** 注册技能；文件缺失或 frontmatter 不完整只告警，不弄崩宿主启动。 */
export function registerAdversarySkill(ctx) {
  const skillName = SKILL_NAMES[0];
  const dir = join(bundledSkillsDir(), skillName);
  const parsed = parseSkillFile(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
  if (parsed.name === '' || parsed.description === '' || parsed.content === '') {
    throw new Error('技能 ' + skillName + ' 的 frontmatter 不完整（name/description/content 均不能为空）');
  }
  return ctx.skills.register({
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    resourceBase: { kind: 'directory', path: dir },
    source: 'runtime',
  });
}

export function apply(ctx, config = {}) {
  const resolved = resolveAdversaryConfig(config);
  const warn = (message) => {
    ctx.logger?.warn?.(message);
  };
  const disposers = [];

  if (ctx.skills !== undefined && typeof ctx.skills.register === 'function') {
    try {
      disposers.push(registerAdversarySkill(ctx));
    } catch (error) {
      warn('[dsh-adversary] 技能加载失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  for (const definition of buildAdversaryTools(resolved)) {
    disposers.push(ctx.tools.register(definition));
  }

  if (typeof ctx.on === 'function') {
    ctx.on('dispose', () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // 释放阶段的异常不应影响其他插件。
        }
      }
    });
  }
}

export { PERSONAS, DEFAULT_PERSONA_IDS, PERSONA_STYLES, PERSONA_STANCES, DELIVERABLE_TYPES, INTENSITIES };
export { buildReviewPlan, renderBrief, renderPersonaCatalog, inspectDeliverable };
