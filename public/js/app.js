/* ============ 智刷星 SPA ============ */
const state = {
  user: API.getUser(),
  courses: [],
  kpMap: {},            // courseId -> [{id,name}]
  aiStatus: null,
  currentQuiz: null,    // 诊断进行中状态
  practice: null,       // 刷题进行中状态
  exam: null
};

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', route);

async function init() {
  await checkAIStatus();
  if (state.user && API.getToken()) {
    showApp();
  } else {
    showLogin();
  }
}

/* ---------------- 登录/注册 ---------------- */
function showLogin() {
  document.getElementById('app-root').classList.add('hidden');
  const root = document.getElementById('login-root');
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">✨</div>
        <div class="login-title">智刷星</div>
        <div class="login-sub">AI 专业课智能刷题平台 · 华中科技大学创客训练营</div>
        <div class="tabs">
          <button id="tab-login" class="active">登录</button>
          <button id="tab-register">注册</button>
        </div>
        <div id="login-form">
          <div class="field"><label>学号 / 邮箱</label><input class="input" id="login-account" placeholder="输入学号或邮箱"></div>
          <div class="field"><label>密码</label><input class="input" type="password" id="login-password" placeholder="输入密码"></div>
          <div class="error-text" id="login-error"></div>
          <button class="btn btn-block" id="login-btn">进入学习台</button>
        </div>
        <div id="register-form" class="hidden">
          <div class="field"><label>姓名</label><input class="input" id="reg-name" placeholder="你的姓名"></div>
          <div class="field"><label>学号</label><input class="input" id="reg-student-no" placeholder="学号"></div>
          <div class="field"><label>邮箱</label><input class="input" id="reg-email" placeholder="学校邮箱"></div>
          <div class="field"><label>密码(至少 6 位)</label><input class="input" type="password" id="reg-password" placeholder="设置密码"></div>
          <div class="error-text" id="register-error"></div>
          <button class="btn btn-block" id="register-btn">注册并开始学习</button>
        </div>
        <div class="login-tip">灵感源自《创客竞赛选题设计报告》智刷队 —— 让每位同学都拥有专属 AI 学习伙伴</div>
      </div>
    </div>`;

  document.getElementById('tab-login').onclick = () => switchAuthTab('login');
  document.getElementById('tab-register').onclick = () => switchAuthTab('register');
  document.getElementById('login-btn').onclick = () => doLogin();
  document.getElementById('register-btn').onclick = () => doRegister();
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('reg-password').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('login-form').classList.toggle('hidden', !isLogin);
  document.getElementById('register-form').classList.toggle('hidden', isLogin);
}

async function doLogin() {
  const account = document.getElementById('login-account').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.style.display = 'none';
  try {
    const res = await API.post('/auth/login', { account, password });
    API.setSession(res.token, res.user);
    state.user = res.user;
    showApp();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const studentNo = document.getElementById('reg-student-no').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const err = document.getElementById('register-error');
  err.style.display = 'none';
  try {
    const res = await API.post('/auth/register', { name, studentNo, email, password });
    API.setSession(res.token, res.user);
    state.user = res.user;
    toast('注册成功,欢迎使用智刷星!', 'success');
    showApp();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
}

/* ---------------- 应用壳 ---------------- */
function showApp() {
  document.getElementById('login-root').innerHTML = '';
  document.getElementById('login-root').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('user-name').textContent = state.user.name || '同学';
  document.getElementById('user-avatar').textContent = initials(state.user.name);
  document.getElementById('logout-btn').onclick = () => {
    API.clearSession();
    location.hash = '#/login';
    showLogin();
  };
  if (!location.hash || location.hash === '#/login') location.hash = '#/dashboard';
  route();
}

async function checkAIStatus() {
  try {
    state.aiStatus = await API.get('/ai/status');
  } catch {
    state.aiStatus = { configured: false };
  }
  const badge = document.getElementById('ai-status');
  if (badge) {
    if (state.aiStatus.configured) {
      badge.innerHTML = `<span class="dot"></span> DeepSeek 已接入`;
      badge.classList.remove('off');
    } else {
      badge.innerHTML = `<span class="dot"></span> AI 未配置(内置题库模式)`;
      badge.classList.add('off');
    }
  }
}

/* ---------------- 路由 ---------------- */
const PAGES = {
  dashboard: { title: '学习台', sub: '期末复习的 AI 智能伙伴' },
  courses: { title: '全部课程', sub: '选择课程,开始诊断与练习' },
  history: { title: '诊断记录', sub: '回顾每一次诊断与成长' },
  ai: { title: 'AI 出题', sub: 'DeepSeek 大模型实时生成专属题目' },
  tutor: { title: 'AI 讲题', sub: '苏格拉底式引导,理解而非死记' },
  'mock-exam': { title: '考前冲刺模拟卷', sub: 'AI 根据你的薄弱点智能组卷' }
};

async function route() {
  if (!state.user || !API.getToken()) return;
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [page, param1, param2] = hash.split('/');
  const meta = PAGES[page];
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (meta) { titleEl.textContent = meta.title; subEl.textContent = meta.sub; }

  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === page);
  });

  const view = document.getElementById('view');
  view.innerHTML = `<div class="loading-block"><div class="spinner"></div>加载中…</div>`;
  try {
    if (page === 'dashboard') await renderDashboard(view);
    else if (page === 'courses') await renderCourses(view);
    else if (page === 'history') await renderHistory(view);
    else if (page === 'ai') await renderAiPage(view);
    else if (page === 'tutor') await renderTutorPage(view);
    else if (page === 'mock-exam') await renderMockExamPage(view);
    else if (page === 'diagnostic') await renderDiagnostic(view, param1, param2);
    else if (page === 'result') await renderResult(view, param1, param2);
    else if (page === 'practice') await renderPractice(view, param1, param2);
    else if (page === 'course') await renderCourseDetail(view, param1);
    else {
      view.innerHTML = `<div class="empty"><div class="emoji">🧭</div>页面不存在</div>`;
    }
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><div>${esc(e.message)}</div></div>`;
  }
}

