const API = {
  getToken() {
    return localStorage.getItem('zx_token') || '';
  },
  setSession(token, user) {
    localStorage.setItem('zx_token', token);
    localStorage.setItem('zx_user', JSON.stringify(user));
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem('zx_user') || 'null'); } catch { return null; }
  },
  clearSession() {
    localStorage.removeItem('zx_token');
    localStorage.removeItem('zx_user');
  },
  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch('/api' + path, { ...options, headers });
    let data = null;
    try { data = await resp.json(); } catch { /* 非 JSON 响应 */ }
    if (resp.status === 401) {
      this.clearSession();
      location.hash = '#/login';
      throw new Error((data && data.error) || '请先登录');
    }
    if (!resp.ok) throw new Error((data && data.error) || '请求失败(' + resp.status + ')');
    return data;
  },
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body || {}) }); }
};

function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 350); }, 3200);
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

function initials(name) {
  return (name || '学').slice(0, 1).toUpperCase();
}
