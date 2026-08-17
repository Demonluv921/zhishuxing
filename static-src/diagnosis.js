// ===== 薄弱点诊断引擎(与后端版同算法,纯客户端) =====
function diagnoseAnswers(course, kpMap, answeredQuestions) {
  const stats = {};
  for (const kp of course.kps) stats[kp.id] = { correct: 0, total: 0, kp };
  for (const a of answeredQuestions) {
    for (const kpId of a.kpIds) {
      if (!stats[kpId]) continue;
      stats[kpId].total++;
      if (a.correct) stats[kpId].correct++;
    }
  }

  const PRIOR = 0.55, STRENGTH = 2.0;
  const mastery = {}, weak = [], strong = [];
  for (const kp of course.kps) {
    const s = stats[kp.id];
    if (!s.total) {
      mastery[kp.id] = { score: Math.round(PRIOR * 100), level: 'unknown', evidence: 0, accuracy: null };
      weak.push({ kp, evidence: 0 });
      continue;
    }
    const acc = s.correct / s.total;
    const shrunk = (s.correct + STRENGTH * PRIOR) / (s.total + STRENGTH);
    const score = Math.round(Math.min(1, Math.max(0, shrunk)) * 100);
    const level = score >= 75 ? 'mastered' : score >= 55 ? 'developing' : 'weak';
    mastery[kp.id] = { score, level, evidence: s.total, accuracy: Math.round(acc * 100) };
    if (level === 'weak') weak.push({ kp, evidence: s.total });
    else if (level === 'mastered') strong.push({ kp, evidence: s.total });
  }

  weak.sort((a, b) => a.kp.sort_order - b.kp.sort_order);
  strong.sort((a, b) => b.kp.weight - a.kp.weight);

  const correctCount = answeredQuestions.filter(a => a.correct).length;
  const score = Math.round(correctCount / (answeredQuestions.length || 1) * 100);

  const report = {
    summary: buildSummary(score, weak.length, course.kps.length),
    weakPoints: weak.slice(0, 5).map(w => ({ id: w.kp.id, name: w.kp.name, score: mastery[w.kp.id].score, evidence: w.evidence })),
    strongPoints: strong.slice(0, 5).map(s => ({ id: s.kp.id, name: s.kp.name, score: mastery[s.kp.id].score })),
    path: buildReviewPath(course, kpMap, weak.slice(0, 3).map(w => w.kp))
  };
  return { score, correctCount, totalCount: answeredQuestions.length, mastery, report };
}

function buildSummary(score, weakCount, totalKp) {
  if (score >= 80) return `整体掌握情况良好(得分 ${score} 分),仅 ${weakCount} 个知识点需要巩固。建议保持节奏,重点挑战综合题与易错题。`;
  if (score >= 60) return `整体处于中等水平(得分 ${score} 分),有 ${weakCount}/${totalKp} 个知识点存在薄弱环节。建议按推荐路径逐个击破。`;
  return `诊断显示 ${weakCount}/${totalKp} 个知识点掌握不足(得分 ${score} 分)。不必焦虑——按下方路径从最基础的知识点开始即可。`;
}

function buildReviewPath(course, kpMap, weakKps) {
  if (!weakKps.length) {
    return [...course.kps].sort((a, b) => b.weight - a.weight).slice(0, 3)
      .map(kp => ({ id: kp.id, name: kp.name, reason: '巩固优势,挑战更高阶综合题' }));
  }
  const path = [], seen = new Set();
  for (const kp of weakKps) {
    for (const e of course.edges || []) {
      if (e[1] === kp.name) {
        const p = course.kps.find(k => k.name === e[0]);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          path.push({ id: p.id, name: p.name, reason: `${kp.name} 的前置基础` });
        }
      }
    }
    if (!seen.has(kp.id)) {
      seen.add(kp.id);
      path.push({ id: kp.id, name: kp.name, reason: '当前薄弱点,优先攻克' });
    }
  }
  return path;
}