/* ---------------- 数据 ---------------- */
async function ensureCourses() {
  if (state.courses.length) return state.courses;
  const res = await API.get('/courses');
  state.courses = res.courses;
  await Promise.all(state.courses.map(async c => {
    const r = await API.get('/courses/' + c.id);
    state.kpMap[c.id] = r.knowledgePoints;
  }));
  return state.courses;
}

function kpName(courseId, id) {
  const kp = (state.kpMap[courseId] || []).find(k => k.id === id);
  return kp ? kp.name : '综合';
}

/* ---------------- 学习台 ---------------- */
async function renderDashboard(view) {
  const [stats, courses] = await Promise.all([API.get('/stats'), ensureCourses()]);
  const weakTags = (stats.weakKps || []).map(k => `<span class="kp-tag">${esc(k.name)}</span>`).join('') || '<span style="color:var(--muted);font-size:13px">暂无薄弱点,继续保持!</span>';
  const latest = stats.latestDiag;
  const latestHtml = latest ? `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px">${esc(latest.course_name)} · 最近诊断</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${fmtTime(latest.created_at)}</div>
        </div>
        <div style="text-align:right">
          <div class="mini-score" style="color:${latest.score >= 75 ? 'var(--green)' : latest.score >= 55 ? 'var(--amber)' : 'var(--red)'}">${latest.score} 分</div>
          <div style="font-size:12px;color:var(--muted)">${latest.correct_count}/${latest.total_count} 题正确</div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-secondary btn-sm" href="#/result/${latest.id}">查看诊断报告</a>
        <a class="btn btn-sm" href="#/practice/${latest.course_id}">针对练习</a>
      </div>
    </div>` : `
    <div class="card">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:38px">🧪</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:16px">还没有诊断记录</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px">做一次 10 题的知识点诊断,AI 帮你找到薄弱点并规划复习路径</div>
        </div>
        <a class="btn" href="#/courses">开始诊断</a>
      </div>
    </div>`;

  view.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat-card"><div class="stat-icon" style="background:var(--brand-soft)">📝</div><div><div class="stat-value">${stats.total}</div><div class="stat-label">累计刷题</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--green-soft)">🎯</div><div><div class="stat-value">${stats.accuracy}%</div><div class="stat-label">正确率</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--amber-soft)">🧪</div><div><div class="stat-value">${stats.diagCount}</div><div class="stat-label">完成诊断</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:#faf5ff">🤖</div><div><div class="stat-value">${stats.aiCount}</div><div class="stat-label">AI 生成题目</div></div></div>
    </div>
    <div class="section-title">📊 近期概况</div>
    ${latestHtml}
    <div class="section-title">⚠️ 薄弱知识点(基于练习记录)</div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap">${weakTags}</div></div>
    <div class="section-title">📚 我的课程</div>
    <div class="grid grid-3">
      ${courses.map(c => `
        <div class="card course-card" data-course="${c.id}">
          <div class="course-icon">${c.icon}</div>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.description)}</p>
          <div class="course-meta">
            <span>${c.kp_count} 知识点</span><span>${c.question_count} 道内置题</span>
          </div>
        </div>`).join('')}
    </div>`;

  view.querySelectorAll('.course-card').forEach(el => {
    el.onclick = () => location.hash = '#/course/' + el.dataset.course;
  });
}

/* ---------------- 课程列表 ---------------- */
async function renderCourses(view) {
  const courses = await ensureCourses();
  view.innerHTML = `
    <div class="ai-intro">
      <h3>🧭 三步开启高效复习</h3>
      <p>① 选择课程 → ② 完成 10 题快速诊断,AI 识别薄弱知识点 → ③ 按推荐路径针对性刷题,遇到难题随时问 AI 讲题</p>
    </div>
    <div class="grid grid-3">
      ${courses.map(c => `
        <div class="card course-card" data-course="${c.id}">
          <div class="course-icon">${c.icon}</div>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.description)}</p>
          <div class="course-meta"><span>${c.kp_count} 知识点</span><span>${c.question_count} 道内置题</span></div>
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary diag-btn" data-id="${c.id}">开始诊断</button>
            <button class="btn btn-sm btn-ghost practice-btn" data-id="${c.id}">直接刷题</button>
          </div>
        </div>`).join('')}
    </div>`;
  view.querySelectorAll('.diag-btn').forEach(b => b.onclick = () => startDiagnostic(b.dataset.id));
  view.querySelectorAll('.practice-btn').forEach(b => b.onclick = () => location.hash = '#/practice/' + b.dataset.id);
}

/* ---------------- 课程详情 ---------------- */
async function renderCourseDetail(view, courseId) {
  const res = await API.get('/courses/' + courseId);
  const c = res.course;
  view.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:18px">
      <div style="font-size:44px">${c.icon}</div>
      <div style="flex:1;min-width:220px">
        <h2 style="font-size:20px">${esc(c.name)}</h2>
        <p style="color:var(--muted);font-size:13px;margin-top:2px">${esc(c.description)}</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="startDiagnostic(${c.id})">🧪 开始诊断</button>
        <a class="btn btn-secondary" href="#/practice/${c.id}">📝 刷题练习</a>
        <a class="btn btn-ghost" href="#/ai?course=${c.id}">🤖 AI 出题</a>
      </div>
    </div>
    <div class="section-title">🗺️ 课程知识图谱</div>
    <div class="card" id="graph-box"><div class="loading-block"><div class="spinner"></div>图谱加载中…</div></div>
    <div class="section-title">📌 知识点清单</div>
    <div class="grid grid-2">
      ${(res.knowledgePoints || []).map(kp => `
        <div class="card" style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <div style="font-weight:600">${esc(kp.name)}</div>
            <div style="font-size:12px;color:var(--muted)">权重 ${kp.weight}</div>
          </div>
          <a class="btn btn-sm btn-ghost" href="#/practice/${c.id}/${kp.id}">专项练习</a>
        </div>`).join('')}
    </div>`;
  try {
    const graph = await API.get('/knowledge-graph/' + courseId);
    renderKnowledgeGraph(document.getElementById('graph-box'), graph);
  } catch (e) {
    document.getElementById('graph-box').innerHTML = `<div class="empty">图谱加载失败:${esc(e.message)}</div>`;
  }
}

