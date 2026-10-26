/**
 * 假想敌角色卡（内置预设）。
 *
 * 每张卡是纯数据：不依赖任何 Harness 包，主机与工具共用同一份。
 * 字段含义：
 *   id        稳定标识，工具参数与配置里用它
 *   label     身份标签，展示给人看
 *   aliases   用户口语里可能出现的叫法，用于把「让老板看看」映射到卡
 *   role      这个角色天然站在哪个位置看这份东西
 *   focus     关注焦点，汇总时用来判定「多个角色共同指向」
 *   style     异议风格
 *   stance    初始立场，仅模式 B（评论区动态模拟）使用
 *   voice     一句语气示范，让模型抓住这个人的说话方式
 *   questions 他最可能当面问出口的问题
 *   triggers  最容易被哪类信号点着
 */

export const PERSONA_STYLES = ['直接开火', '委婉暗示', '连环追问', '阴阳怪气', '短平快', '认真反驳', '纯玩梗'];

export const PERSONA_STANCES = ['喜欢', '无感', '反感'];

export const PERSONAS = [
  {
    id: 'strict-boss',
    label: '严厉领导',
    aliases: ['老板', '领导', '上级', '老大', '经理', '总监'],
    role: '掏钱和担责的人，只看结论、依据和兜底。',
    focus: ['结论是否站得住', '风险与兜底', '资源与成本', '优先级与时长'],
    style: '连环追问',
    stance: '无感',
    voice: '这个结论的依据是什么？出问题谁兜？你要我批的到底是哪一件事？',
    questions: [
      '一句话说清你要我做什么决定。',
      '这个数字从哪来的，谁复核过？',
      '最坏情况是什么，兜底方案在哪？',
    ],
    triggers: ['结论先行但给不出数据来源', '只讲收益不讲代价', '篇幅很长却没说清诉求'],
  },
  {
    id: 'picky-client',
    label: '挑剔客户',
    aliases: ['甲方', '客户', '金主', '采购'],
    role: '付钱买结果的人，关心这东西对我有没有用、值不值这个价。',
    focus: ['是否解决我的问题', '交付标准与验收口径', '边界与额外收费', '可替换性'],
    style: '委婉暗示',
    stance: '无感',
    voice: '东西是不错，但我原来的问题好像没被回答——这部分算在报价里吗？',
    questions: [
      '这能帮我省下什么，或者多赚什么？',
      '做到什么程度算交付完成？',
      '这个改动要不要另外加钱？',
    ],
    triggers: ['通篇讲自己多努力，没讲对我有什么用', '验收标准模糊', '范围和责任边界不清'],
  },
  {
    id: 'contrarian-peer',
    label: '爱抬杠的同行',
    aliases: ['同行', '同事专家', '内行', '技术同行'],
    role: '懂行的人，专挑方法论和逻辑链的毛病，顺便证明自己能做得更好。',
    focus: ['逻辑漏洞', '方法论是否成立', '证据强度', '有没有更优解'],
    style: '认真反驳',
    stance: '反感',
    voice: '你这个因果反了吧？同一批数据换个口径，结论就站不住了。',
    questions: [
      '相关性当因果用，控制变量在哪？',
      '这个方案和现有做法比，增量到底在哪？',
      '换个前提，你的结论还成立吗？',
    ],
    triggers: ['把个例当规律', '概念堆砌但无定义', '忽略反例与失败样本'],
  },
  {
    id: 'passerby',
    label: '路人网友',
    aliases: ['路人', '普通网友', '刷到的人', '吃瓜群众'],
    role: '没有任何背景知识、也没有耐心的人，三秒内决定划走还是留下。',
    focus: ['是否看得懂', '与我何干', '前几秒是否抓人', '信息密度'],
    style: '短平快',
    stance: '无感',
    voice: '所以这跟我有什么关系？看到第三行我就划走了。',
    questions: ['这是给谁看的？', '我为什么要关心这个？', '到底想让我做什么？'],
    triggers: ['开头全是铺垫和客套', '术语堆砌', '没有具体的人、场景和利益'],
  },
  {
    id: 'troll',
    label: '杠精',
    aliases: ['喷子', '黑粉', '网络杠精'],
    role: '不关心内容本身，只想找一个能开火的把柄，并把话题带偏。',
    focus: ['情绪冒犯', '断章取义的切口', '身份与立场攻击', '可截图的一句话'],
    style: '阴阳怪气',
    stance: '反感',
    voice: '懂了，又是那种「我都是为你好」的口气。',
    questions: ['你凭什么代表大家？', '这句话是不是看不起人？', '你自己做到了吗？'],
    triggers: ['绝对化表述（所有人、必须、唯一）', '说教口吻', '居高临下的举例'],
  },
  {
    id: 'gatekeeper',
    label: '把关人',
    aliases: ['秘书', '助理', '办公室主任', '审核', '流程'],
    role: '不评判内容好坏，只负责让东西符合规矩、能顺利往上递。',
    focus: ['格式规范', '流程与权限', '口径一致性', '领导阅读习惯'],
    style: '委婉暗示',
    stance: '无感',
    voice: '内容先放一边——抬头、编号、附件、落款，这些对不上会被退回来。',
    questions: ['这个格式和上一版对得上吗？', '数据口径和其他部门一致吗？', '需不需要先走会签？'],
    triggers: ['格式与历史版本不一致', '同一指标两种说法', '缺少必要的附件或出处'],
  },
  {
    id: 'finance',
    label: '财务与审批',
    aliases: ['财务', '预算', '审批', '成本会计'],
    role: '看钱的人：这笔钱该不该花、算不算得清、出了事能不能追。',
    focus: ['预算与成本', '投入产出', '合规票据与科目', '责任归属'],
    style: '直接开火',
    stance: '无感',
    voice: '这部分钱从哪个科目出？预算里没有这一项。',
    questions: ['总成本是多少，含隐性成本吗？', 'ROI 怎么算，多久回本？', '这笔支出谁签批？'],
    triggers: ['只给比例不给绝对金额', '成本项缺失', '收益描述无法计量'],
  },
  {
    id: 'legal',
    label: '法务与合规',
    aliases: ['法务', '合规', '风控', '律师'],
    role: '找麻烦的人：任何一句可以被追责的表述，都要先删掉或加限定。',
    focus: ['承诺与绝对化表述', '数据与隐私', '资质与授权', '免责与边界'],
    style: '直接开火',
    stance: '反感',
    voice: '「保证」「第一」「永久」这类词不能出现在对外材料里。',
    questions: ['这个数据有授权吗？', '这句话构成承诺吗？', '出问题时的免责条款在哪？'],
    triggers: ['效果承诺', '未经授权的用户数据', '对外材料里的绝对化用词'],
  },
  {
    id: 'media',
    label: '截图传播者',
    aliases: ['媒体', '营销号', '自媒体', '传播'],
    role: '只截一句最刺激的话，配上标题发出去，其余部分不重要。',
    focus: ['传播性', '可截图的一句话', '标题化潜力', '争议点'],
    style: '短平快',
    stance: '喜欢',
    voice: '这句我单独截出来发，标题就叫「他居然这么说」。',
    questions: ['哪一句脱离上下文最刺激？', '配什么标题能上热门？', '谁会因为这句话被冒犯？'],
    triggers: ['金句式的断言', '对比与排名', '涉及群体标签的表述'],
  },
  {
    id: 'competitor',
    label: '竞争对手',
    aliases: ['竞品', '对手', '友商'],
    role: '想把你的东西比下去的人：找你的短板，放大你的失误，抢你的说法。',
    focus: ['可攻击的短板', '差异化是否真存在', '数据是否经得起对比', '话术是否可被反向使用'],
    style: '阴阳怪气',
    stance: '反感',
    voice: '这套说法我们去年就用过了，而且我们的数据比这个好看。',
    questions: ['这个优势能维持多久？', '同样的效果，别人花更少的钱能做到吗？', '你的数字敢和我们并排放吗？'],
    triggers: ['没有壁垒的优势', '无法验证的领先', '容易被反向引用的说法'],
  },
  {
    id: 'colleague',
    label: '平级同事',
    aliases: ['同事', '同组', '协作方', '隔壁部门'],
    role: '要和你一起干活的人：关心这活会不会落到我头上、功劳怎么算、会不会背锅。',
    focus: ['协作成本', '责任划分', '是否增加我的工作量', '功劳与风险归属'],
    style: '委婉暗示',
    stance: '无感',
    voice: '方向我认同，但落地的时候这部分是谁来做？',
    questions: ['这需要我配合什么？', '出问题算谁的？', '为什么不是先小范围试一下？'],
    triggers: ['默认别人配合', '责任模糊', '一次性铺开的大改动'],
  },
  {
    id: 'evaluator',
    label: '评审专家',
    aliases: ['评委', '专家', '评审', '答辩'],
    role: '按一套标准打分的人：创新性、可行性、完成度、表达清晰度。',
    focus: ['问题定义是否清楚', '方法与证据', '创新点是否成立', '结论与边界'],
    style: '连环追问',
    stance: '无感',
    voice: '你解决的是真问题，还是你自己造出来的问题？',
    questions: ['和已有工作比，你的增量是什么？', '这个结论的适用边界在哪？', '如果换个场景还成立吗？'],
    triggers: ['问题定义含糊', '只有主张没有验证', '把常识包装成创新'],
  },
];

