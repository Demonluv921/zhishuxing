const path = require('path');
const Database = require('better-sqlite3');

let db;

function initDb() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!require('fs').existsSync(dataDir)) require('fs').mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'zhishuxing.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      student_no TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      outline TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS knowledge_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL,
      weight REAL DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kp_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      target_id INTEGER NOT NULL REFERENCES knowledge_points(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT,
      difficulty TEXT DEFAULT 'medium',
      source TEXT DEFAULT 'seed'
    );

    CREATE TABLE IF NOT EXISTS question_kps (
      question_id INTEGER NOT NULL REFERENCES questions(id),
      kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      PRIMARY KEY (question_id, kp_id)
    );

    CREATE TABLE IF NOT EXISTS diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diagnostic_answers (
      user_id INTEGER NOT NULL,
      diagnostic_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL REFERENCES questions(id),
      selected INTEGER,
      is_correct INTEGER,
      answered_at TEXT,
      PRIMARY KEY (user_id, diagnostic_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS diagnostic_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      diagnostic_id INTEGER NOT NULL,
      score REAL,
      correct_count INTEGER,
      total_count INTEGER,
      mastery TEXT,
      report TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS practice_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      question_id INTEGER NOT NULL REFERENCES questions(id),
      selected INTEGER,
      is_correct INTEGER,
      answered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      kp_id INTEGER,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

module.exports = { initDb, getDb: () => db };