/* ---------------- 诊断 ---------------- */
async function startDiagnostic(courseId) {
  location.hash = '#/diagnostic/' + courseId;
}

async function renderDiagnostic(view, courseId, step) {
  const course = (await ensureCourses()).find(c => c.id === Number(courseId));
  if (!course) throw new Error('课程不存在');
  state.currentQuiz = {
    courseId: Number(courseId),
    diagnosticId: 0,
    answers: [],
    question: null
  };

  const loadQuestion = async () => {
    const res = await API.get(`/diagnostics/${courseId}/question?diagnosticId=${state.currentQuiz.diagnosticId}`);
    if (res.diagnosticId) state.currentQuiz.diagnosticId = res.diagnosticId;
    if (res.done) {
      await finishDiagnostic();
      return;
    }
    state.currentQuiz.question = res.question;
    renderQuizStep(view, course);
  };

  const renderQuizStep = (view, course) => {
    const q = state.currentQuiz.question;
    const answered = state.currentQuiz.answers.length;
    view.innerHTML = `
      <div class="quiz-wrap">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <a class="btn btn-sm btn-ghost" href="#/course/${courseId}">← 返回</a>
          <div style="font-weight:700;font-size:15px">${course.icon} ${esc(course.name)} · 知识点诊断</div>
        </div>
        <div class="quiz-progress">
          <div class="progress-track"><div class="progress-fill" style="width:${(answered / 10 * 100).toFixed(0)}%"></div></div>
          <div class="quiz-count">${Math.min(answered + 1, 10)} / 10</div>
        </div>
        <div class="quiz-card">
          <div class="quiz-kp-tags">${q.kpIds.map(id => `<span class="kp-tag">${esc(kpName(courseId, id))}</span>`).join('')}</div>
          <div class="quiz-stem">${esc(q.stem)}</div>
          ${q.options.map((opt, i) => `
            <div class="option" data-index="${i}">
              <span class="opt-letter">${String.fromCharCode(65 + i)}.</span>
              <span>${esc(opt)}</span>
            </div>`).join('')}
          <button class="btn btn-block" id="next-btn" disabled>确认作答,下一题</button>
        </div>
      </div>`;

    let selected = null;
    view.querySelectorAll('.option').forEach(el => {
      el.onclick = () => {
        view.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        selected = Number(el.dataset.index);
        document.getElementById('next-btn').disabled = false;
      };
    });
    document.getElementById('next-btn').onclick = async () => {
      state.currentQuiz.answers.push({ questionId: q.id, selected });
      document.getElementById('next-btn').disabled = true;
      document.getElementById('next-btn').textContent = '提交中…';
      await loadQuestion();
    };
  };

  const finishDiagnostic = async () => {
    const res = await API.post(`/diagnostics/${courseId}/submit`, {
      diagnosticId: state.currentQuiz.diagnosticId || undefined,
      answers: state.currentQuiz.answers
    });
    state.currentQuiz = null;
    toast('诊断完成!正在生成分析报告…', 'success');
    location.hash = '#/result/' + res.resultId;
  };

  await loadQuestion();
}

