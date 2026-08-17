// ===== DeepSeek 大模型客户端(浏览器直连,官方 API 支持 CORS) =====
// 团队共享 Key 存放在 Supabase app_config 表,启动时异步加载;个人在"AI 设置"里填的 Key 优先
let DEEPSEEK_SHARED_KEY = '';
const DeepSeekClient = {
  BASE: 'https://api.deepseek.com',

  getKey() { return Store.ai.getKey() || DEEPSEEK_SHARED_KEY; },
  isConfigured() { return Boolean(this.getKey()); },

  // 启动时从 Supabase 读取团队共享 Key(加载失败则退回个人 Key 模式)
  async loadSharedKey() {
    if (!supabaseConfigured() || Store.ai.getKey()) return;
    try {
      const resp = await fetch(SUPABASE_CONFIG.url + '/rest/v1/app_config?key=eq.deepseek_shared_key&select=value&limit=1', {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey
        }
      });
      if (!resp.ok) return;
      const rows = await resp.json();
      if (rows && rows.length) DEEPSEEK_SHARED_KEY = rows[0].value || '';
    } catch (e) { /* 保持空,走个人 Key / 内置题库 */ }
  },

  async chat(systemPrompt, userPrompt, { temperature = 0.8, maxTokens = 4096 } = {}) {
    const key = this.getKey();
    if (!key) throw new Error('未配置 DeepSeek API Key:团队共享未开启,请在"AI 设置"中填写个人 Key');
    const resp = await fetch(this.BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false
      })
    });
    if (!resp.ok) {
      let msg = 'DeepSeek 请求失败(' + resp.status + ')';
      try {
        const data = await resp.json();
        msg = data.error?.message || data.error || msg;
      } catch {}
      throw new Error(msg);
    }
    const data = await resp.json();
    return extractJson(data.choices?.[0]?.message?.content || '');
  },

  async generateQuestions({ courseName, courseOutline, kpName, difficulty, count }) {
    if (!this.isConfigured()) return fallbackQuestions(courseName, kpName, difficulty, count);
    const system = `你是一位经验丰富的大学专业课出题专家。要求:1. 每道题必须是单项选择题,4 个选项,只有一个正确;2. 贴合真实考试风格;3. 知识点归属准确(知识点名称与用户给的一致,未给则依据课程大纲);4. 每题给出简短易懂的解析;5. 只输出 JSON。输出格式:{"questions":[{"stem":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","kpName":"...","difficulty":"easy|medium|hard"}]}`;
    const user = `课程:${courseName}\n课程大纲摘要:${courseOutline || ''}\n${kpName ? '知识点:' + kpName : ''}\n难度:${({ easy: '基础', medium: '中等', hard: '较难' })[difficulty] || '中等'}\n请生成 ${count} 道单项选择题。`;
    const res = await this.chat(system, user, { temperature: 1.0 });
    return normalizeQuestions(res.questions || []);
  },

  async generateMockExam({ courseName, courseOutline, kpNames, count }) {
    if (!this.isConfigured()) return fallbackExam(courseName, count);
    const system = `你是一位大学专业课命题专家。要求:1. 生成 ${count} 道单选题,覆盖课程核心考点${kpNames.length ? ',尤其侧重:' + kpNames.join('、') : ''};2. 难度分布约 30% 基础、50% 中等、20% 综合;3. 每题 4 选项 1 答案,附解析;4. 只输出 JSON:{"questions":[{"stem":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","kpName":"...","difficulty":"easy|medium|hard"}]}`;
    const user = `课程:${courseName}\n课程大纲摘要:${courseOutline || ''}\n请生成含 ${count} 道单选题的考前冲刺模拟卷。`;
    const res = await this.chat(system, user, { temperature: 0.9 });
    return normalizeQuestions(res.questions || []);
  },

  async tutor({ courseName, question, history }) {
    if (!this.isConfigured()) {
      return `(未配置 DeepSeek API Key,当前为离线演示)\n\n这道题我们先不急着算。请先告诉我:1. 它考察的是「${courseName}」中的哪个知识点?你能否写出相关定义或公式?2. 题目给出了哪些已知条件?分别对应公式里的哪个量?\n\n想清楚这两点,你大概率能自己找到突破口。回复"直接讲"可让我给思路框架。`;
    }
    const messages = (history || []).slice(-8).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }));
    if (question) messages.push({ role: 'user', content: `课程:${courseName}\n问题:${String(question).slice(0, 2000)}` });
    if (!messages.length) return '请描述你想问的题目或知识点。';
    const resp = await fetch(this.BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.getKey() },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: TUTOR_SYSTEM }, ...messages],
        temperature: 0.7,
        max_tokens: 800,
        stream: false
      })
    });
    if (!resp.ok) {
      let msg = 'DeepSeek 请求失败(' + resp.status + ')';
      try { const d = await resp.json(); msg = d.error?.message || d.error || msg; } catch {}
      throw new Error(msg);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '抱歉,暂时无法回答,请稍后再试。';
  }
};

const TUTOR_SYSTEM = `你是"智刷星"平台上的 AI 学习伙伴,采用苏格拉底式教学法帮助大学生理解专业课难题。
规则:1. 绝不直接给出完整答案或解题过程,而是通过 1-3 个递进式问题引导学生自己思考;2. 学生给出思路时先肯定正确部分,再针对错误或模糊处继续提问;3. 可提示关键定理、概念或公式名称,但不代写完整推导;4. 使用中文,像耐心负责的学长学姐,每次回复不超过 250 字;5. 学生明确请求"直接讲"时可逐步给出思路框架,但保留关键一步让学生完成。`;

function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
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

function fallbackQuestions(courseName, kpName, difficulty, count) {
  const kp = kpName ? `(${kpName})` : '';
  const pool = [
    { stem: `关于「${courseName}」${kp} 的基础考点,下列说法正确的是?`, options: ['选项 A:定义与公式完全等价,无需区分适用条件', '选项 B:先理解概念的前提假设,再套用公式计算', '选项 C:考试中背下公式即可,概念无需理解', '选项 D:所有结论对所有情况都成立'], correctIndex: 1, explanation: '学习任何知识点都应先理解概念与适用条件,再通过练习巩固公式应用。', kpName: kpName || '综合考点', difficulty },
    { stem: `关于「${courseName}」中知识点的理解,以下哪项最能帮助你在考试中避免失分?${kp}`, options: ['选项 A:只做难题,不做基础题', '选项 B:盲目刷题,不总结错因', '选项 C:针对薄弱点做专项练习并及时复盘错题', '选项 D:考前临时突击所有内容'], correctIndex: 2, explanation: '个性化复习的关键是"诊断薄弱点 → 专项练习 → 复盘错题"。', kpName: kpName || '复习策略', difficulty }
  ];
  return Array.from({ length: count }, (_, i) => ({ ...pool[i % 2], stem: `${i + 1}. ${pool[i % 2].stem}` }));
}

function fallbackExam(courseName, count) {
  return Array.from({ length: count }, (_, i) => ({
    stem: `${i + 1}. 【${courseName}】关于课程核心概念的综合理解,以下说法正确的是?`,
    options: ['A. 概念之间彼此孤立,可单独记忆', 'B. 核心概念之间存在逻辑关联,理解推导过程比死记结论更重要', 'C. 只需记住最终公式', 'D. 不需要理解,考过就忘'],
    correctIndex: 1,
    explanation: '专业课学习的本质是建立知识网络,理解概念间的联系与推导逻辑。',
    kpName: '综合',
    difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard'
  }));
}
