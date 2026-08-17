// ===== 本地存储层(localStorage):用户 / 学习数据 / AI 配置 =====
const Store = {
  _read(key, fallback) {
    try {
      const v = localStorage.getItem('zxs_' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  _write(key, value) {
    localStorage.setItem('zxs_' + key, JSON.stringify(value));
  },

  users: {
    list() { return Store._read('users', {}); },
    save(list) { Store._write('users', list); },
    find(account) {
      const list = this.list();
      return list[account] || null;
    },
    add(user) {
      const list = this.list();
      list[user.account] = user;
      this.save(list);
    }
  },

  session: {
    get() { return Store._read('session', null); },
    set(s) { Store._write('session', s); },
    clear() { localStorage.removeItem('zxs_session'); }
  },

  userData: {
    // 每个用户一份学习数据
    read(userId) { return Store._read('ud_' + userId, { diagnostics: [], results: [], practice: [], ai: [] }); },
    save(userId, data) { Store._write('ud_' + userId, data); }
  },

  ai: {
    getKey() { return localStorage.getItem('zxs_ds_key') || ''; },
    setKey(key) { localStorage.setItem('zxs_ds_key', (key || '').trim()); }
  },

  cloud: {
    // 当前账号的云 token(注册时分配,用于访问云端数据)
    getToken() { return localStorage.getItem('zxs_cloud_token') || ''; },
    setToken(t) { if (t) localStorage.setItem('zxs_cloud_token', t); else localStorage.removeItem('zxs_cloud_token'); }
  }
};

// 简易密码哈希(scrypt 不可用时的浏览器端替代)
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + '::' + password + '::zhishuxing');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
