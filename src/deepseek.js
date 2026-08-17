const fetch = require('node-fetch');

const API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

function isConfigured() {
  return Boolean(API_KEY);
}

async function chat(systemPrompt, userPrompt, { temperature = 0.8, maxTokens = 4096, jsonMode = false } = {}) {
  if (!API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepSeek API 请求失败(${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return extractJson(content);
}

function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const GENERATE_SYSTEM = `你是一位经验丰富的大学专业课出题专家,擅长为理工科大学生出高质量的选择题。
要求:
1. 每道题必须是单项选择题,4 个选项,只有一个正确。
2. 题目要贴合真实考试风格,难度要符合要求,不能太简单也不能故意刁钻。
3. 知识点归属要准确,知识点名称必须与用户给出的知识点一致(未给则依据课程大纲合理选择)。
4. 每题必须给出简短易懂的解析(2-4句),让学生看完能真正理解。
5. 只输出 JSON,不要输出任何其他文字。
输出格式:
{"questions":[{"stem":"题目内容","options":["A选项","B选项","C选项","D选项"],"correctIndex":0,"explanation":"解析","kpName":"知识点名称","difficulty":"easy|medium|hard"}]}`;

const TUTOR_SYSTEM = `你是"智刷星"平台上的 AI 学习伙伴,采用苏格拉底式教学法帮助大学生理解专业课难题。
规则:
1. 绝不直接给出完整答案或解题过程,而是通过 1-3 个递进式问题引导学生自己思考。
2. 当学生给出思路时,先肯定正确的部分,再针对错误或模糊处继续提问。
3. 适当提示关键定理、概念或公式名称,但不代写完整推导。
4. 回答使用中文,语气像耐心负责的学长/学姐,简洁不啰嗦,每次回复不超过 250 字。
5. 如果学生明确表示"实在想不出来"并请求直接讲解,可以逐步给出思路框架,但仍要保留关键一步让学生自己完成。`;

async function generateQuestions({ courseName, courseOutline, kpName, difficulty, count }) {
  if (!isConfigured()) return fallbackQuestions(courseName, kpName, difficulty, count);
  const user = `课程:${courseName}
课程大纲摘要:${courseOutline || '标准大学课程大纲'}
${kpName ? `知识点:${kpName}` : '知识点:依据课程大纲自行选择核心知识点'}
难度:${difficultyLabel(difficulty)}
请生成 ${count} 道单项选择题。`;
  return normalizeQuestions((await chat(GENERATE_SYSTEM, user, { temperature: 1.0, jsonMode: true })).questions || []);
}

async function generateMockExam({ courseName, courseOutline, kpNames, count }) {
  if (!isConfigured()) return fallbackExam(courseName, count);
  const system = `你是一位大学专业课命题专家,负责出一份期末考前模拟卷(全部为单选题)。
要求:
1. 共 ${count} 道题,覆盖课程核心考点${kpNames.length ? `,尤其侧重以下知识点:${kpNames.join('、')}` : ''}。
2. 题目难度分布合理(约 30% 基础、50% 中等、20% 综合)。
3. 每题 4 个选项、1 个正确答案,解析要能讲清原理。
4. 只输出 JSON,格式:{"questions":[{"stem":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","kpName":"...","difficulty":"easy|medium|hard"}]}`;
  const user = `课程:${courseName}
课程大纲摘要:${courseOutline || '标准大学课程大纲'}
请生成一份含 ${count} 道单选题的考前冲刺模拟卷。`;
  return normalizeQuestions((await chat(system, user, { temperature: 0.9, jsonMode: true })).questions || []);
}

function normalizeQuestions(list) {
  return list.map((q, i) => {
    const ci = Number(q.correctIndex);
    const validCi = Number.isInteger(ci) && ci >= 0 && ci <= 3 ? ci : 0;
    const options = Array.isArray(q.options) && q.options.length >= 4
      ? q.options.slice(0, 4).map(o => String(o))
      : ['选项 A', '选项 B', '选项 C', '选项 D'];
    return {
      stem: String(q.stem || `第 ${i + 1} 题`),
      options,
      correctIndex: validCi,
      explanation: String(q.explanation || '本题考查了对应知识点的核心概念。'),
      kpName: String(q.kpName || '综合'),
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium'
    };
  }).slice(0, 5);
}

async function tutor({ courseName, question, history }) {
  if (!isConfigured()) {
    return `(未配置 DeepSeek API Key,当前为离线演示回复)\n\n这道题我们先不急着算。请先告诉我:\n1. 题目考察的是「${courseName}」中的哪个知识点?你能否写出相关的定义或公式?\n2. 题目给出了哪些已知条件?这些条件分别对应公式里的哪个量?\n\n想清楚这两点,你大概率就能自己找到突破口。如果想让我继续引导,把你的思路发给我;如果希望我直接讲完整解法,回复"直接讲"。`;
  }
  const messages = [];
  const recent = Array.isArray(history) ? history.slice(-8) : [];
  for (const m of recent) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: String(m.content || '').slice(0, 2000) });
    }
  }
  if (question) messages.push({ role: 'user', content: `课程:${courseName}\n问题:${String(question).slice(0, 2000)}` });
  if (!messages.length) return '请描述你想问的题目或知识点。';
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: TUTOR_SYSTEM }, ...messages],
      temperature: 0.7,
      max_tokens: 800,
      stream: false
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepSeek API 请求失败(${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '抱歉,我暂时无法回答,请稍后再试。';
}

function difficultyLabel(d) {
  return ({ easy: '基础', medium: '中等', hard: '较难(综合应用)' })[d] || '中等';
}

/* ---------- 未配置 API Key 时的内置兜底(保证功能可演示) ---------- */
function fallbackQuestions(courseName, kpName, difficulty, count) {
  const kp = kpName ? `(${kpName})` : '';
  const pool = [
    {
      stem: `关于「${courseName}」${kp} 的一个基础考点,下列说法正确的是?`,
      options: ['选项 A:定义与公式完全等价,无需区分适用条件', '选项 B:先理解概念的前提假设,再套用公式计算', '选项 C:考试中背下公式即可,概念无需理解', '选项 D:所有结论对所有情况都成立'],
      correctIndex: 1,
      explanation: '学习任何知识点都应先理解概念与适用条件,再通过练习巩固公式应用,这也是本平台的核心复习理念。',
      kpName: kpName || '综合考点',
      difficulty
    },
    {
      stem: `关于「${courseName}」中知识点的理解,以下哪项最能帮助你在考试中避免失分?${kp}`,
      options: ['选项 A:只做难题,不做基础题', '选项 B:盲目刷题,不总结错因', '选项 C:针对薄弱点做专项练习并及时复盘错题', '选项 D:考前临时突击所有内容'],
      correctIndex: 2,
      explanation: '个性化复习的关键是"诊断薄弱点 → 专项练习 → 复盘错题",这正是智刷星的设计初衷。',
      kpName: kpName || '复习策略',
      difficulty
    }
  ];
  const out = [];
  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length];
    out.push({ ...base, stem: `${i + 1}. ${base.stem}` });
  }
  return out;
}

function fallbackExam(courseName, count) {
  const qs = [];
  for (let i = 0; i < count; i++) {
    qs.push({
      stem: `${i + 1}. 【${courseName}】关于课程核心概念的综合理解,以下说法正确的是?`,
      options: ['A. 概念之间彼此孤立,可单独记忆', 'B. 核心概念之间存在逻辑关联,理解推导过程比死记结论更重要', 'C. 只需记住最终公式', 'D. 不需要理解,考过就忘'],
      correctIndex: 1,
      explanation: '专业课学习的本质是建立知识网络,理解概念间的联系与推导逻辑,才能在综合题中灵活运用。',
      kpName: '综合',
      difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard'
    });
  }
  return qs;
}

module.exports = {
  isConfigured,
  generateQuestions,
  generateMockExam,
  tutor,
  model,
  providerLabel: 'DeepSeek(深度求索)'
};