/* ---------------- 诊断结果 ---------------- */
async function renderResult(view, resultId) {
  const res = await API.get('/diagnostics/history');
  const r = res.history.find(h => h.id === Number(resultId));
  if (!r) throw new Error('诊断记录不存在');
  const levelCls = r.score >= 75 ? 'level-good' : r.score >= 55 ? 'level-mid' : 'level-low';
  const levelText = r.score >= 75 ? '掌握良好' : r.score >= 55 ? '有待加强' : '需要强化';
  const ringColor = r.score >= 75 ? '#059669' : r.score >= 55 ? '#d97706' : '#dc2626';
  const circumference = 2 * Math.PI * 62;

  const weakList = (r.report.weakPoints || []).map((w, i) => `
    <li>
      <span class="path-index">${i + 1}</span>
      <div style="flex:1">
        <div style="font-weight:600">${esc(w.name)} <span style="color:var(--red);font-weight:800">${w.score} 分</span></div>
        <div class="path-reason">掌握度偏低${w.evidence ? `,基于 ${w.evidence} 道题判定` : ',尚未有足够答题数据'}</div>
      </div>
      <a class="btn btn-sm btn-secondary" href="#/practice/${r.course_id}/${w.id}">去练习</a>
    </li>`).join('') || '<li style="border:none;color:var(--green)">🎉 暂无薄弱点</li>';

  const pathList = (r.report.path || []).map((p, i) => `
    <li>
      <span class="path-index">${i + 1}</span>
      <div style="flex:1"><div style="font-weight:600">${esc(p.name)}</div><div class="path-reason">${esc(p.reason)}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/practice/${r.course_id}/${p.id}">练习</a>
    </li>`).join('');

  view.innerHTML = `
    <div style="max-width:980px;margin:0 auto">
      <div class="card result-hero">
        <div class="score-ring">
          <svg width="150" height="150">
            <circle cx="75" cy="75" r="62" fill="none" stroke="#eef0f6" stroke-width="12"/>
            <circle cx="75" cy="75" r="62" fill="none" stroke="${ringColor}" stroke-width="12"
              stroke-linecap="round" stroke-dasharray="${circumference}"
              stroke-dashoffset="${circumference * (1 - r.score / 100)}"/>
          </svg>
          <div class="score-text"><span class="num">${r.score}</span><span class="unit">总分 100</span></div>
        </div>
        <span class="level-pill ${levelCls}">${levelText}</span>
        <div class="result-summary">${esc(r.report.summary || '')}</div>
        <div style="margin-top:14px;font-size:12.5px;color:var(--muted)">${fmtTime(r.created_at)} · ${esc(r.course_name)} · 答对 ${r.correct_count}/${r.total_count} 题</div>
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn" href="#/practice/${r.course_id}">📝 开始针对性刷题</a>
          <a class="btn btn-secondary" href="#/ai?course=${r.course_id}">🤖 AI 生成强化题</a>
          <button class="btn btn-ghost" id="redo-btn">🔄 重新诊断</button>
        </div>
      </div>

      <div class="section-title">🗺️ 知识点掌握图谱</div>
      <div class="card" id="graph-box"><div class="loading-block"><div class="spinner"></div>图谱加载中…</div></div>

      <div class="section-title">🩹 薄弱知识点</div>
      <ul class="path-list">${weakList}</ul>

      <div class="section-title">🧭 个性化复习路径</div>
      <div class="card"><ul class="path-list" style="margin-top:0">${pathList || '<li>暂无推荐路径,可先做一次练习</li>'}</ul></div>
    </div>`;

  document.getElementById('redo-btn').onclick = () => startDiagnostic(r.course_id);
  try {
    const graph = await API.get('/knowledge-graph/' + r.course_id);
    renderKnowledgeGraph(document.getElementById('graph-box'), graph);
  } catch (e) {
    document.getElementById('graph-box').innerHTML = `<div class="empty">图谱加载失败:${esc(e.message)}</div>`;
  }
}

