// ===== Supabase 云同步配置(由构建时注入 JSON 字面量) =====
// 未配置时网站以纯本地模式运行,所有功能照常可用
const SUPABASE_CONFIG = {
  url: __SUPABASE_URL__,
  anonKey: __SUPABASE_ANON__
};

function supabaseConfigured() {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}
