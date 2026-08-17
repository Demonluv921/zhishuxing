// ===== 智刷星 · 静态版主逻辑 =====
const SEED = typeof __SEED_COURSES__ !== 'undefined' ? __SEED_COURSES__ : [];
const state = { user: null, courses: [], quiz: null, practice: null, aiStatus: { configured: false } };
window.__STATE__ = state; // 便于调试与自动化测试

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', route);

function init() {
  state.courses = buildCourses(SEED);
  state.user = Store.session.get();
  state.aiStatus.configured = DeepSeekClient.isConfigured();
  if (state.user) showApp(); else showLogin();
}

// 把 seed 数据(知识点名/题)转为带 id 的结构
function buildCourses(seed) {
  return seed.map(c => {
    const kps = c.kps.map((k, i) => ({ ...k, id: i + 1, sort_order: i }));
    const kpIdByName = {};
    kps.forEach(k => { kpIdByName[k.name] = k.id; });
    const questions = c.questions.map((q, i) => ({
      ...q,
      id: i + 1,
      courseId: 0,
      kpIds: q.kps.map(name => kpIdByName[name]).filter(Boolean)
    }));
    return { ...c, id: 0, kps, questions, edges: c.edges || [] };
  }).map((c, i) => ({
    ...c,
    id: i + 1,
    questions: c.questions.map(q => ({ ...q, courseId: i + 1 }))
  }));
}

function kpName(course, id) {
  const kp = (course.kps || []).find(k => k.id === id);
  return kp ? kp.name : '综合';
}

/* ================= 登录 / 注册 ================= */
function showLogin() {
  const root = document.getElementById('app-root');
  root.className = 'login-wrap';
  root.innerHTML = `
    <div class="login-card">
      <div class="login-logo">✨</div>
      <div class="login-title">智刷星</div>
      <div class="login-sub">AI 专业课智能刷题平台 · 华中科技大学创客训练营</div>
      <div class="tabs"><button id="tab-login" class="active">登录</button><button id="tab-register">注册</button></div>
      <div id="login-form">
        <div class="field"><label>账号(学号/邮箱)</label><input class="input" id="login-account" placeholder="学号或邮箱"></div>
        <div class="field"><label>密码</label><input class="input" type="password" id="login-password" placeholder="输入密码"></div>
        <div class="error-text" id="login-error"></div>
        <button class="btn btn-block" id="login-btn">进入学习台</button>
      </div>
      <div id="register-form" class="hidden">
        <div class="field"><label>姓名</label><input class="input" id="reg-name" placeholder="你的姓名"></div>
        <div class="field"><label>账号(学号/邮箱)</label><input class="input" id="reg-account" placeholder="学号或邮箱"></div>
        <div class="field"><label>密码(至少 6 位)</label><input class="input" type="password" id="reg-password" placeholder="设置密码"></div>
        <div class="error-text" id="register-error"></div>
        <button class="btn btn-block" id="register-btn">注册并开始学习</button>
      </div>
      <div class="login-tip">数据保存在本浏览器(localStorage),换设备或清缓存会丢失;AI 功能需在设置中填写 DeepSeek API Key</div>
    </div>`;
  document.getElementById('tab-login').onclick = () => switchAuthTab(true);
  document.getElementById('tab-register').onclick = () => switchAuthTab(false);
  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('register-btn').onclick = doRegister;
}

function switchAuthTab(isLogin) {
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
  const user = Store.users.find(account);
  if (!user) { err.textContent = '账号不存在,请先注册'; err.style.display = 'block'; return; }
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passHash) { err.textContent = '密码错误'; err.style.display = 'block'; return; }
  state.user = user;
  Store.session.set({ id: user.id, name: user.name, account: user.account });
  showApp();
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const account = document.getElementById('reg-account').value.trim();
  const password = document.getElementById('reg-password').value;
  const err = document.getElementById('register-error');
  err.style.display = 'none';
  if (!name || !account || password.length < 6) { err.textContent = '请填写完整信息,密码至少 6 位'; err.style.display = 'block'; return; }
  if (Store.users.find(account)) { err.textContent = '该账号已注册'; err.style.display = 'block'; return; }
  const salt = randomSalt();
  const user = { id: Date.now() % 1000000000, name, account, salt, passHash: await hashPassword(password, salt) };
  Store.users.add(user);
  state.user = user;
  Store.session.set({ id: user.id, name: user.name, account: user.account });
  toast('注册成功,欢迎使用智刷星!', 'success');
  showApp();
}

