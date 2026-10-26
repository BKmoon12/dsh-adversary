/**
 * 审查任务书的生成与渲染。
 *
 * 这里只做纯字符串与数据变换：不发请求、不读文件、不写磁盘。
 * 生成的 markdown 会被工具作为结果返回给模型，模型据此逐角色完成预演。
 */
import { PERSONAS, DEFAULT_PERSONA_IDS, resolvePersonas, normalizeCustomPersona } from './personas.js';

/** 交付物类型：决定这一轮该重点看什么，而不是泛泛地"提意见"。 */
export const DELIVERABLE_TYPES = ['文件', '文案', '视频脚本', '朋友圈', '抖音', '演讲/汇报', '其他'];

const TYPE_HINTS = {
  文件: '看结论是否成立、依据是否可查、格式与口径是否合规、责任与兜底是否清楚；忽略"文笔"。',
  文案: '看第一句是否抓人、卖点是否可信、承诺是否越界、有没有可被断章取义的句子。',
  视频脚本: '按秒看：前 3 秒是否留人、第 15 秒是否给出继续看的理由、结尾是否有明确的动作；口播句子要能直接念出来。',
  朋友圈: '看社交摩擦：会不会让熟人觉得你在炫耀、说教或卖东西；是否有人会被默认对号入座。',
  抖音: '看信息密度与情绪强度：开头钩子、评论区最可能被顶上去的那句、哪句话最容易被截出来配标题。',
  '演讲/汇报': '看听众在 30 秒内是否知道你要他们做什么决定；时间是否超、有没有会被当场追问的数字。',
  其他: '按"对方要拿它做什么决定"来判断，先找结论与依据的缺口。',
};

const INTENSITY_HINTS = {
  gentle: '语气克制：指出问题，但给足台阶，适合内部初稿。',
  normal: '语气直接：像真会当面提出的异议，不修饰，但不对人。',
  brutal: '语气不客气：假设对方今天心情不好且没耐心，专挑最难回答的那一句。',
};

export const INTENSITIES = Object.keys(INTENSITY_HINTS);

function coerceType(type) {
  if (typeof type !== 'string') return '其他';
  const trimmed = type.trim();
  return DELIVERABLE_TYPES.includes(trimmed) ? trimmed : '其他';
}

/** 纯文本统计，用于判断交付物是否长到会稀释注意力。 */
export function inspectDeliverable(text) {
  const source = typeof text === 'string' ? text : '';
  const chars = source.trim().length;
  const lines = source.trim() === '' ? 0 : source.trim().split(/\r?\n/).length;
  return { chars, lines, tooLong: chars > 8000 };
}

/** 渲染一份角色清单，供模型或用户挑选。 */
export function renderPersonaCatalog() {
  const lines = [];
  lines.push('# 假想敌角色卡（内置 ' + PERSONAS.length + ' 张）');
  lines.push('');
  for (const persona of PERSONAS) {
    lines.push('## ' + persona.label + '（id: ' + persona.id + '）');
    lines.push('- 视角：' + persona.role);
    lines.push('- 关注焦点：' + persona.focus.join(' / '));
    lines.push('- 异议风格：' + persona.style + '｜初始立场（模式 B）：' + persona.stance);
    if (persona.voice !== '') lines.push('- 语气示范：' + persona.voice);
    if (persona.questions.length > 0) lines.push('- 典型追问：' + persona.questions.join(' '));
    if (persona.triggers.length > 0) lines.push('- 容易被点着：' + persona.triggers.join('；'));
    if (persona.aliases.length > 0) lines.push('- 别名：' + persona.aliases.join('、'));
    lines.push('');
  }
  lines.push('默认组合：' + DEFAULT_PERSONA_IDS.join(' + ') + '（结果 / 价值 / 逻辑 三种压力）。');
  lines.push('也可以完全不选卡，直接告诉我要模拟谁（例如「我们那位只关心预算的副总」），我会按你的描述现建一张空卡。');
  return lines.join('\n');
}

function renderPersonaBlock(persona, index) {
  const lines = [];
  lines.push('### 角色 ' + index + '：' + persona.label);
  lines.push('');
  lines.push('**你现在就是这个人。** 你的视角：' + persona.role);
  lines.push('');
  lines.push('- 身份标签：' + persona.label);
  lines.push('- 关注焦点：' + persona.focus.join(' / '));
  lines.push('- 异议风格：' + persona.style);
  if (persona.voice !== '') lines.push('- 语气示范（照这个说话方式，不要照抄句子）：' + persona.voice);
  if (persona.questions.length > 0) lines.push('- 你大概率会问：' + persona.questions.join(' '));
  if (persona.triggers.length > 0) lines.push('- 你会被这些点着：' + persona.triggers.join('；'));
  lines.push('');
  lines.push('输出这四段，顺序固定：');
  lines.push('1. **第一反应**：一到两句话，用这个人的口吻说出来（不要写"我认为"，直接说）。');
  lines.push('2. **会提出的异议**：2–4 条。每条必须写成：「原文片段」→ 他会怎么质疑 → 为什么他在意。用原文里的具体词句，不许泛泛而谈。');
  lines.push('3. **最可能被抓住的薄弱点**：只写一条，是这份东西在他眼里最致命的地方。');
  lines.push('4. **一条修改建议**：具体到改哪一句、改成什么方向。不要写"建议完善结构"这类废话。');
  return lines.join('\n');
}

