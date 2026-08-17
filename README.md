# ✨ 智刷星 —— AI 专业课智能刷题平台(GitHub Pages 公网版)

> 灵感源自《创客竞赛选题设计报告》(智刷队:邓程浩、何志浩、赵临枫)
> 华中科技大学未来技术学院 · 创客训练营

智刷星是一款面向理工科大学生的 AI 辅助复习网站:

- 🧪 **知识点智能诊断**:10 道题覆盖课程全部知识点,自动识别薄弱点
- 🗺️ **知识图谱可视化**:掌握度红/橙/绿/灰四色标注
- 🧭 **个性化复习路径**:基于知识点前置关系自动生成复习路线
- 🤖 **AI 出题**:DeepSeek 大模型按课程/知识点/难度实时生成原创题
- 💬 **苏格拉底式 AI 讲题**:引导式提问,理解而非死记
- 📝 **AI 考前冲刺模拟卷**:依据课程大纲与薄弱点自动组卷

线上地址:https://demonluv921.github.io/zhishuxing/

## 部署方式:GitHub Pages(免费、永久公网访问)

本项目是**纯静态网站**(无服务器、无数据库),天然适合 GitHub Pages。发布方式为仓库根目录 `index.html` + `.nojekyll`,从 main 分支直接发布,不依赖 Actions 工作流。AI 功能通过浏览器直接调用 DeepSeek 官方 API(已确认支持跨域 CORS)。

### 更新上线步骤

1. 修改 `static-src/` 源码后执行构建,并把产物复制到仓库根目录:

```bash
node static-src/build.js
copy site\index.html index.html
```

2. 提交并推送:

```bash
git add -A
git commit -m "更新"
git push origin main
```

3. 等待 1-2 分钟,访问 `https://<用户名>.github.io/<仓库>/` 即可看到更新。

## DeepSeek AI 接入(两种模式)

网站是纯静态的,**无法在服务端保存密钥**,支持两种模式:

### 模式一:个人 Key(默认)

1. 打开网站,点击左下角 **⚙️ AI 设置**
2. 前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并创建 API Key
3. 填入 Key 并保存 —— Key 仅保存在**本机浏览器**(localStorage),AI 请求直接发给 DeepSeek 官方接口

### 模式二:团队共享 Key(所有账号免配置直接用 AI)

密钥存放在 Supabase 的 `app_config` 表中(项目根目录 `supabase-config.json` 指向的数据库),网站启动时自动读取,不出现在网页源码和 Git 仓库中。

启用/更新共享 Key(需 Supabase 管理令牌):

```sql
-- 在 Supabase SQL Editor 中执行(把 sk-xxx 换成你的 Key)
INSERT INTO public.app_config (key, value) VALUES ('deepseek_shared_key', 'sk-xxx')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

所有访问者无需任何设置即可使用 AI 出题/讲题/模拟卷;个人仍可在"AI 设置"中填入自己的 Key 覆盖共享 Key。演示结束后,清空该行或到 DeepSeek 平台轮换 Key 即可。

> ⚠️ 重要风险(演示级共享):Supabase 的 anon key 在网页源码中公开,`app_config` 表对匿名只读开放,技术用户仍可通过 REST 接口读到共享 Key。仅适合短期演示;想要真正安全的共享,需要服务端代理(见下文"本地服务版")。

## 云端同步(Supabase A 方案)

网站已内置云同步代码(`static-src/cloud-sync.js`)。启用步骤:

1. 在 [Supabase](https://supabase.com) 注册免费账号,进入 [Account Tokens](https://supabase.com/dashboard/account/tokens) 生成 Personal Access Token
2. 在本目录执行(自动创建项目、建表、生成 `supabase-config.json`):

```bash
node scripts/setup-supabase.js <你的 Supabase 访问令牌>
```

3. 重新构建并推送,线上即启用云同步:

```bash
node static-src/build.js
copy site\index.html index.html
git add -A
git commit -m "启用云端同步"
git push
```

工作方式:注册时每个账号分配一个随机 `cloudToken`;所有 REST 请求用 Supabase anon key 认证,通过 `token=eq.<token>` 查询条件定位本人数据行;登录时自动拉取云端数据与本机合并(按记录 id 去重、保留较新版本),做题/诊断后自动防抖同步。

> ⚠️ 已知边界(演示模式):anon key 本身在网页源码中公开,RLS 采用宽松策略,账号隔离靠 token 过滤实现。数据为学习记录,不含敏感信息,适合竞赛演示;正式生产应改用 Supabase Auth(JWT)+ `auth.uid()` 行级安全,或把同步逻辑放进 Edge Function。

## 数据说明

- 注册账号、诊断记录、刷题记录、AI 题目**默认**保存在浏览器本地(localStorage)
- 配置 Supabase 云同步后,账号与学习数据会同步到云端,**任意电脑登录同一账号都能看到同一份数据**
- 内置题库:概率论与数理统计、普通化学、大学物理 A,共 3 门课 36 道题

## 本地开发与调试

### 静态版本地预览

```powershell
npm run build
# 然后用任意静态服务器打开 site/index.html,例如:
python -m http.server 8080 -d site
# 访问 http://localhost:8080
```

### 运行冒烟测试

```powershell
node static-src/test-static.js
```

### 本地服务版(可选,带数据库后端)

仓库同时保留了 Express 版本(支持服务器端存储与 API Key 配置),适合本地演示或部署到自有服务器:

```powershell
pnpm install
pnpm rebuild better-sqlite3
copy .env.example .env   # 填入 DEEPSEEK_API_KEY
npm start                 # http://localhost:3000
```

## 项目结构

```
zhishuxing/
├── index.html             # GitHub Pages 构建产物(由 build.js 生成后复制到根目录)
├── site/                  # 构建中间产物(不入库)
├── static-src/            # 静态版源码
│   ├── template.html      # 单页模板
│   ├── supabase-config.js # Supabase 配置注入模块
│   ├── cloud-sync.js      # 云端同步(账号/学习数据)
│   ├── storage.js         # 浏览器本地存储层
│   ├── diagnosis.js       # 薄弱点诊断引擎
│   ├── deepseek-client.js # DeepSeek 浏览器直连客户端
│   ├── graph.js           # 知识图谱 SVG 渲染
│   ├── app.js             # 页面逻辑
│   ├── build.js           # 构建脚本(合并为单个 index.html)
│   └── test-static.js     # 冒烟测试
├── scripts/setup-supabase.js  # Supabase 自动化配置脚本
├── public/                # 服务端版前端(Express 用)
├── src/                   # Express 版后端(seed-data.json 为共享题库)
├── server.js              # 本地服务版入口
└── supabase-config.json   # Supabase 项目配置(不入库,由 setup 脚本生成)
```

## 常见问题

**Q: AI 出题报"未配置 Key"?**
点击左下角"AI 设置"填入你的 DeepSeek API Key;确认 Key 有效且有余额。

**Q: 换浏览器/电脑后数据没了?**
数据默认存于浏览器 localStorage;启用 Supabase 云同步后,在任意电脑用同一账号登录即可恢复数据。

**Q: 想更新题目?**
编辑 `src/seed-data.json` 后重新构建提交即可。

**Q: 需要真正的用户账号和多人共享数据?**
优先启用上文"云端同步(Supabase A 方案)";如需更强的权限隔离,使用仓库中的 Express 服务版部署到云服务器(VPS)。