/* ---------------- 练习 ---------------- */
async function renderPractice(view, courseId, kpId) {
  const course = (await ensureCourses()).find(c => c.id === Number(courseId));
  if (!course) throw new Error('课程不存在');
  const limit = kpId ? 8 : 12;
  const url = `/practice/questions?courseId=${courseId}${kpId ? '&kpId=' + kpId : ''}&limit=${limit}`;
  const res = await API.get(url);
  if (!res.questions.length) {
    view.innerHTML = `<div class="empty"><div class="emoji">📭</div>该知识点暂无题目,试试 <a href="#/ai?course=${courseId}${kpId ? '&kp=' + kpId : ''}">AI 出题</a></div>`;
    return;
  }
  state.practice = { courseId: Number(courseId), kpId: Number(kpId || 0), questions: res.questions, index: 0, results: {} };
  renderPracticeQuestion(view, course);
}

function renderPracticeQuestion(view, course) {
  const p = state.practice;
  const q = p.questions[p.index];
  const r = p.results[q.id] || null;
  const answeredCount = Object.keys(p.results).length;

  const feedback = r ? `
    <div class="feedback-box ${r.correct ? 'correct' : 'wrong'}">
      <div class="fb-title">${r.correct ? '✅ 回答正确' : '❌ 回答错误'}</div>
      <div>正确答案:${String.fromCharCode(65 + r.correctIndex)}. ${esc(q.options[r.correctIndex])}</div>
      <div style="margin-top:8px;font-size:13.5px">${esc(q.explanation)}</div>
      <div class="fb-actions">
        <button class="btn btn-sm btn-secondary" id="practice-next">${p.index === p.questions.length - 1 ? '完成练习' : '下一题 →'}</button>
        <button class="btn btn-sm btn-ghost" id="practice-ai">🤖 问 AI 讲解</button>
      </div>
    </div>` : '';

  view.innerHTML = `
    <div class="practice-layout">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          <a class="btn btn-sm btn-ghost" href="#/course/${p.courseId}">← ${course.icon} ${esc(course.name)}</a>
          ${p.kpId ? `<span class="kp-tag">${esc(kpName(p.courseId, p.kpId))}</span>` : '<span class="kp-tag">综合练习</span>'}
          <span style="font-size:13px;color:var(--muted)">已答 ${answeredCount}/${p.questions.length}</span>
        </div>
        <div class="card" style="padding:26px">
          <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:8px">第 ${p.index + 1} 题 · ${difficultyText(q.difficulty)}</div>
          <div class="quiz-stem" style="margin-bottom:18px">${esc(q.stem)}</div>
          ${q.options.map((opt, i) => {
            let cls = 'option';
            if (r) {
              if (i === r.correctIndex) cls += ' reveal-correct';
              if (i === r.selected && !r.correct) cls += ' wrong';
            }
            return `<div class="${cls}" data-index="${i}" ${r ? 'style="pointer-events:none"' : ''}>
              <span class="opt-letter">${String.fromCharCode(65 + i)}.</span><span>${esc(opt)}</span>
            </div>`;
          }).join('')}
          ${!r ? `<button class="btn btn-block" id="practice-submit" disabled>提交答案</button>` : feedback}
        </div>
      </div>
      <div>
        <div class="card" style="position:sticky;top:20px">
          <div style="font-weight:700;margin-bottom:12px">答题进度</div>
          <div class="qnav">
            ${p.questions.map((qq, i) => {
              const rr = p.results[qq.id];
              let cls = '';
              if (rr) cls = rr.correct ? 'done-correct' : 'done-wrong';
              if (i === p.index) cls += ' current';
              return `<button class="${cls}" data-i="${i}">${i + 1}</button>`;
            }).join('')}
          </div>
          ${p.kpId ? '' : `<div style="margin-top:14px;font-size:12.5px;color:var(--muted)">提示:答错题会进入薄弱知识点统计,建议结合 AI 出题做专项强化。</div>`}
        </div>
      </div>
    </div>`;

  if (!r) {
    let selected = null;
    view.querySelectorAll('.option').forEach(el => {
      el.onclick = () => {
        view.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        selected = Number(el.dataset.index);
        document.getElementById('practice-submit').disabled = false;
      };
    });
    document.getElementById('practice-submit').onclick = async () => {
      const btn = document.getElementById('practice-submit');
      btn.disabled = true; btn.textContent = '判题中…';
      const res = await API.post('/practice/answer', { questionId: q.id, selected });
      p.results[q.id] = { ...res, selected };
      renderPracticeQuestion(view, course);
    };
  } else {
    document.getElementById('practice-next').onclick = () => {
      if (p.index === p.questions.length - 1) {
        toast('练习完成!继续加油 💪', 'success');
        location.hash = p.kpId ? '#/course/' + p.courseId : '#/dashboard';
      } else {
        p.index++;
        renderPracticeQuestion(view, course);
      }
    };
    document.getElementById('practice-ai').onclick = () => {
      location.hash = '#/tutor?course=' + p.courseId + '&q=' + encodeURIComponent(q.stem);
    };
  }

  view.querySelectorAll('.qnav button').forEach(b => {
    b.onclick = () => { p.index = Number(b.dataset.i); renderPracticeQuestion(view, course); };
  });
}

