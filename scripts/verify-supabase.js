// 云同步真实连通性验证:注册测试账号 -> 上传数据 -> 更新 -> 拉取 -> 清理
// 用法: node scripts/verify-supabase.js
// 可选:设置环境变量 ZXS_SUPABASE_TOKEN 后会自动清理测试数据(通过 Supabase 管理 API)
const fs = require('fs');
const path = require('path');

(async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supabase-config.json'), 'utf8'));
  const base = cfg.url + '/rest/v1';
  const headers = {
    'Content-Type': 'application/json',
    'apikey': cfg.anonKey,
    'Authorization': 'Bearer ' + cfg.anonKey,
    'Prefer': 'return=representation'
  };
  const j = async r => {
    const t = await r.text();
    try { return { status: r.status, body: t ? JSON.parse(t) : null }; }
    catch { return { status: r.status, body: t }; }
  };
  const account = '__zxs_verify__';
  const token = 'zxs-verify-' + Date.now();
  const results = {};

  // 1. 查询不存在的账号
  let r = await fetch(`${base}/users?account=eq.${account}&select=*&limit=1`, { headers });
  results.findEmpty = await j(r);

  // 2. 注册(插入用户)
  r = await fetch(`${base}/users`, { method: 'POST', headers, body: JSON.stringify({ account, name: '验证用户', salt: 's', pass_hash: 'h', token }) });
  results.createUser = await j(r);

  // 3. 重复注册应被唯一约束拦截
  r = await fetch(`${base}/users`, { method: 'POST', headers, body: JSON.stringify({ account, name: 'dup', salt: 's', pass_hash: 'h', token: token + '-dup' }) });
  results.dupRejected = { status: r.status };

  // 4. 按账号查询用户(登录用)
  r = await fetch(`${base}/users?account=eq.${account}&select=*&limit=1`, { headers });
  results.findUser = await j(r);

  // 5. 首次上传学习数据(insert)
  const data1 = { diagnostics: [], results: [{ id: 1, courseId: 1, score: 80, updatedAt: Date.now() }], practice: [], ai: [] };
  r = await fetch(`${base}/user_data`, { method: 'POST', headers, body: JSON.stringify({ token, data: data1, updated_at: new Date().toISOString() }) });
  results.insertData = await j(r);

  // 6. 按 token 拉取学习数据
  r = await fetch(`${base}/user_data?select=*&token=eq.${encodeURIComponent(token)}&limit=1`, { headers });
  results.getData = await j(r);

  // 7. 更新学习数据(PATCH 按 token 定位)
  const data2 = { ...data1, results: [{ id: 1, courseId: 1, score: 95, updatedAt: Date.now() }] };
  r = await fetch(`${base}/user_data?token=eq.${encodeURIComponent(token)}`, { method: 'PATCH', headers, body: JSON.stringify({ data: data2, updated_at: new Date().toISOString() }) });
  results.updateData = await j(r);

  // 8. 清理测试数据(传了管理令牌时)
  const mgmtToken = process.env.ZXS_SUPABASE_TOKEN;
  if (mgmtToken) {
    const ref = cfg.url.replace('https://', '').replace('.supabase.co', '');
    const del = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + mgmtToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `DELETE FROM public.user_data WHERE token='${token}'; DELETE FROM public.users WHERE account='${account}';` })
    });
    results.cleanup = { status: del.status };
  }

  const ok = results.findEmpty.status === 200
    && results.createUser.status === 201 && Array.isArray(results.createUser.body)
    && results.dupRejected.status === 409
    && results.findUser.status === 200 && results.findUser.body?.[0]?.token === token
    && results.insertData.status === 201
    && results.getData.status === 200 && results.getData.body?.[0]?.token === token && results.getData.body?.[0]?.data?.results?.[0]?.score === 80
    && results.updateData.status === 200 && results.updateData.body?.[0]?.data?.results?.[0]?.score === 95;

  console.log(JSON.stringify(results, null, 2));
  console.log(ok ? '✅ 真实 Supabase 云同步连通性验证通过' : '❌ 验证失败');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