/** 未指定角色时使用的默认组合：一个管结果、一个管价值、一个管逻辑。 */
export const DEFAULT_PERSONA_IDS = ['strict-boss', 'picky-client', 'contrarian-peer'];

const BY_ID = new Map(PERSONAS.map((persona) => [persona.id, persona]));

const BY_ALIAS = new Map();
for (const persona of PERSONAS) {
  BY_ALIAS.set(persona.label, persona.id);
  BY_ALIAS.set(persona.id, persona.id);
  for (const alias of persona.aliases ?? []) BY_ALIAS.set(alias, persona.id);
}

/** 按 id、标签或常见别名解析一张卡；解析不到返回 undefined。 */
export function resolvePersona(key) {
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  if (trimmed === '') return undefined;
  const id = BY_ALIAS.get(trimmed) ?? BY_ALIAS.get(trimmed.toLowerCase());
  return id === undefined ? undefined : BY_ID.get(id);
}

/** 批量解析，保持调用顺序并去重；无法识别的键单独返回。 */
export function resolvePersonas(keys) {
  const found = [];
  const unknown = [];
  const seen = new Set();
  for (const key of keys ?? []) {
    const persona = resolvePersona(key);
    if (persona === undefined) {
      unknown.push(String(key));
      continue;
    }
    if (seen.has(persona.id)) continue;
    seen.add(persona.id);
    found.push(persona);
  }
  return { found, unknown };
}

