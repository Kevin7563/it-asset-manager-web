// 打包「可攜版」ZIP：內含 node.exe 與 node_modules，新電腦解壓即可執行（不需安裝 Node.js）
//   用法：npm run release:portable
//   產出：out/it-asset-manager-web-portable-v<版本>.zip
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crc32 } = require('../lib/files.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const stageName = 'it-asset-manager-web-v' + version;
const outDir = path.join(root, 'out');
const stageRoot = path.join(outDir, 'portable', stageName);

// ── 1. 準備暫存資料夾 ───────────────────────────────
fs.rmSync(path.join(outDir, 'portable'), { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });

const APP_FILES = ['server.js', 'package.json', 'config.json.example', 'README.md', 'CHANGELOG.md', 'start.bat', 'install.bat'];
const APP_DIRS = ['lib', 'public', 'docs', 'scripts'];

// 不打包：測試/原始碼/文件等對執行無用的內容
// 注意：只排除「確定不需要」的東西；例如 exceljs 的 lib/doc 是程式必需，不可排除
const SKIP_RE = [
    /[\\/]node_modules[\\/]sqlite3[\\/](deps|src)([\\/]|$)/i,
    /[\\/]\.bin([\\/]|$)/i,
    /[\\/]\.git([\\/]|$)/i,
    /\.(map|markdown)$/i
];

let copied = 0;
function copyOne(src, rel) {
    const dst = path.join(stageRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
}
function walkCopy(srcDir, relBase) {
    fs.readdirSync(srcDir, { withFileTypes: true }).forEach(d => {
        const full = path.join(srcDir, d.name);
        const rel = relBase ? relBase + '/' + d.name : d.name;
        if (SKIP_RE.some(re => re.test(full))) return;
        if (d.isDirectory()) walkCopy(full, rel);
        else if (d.isFile()) copyOne(full, rel);
    });
}

APP_FILES.forEach(f => { const full = path.join(root, f); if (fs.existsSync(full)) copyOne(full, f); });
APP_DIRS.forEach(d => { const full = path.join(root, d); if (fs.existsSync(full)) walkCopy(full, d); });
walkCopy(path.join(root, 'node_modules'), 'node_modules');

// 內建 Node.js 執行檔（與目前相依套件編譯版本相同）
fs.copyFileSync(process.execPath, path.join(stageRoot, 'node.exe'));
copied++;

// ── 2. 啟動腳本 ───────────────────────────────────────
//   start.bat / install.bat 已在上面（APP_FILES）複製進暫存資料夾。
//   可攜版同樣走 scripts\launch.ps1 → tray.ps1（背景執行＋系統匣），
//   Get-AppNodeExe 會優先用資料夾內的 node.exe，不需另外安裝 Node.js。
['start.bat', 'install.bat'].forEach(f => {
    if (!fs.existsSync(path.join(stageRoot, f))) throw new Error('打包失敗：缺少 ' + f);
});
['lib', 'public', 'scripts'].forEach(d => {
    if (!fs.existsSync(path.join(stageRoot, d))) throw new Error('打包失敗：缺少 ' + d + ' 資料夾');
});

// ── 3. 使用說明（純文字，放在根目錄最顯眼）────────────
const README_TXT = [
    '【IT 資產管理系統 - Web 版（可攜版）v' + version + '】',
    '',
    '■ 需要環境',
    '  Windows 10 / 11（64 位元）。本包已內建 Node.js，不需另外安裝。',
    '',
    '■ 第一次使用（3 步）',
    '  1. 把整個資料夾解壓縮到硬碟（例如 D:\\IT資產管理系統）',
    '     ※ 請勿直接在 ZIP 內執行；不建議放在需要系統管理員權限的資料夾。',
    '  2. 雙擊「start.bat」→ 先跳出說明視窗，按「啟動服務」後：',
    '     ‧ 服務在背景執行（不會再出現黑色命令視窗）',
    '     ‧ 右下角通知區域會出現常駐圖示，並自動開啟瀏覽器 http://localhost:3010',
    '  3. 登入：admin / 5508888 → 登入後請至「🔒 修改我的密碼」更換',
    '',
    '■ 常駐圖示（右下角）按右鍵',
    '  開啟網頁／啟動服務／重新啟動服務／停止服務／開啟程式資料夾／結束常駐程式',
    '',
    '■ 桌面執行圖示',
    '  第一次執行 start.bat 會自動在桌面建立「IT 資產管理系統」捷徑；',
    '  也可隨時雙擊「install.bat」重新建立（桌面＋開始功能表）。',
    '',
    '■ 資料存放位置',
    '  data\\asset_data.db    ← 第一次啟動會自動建立（含預設帳號）',
    '  data\\vendor_files\\    ← 廠商／維護附件',
    '  data\\backups\\         ← 自動備份（匯入、還原、更新前）',
    '  ★ 備份或換電腦：複製整個資料夾即可，重點是 data 資料夾。',
    '',
    '■ 區網共用（其他電腦連線）',
    '  1. Windows 防火牆允許 Node.js 或連接埠 3010',
    '  2. 其他電腦開啟 http://<本機IP>:3010',
    '',
    '■ 修改連接埠',
    '  在本資料夾新增 config.json，內容：{"port": 3011}',
    '  或設環境變數 WEB_PORT 後再執行 start.bat',
    '',
    '■ 線上更新',
    '  登入後「系統管理 → 🔄 版本與更新」→ 檢查更新 → 下載 → 套用並重新啟動',
    '  （只更新程式檔，data 與 config.json 不會被更動）',
    '',
    '■ 疑難排解',
    '  「連接埠 3010 已被占用」→ 已有一個服務在跑，直接開瀏覽器即可；或由常駐圖示重新啟動。',
    '  「Windows 已保護您的電腦」→ 按「其他資訊 → 仍要執行」。',
    '  網頁打不開 → 右鍵常駐圖示看「狀態」，並查看 data\\logs\\server.err.log。',
    '  找不到常駐圖示 → 可能被收合在「^」內；或雙擊桌面圖示重新啟動。',
    ''
].join('\r\n');

fs.writeFileSync(path.join(stageRoot, '安裝與啟動.txt'), README_TXT, 'utf8');
copied++;

// ── 4. 建立 ZIP（deflate 壓縮）────────────────────────
function deflateZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    entries.forEach(e => {
        const nameBuf = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
        const raw = e.data;
        const comp = zlib.deflateRawSync(raw, { level: 6 });
        const crc = crc32(raw);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x0021, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comp.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, comp);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x0021, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(comp.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(Buffer.concat([central, nameBuf]));
        offset += local.length + nameBuf.length + comp.length;
    });
    const centralPart = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralPart.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([Buffer.concat(locals), centralPart, end]);
}

function collect(dir, relBase) {
    const list = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
        const full = path.join(dir, d.name);
        const rel = relBase ? relBase + '/' + d.name : d.name;
        if (d.isDirectory()) list.push(...collect(full, rel));
        else if (d.isFile()) list.push({ name: stageName + '/' + rel, data: fs.readFileSync(full) });
    });
    return list;
}

const entries = collect(stageRoot, '');
const zipBuf = deflateZip(entries);
const zipFile = path.join(outDir, 'it-asset-manager-web-portable-v' + version + '.zip');
fs.writeFileSync(zipFile, zipBuf);

const rawMB = entries.reduce((s, e) => s + e.data.length, 0) / 1048576;
console.log('✅ 可攜版打包完成');
console.log('   檔案數：' + entries.length + ' 個（含 node.exe 與 node_modules）');
console.log('   未壓縮：' + rawMB.toFixed(1) + ' MB　→　ZIP：' + (zipBuf.length / 1048576).toFixed(1) + ' MB');
console.log('   輸出：' + zipFile);
console.log('');
console.log('   新電腦：解壓縮 → 雙擊 start.bat → 背景啟動（右下角常駐圖示）→ 瀏覽器 http://localhost:3010');
console.log('   （第一次啟動會建立 data\\asset_data.db、預設帳號與桌面執行圖示）');

// ── 5. 清掉暫存資料夾（保留 ZIP）──────────────────────
if (process.argv.indexOf('--keep') < 0) {
    fs.rmSync(path.join(outDir, 'portable'), { recursive: true, force: true });
}
