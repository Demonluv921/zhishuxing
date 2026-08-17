// 静态版冒烟测试:在模拟浏览器环境中加载 docs/index.html 并验证核心逻辑
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const webcrypto = require('crypto').webcrypto;

const src = __dirname;
const root = path.join(src, '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'src', 'seed-data.json'), 'utf8'));
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const modules = {
  supabase: fs.readFileSync(path.join(src, 'supabase-config.js'), 'utf8')
    .replace('__SUPABASE_URL__', JSON.stringify('https://fake.supabase.co'))
    .replace('__SUPABASE_ANON__', JSON.stringify('fake-anon-key')),
  cloud: fs.readFileSync(path.join(src, 'cloud-sync.js'), 'utf8'),
  storage: fs.readFileSync(path.join(src, 'storage.js'), 'utf8'),
  diagnosis: fs.readFileSync(path.join(src, 'diagnosis.js'), 'utf8'),
  deepseek: fs.readFileSync(path.join(src, 'deepseek-client.js'), 'utf8'),
  graph: fs.readFileSync(path.join(src, 'graph.js'), 'utf8'),
  app: fs.readFileSync(path.join(src, 'app.js'), 'utf8')
};
const scriptSource = modules.supabase + '\n' + modules.cloud + '\n' + modules.storage + '\n'
  + modules.diagnosis + '\n' + modules.deepseek + '\n' + modules.graph + '\n' + modules.app;

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
  __SEED_COURSES__: seed,
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  console, setTimeout, URLSearchParams, Date, Math, JSON, String, Number, Array, Object, Promise,
  TextEncoder, crypto: webcrypto, encodeURIComponent, decodeURIComponent, isNaN,
  fetch: async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/users')) {
      if ((opts.method || 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => [{ id: 1, account: 'cloudtest', name: '云测试', salt: 's', pass_hash: 'h', token: 'tok-abc' }] };
      }
      return { ok: true, status: 201, json: async () => [{ account: 'cloudtest' }] };
    }
    if (u.includes('/rest/v1/user_data')) {
      if ((opts.method || 'GET') === 'GET') {
        if (!u.includes('token=eq.')) throw new Error('user_data GET 必须带 token 过滤: ' + u);
        return { ok: true, status: 200, json: async () => [{ token: 'tok-abc', data: { results: [{ id: 99, courseId: 1 }], practice: [], diagnostics: [], ai: [] } }] };
      }
      return { ok: true, status: 204, json: async () => null };
    }
    throw new Error('unexpected fetch: ' + u);
  },
  __TEST_RESULT__: null
};
vm.createContext(sandbox);
vm.runInContext(scriptSource, sandbox);
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
const cloudTest = `
(async () => {
  const configured = supabaseConfigured();
  const user = await Cloud.findUser('cloudtest');
  const token = user.token;
  const data = await Cloud.getUserData(token);
  const merged = Cloud.mergeLocalCloud(
    { results: [{ id: 1, courseId: 1, updatedAt: 2 }], practice: [], diagnostics: [], ai: [] },
    data
  );
  __TEST_RESULT__.cloud = {
    configured,
    userFound: user && user.account === 'cloudtest',
    dataLoaded: data && data.token === 'tok-abc',
    mergedCount: merged.results.length
  };
})();
`;
vm.runInContext(cloudTest, sandbox);
setTimeout(() => {
  console.log(JSON.stringify(sandbox.__TEST_RESULT__.cloud, null, 2));
  const cloudOk = sandbox.__TEST_RESULT__.cloud.configured
    && sandbox.__TEST_RESULT__.cloud.userFound
    && sandbox.__TEST_RESULT__.cloud.dataLoaded
    && sandbox.__TEST_RESULT__.cloud.mergedCount === 2;
  console.log(ok && cloudOk ? '✅ ALL TESTS PASSED (含云同步)' : '❌ TESTS FAILED');
  process.exit(ok && cloudOk ? 0 : 1);
}, 300);
}, 200);