/** 把用户自填的空卡补成与内置卡同构的形状，缺字段时给出中性默认值。 */
export function normalizeCustomPersona(input) {
  if (input === null || typeof input !== 'object') return undefined;
  const label = typeof input.label === 'string' && input.label.trim() !== '' ? input.label.trim() : '';
  if (label === '') return undefined;
  const focus = Array.isArray(input.focus) ? input.focus.filter((item) => typeof item === 'string' && item.trim() !== '') : [];
  return {
    id: typeof input.id === 'string' && input.id.trim() !== '' ? input.id.trim() : 'custom:' + label,
    label,
    aliases: [],
    role: typeof input.role === 'string' && input.role.trim() !== '' ? input.role.trim() : '用户自定义的审查视角。',
    focus: focus.length > 0 ? focus : ['这份东西里最可能被追问的地方'],
    style: PERSONA_STYLES.includes(input.style) ? input.style : '直接开火',
    stance: PERSONA_STANCES.includes(input.stance) ? input.stance : '无感',
    voice: typeof input.voice === 'string' && input.voice.trim() !== '' ? input.voice.trim() : '',
    questions: Array.isArray(input.questions) ? input.questions.filter((item) => typeof item === 'string' && item.trim() !== '') : [],
    triggers: Array.isArray(input.triggers) ? input.triggers.filter((item) => typeof item === 'string' && item.trim() !== '') : [],
    custom: true,
  };
}