/* ================= 应用壳 ================= */
function showApp() {
  const root = document.getElementById('app-root');
  root.className = '';
  root.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-icon">✨</span><div><div class="brand-name">智刷星</div><div class="brand-sub">AI 学习伙伴</div></div></div>
      <nav class="nav">
        <a href="#/dashboard" class="nav-item" data-nav="dashboard"><span>🏠</span> 学习台</a>
        <a href="#/courses" class="nav-item" data-nav="courses"><span>📚</span> 全部课程</a>
        <a href="#/history" class="nav-item" data-nav="history"><span>📊</span> 诊断记录</a>
        <a href="#/ai" class="nav-item" data-nav="ai"><span>🤖</span> AI 出题</a>
        <a href="#/tutor" class="nav-item" data-nav="tutor"><span>💬</span> AI 讲题</a>
        <a href="#/mock-exam" class="nav-item" data-nav="mock-exam"><span>📝</span> 模拟卷</a>
        <a href="#/about" class="nav-item" data-nav="about"><span>📋</span> 关于项目</a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-chip"><div class="avatar" id="user-avatar">学</div><div class="user-meta"><div id="user-name">同学</div><div>本机账号</div></div></div>
        <button class="btn btn-ghost btn-sm full" id="settings-btn">⚙️ AI 设置</button>
        <button class="btn btn-ghost btn-sm full" id="logout-btn">退出登录</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div><h1 id="page-title">学习台</h1><p id="page-subtitle">期末复习的 AI 智能伙伴</p></div>
        <div class="topbar-right"><span class="ai-badge" id="ai-status"></span></div>
      </header>
      <div id="view" class="view"></div>
    </main>`;
  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-avatar').textContent = state.user.name.slice(0, 1);
  document.getElementById('logout-btn').onclick = () => { Store.session.clear(); location.hash = ''; showLogin(); };
  document.getElementById('settings-btn').onclick = openSettings;
  refreshAiBadge();
  if (!location.hash) location.hash = '#/dashboard';
  route();
}

function refreshAiBadge() {
  const badge = document.getElementById('ai-status');
  if (!badge) return;
  state.aiStatus.configured = DeepSeekClient.isConfigured();
  badge.className = 'ai-badge' + (state.aiStatus.configured ? '' : ' off');
  badge.innerHTML = state.aiStatus.configured
    ? '<span class="dot"></span> DeepSeek 已接入'
    : '<span class="dot"></span> AI 未配置(内置题库模式)';
}

function openSettings() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>⚙️ AI 设置(DeepSeek)</h3>
      <p class="modal-desc">在 <a href="https://platform.deepseek.com/" target="_blank" rel="noopener">platform.deepseek.com</a> 注册并创建 API Key。Key 仅保存在<b>本机浏览器</b>,直接调用 DeepSeek 官方接口,不经过任何中间服务器。</p>
      <div class="field"><label>DeepSeek API Key</label><input class="input" id="ds-key" type="password" placeholder="sk-..."></div>
      <div class="field"><label>模型</label><select class="select" id="ds-model"><option value="deepseek-chat">deepseek-chat(推荐)</option><option value="deepseek-reasoner">deepseek-reasoner(R1 深度思考)</option></select></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" id="ds-cancel">取消</button>
        <button class="btn btn-sm" id="ds-save">保存</button>
      </div>
      <div class="error-text" id="ds-error"></div>
    </div>`;
  overlay.querySelector('#ds-key').value = Store.ai.getKey();
  document.body.appendChild(overlay);
  overlay.querySelector('#ds-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#ds-save').onclick = () => {
    const key = overlay.querySelector('#ds-key').value.trim();
    if (key && !/^sk-/.test(key)) {
      overlay.querySelector('#ds-error').textContent = 'Key 格式应为 sk- 开头';
      overlay.querySelector('#ds-error').style.display = 'block';
      return;
    }
    Store.ai.setKey(key);
    overlay.remove();
    refreshAiBadge();
    toast(key ? 'DeepSeek 已接入 ✓' : '已清除 Key', key ? 'success' : 'info');
  };
}

/* ================= 路由 ================= */
const PAGES = {
  dashboard: { title: '学习台', sub: '期末复习的 AI 智能伙伴' },
  courses: { title: '全部课程', sub: '选择课程,开始诊断与练习' },
  history: { title: '诊断记录', sub: '回顾每一次诊断与成长' },
  ai: { title: 'AI 出题', sub: 'DeepSeek 大模型实时生成专属题目' },
  tutor: { title: 'AI 讲题', sub: '苏格拉底式引导,理解而非死记' },
  'mock-exam': { title: '考前冲刺模拟卷', sub: 'AI 根据你的薄弱点智能组卷' },
  about: { title: '关于项目', sub: '创客竞赛选题:智刷队' }
};

