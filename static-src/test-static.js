// 静态版冒烟测试:在模拟浏览器环境中加载 docs/index.html 并验证核心逻辑
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const webcrypto = require('crypto').webcrypto;

const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function makeEl() {
  const el = {
    _cls: new Set(), _html: '', _listeners: {}, _val: '', dataset: {}, style: {},
    disabled: false, scrollTop: 0, scrollHeight: 0, textContent: '',
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c),
      toggle: (c, f) => { if (f === undefined ? !el._cls.has(c) : f) el._cls.add(c); else el._cls.delete(c); },
      contains: c => el._cls.has(c)
    },
    set innerHTML(v) { el._html = v; }, get innerHTML() { return el._html; },
    set value(v) { el._val = v; }, get value() { return el._val; },
    addEventListener(t, fn) { el._listeners[t] = fn; }, onclick: null,
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    appendChild() {}, remove() {}, focus() {}, scrollIntoView() {}, setAttribute() {}
  };
  return el;
}

const elCache = {};
let domReadyHandler = null;
const documentMock = {
  getElementById(id) { return elCache[id] || (elCache[id] = makeEl()); },
  createElement() { return makeEl(); },
  querySelectorAll() { return []; },
  addEventListener(t, fn) { if (t === 'DOMContentLoaded') domReadyHandler = fn; },
  body: { appendChild() {} }
};
const storage = {};
const sandbox = {
  document: documentMock,
  window: { addEventListener() {}, location: { hash: '' } },
  __SEED_COURSES__: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'seed-data.json'), 'utf8')),
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  console, setTimeout, URLSearchParams, Date, Math, JSON, String, Number, Array, Object, Promise,
  TextEncoder, crypto: webcrypto, encodeURIComponent, decodeURIComponent, isNaN,
  fetch: async () => { throw new Error('no network'); },
  __TEST_RESULT__: null
};
vm.createContext(sandbox);
vm.runInContext(scripts[0], sandbox);
vm.runInContext(scripts[1], sandbox);
console.log('has STATE:', sandbox.window.__STATE__ != null);
vm.runInContext('window.__STATE__.courses = buildCourses(SEED);', sandbox);

const testCode = `
(async () => {
const built = buildCourses(SEED);
const appState = window.__STATE__;
appState.courses = built;
const course = appState.courses[0];
const answers = course.questions.slice(0, 10).map((q, i) => ({ questionId: q.id, kpIds: q.kpIds, correct: i % 2 === 0 }));
const r = diagnoseAnswers(course, {}, answers);
const fb = await DeepSeekClient.generateQuestions({ courseName: course.name, kpName: '随机事件与古典概型', difficulty: 'medium', count: 3 });
const t = await DeepSeekClient.tutor({ courseName: course.name, question: 'test', history: [] });
// 诊断抽题逻辑
const picked = [];
const covered = new Set();
const all = course.questions.slice();
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
__TEST_RESULT__ = {
  courses: appState.courses.length,
  kps: course.kps.length,
  questions: course.questions.length,
  q1KpIds: course.questions[0].kpIds,
  diagScore: r.score,
  weakCount: r.report.weakPoints.length,
  pathCount: r.report.path.length,
  pickedCount: picked.length,
  coveredKps: covered.size,
  fallbackCount: fb.length,
  fallbackOptions: fb[0].options.length,
  tutorFallback: t.includes('未配置')
};
})();
`;
vm.runInContext(testCode, sandbox);
setTimeout(() => {
console.log(JSON.stringify(sandbox.__TEST_RESULT__, null, 2));
const ok = sandbox.__TEST_RESULT__.courses === 3
  && sandbox.__TEST_RESULT__.pickedCount === 10
  && sandbox.__TEST_RESULT__.fallbackCount === 3
  && sandbox.__TEST_RESULT__.tutorFallback;
console.log(ok ? '✅ ALL STATIC TESTS PASSED' : '❌ TESTS FAILED');
process.exit(ok ? 0 : 1);
}, 200);
