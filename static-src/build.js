// 构建静态版智刷星:合并模块 + 注入题库数据,输出 docs/index.html
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(__dirname);
const outDir = path.join(root, 'site');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8')
  + '\n' + fs.readFileSync(path.join(src, 'extra.css'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'src', 'seed-data.json'), 'utf8');
const storage = fs.readFileSync(path.join(src, 'storage.js'), 'utf8');
const diagnosis = fs.readFileSync(path.join(src, 'diagnosis.js'), 'utf8');
const deepseek = fs.readFileSync(path.join(src, 'deepseek-client.js'), 'utf8');
const graph = fs.readFileSync(path.join(src, 'graph.js'), 'utf8');
const app = fs.readFileSync(path.join(src, 'app.js'), 'utf8');

let html = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
html = html.replace('__CSS__', css);
html = html.replace('__SEED__', seed);
html = html.replace('__STORAGE__', storage);
html = html.replace('__DIAGNOSIS__', diagnosis);
html = html.replace('__DEEPSEEK__', deepseek);
html = html.replace('__GRAPH__', graph);
html = html.replace('__APP__', app);

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
console.log('静态版构建完成:', path.join(outDir, 'index.html'), (html.length / 1024).toFixed(1) + ' KB');