/**
 * 生成审查任务书。
 * 返回纯数据，渲染交给下面两个函数，方便工具与测试分别验证。
 */
export function buildReviewPlan(input = {}) {
  const deliverable = typeof input.deliverable === 'string' ? input.deliverable : '';
  const type = coerceType(input.deliverableType);
  const intensity = INTENSITIES.includes(input.intensity) ? input.intensity : 'normal';

  const requested = Array.isArray(input.personas) && input.personas.length > 0 ? input.personas : DEFAULT_PERSONA_IDS;
  const { found, unknown } = resolvePersonas(requested);

  const custom = [];
  for (const item of Array.isArray(input.customPersonas) ? input.customPersonas : []) {
    const normalized = normalizeCustomPersona(item);
    if (normalized !== undefined) custom.push(normalized);
  }

  const personas = [...found, ...custom];
  const stats = inspectDeliverable(deliverable);

  return {
    deliverable,
    deliverableType: type,
    intensity,
    personas,
    unknownPersonas: unknown,
    stats,
    ok: deliverable.trim() !== '' && personas.length > 0,
    reason: deliverable.trim() === '' ? '交付物为空' : personas.length === 0 ? '没有可用的角色卡' : '',
  };
}

/** 渲染任务书正文，交给模型执行。 */
export function renderBrief(plan) {
  const lines = [];
  lines.push('## 假想敌预演任务书');
  lines.push('');
  lines.push('- 交付物类型：' + plan.deliverableType);
  lines.push('- 审查强度：' + plan.intensity + '（' + INTENSITY_HINTS[plan.intensity] + '）');
  lines.push('- 角色数量：' + plan.personas.length + '（' + plan.personas.map((persona) => persona.label).join('、') + '）');
  lines.push('- 这一轮该重点看：' + (TYPE_HINTS[plan.deliverableType] ?? TYPE_HINTS['其他']));
  lines.push('- 篇幅：' + plan.stats.chars + ' 字 / ' + plan.stats.lines + ' 行' + (plan.stats.tooLong ? '（偏长，先只针对最关键的 3 处开火，不要平均用力）' : ''));
  if (plan.unknownPersonas.length > 0) {
    lines.push('- 未识别的角色，已忽略：' + plan.unknownPersonas.join('、') + '（可用 adversary_personas 查 id，或改用 customPersonas 自建）');
  }
  lines.push('');
  lines.push('## 铁律');
  lines.push('');
  lines.push('1. **一次只演一个人。** 每个角色单独成段，角色之间不互相引用、不互相补充、不总结前一个角色说过的话。');
  lines.push('2. **只挑毛病，不夸。** 不许写"整体不错""思路清晰"这类缓冲句，第一句就要落在问题上。');
  lines.push('3. **必须引用原文。** 每条异议都要指出原文里的具体词句或位置，不能凭空评价这份东西。');
  lines.push('4. **不编造事实。** 你不掌握这份交付物之外的信息（真实数据、对方的历史态度、内部政治），需要外部信息才能成立的质疑，要写成"他会问你……"，而不是直接断言。');
  lines.push('5. **这是压力测试，不是预测。** 不要承诺"领导一定会这么想"，只交付"如果他这么想，你该怎么接"。');
  lines.push('');
  lines.push('## 交付物原文');
  lines.push('');
  lines.push('<<<');
  lines.push(plan.deliverable.trim());
  lines.push('>>>');
  lines.push('');
  lines.push('## 逐个角色执行');
  lines.push('');
  plan.personas.forEach((persona, index) => {
    lines.push(renderPersonaBlock(persona, index + 1));
    lines.push('');
  });

  if (plan.personas.length > 1) {
    lines.push('## 收尾：多角度异议总表');
    lines.push('');
    lines.push('所有角色演完后，把异议合并成一张表，列固定为：优先级 / 异议 / 指向原文位置 / 提出者 / 是否共同指向。');
    lines.push('');
    lines.push('判定规则（按顺序执行，不要凭感觉）：');
    lines.push('1. **共同指向**：两个及以上不同角色针对**同一处原文**提出的异议，才算"共同指向"，优先级最高。同一角色重复提两次不算。');
    lines.push('2. **优先级**：共同指向 > 单一角色的致命薄弱点（每个角色的第 3 段）> 其余单条异议。P0 = 不改就会被打回；P1 = 会被追问、需要准备答案；P2 = 可以不改但值得知道。');
    lines.push('3. **合并同类**：措辞不同但指向同一处原文的，合并成一条，提出者写全部角色名。');
    lines.push('');
    lines.push('表格之后再写两段，各不超过三句：');
    lines.push('- **最可能被截图的一句话**：原文里哪一句最容易被单独截出来传播或放大，为什么。');
    lines.push('- **如果只能改三处**：给出按投入产出排序的三条修改，每条写清改哪句、往哪个方向改。');
    lines.push('');
  } else {
    lines.push('## 收尾');
    lines.push('');
    lines.push('这个角色演完后，追加一段「如果只能改三处」，按投入产出排序，写清改哪句、往哪个方向改。');
    lines.push('');
  }

  return lines.join('\n');
}

/** 一行摘要，用于没有原文时的兜底提示。 */
export function describePlan(plan) {
  return plan.personas.map((persona) => persona.label).join('、') + ' × ' + plan.deliverableType + ' × ' + plan.intensity;
}
