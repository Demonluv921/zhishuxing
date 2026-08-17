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

## 部署方式:GitHub Pages(免费、永久公网访问)

本项目是**纯静态网站**(无服务器、无数据库),天然适合 GitHub Pages。
AI 功能通过浏览器直接调用 DeepSeek 官方 API(已确认支持跨域 CORS)。

### 一键部署步骤

1. **在 GitHub 上新建仓库**(例如 `zhishuxing`,设为 Public)

2. **推送代码**(在本项目目录执行,`YOUR_NAME`/`REPO` 换成你的):

```bash
git init
git add .
git commit -m "智刷星:AI专业课智能刷题平台"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/REPO.git
git push -u origin main
```

3. **启用 GitHub Pages**:
   仓库 → Settings → Pages → Source 选择 **GitHub Actions**
   (推送后工作流会自动构建并部署,无需手动设置分支)

4. **等待 1-2 分钟**,访问:
   `https://YOUR_NAME.github.io/REPO/`

之后每次 `git push`,GitHub Actions 都会自动重新构建并发布。

## 配置 DeepSeek API Key(AI 出题必做)

网站是纯静态的,**无法在服务端保存密钥**,采用"个人配置"方案:

1. 打开网站,点击左下角 **⚙️ AI 设置**
2. 前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并创建 API Key
3. 填入 Key 并保存 —— Key 仅保存在**你自己的浏览器**(localStorage),AI 请求直接发给 DeepSeek 官方接口,不经过任何中间服务器

> 每个访问者需要各自配置 Key。如果希望访问者**免配置直接用 AI**,有两个方案:
> - 团队共享一个 Key 发布到网站上(Key 会被所有访问者看到,可能被滥用,不推荐)
> - 或改用带后端的部署(见下文"本地服务版")

## 数据说明

- 注册账号、诊断记录、刷题记录、AI 题目均保存在**浏览器本地**(localStorage)
- 换设备或清除浏览器数据会丢失记录
- 内置题库:概率论与数理统计、普通化学、大学物理 A,共 3 门课 36 道题

## 本地开发与调试

### 静态版本地预览

```powershell
npm run build
# 然后用任意静态服务器打开 docs/index.html,例如:
python -m http.server 8080 -d docs
# 访问 http://localhost:8080
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
├── docs/                  # GitHub Pages 构建产物(自动生成,提交到仓库)
├── static-src/            # 静态版源码
│   ├── template.html      # 单页模板
│   ├── storage.js         # 浏览器本地存储层
│   ├── diagnosis.js       # 薄弱点诊断引擎
│   ├── deepseek-client.js # DeepSeek 浏览器直连客户端
│   ├── graph.js           # 知识图谱 SVG 渲染
│   ├── app.js             # 页面逻辑
│   └── build.js           # 构建脚本(合并为单个 index.html)
├── public/                # 服务端版前端(Express 用)
├── src/                   # Express 版后端(seed-data.json 为共享题库)
├── server.js              # 本地服务版入口
└── .github/workflows/     # GitHub Actions 自动部署
```

## 常见问题

**Q: AI 出题报"未配置 Key"?**
点击左下角"AI 设置"填入你的 DeepSeek API Key;确认 Key 有效且有余额。

**Q: 换浏览器/电脑后数据没了?**
数据存于浏览器 localStorage,请在同一浏览器使用;可导出题库数据自行备份。

**Q: 想更新题目?**
编辑 `src/seed-data.json` 后重新构建提交即可。

**Q: 需要真正的用户账号和多人共享数据?**
使用仓库中的 Express 服务版部署到云服务器(VPS),即支持服务器端数据库。
