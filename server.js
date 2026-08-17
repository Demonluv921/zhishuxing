require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { initDb, getDb } = require('./src/db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./src/auth');
const { diagnose } = require('./src/diagnosis');
const { seedIfEmpty } = require('./src/seed');
const deepseek = require('./src/deepseek');

const app = express();
const PORT = process.env.PORT || 3000;

initDb();
seedIfEmpty();
const db = getDb();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- 鉴权中间件 ---------------- */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '请先登录' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });
  const user = db.prepare('SELECT id, name, student_no, email, role, created_at FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  next();
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* ---------------- 认证接口 ---------------- */
app.post('/api/auth/register', (req, res) => {
  const { name, studentNo, email, password } = req.body || {};
  if (!name || !studentNo || !email || !password) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const exists = db.prepare('SELECT id FROM users WHERE student_no = ? OR email = ?').get(studentNo, email);
  if (exists) return res.status(400).json({ error: '该学号或邮箱已注册' });
  const info = db.prepare(
    'INSERT INTO users (name, student_no, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(name, studentNo, email, hashPassword(password));
  const user = db.prepare('SELECT id, name, student_no, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: signToken(user.id), user });
});

app.post('/api/auth/login', (req, res) => {
  const { account, password } = req.body || {};
  if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const user = db.prepare('SELECT * FROM users WHERE student_no = ? OR email = ?').get(account, account);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const safe = { id: user.id, name: user.name, student_no: user.student_no, email: user.email, role: user.role };
  res.json({ token: signToken(user.id), user: safe });
});

app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));

/* ---------------- 课程与知识点 ---------------- */
app.get('/api/courses', (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, COUNT(DISTINCT q.id) AS question_count, COUNT(DISTINCT k.id) AS kp_count
    FROM courses c
    LEFT JOIN knowledge_points k ON k.course_id = c.id
    LEFT JOIN questions q ON q.course_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `).all();
  res.json({ courses });
});

app.get('/api/courses/:courseId', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.courseId));
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const kps = db.prepare('SELECT * FROM knowledge_points WHERE course_id = ? ORDER BY sort_order').all(course.id);
  res.json({ course, knowledgePoints: kps });
});

/* ---------------- 诊断 ---------------- */
app.get('/api/diagnostics/:courseId/question', authRequired, (req, res) => {
  const courseId = Number(req.params.courseId);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  // 惰性创建本次诊断记录,返回真实 diagnosticId 供后续抽题/提交使用
  let diagnosticId = Number(req.query.diagnosticId || 0);
  if (!diagnosticId) {
    const info = db.prepare('INSERT INTO diagnostics (user_id, course_id, created_at) VALUES (?, ?, ?)')
      .run(req.user.id, courseId, new Date().toISOString());
    diagnosticId = info.lastInsertRowid;
  }
  const taken = db.prepare(
    'SELECT question_id FROM diagnostic_answers WHERE user_id = ? AND diagnostic_id = ?'
  ).all(req.user.id, diagnosticId).map(r => r.question_id);
  const placeholders = taken.length ? taken.map(() => '?').join(',') : '-1';
  let rows = [];
  const kpCount = db.prepare('SELECT COUNT(*) n FROM knowledge_points WHERE course_id = ?').get(courseId).n;
  // 自适应诊断:逐知识点覆盖——先为每个未测知识点各挑 1 题
  const coveredKps = db.prepare(`
    SELECT DISTINCT qk.kp_id FROM question_kps qk
    JOIN questions q ON q.id = qk.question_id
    WHERE q.course_id = ? AND q.id IN (${placeholders})
  `).all(courseId, ...taken).map(r => r.kp_id);
  if (taken.length < Math.min(kpCount, 8)) {
    // 贪心:从未答题目中选"新增覆盖知识点最多"的一题
    const candidates = db.prepare(`
      SELECT q.id, q.stem, q.options FROM questions q
      WHERE q.course_id = ? AND q.id NOT IN (${placeholders})
    `).all(courseId, ...taken);
    const kpsByQ = db.prepare(`
      SELECT qk.question_id, qk.kp_id FROM question_kps qk
      JOIN questions q ON q.id = qk.question_id
      WHERE q.course_id = ?
    `).all(courseId);
    const kpMap = {};
    for (const r of kpsByQ) {
      (kpMap[r.question_id] = kpMap[r.question_id] || []).push(r.kp_id);
    }
    let best = null, bestGain = -1;
    for (const c of candidates) {
      const gain = (kpMap[c.id] || []).filter(id => !coveredKps.includes(id)).length;
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (best && bestGain > 0) rows = [best];
    if (!rows.length) {
      rows = db.prepare(`
        SELECT id, stem, options FROM questions
        WHERE course_id = ? AND id NOT IN (${placeholders})
        ORDER BY RANDOM() LIMIT 1
      `).all(courseId, ...taken);
    }
  } else {
    rows = db.prepare(`
      SELECT id, stem, options FROM questions
      WHERE course_id = ? AND id NOT IN (${placeholders})
      ORDER BY RANDOM() LIMIT 1
    `).all(courseId, ...taken);
  }
  if (!rows.length) return res.json({ done: true });
  const q = rows[0];
  // 立即登记已抽取的题目,保证同一次诊断中不会重复出题
  db.prepare(`
    INSERT OR IGNORE INTO diagnostic_answers (user_id, diagnostic_id, question_id, selected, is_correct, answered_at)
    VALUES (?, ?, ?, NULL, NULL, ?)
  `).run(req.user.id, diagnosticId, q.id, new Date().toISOString());
  res.json({ done: false, diagnosticId, question: { id: q.id, stem: q.stem, options: JSON.parse(q.options), kpIds: getQuestionKps(q.id) } });
});

app.post('/api/diagnostics/:courseId/submit', authRequired, (req, res) => {
  const courseId = Number(req.params.courseId);
  const { diagnosticId, answers } = req.body || {};
  if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ error: '请先作答' });

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });

  const now = new Date().toISOString();
  let did = diagnosticId;
  if (!did) {
    const info = db.prepare('INSERT INTO diagnostics (user_id, course_id, created_at) VALUES (?, ?, ?)').run(req.user.id, courseId, now);
    did = info.lastInsertRowid;
  }

  let correctCount = 0;
  const detail = [];
  const insertAnswer = db.prepare(`
    INSERT OR REPLACE INTO diagnostic_answers (user_id, diagnostic_id, question_id, selected, is_correct, answered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const a of answers) {
    const q = db.prepare('SELECT * FROM questions WHERE id = ? AND course_id = ?').get(a.questionId, courseId);
    if (!q) continue;
    const correct = q.correct_index === a.selected;
    if (correct) correctCount++;
    insertAnswer.run(req.user.id, did, q.id, a.selected, correct ? 1 : 0, now);
    detail.push({
      questionId: q.id,
      correct,
      correctIndex: q.correct_index,
      explanation: q.explanation,
      kpIds: getQuestionKps(q.id)
    });
  }

  const result = diagnose(req.user.id, courseId, did);
  const mastery = JSON.stringify(result.mastery);
  const info = db.prepare(`
    INSERT INTO diagnostic_results (user_id, course_id, diagnostic_id, score, correct_count, total_count, mastery, report, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, courseId, did, result.score, correctCount, detail.length, mastery, JSON.stringify(result.report), now);

  res.json({ diagnosticId: did, resultId: info.lastInsertRowid, ...result, detail });
});

app.get('/api/diagnostics/history', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT dr.*, c.name AS course_name, c.icon FROM diagnostic_results dr
    JOIN courses c ON c.id = dr.course_id
    WHERE dr.user_id = ?
    ORDER BY dr.created_at DESC LIMIT 20
  `).all(req.user.id);
  rows.forEach(r => {
    r.mastery = JSON.parse(r.mastery);
    r.report = JSON.parse(r.report);
  });
  res.json({ history: rows });
});

/* ---------------- 刷题 ---------------- */
app.get('/api/practice/questions', authRequired, (req, res) => {
  const courseId = Number(req.query.courseId || 0);
  const kpId = Number(req.query.kpId || 0);
  const limit = Math.min(Number(req.query.limit || 10), 20);
  if (!courseId) return res.status(400).json({ error: '缺少课程参数' });
  let rows;
  if (kpId) {
    rows = db.prepare(`
      SELECT DISTINCT q.* FROM questions q
      JOIN question_kps qk ON qk.question_id = q.id
      WHERE q.course_id = ? AND qk.kp_id = ?
      ORDER BY RANDOM() LIMIT ?
    `).all(courseId, kpId, limit);
  } else {
    rows = db.prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY RANDOM() LIMIT ?').all(courseId, limit);
  }
  res.json({ questions: rows.map(q => ({ ...q, options: JSON.parse(q.options), kpIds: getQuestionKps(q.id) })) });
});

app.post('/api/practice/answer', authRequired, (req, res) => {
  const { questionId, selected } = req.body || {};
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(questionId));
  if (!q) return res.status(404).json({ error: '题目不存在' });
  const correct = q.correct_index === selected;
  const kps = getQuestionKps(q.id);
  db.prepare(`
    INSERT INTO practice_answers (user_id, question_id, selected, is_correct, answered_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, q.id, selected, correct ? 1 : 0, new Date().toISOString());
  res.json({ correct, correctIndex: q.correct_index, explanation: q.explanation, kpIds: kps });
});

app.get('/api/stats', authRequired, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) n FROM practice_answers WHERE user_id = ?').get(req.user.id).n;
  const correct = db.prepare('SELECT COUNT(*) n FROM practice_answers WHERE user_id = ? AND is_correct = 1').get(req.user.id).n;
  const diagCount = db.prepare('SELECT COUNT(DISTINCT id) n FROM diagnostics WHERE user_id = ?').get(req.user.id).n;
  const aiCount = db.prepare('SELECT COUNT(*) n FROM ai_questions WHERE user_id = ?').get(req.user.id).n;
  const latestDiag = db.prepare(`
    SELECT dr.*, c.name course_name FROM diagnostic_results dr
    JOIN courses c ON c.id = dr.course_id
    WHERE dr.user_id = ? ORDER BY dr.created_at DESC LIMIT 1
  `).get(req.user.id);
  const weakKps = db.prepare(`
    SELECT kp.name, kp.id FROM knowledge_points kp
    JOIN courses c ON c.id = kp.course_id
    WHERE c.id = ? AND kp.id IN (
      SELECT kp_id FROM (
        SELECT qk.kp_id, AVG(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) acc
        FROM practice_answers pa JOIN question_kps qk ON qk.question_id = pa.question_id
        WHERE pa.user_id = ? GROUP BY qk.kp_id HAVING acc < 0.6
      )
    ) LIMIT 5
  `).all(latestDiag?.course_id || 0, req.user.id);
  res.json({
    total,
    correct,
    accuracy: total ? Math.round(correct / total * 100) : 0,
    diagCount,
    aiCount,
    latestDiag: latestDiag ? { ...latestDiag, mastery: JSON.parse(latestDiag.mastery) } : null,
    weakKps
  });
});

/* ---------------- AI: DeepSeek ---------------- */
app.post('/api/ai/generate', authRequired, wrap(async (req, res) => {
  const { courseId, kpId, difficulty, count } = req.body || {};
  const n = Math.min(Math.max(Number(count) || 3, 1), 5);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(courseId));
  if (!course) return res.status(400).json({ error: '课程不存在' });
  let kpName = null;
  if (kpId) {
    const kp = db.prepare('SELECT * FROM knowledge_points WHERE id = ? AND course_id = ?').get(Number(kpId), course.id);
    kpName = kp ? kp.name : null;
  }
  const questions = await deepseek.generateQuestions({
    courseName: course.name,
    courseOutline: course.outline,
    kpName,
    difficulty: difficulty || 'medium',
    count: n
  });
  const insert = db.prepare(`
    INSERT INTO ai_questions (user_id, course_id, kp_id, data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const out = [];
  for (const q of questions) {
    const info = insert.run(req.user.id, course.id, kpId || null, JSON.stringify(q), new Date().toISOString());
    out.push({ id: info.lastInsertRowid, ...q });
  }
  res.json({ questions: out, model: deepseek.model, provider: deepseek.providerLabel });
}));

app.post('/api/ai/tutor', authRequired, wrap(async (req, res) => {
  const { courseId, question, history } = req.body || {};
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(courseId));
  if (!course) return res.status(400).json({ error: '课程不存在' });
  if (!question && !(history && history.length)) return res.status(400).json({ error: '请输入问题' });
  const reply = await deepseek.tutor({
    courseName: course.name,
    question: String(question || ''),
    history: Array.isArray(history) ? history : []
  });
  res.json({ reply, model: deepseek.model });
}));

