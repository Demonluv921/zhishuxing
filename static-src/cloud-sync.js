// ===== Supabase 云同步:账号与学习数据云端存储 =====
// 设计:注册时分配随机 token;所有 REST 请求统一用 anon key 认证,
//       用户 token 作为查询条件(token=eq.<token>)定位本人数据行。
//       建表时 RLS 为宽松策略(演示用),账号隔离靠 token 查询过滤。

const Cloud = {
  _headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_CONFIG.anonKey,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
      'Prefer': 'return=representation'
    };
  },

  async _request(path, { method = 'GET', body } = {}) {
    if (!supabaseConfigured()) throw new Error('云端未配置');
    const resp = await fetch(SUPABASE_CONFIG.url + path, {
      method,
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
      let msg = '云端请求失败(' + resp.status + ')';
      try { const d = await resp.json(); msg = d.message || d.error?.message || msg; } catch {}
      throw new Error(msg);
    }
    if (resp.status === 204) return null;
    return resp.json();
  },

  // ---- 账号 ----
  async findUser(account) {
    const rows = await this._request('/rest/v1/users?account=eq.' + encodeURIComponent(account) + '&select=*&limit=1');
    return rows && rows.length ? rows[0] : null;
  },

  async createUser({ account, name, salt, passHash, token }) {
    const row = { account, name, salt, pass_hash: passHash, token };
    const res = await this._request('/rest/v1/users', { method: 'POST', body: row });
    return Array.isArray(res) ? res[0] : res;
  },

  // ---- 学习数据 ----
  async getUserData(token) {
    const rows = await this._request(
      '/rest/v1/user_data?select=*&token=eq.' + encodeURIComponent(token) + '&limit=1'
    );
    return rows && rows.length ? rows[0] : null;
  },

  async saveUserData(token, data) {
    const existing = await this.getUserData(token);
    const payload = {
      token,
      data: data,
      updated_at: new Date().toISOString()
    };
    if (existing) {
      await this._request('/rest/v1/user_data?token=eq.' + encodeURIComponent(token), {
        method: 'PATCH', body: payload
      });
    } else {
      await this._request('/rest/v1/user_data', { method: 'POST', body: payload });
    }
  },

  // ---- 数据合并(本地与云端取较新/较全) ----
  mergeLocalCloud(local, cloud) {
    const empty = { diagnostics: [], results: [], practice: [], ai: [] };
    const a = local && typeof local === 'object' ? local : { ...empty };
    const b = cloud && cloud.data && typeof cloud.data === 'object' ? cloud.data : { ...empty };
    for (const k of Object.keys(empty)) {
      a[k] = a[k] || [];
      b[k] = b[k] || [];
    }
    const mergeArr = (x, y) => {
      const map = new Map();
      [...x, ...y].forEach(item => {
        const id = item && item.id != null ? item.id : null;
        if (id != null) {
          const prev = map.get(id);
          if (!prev || (item.updatedAt || item.createdAt || 0) > (prev.updatedAt || prev.createdAt || 0)) map.set(id, item);
        } else if (id == null) {
          map.set(map.size + '_' + Math.random().toString(36).slice(2, 8), item);
        }
      });
      return Array.from(map.values());
    };
    return {
      diagnostics: mergeArr(a.diagnostics, b.diagnostics),
      results: mergeArr(a.results, b.results),
      practice: mergeArr(a.practice, b.practice),
      ai: mergeArr(a.ai, b.ai)
    };
  }
};