function difficultyText(d) {
  return ({ easy: '基础', medium: '中等', hard: '较难' })[d] || '中等';
}

/* ---------------- 历史 ---------------- */
async function renderHistory(view) {
  const res = await API.get('/diagnostics/history');
  if (!res.history.length) {
    view.innerHTML = `<div class="empty"><div class="emoji">📭</div>还没有诊断记录<br><a class="btn" style="margin-top:14px" href="#/courses">去完成第一次诊断</a></div>`;
    return;
  }
  view.innerHTML = `
    <div class="card" style="padding:8px">
      <table class="table">
        <thead><tr><th>课程</th><th>时间</th><th>得分</th><th>答题</th><th>薄弱点</th><th></th></tr></thead>
        <tbody>
          ${res.history.map(h => `
            <tr>
              <td>${h.icon} ${esc(h.course_name)}</td>
              <td style="color:var(--muted)">${fmtTime(h.created_at)}</td>
              <td><span class="mini-score" style="color:${h.score >= 75 ? 'var(--green)' : h.score >= 55 ? 'var(--amber)' : 'var(--red)'}">${h.score}</span></td>
              <td>${h.correct_count}/${h.total_count}</td>
              <td style="max-width:260px">${(h.report.weakPoints || []).slice(0, 2).map(w => `<span class="kp-tag">${esc(w.name)}</span>`).join('') || '<span style="color:var(--muted)">无</span>'}</td>
              <td><a class="btn btn-sm btn-secondary" href="#/result/${h.id}">查看报告</a></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ---------------- AI 出题 ---------------- */
async function renderAiPage(view) {
  const courses = await ensureCourses();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preselectCourse = Number(params.get('course') || 0);
  const preselectKp = Number(params.get('kp') || 0);
  view.innerHTML = `
    <div class="ai-intro">
      <h3>🤖 DeepSeek 大模型实时出题</h3>
      <p>选择课程、难度与数量,AI 依据课程大纲与你的薄弱知识点,即时生成带详细解析的原创题目。</p>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="grid grid-4">
        <div class="field">
          <label>课程</label>
          <select class="select" id="ai-course">
            ${courses.map(c => `<option value="${c.id}" ${c.id === preselectCourse ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>知识点</label>
          <select class="select" id="ai-kp"><option value="0">综合(自动选择)</option></select>
        </div>
        <div class="field">
          <label>难度</label>
          <select class="select" id="ai-difficulty">
            <option value="easy">基础</option><option value="medium" selected>中等</option><option value="hard">较难</option>
          </select>
        </div>
        <div class="field">
          <label>题数</label>
          <select class="select" id="ai-count">
            <option value="1">1 题</option><option value="3" selected>3 题</option><option value="5">5 题</option>
          </select>
        </div>
      </div>
      <button class="btn" id="ai-generate" style="width:100%">⚡ 让 DeepSeek 生成题目</button>
      ${state.aiStatus && !state.aiStatus.configured ? `<div style="margin-top:10px;font-size:12.5px;color:var(--amber)">⚠️ 尚未配置 DEEPSEEK_API_KEY,当前返回内置演示题。配置方法见 README。</div>` : ''}
    </div>
    <div id="ai-result"><div class="empty"><div class="emoji">🎯</div>生成的题目会显示在这里</div></div>`;

  const kpSelect = document.getElementById('ai-kp');
  const refreshKps = () => {
    const cid = Number(document.getElementById('ai-course').value);
    kpSelect.innerHTML = '<option value="0">综合(自动选择)</option>' +
      (state.kpMap[cid] || []).map(k => `<option value="${k.id}" ${k.id === preselectKp ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
  };
  document.getElementById('ai-course').onchange = refreshKps;
  refreshKps();

  document.getElementById('ai-generate').onclick = async () => {
    const btn = document.getElementById('ai-generate');
    const resultBox = document.getElementById('ai-result');
    btn.disabled = true; btn.textContent = '🤖 DeepSeek 生成中,约需 10-30 秒…';
    resultBox.innerHTML = `<div class="loading-block"><div class="spinner"></div>大模型正在为你出题,请稍候…</div>`;
    try {
      const res = await API.post('/ai/generate', {
        courseId: Number(document.getElementById('ai-course').value),
        kpId: Number(kpSelect.value) || undefined,
        difficulty: document.getElementById('ai-difficulty').value,
        count: Number(document.getElementById('ai-count').value)
      });
      resultBox.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div style="font-weight:700">🎉 生成完成 <span style="font-size:12px;color:var(--muted);font-weight:400">(${res.model} · ${res.provider})</span></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary" id="ai-regen">↻ 再生成一组</button>
          </div>
        </div>
        <div id="ai-list">${res.questions.map((q, qi) => renderAiQuestionCard(q, qi)).join('')}</div>`;
      document.getElementById('ai-regen').onclick = () => document.getElementById('ai-generate').click();
      bindAiReveals(resultBox);
    } catch (e) {
      resultBox.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><div>${esc(e.message)}</div></div>`;
    } finally {
      btn.disabled = false; btn.textContent = '⚡ 让 DeepSeek 生成题目';
    }
  };
}

function renderAiQuestionCard(q, idx) {
  const diff = q.difficulty || 'medium';
  const ci = q.correctIndex != null ? Number(q.correctIndex) : null;
  return `
    <div class="ai-question" data-qid="${q.id || idx}" data-correct-index="${ci != null ? ci : ''}">
      <div class="ai-q-head">
        <div class="ai-q-tags">
          <span class="tag tag-kp">${esc(q.kpName || '综合')}</span>
          <span class="tag tag-diff-${diff}">${difficultyText(diff)}</span>
          <span class="tag" style="background:var(--brand-soft);color:var(--brand-dark)">AI 原创</span>
        </div>
        <button class="btn btn-sm btn-ghost ai-reveal">查看答案与解析</button>
      </div>
      <div class="ai-q-stem">${esc(q.stem)}</div>
      ${(q.options || []).map((opt, i) => `<div class="ai-opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${esc(opt)}</div>`).join('')}
      <div class="ai-explain hidden"><b>💡 解析:</b> ${esc(q.explanation || '暂无解析')}</div>
    </div>`;
}

function bindAiReveals(scope) {
  scope.querySelectorAll('.ai-question').forEach(card => {
    const btn = card.querySelector('.ai-reveal');
    btn.onclick = () => {
      const q = card;
      const opts = q.querySelectorAll('.ai-opt');
      opts.forEach(o => o.classList.remove('correct-opt'));
      const reveal = q.querySelector('.ai-explain');
      reveal.classList.remove('hidden');
      // 无 correctIndex 数据时只显示解析
      const ci = card.dataset.correctIndex;
      if (ci !== '' && opts[ci]) opts[ci].classList.add('correct-opt');
      btn.textContent = '已展示解析';
      btn.disabled = true;
    };
  });
}

/* ---------------- AI 讲题(苏格拉底) ---------------- */
async function renderTutorPage(view) {
  const courses = await ensureCourses();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preCourse = Number(params.get('course') || (courses[0] && courses[0].id));
  const preQuestion = params.get('q') || '';
  const history = [];

  view.innerHTML = `
    <div class="ai-intro">
      <h3>💬 AI 讲题 · 苏格拉底式引导</h3>
      <p>不直接给答案,而是像学长学姐一样一步步提问引导你思考。贴入题目或描述你的疑问,开始对话。</p>
    </div>
    <div class="chat-layout">
      <div>
        <div class="card" style="padding:14px">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">当前课程</div>
          <div class="chat-courses">
            ${courses.map(c => `<button class="course-opt ${c.id === preCourse ? 'active' : ''}" data-id="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}
          </div>
          <div class="socratic-note">💡 提示:提问时尽量给出题目条件;AI 会先引导你思考,如果确实卡住,可以告诉它"我实在想不出来,请逐步讲解"。</div>
        </div>
      </div>
      <div class="chat-box">
        <div class="chat-msgs" id="chat-msgs">
          <div class="msg ai">你好,我是你的 AI 学习伙伴 👋<br>把题目或不懂的知识点发给我,我会引导你一步步想明白,而不是直接给答案。</div>
        </div>
        <div class="chat-input-row">
          <textarea id="chat-input" placeholder="输入题目或问题,Enter 发送,Shift+Enter 换行"></textarea>
          <button class="btn" id="chat-send">发送</button>
        </div>
      </div>
    </div>`;

  let currentCourse = preCourse;
  view.querySelectorAll('.course-opt').forEach(b => {
    b.onclick = () => {
      view.querySelectorAll('.course-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentCourse = Number(b.dataset.id);
    };
  });

  const msgs = document.getElementById('chat-msgs');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  if (preQuestion) input.value = preQuestion;

  const appendMsg = (text, role) => {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  };

  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    appendMsg(text, 'user');
    history.push({ role: 'user', content: text });
    const loading = appendMsg('AI 思考中…', 'loading');
    send.disabled = true;
    try {
      const res = await API.post('/ai/tutor', { courseId: currentCourse, history });
      loading.remove();
      appendMsg(res.reply, 'ai');
      history.push({ role: 'assistant', content: res.reply });
    } catch (e) {
      loading.remove();
      appendMsg('⚠️ ' + e.message, 'ai');
    } finally {
      send.disabled = false;
      input.focus();
    }
  };
  send.onclick = doSend;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  input.focus();
}

/* ---------------- 模拟卷 ---------------- */
async function renderMockExamPage(view) {
  const courses = await ensureCourses();
  view.innerHTML = `
    <div class="card exam-intro">
      <div class="big">📝</div>
      <h2>AI 考前冲刺模拟卷</h2>
      <p>选择课程与题数,DeepSeek 依据课程大纲自动组卷。建议完成诊断后再生成,AI 会更侧重你的薄弱知识点。</p>
      <div class="exam-config">
        <div class="grid grid-2">
          <div class="field"><label>课程</label>
            <select class="select" id="exam-course">${courses.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>题数</label>
            <select class="select" id="exam-count"><option value="5">5 题(快速)</option><option value="10" selected>10 题(标准)</option><option value="15">15 题(强化)</option></select>
          </div>
        </div>
        <div class="field"><label>侧重薄弱点 <span style="font-weight:400;color:var(--muted)">(可选,默认自动)</span></label>
          <div id="exam-kps" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        </div>
        <button class="btn btn-block" id="exam-generate">✨ 生成模拟卷</button>
        ${state.aiStatus && !state.aiStatus.configured ? `<div style="margin-top:10px;font-size:12.5px;color:var(--amber)">⚠️ 未配置 DEEPSEEK_API_KEY,将生成内置演示卷。</div>` : ''}
      </div>
    </div>
    <div id="exam-result" style="margin-top:18px"></div>`;

  const kpBox = document.getElementById('exam-kps');
  const refreshKps = () => {
    const cid = Number(document.getElementById('exam-course').value);
    const kps = state.kpMap[cid] || [];
    kpBox.innerHTML = kps.map(k => `<label style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;background:var(--gray-soft);padding:5px 10px;border-radius:999px;cursor:pointer">
      <input type="checkbox" value="${k.id}"> ${esc(k.name)}
    </label>`).join('');
  };
  document.getElementById('exam-course').onchange = refreshKps;
  refreshKps();

  document.getElementById('exam-generate').onclick = async () => {
    const btn = document.getElementById('exam-generate');
    const box = document.getElementById('exam-result');
    btn.disabled = true; btn.textContent = '📝 组卷中,约需 15-40 秒…';
    box.innerHTML = `<div class="loading-block"><div class="spinner"></div>DeepSeek 正在为你生成模拟卷…</div>`;
    try {
      const kpIds = Array.from(document.querySelectorAll('#exam-kps input:checked')).map(i => Number(i.value));
      const res = await API.post('/ai/mock-exam', {
        courseId: Number(document.getElementById('exam-course').value),
        kpIds,
        count: Number(document.getElementById('exam-count').value)
      });
      box.innerHTML = `
        <div class="card" style="padding:8px 8px 18px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 0;flex-wrap:wrap;gap:8px">
            <div style="font-weight:800;font-size:17px">📝 ${esc(res.courseName)} 考前模拟卷(${res.questions.length} 题)</div>
            <button class="btn btn-sm btn-secondary" id="exam-regen">↻ 重出卷</button>
          </div>
          <div style="padding:0 16px">${res.questions.map((q, i) => renderAiQuestionCard(q, i)).join('')}</div>
        </div>`;
      document.getElementById('exam-regen').onclick = () => document.getElementById('exam-generate').click();
      bindAiReveals(box);
      box.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      box.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><div>${esc(e.message)}</div></div>`;
    } finally {
      btn.disabled = false; btn.textContent = '✨ 生成模拟卷';
    }
  };
}
