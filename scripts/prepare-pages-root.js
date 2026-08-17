// 将构建产物放到仓库根目录(GitHub Pages 直接部署 main 分支根目录方案)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const siteDir = path.join(root, 'site');
const srcDir = path.join(root, 'src');
const publicDir = path.join(root, 'public');
const staticSrcDir = path.join(root, 'static-src');
const oldDocs = path.join(root, 'docs');
const ghDir = path.join(root, '.github');
const nojekyll = path.join(root, '.nojekyll');

// 1. 生成静态站点到 site/
require(path.join(staticSrcDir, 'build.js'));

// 2. 把根目录里的站点文件先移走(保留源码目录,不混入站点)
const rootEntries = fs.readdirSync(root).filter(n =>
  !['site', 'src', 'public', 'static-src', 'scripts', '.git', 'node_modules', 'data', '.env', '.env.example', '.gitignore', '.ghtools'].includes(n)
);

// 3. 站点文件提升到根
const siteFiles = fs.readdirSync(siteDir);
for (const f of siteFiles) {
  const from = path.join(siteDir, f);
  const to = path.join(root, f);
  if (fs.existsSync(to)) fs.unlinkSync(to);
  fs.copyFileSync(from, to);
  console.log('site -> root:', f);
}

// 4. 写 .nojekyll 防止 Jekyll 干扰
fs.writeFileSync(nojekyll, '', 'utf8');

// 5. 移除旧的 docs/ 与 .github/(工作流需要 workflow 权限,改用根目录部署)
for (const dir of [oldDocs, ghDir]) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('removed:', dir);
  }
}

console.log('pages root ready');
