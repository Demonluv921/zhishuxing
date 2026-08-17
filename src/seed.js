const { getDb } = require('./db');
const SEED_COURSES = require('./seed-data.json');

function seedIfEmpty() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) n FROM courses').get().n;
  if (count > 0) return;
  const tx = db.transaction(() => {
    for (const course of SEED_COURSES) {
      const info = db.prepare(`
        INSERT INTO courses (name, icon, color, outline, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(course.name, course.icon, course.color, course.outline, course.description, course.sortOrder);
      const courseId = info.lastInsertRowid;
      const kpIds = {};
      course.kps.forEach((kp, i) => {
        const r = db.prepare(`
          INSERT INTO knowledge_points (course_id, name, weight, sort_order) VALUES (?, ?, ?, ?)
        `).run(courseId, kp.name, kp.weight || 1, i);
        kpIds[kp.name] = r.lastInsertRowid;
      });
      for (const edge of course.edges || []) {
        const s = kpIds[edge[0]], t = kpIds[edge[1]];
        if (s && t) db.prepare('INSERT INTO kp_edges (source_id, target_id) VALUES (?, ?)').run(s, t);
      }
      for (const q of course.questions || []) {
        const qi = db.prepare(`
          INSERT INTO questions (course_id, stem, options, correct_index, explanation, difficulty, source)
          VALUES (?, ?, ?, ?, ?, ?, 'seed')
        `).run(courseId, q.stem, JSON.stringify(q.options), q.correctIndex, q.explanation, q.difficulty || 'medium');
        for (const kpName of q.kps) {
          const kpId = kpIds[kpName];
          if (kpId) db.prepare('INSERT OR IGNORE INTO question_kps (question_id, kp_id) VALUES (?, ?)').run(qi.lastInsertRowid, kpId);
        }
      }
    }
  });
  tx();
  console.log('[Seed] 内置题库初始化完成');
}

module.exports = { seedIfEmpty, SEED_COURSES };
