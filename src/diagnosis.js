const { getDb } = require('./db');

/**
 * 基于答题记录的薄弱点诊断引擎
 * 方法:按知识点聚合准确率,结合证据量做贝叶斯收缩,
 * 给出 0-100 掌握度、薄弱点排序与个性化复习路径。
 */
function diagnose(userId, courseId, diagnosticId) {
  const db = getDb();
  const kps = db.prepare('SELECT * FROM knowledge_points WHERE course_id = ? ORDER BY sort_order').all(courseId);
  const answers = db.prepare(`
    SELECT da.*, qk.kp_id FROM diagnostic_answers da
    JOIN question_kps qk ON qk.question_id = da.question_id
    WHERE da.user_id = ? AND da.diagnostic_id = ?
      AND da.is_correct IS NOT NULL
  `).all(userId, diagnosticId);

  const stats = {};
  for (const kp of kps) {
    stats[kp.id] = { correct: 0, total: 0, kp };
  }
  for (const a of answers) {
    if (!stats[a.kp_id]) continue;
    stats[a.kp_id].total++;
    if (a.is_correct) stats[a.kp_id].correct++;
  }

  const PRIOR = 0.55;      // 先验:假设平均掌握度约 55%
  const STRENGTH = 2.0;    // 先验强度(证据越少越靠拢先验)
  const mastery = {};
  const weak = [];
  const strong = [];

  for (const kp of kps) {
    const s = stats[kp.id];
    if (!s.total) {
      mastery[kp.id] = { score: Math.round(PRIOR * 100), level: 'unknown', evidence: 0, accuracy: null };
      weak.push({ kp, evidence: 0 });
      continue;
    }
    const acc = s.correct / s.total;
    const shrunk = (s.correct + STRENGTH * PRIOR) / (s.total + STRENGTH);
    const score = Math.round(Math.min(1, Math.max(0, shrunk)) * 100);
    let level;
    if (score >= 75) level = 'mastered';
    else if (score >= 55) level = 'developing';
    else level = 'weak';
    mastery[kp.id] = { score, level, evidence: s.total, accuracy: Math.round(acc * 100) };
    if (level === 'weak') weak.push({ kp, evidence: s.total });
    else if (level === 'mastered') strong.push({ kp, evidence: s.total });
  }

  weak.sort((a, b) => a.kp.sort_order - b.kp.sort_order);
  strong.sort((a, b) => b.kp.weight - a.kp.weight);

  const totalCount = answers.length || 1;
  const correctCount = answers.filter(a => a.is_correct).length;
  const score = Math.round(correctCount / totalCount * 100);

  const report = {
    summary: buildSummary(score, weak.length, kps.length),
    weakPoints: weak.slice(0, 5).map(w => ({
      id: w.kp.id, name: w.kp.name, score: mastery[w.kp.id].score, evidence: w.evidence
    })),
    strongPoints: strong.slice(0, 5).map(s => ({
      id: s.kp.id, name: s.kp.name, score: mastery[s.kp.id].score
    })),
    path: buildReviewPath(courseId, weak.slice(0, 3).map(w => w.kp))
  };

  return { score, correctCount, totalCount, mastery, report };
}

function buildSummary(score, weakCount, totalKp) {
  if (score >= 80) return `整体掌握情况良好(得分 ${score} 分),仅 ${weakCount} 个知识点需要巩固。建议保持节奏,重点挑战综合题与易错题。`;
  if (score >= 60) return `整体处于中等水平(得分 ${score} 分),有 ${weakCount}/${totalKp} 个知识点存在薄弱环节。建议按推荐路径逐个击破,先补基础再看综合。`;
  return `诊断显示 ${weakCount}/${totalKp} 个知识点掌握不足(得分 ${score} 分)。不必焦虑——按下方路径从最基础的知识点开始,循序渐进即可。`;
}

function buildReviewPath(courseId, weakKps) {
  const db = getDb();
  if (!weakKps.length) {
    const top = db.prepare('SELECT id, name FROM knowledge_points WHERE course_id = ? ORDER BY weight DESC LIMIT 3').all(courseId);
    return top.map(kp => ({ id: kp.id, name: kp.name, reason: '巩固优势,挑战更高阶综合题' }));
  }
  const path = [];
  const seen = new Set();
  for (const kp of weakKps) {
    const prereqs = db.prepare(`
      SELECT kp.id, kp.name FROM kp_edges e
      JOIN knowledge_points kp ON kp.id = e.source_id
      WHERE e.target_id = ?
    `).all(kp.id);
    for (const p of prereqs) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      path.push({ id: p.id, name: p.name, reason: `${kp.name} 的前置基础` });
    }
    if (!seen.has(kp.id)) {
      seen.add(kp.id);
      path.push({ id: kp.id, name: kp.name, reason: '当前薄弱点,优先攻克' });
    }
  }
  return path;
}

module.exports = { diagnose };