function route() {
  if (!state.user) return;
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const parts = hash.split('?')[0].split('/');
  const page = parts[0];
  const meta = PAGES[page];
  if (meta) {
    document.getElementById('page-title').textContent = meta.title;
    document.getElementById('page-subtitle').textContent = meta.sub;
  }
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
  const view = document.getElementById('view');
  view.innerHTML = '<div class="loading-block"><div class="spinner"></div>加载中…</div>';
  try {
    if (page === 'dashboard') renderDashboard(view);
    else if (page === 'courses') renderCourses(view);
    else if (page === 'history') renderHistory(view);
    else if (page === 'ai') renderAiPage(view);
    else if (page === 'tutor') renderTutorPage(view);
    else if (page === 'mock-exam') renderMockExamPage(view);
    else if (page === 'about') renderAbout(view);
    else if (page === 'diagnostic') renderDiagnostic(view, Number(parts[1]));
    else if (page === 'result') renderResult(view, Number(parts[1]));
    else if (page === 'practice') renderPractice(view, Number(parts[1]), Number(parts[2] || 0));
    else if (page === 'course') renderCourseDetail(view, Number(parts[1]));
    else view.innerHTML = '<div class="empty"><div class="emoji">🧭</div>页面不存在</div>';
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><div>${esc(e.message)}</div></div>`;
  }
}

function userData() {
  return Store.userData.read(state.user.id);
}

function saveUserData(data) {
  Store.userData.save(state.user.id, data);
}

/* ================= 学习台 ================= */
function renderDashboard(view) {
  const data = userData();
  const practice = data.practice || [];
  const correct = practice.filter(a => a.correct).length;
  const acc = practice.length ? Math.round(correct / practice.length * 100) : 0;
  const latest = (data.results || []).slice().sort((a, b) => b.id - a.id)[0];
  const kpAcc = {};
  for (const c of state.courses) for (const a of practice) {
    if (!c.questions.some(q => q.id === a.questionId)) continue;
    for (const kpId of a.kpIds || []) {
      kpAcc[kpId] = kpAcc[kpId] || { n: 0, c: 0, name: kpName(c, kpId) };
      kpAcc[kpId].n++;
      if (a.correct) kpAcc[kpId].c++;
    }
  }
  const weakKps = Object.values(kpAcc).filter(s => s.c / s.n < 0.6).sort((a, b) => a.c / a.n - b.c / b.n).slice(0, 6);

  view.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat-card"><div class="stat-icon" style="background:var(--brand-soft)">📝</div><div><div class="stat-value">${practice.length}</div><div class="stat-label">累计刷题</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--green-soft)">🎯</div><div><div class="stat-value">${acc}%</div><div class="stat-label">正确率</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--amber-soft)">🧪</div><div><div class="stat-value">${(data.results || []).length}</div><div class="stat-label">完成诊断</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:#faf5ff">🤖</div><div><div class="stat-value">${(data.ai || []).length}</div><div class="stat-label">AI 生成题目</div></div></div>
    </div>
    <div class="section-title">📊 近期概况</div>
    ${latest ? `
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><div style="font-weight:700;font-size:16px">${esc(latest.courseName)} · 最近诊断</div><div style="font-size:12.5px;color:var(--muted);margin-top:2px">${fmtTime(latest.createdAt)}</div></div>
        <div style="text-align:right"><div class="mini-score" style="color:${latest.score >= 75 ? 'var(--green)' : latest.score >= 55 ? 'var(--amber)' : 'var(--red)'}">${latest.score} 分</div><div style="font-size:12px;color:var(--muted)">${latest.correctCount}/${latest.totalCount} 题正确</div></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-secondary btn-sm" href="#/result/${latest.id}">查看诊断报告</a><a class="btn btn-sm" href="#/practice/${latest.courseId}">针对练习</a></div></div>` : `
      <div class="card"><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div style="font-size:38px">🧪</div><div style="flex:1"><div style="font-weight:700;font-size:16px">还没有诊断记录</div><div style="font-size:13px;color:var(--muted);margin-top:2px">做一次 10 题的知识点诊断,AI 帮你找到薄弱点并规划复习路径</div></div><a class="btn" href="#/courses">开始诊断</a></div></div>`}
    <div class="section-title">⚠️ 薄弱知识点(基于练习记录)</div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap">${weakKps.map(k => `<span class="kp-tag">${esc(k.name)}</span>`).join('') || '<span style="color:var(--muted);font-size:13px">暂无薄弱点,继续保持!</span>'}</div></div>
    <div class="section-title">📚 我的课程</div>
    <div class="grid grid-3">${state.courses.map(c => `<div class="card course-card" data-course="${c.id}"><div class="course-icon">${c.icon}</div><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><div class="course-meta"><span>${c.kps.length} 知识点</span><span>${c.questions.length} 道内置题</span></div></div>`).join('')}</div>`;
  view.querySelectorAll('.course-card').forEach(el => { el.onclick = () => location.hash = '#/course/' + el.dataset.course; });
}

/* ================= 课程 ================= */
function renderCourses(view) {
  view.innerHTML = `
    <div class="ai-intro"><h3>🧭 三步开启高效复习</h3><p>① 选择课程 → ② 完成 10 题快速诊断,识别薄弱知识点 → ③ 按推荐路径针对性刷题,遇到难题随时问 AI 讲题</p></div>
    <div class="grid grid-3">${state.courses.map(c => `
      <div class="card course-card" data-course="${c.id}"><div class="course-icon">${c.icon}</div><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p>
      <div class="course-meta"><span>${c.kps.length} 知识点</span><span>${c.questions.length} 道内置题</span></div>
      <div style="margin-top:14px;display:flex;gap:8px"><button class="btn btn-sm btn-secondary diag-btn" data-id="${c.id}">开始诊断</button><button class="btn btn-sm btn-ghost practice-btn" data-id="${c.id}">直接刷题</button></div></div>`).join('')}</div>`;
  view.querySelectorAll('.diag-btn').forEach(b => b.onclick = () => location.hash = '#/diagnostic/' + b.dataset.id);
  view.querySelectorAll('.practice-btn').forEach(b => b.onclick = () => location.hash = '#/practice/' + b.dataset.id);
}

function renderCourseDetail(view, courseId) {
  const c = state.courses.find(x => x.id === courseId);
  if (!c) throw new Error('课程不存在');
  const data = userData();
  const latest = (data.results || []).filter(r => r.courseId === courseId).sort((a, b) => b.id - a.id)[0];
  view.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:18px">
      <div style="font-size:44px">${c.icon}</div>
      <div style="flex:1;min-width:220px"><h2 style="font-size:20px">${esc(c.name)}</h2><p style="color:var(--muted);font-size:13px;margin-top:2px">${esc(c.description)}</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="location.hash='#/diagnostic/${c.id}'">🧪 开始诊断</button><a class="btn btn-secondary" href="#/practice/${c.id}">📝 刷题练习</a><a class="btn btn-ghost" href="#/ai?course=${c.id}">🤖 AI 出题</a></div>
    </div>
    <div class="section-title">🗺️ 课程知识图谱</div>
    <div class="card" id="graph-box"></div>
    <div class="section-title">📌 知识点清单</div>
    <div class="grid grid-2">${c.kps.map(kp => `<div class="card" style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px"><div><div style="font-weight:600">${esc(kp.name)}</div><div style="font-size:12px;color:var(--muted)">权重 ${kp.weight}</div></div><a class="btn btn-sm btn-ghost" href="#/practice/${c.id}/${kp.id}">专项练习</a></div>`).join('')}</div>`;
  const practiceStats = {};
  for (const a of data.practice || []) {
    if (!c.questions.some(q => q.id === a.questionId)) continue;
    for (const kpId of a.kpIds || []) {
      practiceStats[kpId] = practiceStats[kpId] || { kp_id: kpId, acc: 0, n: 0 };
      practiceStats[kpId].n++;
      practiceStats[kpId].acc += a.correct ? 1 : 0;
    }
  }
  Object.values(practiceStats).forEach(s => s.acc = s.acc / s.n);
  renderKnowledgeGraph(document.getElementById('graph-box'), c, latest ? latest.mastery : null, Object.values(practiceStats));
}

/* ================= 诊断 ================= */
function renderDiagnostic(view, courseId) {
  const course = state.courses.find(x => x.id === courseId);
  if (!course) throw new Error('课程不存在');
  const all = course.questions.map((q, i) => ({ ...q, seq: i }));
  const picked = [];
  const covered = new Set();
  // 贪心全覆盖 + 随机补齐
  while (picked.length < 10 && all.length) {
    let best = null, gain = -1;
    for (const q of all) {
      if (picked.includes(q)) continue;
      const g = q.kpIds.filter(id => !covered.has(id)).length;
      if (g > gain) { gain = g; best = q; }
    }
    if (best && gain > 0 && picked.length < Math.min(course.kps.length, 8)) {
      picked.push(best);
      best.kpIds.forEach(id => covered.add(id));
    } else {
      const rest = all.filter(q => !picked.includes(q));
      if (!rest.length) break;
      const q = rest[Math.floor(Math.random() * rest.length)];
      picked.push(q);
      q.kpIds.forEach(id => covered.add(id));
    }
  }
  state.quiz = { courseId, questions: picked.slice(0, 10), index: 0, answers: [] };
  renderQuizStep(view, course);
}

function renderQuizStep(view, course) {
  const qz = state.quiz;
  if (qz.index >= qz.questions.length) { finishDiagnostic(); return; }
  const q = qz.questions[qz.index];
  view.innerHTML = `
    <div class="quiz-wrap">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><a class="btn btn-sm btn-ghost" href="#/course/${course.id}">← 返回</a><div style="font-weight:700;font-size:15px">${course.icon} ${esc(course.name)} · 知识点诊断</div></div>
      <div class="quiz-progress"><div class="progress-track"><div class="progress-fill" style="width:${(qz.index / 10 * 100).toFixed(0)}%"></div></div><div class="quiz-count">${qz.index + 1} / 10</div></div>
      <div class="quiz-card">
        <div class="quiz-kp-tags">${q.kpIds.map(id => `<span class="kp-tag">${esc(kpName(course, id))}</span>`).join('')}</div>
        <div class="quiz-stem">${esc(q.stem)}</div>
        ${q.options.map((opt, i) => `<div class="option" data-index="${i}"><span class="opt-letter">${String.fromCharCode(65 + i)}.</span><span>${esc(opt)}</span></div>`).join('')}
        <button class="btn btn-block" id="quiz-next" disabled>确认作答,下一题</button>
      </div>
    </div>`;
  let selected = null;
  view.querySelectorAll('.option').forEach(el => {
    el.onclick = () => {
      view.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      selected = Number(el.dataset.index);
      document.getElementById('quiz-next').disabled = false;
    };
  });
  document.getElementById('quiz-next').onclick = () => {
    qz.answers.push({ questionId: q.id, selected, kpIds: q.kpIds, correct: selected === q.correctIndex });
    qz.index++;
    renderQuizStep(view, course);
  };
}

function finishDiagnostic() {
  const qz = state.quiz;
  const course = state.courses.find(c => c.id === qz.courseId);
  const result = diagnoseAnswers(course, {}, qz.answers);
  const data = userData();
  const record = {
    id: Date.now(),
    courseId: qz.courseId,
    courseName: course.name,
    createdAt: new Date().toISOString(),
    ...result
  };
  data.results = data.results || [];
  data.results.push(record);
  saveUserData(data);
  state.quiz = null;
  toast('诊断完成!正在生成分析报告…', 'success');
  location.hash = '#/result/' + record.id;
}

/* ================= 诊断结果 ================= */
function renderResult(view, resultId) {
  const data = userData();
  const r = (data.results || []).find(x => x.id === resultId);
  if (!r) throw new Error('诊断记录不存在');
  const course = state.courses.find(c => c.id === r.courseId);
  const levelCls = r.score >= 75 ? 'level-good' : r.score >= 55 ? 'level-mid' : 'level-low';
  const levelText = r.score >= 75 ? '掌握良好' : r.score >= 55 ? '有待加强' : '需要强化';
  const ringColor = r.score >= 75 ? '#059669' : r.score >= 55 ? '#d97706' : '#dc2626';
  const circumference = 2 * Math.PI * 62;
  const weakList = (r.report.weakPoints || []).map((w, i) => `
    <li><span class="path-index">${i + 1}</span><div style="flex:1"><div style="font-weight:600">${esc(w.name)} <span style="color:var(--red);font-weight:800">${w.score} 分</span></div><div class="path-reason">掌握度偏低${w.evidence ? `,基于 ${w.evidence} 道题判定` : ',尚未有足够答题数据'}</div></div><a class="btn btn-sm btn-secondary" href="#/practice/${r.courseId}/${w.id}">去练习</a></li>`).join('') || '<li style="border:none;color:var(--green)">🎉 暂无薄弱点</li>';
  const pathList = (r.report.path || []).map((p, i) => `<li><span class="path-index">${i + 1}</span><div style="flex:1"><div style="font-weight:600">${esc(p.name)}</div><div class="path-reason">${esc(p.reason)}</div></div><a class="btn btn-sm btn-ghost" href="#/practice/${r.courseId}/${p.id}">练习</a></li>`).join('');
  view.innerHTML = `
    <div style="max-width:980px;margin:0 auto">
      <div class="card result-hero">
        <div class="score-ring"><svg width="150" height="150"><circle cx="75" cy="75" r="62" fill="none" stroke="#eef0f6" stroke-width="12"/><circle cx="75" cy="75" r="62" fill="none" stroke="${ringColor}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - r.score / 100)}"/></svg><div class="score-text"><span class="num">${r.score}</span><span class="unit">总分 100</span></div></div>
        <span class="level-pill ${levelCls}">${levelText}</span>
        <div class="result-summary">${esc(r.report.summary || '')}</div>
        <div style="margin-top:14px;font-size:12.5px;color:var(--muted)">${fmtTime(r.createdAt)} · ${esc(r.courseName)} · 答对 ${r.correctCount}/${r.totalCount} 题</div>
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn" href="#/practice/${r.courseId}">📝 开始针对性刷题</a><a class="btn btn-secondary" href="#/ai?course=${r.courseId}">🤖 AI 生成强化题</a><button class="btn btn-ghost" id="redo-btn">🔄 重新诊断</button></div>
      </div>
      <div class="section-title">🗺️ 知识点掌握图谱</div><div class="card" id="graph-box"></div>
      <div class="section-title">🩹 薄弱知识点</div><ul class="path-list">${weakList}</ul>
      <div class="section-title">🧭 个性化复习路径</div><div class="card"><ul class="path-list" style="margin-top:0">${pathList || '<li>暂无推荐路径,可先做一次练习</li>'}</ul></div>
    </div>`;
  document.getElementById('redo-btn').onclick = () => location.hash = '#/diagnostic/' + r.courseId;
  renderKnowledgeGraph(document.getElementById('graph-box'), course, r.mastery, []);
}

/* ================= 练习 ================= */
function renderPractice(view, courseId, kpId) {
  const course = state.courses.find(c => c.id === courseId);
  if (!course) throw new Error('课程不存在');
  const pool = kpId ? course.questions.filter(q => q.kpIds.includes(kpId)) : course.questions;
  if (!pool.length) { view.innerHTML = `<div class="empty"><div class="emoji">📭</div>该知识点暂无题目,试试 <a href="#/ai?course=${courseId}${kpId ? '&kp=' + kpId : ''}">AI 出题</a></div>`; return; }
  const questions = shuffle(pool).slice(0, kpId ? 8 : 12).map(q => ({ ...q, selected: null, done: false }));
  state.practice = { courseId, kpId, questions, index: 0 };
  renderPracticeQuestion(view, course);
}

function renderPracticeQuestion(view, course) {
  const p = state.practice;
  const q = p.questions[p.index];
  const doneCount = p.questions.filter(x => x.done).length;
  const feedback = q.done ? `
    <div class="feedback-box ${q.selected === q.correctIndex ? 'correct' : 'wrong'}">
      <div class="fb-title">${q.selected === q.correctIndex ? '✅ 回答正确' : '❌ 回答错误'}</div>
      <div>正确答案:${String.fromCharCode(65 + q.correctIndex)}. ${esc(q.options[q.correctIndex])}</div>
      <div style="margin-top:8px;font-size:13.5px">${esc(q.explanation)}</div>
      <div class="fb-actions"><button class="btn btn-sm btn-secondary" id="practice-next">${p.index === p.questions.length - 1 ? '完成练习' : '下一题 →'}</button><button class="btn btn-sm btn-ghost" id="practice-ai">🤖 问 AI 讲解</button></div>
    </div>` : '';
  view.innerHTML = `
    <div class="practice-layout"><div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap"><a class="btn btn-sm btn-ghost" href="#/course/${p.courseId}">← ${course.icon} ${esc(course.name)}</a>${p.kpId ? `<span class="kp-tag">${esc(kpName(course, p.kpId))}</span>` : '<span class="kp-tag">综合练习</span>'}<span style="font-size:13px;color:var(--muted)">已答 ${doneCount}/${p.questions.length}</span></div>
      <div class="card" style="padding:26px">
        <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:8px">第 ${p.index + 1} 题 · ${difficultyText(q.difficulty)}</div>
        <div class="quiz-stem" style="margin-bottom:18px">${esc(q.stem)}</div>
        ${q.options.map((opt, i) => {
          let cls = 'option';
          if (q.done) {
            if (i === q.correctIndex) cls += ' reveal-correct';
            if (i === q.selected && q.selected !== q.correctIndex) cls += ' wrong';
          }
          return `<div class="${cls}" data-index="${i}" ${q.done ? 'style="pointer-events:none"' : ''}><span class="opt-letter">${String.fromCharCode(65 + i)}.</span><span>${esc(opt)}</span></div>`;
        }).join('')}
        ${!q.done ? '<button class="btn btn-block" id="practice-submit" disabled>提交答案</button>' : feedback}
      </div></div>
      <div><div class="card" style="position:sticky;top:20px"><div style="font-weight:700;margin-bottom:12px">答题进度</div>
        <div class="qnav">${p.questions.map((qq, i) => `<button class="${qq.done ? (qq.selected === qq.correctIndex ? 'done-correct' : 'done-wrong') : ''} ${i === p.index ? 'current' : ''}" data-i="${i}">${i + 1}</button>`).join('')}</div>
        <div style="margin-top:14px;font-size:12.5px;color:var(--muted)">答错的题会计入薄弱知识点统计,建议结合 AI 出题做专项强化。</div></div></div>
    </div>`;

  if (!q.done) {
    let selected = null;
    view.querySelectorAll('.option').forEach(el => {
      el.onclick = () => {
        view.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        selected = Number(el.dataset.index);
        document.getElementById('practice-submit').disabled = false;
      };
    });
    document.getElementById('practice-submit').onclick = () => {
      q.selected = selected;
      q.done = true;
      recordPractice(q);
      renderPracticeQuestion(view, course);
    };
  } else {
    document.getElementById('practice-next').onclick = () => {
      if (p.index === p.questions.length - 1) {
        toast('练习完成!继续加油 💪', 'success');
        location.hash = p.kpId ? '#/course/' + p.courseId : '#/dashboard';
      } else { p.index++; renderPracticeQuestion(view, course); }
    };
    document.getElementById('practice-ai').onclick = () => location.hash = '#/tutor?course=' + p.courseId + '&q=' + encodeURIComponent(q.stem);
  }
  view.querySelectorAll('.qnav button').forEach(b => { b.onclick = () => { p.index = Number(b.dataset.i); renderPracticeQuestion(view, course); }; });
}

function recordPractice(q) {
  const data = userData();
  data.practice = data.practice || [];
  data.practice.push({ questionId: q.id, selected: q.selected, correct: q.selected === q.correctIndex, kpIds: q.kpIds, answeredAt: new Date().toISOString() });
  saveUserData(data);
}

/* ================= 历史 ================= */
function renderHistory(view) {
  const data = userData();
  const results = (data.results || []).slice().sort((a, b) => b.id - a.id);
  if (!results.length) {
    view.innerHTML = `<div class="empty"><div class="emoji">📭</div>还没有诊断记录<br><a class="btn" style="margin-top:14px" href="#/courses">去完成第一次诊断</a></div>`;
    return;
  }
  view.innerHTML = `<div class="card" style="padding:8px"><table class="table">
    <thead><tr><th>课程</th><th>时间</th><th>得分</th><th>答题</th><th>薄弱点</th><th></th></tr></thead>
    <tbody>${results.map(r => `<tr>
      <td>${state.courses.find(c => c.id === r.courseId)?.icon || '📘'} ${esc(r.courseName)}</td>
      <td style="color:var(--muted)">${fmtTime(r.createdAt)}</td>
      <td><span class="mini-score" style="color:${r.score >= 75 ? 'var(--green)' : r.score >= 55 ? 'var(--amber)' : 'var(--red)'}">${r.score}</span></td>
      <td>${r.correctCount}/${r.totalCount}</td>
      <td style="max-width:260px">${(r.report.weakPoints || []).slice(0, 2).map(w => `<span class="kp-tag">${esc(w.name)}</span>`).join('') || '<span style="color:var(--muted)">无</span>'}</td>
      <td><a class="btn btn-sm btn-secondary" href="#/result/${r.id}">查看报告</a></td></tr>`).join('')}</tbody></table></div>`;
}

/* ================= AI 出题 ================= */
function renderAiPage(view) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preCourse = Number(params.get('course') || 0);
  const preKp = Number(params.get('kp') || 0);
  view.innerHTML = `
    <div class="ai-intro"><h3>🤖 DeepSeek 大模型实时出题</h3><p>选择课程、难度与数量,AI 依据课程大纲与薄弱知识点即时生成带详细解析的原创题目。首次使用请先在左下角"AI 设置"填入 API Key。</p></div>
    <div class="card" style="margin-bottom:18px">
      <div class="grid grid-4">
        <div class="field"><label>课程</label><select class="select" id="ai-course">${state.courses.map(c => `<option value="${c.id}" ${c.id === preCourse ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>知识点</label><select class="select" id="ai-kp"><option value="0">综合(自动选择)</option></select></div>
        <div class="field"><label>难度</label><select class="select" id="ai-difficulty"><option value="easy">基础</option><option value="medium" selected>中等</option><option value="hard">较难</option></select></div>
        <div class="field"><label>题数</label><select class="select" id="ai-count"><option value="1">1 题</option><option value="3" selected>3 题</option><option value="5">5 题</option></select></div>
      </div>
      <button class="btn" id="ai-generate" style="width:100%">⚡ 让 DeepSeek 生成题目</button>
      ${!state.aiStatus.configured ? '<div style="margin-top:10px;font-size:12.5px;color:var(--amber)">⚠️ 尚未配置 DeepSeek API Key,当前返回内置演示题。点击左下角"AI 设置"填入 Key 后即为真实 DeepSeek 出题。</div>' : ''}
    </div>
    <div id="ai-result"><div class="empty"><div class="emoji">🎯</div>生成的题目会显示在这里</div></div>`;

  const kpSelect = document.getElementById('ai-kp');
  const refreshKps = () => {
    const cid = Number(document.getElementById('ai-course').value);
    const course = state.courses.find(c => c.id === cid);
    kpSelect.innerHTML = '<option value="0">综合(自动选择)</option>' + (course.kps || []).map(k => `<option value="${k.id}" ${k.id === preKp ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
  };
  document.getElementById('ai-course').onchange = refreshKps;
  refreshKps();

  document.getElementById('ai-generate').onclick = async () => {
    const btn = document.getElementById('ai-generate');
    const box = document.getElementById('ai-result');
    btn.disabled = true; btn.textContent = '🤖 DeepSeek 生成中,约需 10-30 秒…';
    box.innerHTML = '<div class="loading-block"><div class="spinner"></div>大模型正在为你出题,请稍候…</div>';
    try {
      const cid = Number(document.getElementById('ai-course').value);
      const course = state.courses.find(c => c.id === cid);
      const kpId = Number(kpSelect.value) || undefined;
      const kpNameSel = kpId ? course.kps.find(k => k.id === kpId)?.name : undefined;
      const questions = await DeepSeekClient.generateQuestions({
        courseName: course.name, courseOutline: course.outline, kpName: kpNameSel,
        difficulty: document.getElementById('ai-difficulty').value,
        count: Number(document.getElementById('ai-count').value)
      });
      const data = userData();
      data.ai = data.ai || [];
      questions.forEach(q => data.ai.push({ ...q, courseId: cid, createdAt: new Date().toISOString() }));
      saveUserData(data);
      box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px"><div style="font-weight:700">🎉 生成完成 <span style="font-size:12px;color:var(--muted);font-weight:400">(deepseek-chat · DeepSeek)</span></div><button class="btn btn-sm btn-secondary" id="ai-regen">↻ 再生成一组</button></div><div id="ai-list">${questions.map(renderAiQuestionCard).join('')}</div>`;
      document.getElementById('ai-regen').onclick = () => document.getElementById('ai-generate').click();
      bindAiReveals(box);
    } catch (e) {
      box.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><div>${esc(e.message)}</div></div>`;
    } finally {
      btn.disabled = false; btn.textContent = '⚡ 让 DeepSeek 生成题目';
    }
  };
}

function renderAiQuestionCard(q) {
  const diff = q.difficulty || 'medium';
  return `<div class="ai-question" data-correct-index="${q.correctIndex != null ? Number(q.correctIndex) : ''}">
    <div class="ai-q-head"><div class="ai-q-tags"><span class="tag tag-kp">${esc(q.kpName || '综合')}</span><span class="tag tag-diff-${diff}">${difficultyText(diff)}</span><span class="tag" style="background:var(--brand-soft);color:var(--brand-dark)">AI 原创</span></div><button class="btn btn-sm btn-ghost ai-reveal">查看答案与解析</button></div>
    <div class="ai-q-stem">${esc(q.stem)}</div>
    ${(q.options || []).map((opt, i) => `<div class="ai-opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${esc(opt)}</div>`).join('')}
    <div class="ai-explain hidden"><b>💡 解析:</b> ${esc(q.explanation || '暂无解析')}</div></div>`;
}

function bindAiReveals(scope) {
  scope.querySelectorAll('.ai-question').forEach(card => {
    const btn = card.querySelector('.ai-reveal');
    btn.onclick = () => {
      const ci = card.dataset.correctIndex;
      card.querySelectorAll('.ai-opt').forEach((o, i) => o.classList.toggle('correct-opt', ci !== '' && i === Number(ci)));
      card.querySelector('.ai-explain').classList.remove('hidden');
      btn.textContent = '已展示解析';
      btn.disabled = true;
    };
  });
}

/* ================= AI 讲题 ================= */
function renderTutorPage(view) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preCourse = Number(params.get('course') || state.courses[0].id);
  const preQ = params.get('q') || '';
  const history = [];
  view.innerHTML = `
    <div class="ai-intro"><h3>💬 AI 讲题 · 苏格拉底式引导</h3><p>不直接给答案,而是像学长学姐一样一步步提问引导你思考。贴入题目或描述疑问,开始对话。</p></div>
    <div class="chat-layout"><div>
      <div class="card" style="padding:14px"><div style="font-weight:700;font-size:13px;margin-bottom:10px">当前课程</div>
        <div class="chat-courses">${state.courses.map(c => `<button class="course-opt ${c.id === preCourse ? 'active' : ''}" data-id="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
        <div class="socratic-note">💡 提问时尽量给出题目条件;卡住时可以告诉它"我实在想不出来,请逐步讲解"。</div></div></div>
      <div class="chat-box"><div class="chat-msgs" id="chat-msgs"><div class="msg ai">你好,我是你的 AI 学习伙伴 👋<br>把题目或不懂的知识点发给我,我会引导你一步步想明白。</div></div>
        <div class="chat-input-row"><textarea id="chat-input" placeholder="输入题目或问题,Enter 发送,Shift+Enter 换行"></textarea><button class="btn" id="chat-send">发送</button></div></div>
    </div>`;
  let currentCourse = preCourse;
  view.querySelectorAll('.course-opt').forEach(b => {
    b.onclick = () => { view.querySelectorAll('.course-opt').forEach(x => x.classList.remove('active')); b.classList.add('active'); currentCourse = Number(b.dataset.id); };
  });
  const msgs = document.getElementById('chat-msgs');
  const input = document.getElementById('chat-input');
  if (preQ) input.value = preQ;
  const appendMsg = (text, role) => {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  };
  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    appendMsg(text, 'user');
    history.push({ role: 'user', content: text });
    const loading = appendMsg('AI 思考中…', 'loading');
    try {
      const course = state.courses.find(c => c.id === currentCourse);
      const reply = await DeepSeekClient.tutor({ courseName: course.name, question: '', history });
      loading.remove();
      appendMsg(reply, 'ai');
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      loading.remove();
      appendMsg('⚠️ ' + e.message, 'ai');
    }
  };
  document.getElementById('chat-send').onclick = doSend;
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
}

/* ================= 模拟卷 ================= */
function renderMockExamPage(view) {
  view.innerHTML = `
    <div class="card exam-intro"><div class="big">📝</div><h2>AI 考前冲刺模拟卷</h2>
      <p>选择课程与题数,DeepSeek 依据课程大纲自动组卷。建议完成诊断后再生成,AI 会更侧重你的薄弱知识点。</p>
      <div class="exam-config">
        <div class="grid grid-2"><div class="field"><label>课程</label><select class="select" id="exam-course">${state.courses.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>题数</label><select class="select" id="exam-count"><option value="5">5 题(快速)</option><option value="10" selected>10 题(标准)</option><option value="15">15 题(强化)</option></select></div></div>
        <div class="field"><label>侧重薄弱点 <span style="font-weight:400;color:var(--muted)">(可选,默认自动)</span></label><div id="exam-kps" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>
        <button class="btn btn-block" id="exam-generate">✨ 生成模拟卷</button>
        ${!state.aiStatus.configured ? '<div style="margin-top:10px;font-size:12.5px;color:var(--amber)">⚠️ 未配置 DeepSeek API Key,将生成内置演示卷。</div>' : ''}
      </div></div>
    <div id="exam-result" style="margin-top:18px"></div>`;
  const kpBox = document.getElementById('exam-kps');
  const refreshKps = () => {
    const course = state.courses.find(c => c.id === Number(document.getElementById('exam-course').value));
    kpBox.innerHTML = (course.kps || []).map(k => `<label style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;background:var(--gray-soft);padding:5px 10px;border-radius:999px;cursor:pointer"><input type="checkbox" value="${k.id}"> ${esc(k.name)}</label>`).join('');
  };
  document.getElementById('exam-course').onchange = refreshKps;
  refreshKps();
  document.getElementById('exam-generate').onclick = async () => {
    const btn = document.getElementById('exam-generate');
    const box = document.getElementById('exam-result');
    btn.disabled = true; btn.textContent = '📝 组卷中,约需 15-40 秒…';
    box.innerHTML = '<div class="loading-block"><div class="spinner"></div>DeepSeek 正在为你生成模拟卷…</div>';
    try {
      const cid = Number(document.getElementById('exam-course').value);
      const course = state.courses.find(c => c.id === cid);
      const kpIds = Array.from(document.querySelectorAll('#exam-kps input:checked')).map(i => Number(i.value));
      const kpNames = kpIds.map(id => course.kps.find(k => k.id === id)?.name).filter(Boolean);
      const questions = await DeepSeekClient.generateMockExam({ courseName: course.name, courseOutline: course.outline, kpNames, count: Number(document.getElementById('exam-count').value) });
      box.innerHTML = `<div class="card" style="padding:8px 8px 18px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 0;flex-wrap:wrap;gap:8px"><div style="font-weight:800;font-size:17px">📝 ${esc(course.name)} 考前模拟卷(${questions.length} 题)</div><button class="btn btn-sm btn-secondary" id="exam-regen">↻ 重出卷</button></div>
        <div style="padding:0 16px">${questions.map(renderAiQuestionCard).join('')}</div></div>`;
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

/* ================= 关于 ================= */
function renderAbout(view) {
  view.innerHTML = `
    <div class="card" style="max-width:760px;margin:0 auto">
      <h2 style="font-size:20px">📋 关于「智刷星」</h2>
      <p style="color:var(--muted);font-size:14px;margin:10px 0 18px">灵感源自《创客竞赛选题设计报告》—— 智刷队(邓程浩 · 何志浩 · 赵临枫),华中科技大学未来技术学院创客训练营。</p>
      <div class="grid grid-2">
        <div class="card" style="padding:16px"><div style="font-weight:700;margin-bottom:6px">🎯 项目初衷</div><p style="font-size:13px;color:var(--muted)">理工科专业课复习时"题目匮乏、缺乏针对性、遇到难题无人讲解",我们希望用 AI 打造每位同学专属的学习伙伴。</p></div>
        <div class="card" style="padding:16px"><div style="font-weight:700;margin-bottom:6px">🧠 核心机制</div><p style="font-size:13px;color:var(--muted)">知识图谱诊断薄弱点 → 个性化复习路径 → 专项刷题 → AI 苏格拉底式讲题,形成"诊断-练习-理解"闭环。</p></div>
        <div class="card" style="padding:16px"><div style="font-weight:700;margin-bottom:6px">🤖 AI 能力</div><p style="font-size:13px;color:var(--muted)">AI 出题、苏格拉底式讲题、考前模拟卷均由 DeepSeek 大模型实时生成,需在"AI 设置"中配置 API Key。</p></div>
        <div class="card" style="padding:16px"><div style="font-weight:700;margin-bottom:6px">🔒 隐私说明</div><p style="font-size:13px;color:var(--muted)">纯静态站点,无服务器、无数据库:学习数据与 API Key 仅保存在你的浏览器中。</p></div>
      </div>
    </div>`;
}

/* ================= 工具 ================= */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function difficultyText(d) { return ({ easy: '基础', medium: '中等', hard: '较难' })[d] || '中等'; }
function fmtTime(iso) { return String(iso || '').replace('T', ' ').slice(0, 16); }
function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function toast(message, type) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 3000);
}