app.post('/api/ai/mock-exam', authRequired, wrap(async (req, res) => {
  const { courseId, kpIds, count } = req.body || {};
  const n = Math.min(Math.max(Number(count) || 10, 5), 15);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(courseId));
  if (!course) return res.status(400).json({ error: '课程不存在' });
  const kpNames = (kpIds || []).length
    ? db.prepare(`SELECT name FROM knowledge_points WHERE id IN (${kpIds.map(() => '?').join(',')})`).all(...kpIds).map(r => r.name)
    : [];
  const questions = await deepseek.generateMockExam({
    courseName: course.name,
    courseOutline: course.outline,
    kpNames,
    count: n
  });
  res.json({ questions, model: deepseek.model, courseName: course.name });
}));

app.get('/api/ai/status', (req, res) => {
  res.json({ configured: deepseek.isConfigured(), model: deepseek.model, providerLabel: deepseek.providerLabel });
});

/* ---------------- 知识图谱数据 ---------------- */
app.get('/api/knowledge-graph/:courseId', authRequired, (req, res) => {
  const courseId = Number(req.params.courseId);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const kps = db.prepare('SELECT * FROM knowledge_points WHERE course_id = ? ORDER BY sort_order').all(courseId);
  const edges = db.prepare('SELECT * FROM kp_edges WHERE (source_id IN (SELECT id FROM knowledge_points WHERE course_id = ?))').all(courseId);
  const mastery = db.prepare(`
    SELECT mastery FROM diagnostic_results
    WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id, courseId);
  const practiceStats = db.prepare(`
    SELECT qk.kp_id, AVG(pa.is_correct) acc, COUNT(*) n FROM practice_answers pa
    JOIN question_kps qk ON qk.question_id = pa.question_id
    WHERE pa.user_id = ? AND pa.question_id IN (SELECT id FROM questions WHERE course_id = ?)
    GROUP BY qk.kp_id
  `).all(req.user.id, courseId);
  res.json({
    course,
    nodes: kps.map(kp => ({ id: kp.id, name: kp.name, weight: kp.weight })),
    edges,
    mastery: mastery ? JSON.parse(mastery.mastery) : null,
    practiceStats
  });
});

/* ---------------- 工具函数 ---------------- */
function getQuestionKps(questionId) {
  return db.prepare('SELECT kp_id FROM question_kps WHERE question_id = ?').all(questionId).map(r => r.kp_id);
}

/* ---------------- 错误处理 ---------------- */
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`智刷星已启动: http://localhost:${PORT}`);
  console.log(`DeepSeek: ${deepseek.isConfigured() ? '已配置(' + deepseek.model + ')' : '未配置(使用内置题库兜底)'}`);
});
