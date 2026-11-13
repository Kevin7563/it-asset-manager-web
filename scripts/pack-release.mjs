// 打包「程式檔」ZIP（本機用；GitHub Actions 也會做一樣的事）
//   用法：npm run release:pack   → 產出 out/it-asset-manager-web-v<版本>.zip
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildZip } = require('../lib/files.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

const FILES = ['server.js', 'package.json', 'config.json.example', 'README.md', 'CHANGELOG.md', 'start.bat', 'install.bat'];
const DIRS = ['lib', 'public', 'docs', 'scripts'];

const entries = [];
const add = (full, rel) => entries.push({ name: rel.replace(/\\/g, '/'), data: fs.readFileSync(full) });
FILES.forEach(f => { const full = path.join(root, f); if (fs.existsSync(full)) add(full, f); });
const walk = (dir, relBase) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
        const full = path.join(dir, d.name);
        const rel = relBase + '/' + d.name;
        if (d.isDirectory()) walk(full, rel);
        else if (d.isFile()) add(full, rel);
    });
};
DIRS.forEach(d => walk(path.join(root, d), d));

const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'it-asset-manager-web-v' + version + '.zip');
fs.writeFileSync(outFile, buildZip(entries));
console.log('✅ 已打包 ' + entries.length + ' 個檔案 → ' + outFile);
console.log('   把這個 ZIP 上傳到 GitHub Release（或直接 git push 標籤讓 Actions 自動打包）。');
