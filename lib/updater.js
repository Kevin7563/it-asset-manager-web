// =====================================================================
// 線上更新：GitHub Releases（版本檢查 / 下載 / 套用 / 重新啟動）
//   · 版本來源：https://api.github.com/repos/<owner>/<repo>/releases/latest
//   · 也可用 WEB_UPDATE_URL 指向自架的 JSON（格式同 GitHub release 或簡化版）
//   · 更新檔：Release 內的 .zip（含 server.js / lib / public / package.json）
//   · 資料（data/ uploads/ backups/）與 config.json 一律不會被覆蓋
// =====================================================================
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { readZip } = require('./zip-read');
const { buildZip, ensureDir, isInside } = require('./files');

const REPO_DEFAULT = 'Kevin7563/it-asset-manager-web';
const UA = 'it-asset-manager-web-updater';
const CACHE_MS = 5 * 60 * 1000;
const MAX_ZIP = 120 * 1024 * 1024;

const ALLOW_FILES = ['server.js', 'package.json', 'config.json.example', 'README.md', 'CHANGELOG.md'];
const ALLOW_DIRS = ['lib', 'public', 'docs'];

let cache = { at: 0, data: null };

const APP_ROOT = path.join(__dirname, '..');
function readConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config.json'), 'utf-8')); } catch (e) { return {}; }
}
function repoSlug() {
    const cfg = readConfig();
    return String(process.env.WEB_UPDATE_REPO || cfg.githubRepo || REPO_DEFAULT).trim();
}
function releasesPageUrl() {
    const slug = repoSlug();
    return /^https?:/i.test(slug) ? slug : ('https://github.com/' + slug + '/releases');
}
function feedUrl() {
    const cfg = readConfig();
    const custom = String(process.env.WEB_UPDATE_URL || cfg.updateUrl || '').trim();
    if (custom) return custom;
    return 'https://api.github.com/repos/' + repoSlug() + '/releases/latest';
}

function versionParts(v) {
    return String(v || '').replace(/^v/i, '').split(/[.+-]/).map(n => parseInt(n, 10) || 0);
}
function compareVersions(a, b) {
    const pa = versionParts(a), pb = versionParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

// 把 GitHub release／自架 JSON 統一成正規格式
function normalizeRelease(json) {
    const src = json || {};
    let version = String(src.version || src.tag_name || src.name || '').trim();
    const notes = String(src.notes || src.body || src.releaseNotes || '').trim();
    const publishedAt = String(src.publishedAt || src.published_at || src.releaseDate || '').trim();
    const pageUrl = String(src.homepage || src.html_url || '').trim() || releasesPageUrl();
    let assets = Array.isArray(src.assets) ? src.assets.map(a => ({
        name: String(a.name || a.fileName || ''),
        size: Number(a.size || 0),
        url: String(a.browser_download_url || a.downloadUrl || a.url || '')
    })) : [];
    if (!assets.length && (src.downloadUrl || src.fileName)) {
        assets = [{ name: String(src.fileName || 'update.zip'), size: Number(src.size || 0), url: String(src.downloadUrl || '') }];
    }
    if (!version) version = '';
    return {
        version: version.replace(/^v/i, ''),
        tag: version,
        notes: notes,
        publishedAt: publishedAt,
        pageUrl: pageUrl,
        assets: assets.filter(a => a.url),
        source: feedUrl()
    };
}

async function fetchLatest(force) {
    if (!force && cache.data && (Date.now() - cache.at) < CACHE_MS) return cache.data;
    const url = feedUrl();
    const cfg = readConfig();
    const headers = { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' };
    const token = String(process.env.WEB_UPDATE_TOKEN || process.env.GITHUB_TOKEN || cfg.githubToken || '').trim();
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch(url, { headers }); }
    catch (e) { throw new Error('無法連線到 GitHub（' + (e.message || e) + '），請確認網路或 proxy 設定。'); }
    if (res.status === 404) throw new Error('找不到任何 Release（' + (res.status) + '）：請先在 GitHub 建立 vX.Y.Z Release 並附上 .zip 更新檔。');
    if (!res.ok) throw new Error('讀取更新資訊失敗（HTTP ' + res.status + '）');
    const json = await res.json();
    const data = normalizeRelease(json);
    if (!data.version) throw new Error('更新資訊缺少版本號（version／tag_name）。');
    cache = { at: Date.now(), data };
    return data;
}

function pickAsset(release) {
    const list = (release && release.assets) || [];
    return list.find(a => /\.zip$/i.test(a.name) && /web/i.test(a.name))
        || list.find(a => /\.zip$/i.test(a.name))
        || null;
}

async function downloadAsset(url, destFile) {
    const headers = { 'User-Agent': UA };
    const token = String(process.env.WEB_UPDATE_TOKEN || process.env.GITHUB_TOKEN || readConfig().githubToken || '').trim();
    if (token && /api\.github\.com|github\.com/i.test(url)) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) throw new Error('下載更新檔失敗（HTTP ' + res.status + '）');
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('更新檔內容為空。');
    if (buf.length > MAX_ZIP) throw new Error('更新檔過大（' + Math.round(buf.length / 1048576) + 'MB），請確認檔案是否正確。');
    ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, buf);
    return { file: destFile, size: buf.length, buffer: buf };
}

function isAllowedRel(rel) {
    const p = String(rel || '').replace(/\\/g, '/');
    if (!p || p.indexOf('..') >= 0) return false;
    if (/^(data|uploads|backups|updates|node_modules|\.git)\//i.test(p)) return false;
    if (/^config\.json$/i.test(p)) return false;
    if (/\.(db|db-wal|db-shm|log)$/i.test(p)) return false;
    if (ALLOW_FILES.indexOf(p) >= 0) return true;
    return ALLOW_DIRS.some(d => p.indexOf(d + '/') === 0);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

// 下載 → 解壓到 updates/staged
async function stage(release) {
    const asset = pickAsset(release);
    if (!asset) {
        throw new Error('此版本沒有 .zip 更新檔：請在 Release 附上 it-asset-manager-web-vX.Y.Z.zip（或改用 Release 的原始碼 ZIP）。');
    }
    const updatesDir = path.join(APP_ROOT, 'updates');
    const stagedDir = path.join(updatesDir, 'staged');
    fs.rmSync(stagedDir, { recursive: true, force: true });
    ensureDir(stagedDir);

    const file = path.join(updatesDir, 'download_' + String(release.version).replace(/[^\w.-]/g, '_') + '.zip');
    const dl = await downloadAsset(asset.url, file);

    let entries;
    try { entries = readZip(dl.buffer); }
    catch (e) { throw new Error('更新檔不是有效的 ZIP：' + (e.message || e)); }

    // 若整包只有一個上層資料夾（GitHub 原始碼 ZIP 常見），自動去掉
    const firsts = new Set(entries.map(e => e.name.split('/')[0]));
    const stripRoot = (firsts.size === 1 && entries.every(e => e.name.indexOf('/') > 0)) ? (entries[0].name.split('/')[0] + '/') : '';

    const written = [];
    entries.forEach(e => {
        let rel = e.name;
        if (stripRoot && rel.indexOf(stripRoot) === 0) rel = rel.slice(stripRoot.length);
        if (!isAllowedRel(rel)) return;
        const dest = path.join(stagedDir, rel);
        if (!isInside(stagedDir, dest)) return;
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, e.data);
        written.push(rel);
    });

    const must = ['server.js', 'public/index.html', path.join('lib', 'service.js')];
    const missing = must.filter(m => !fs.existsSync(path.join(stagedDir, m)));
    if (missing.length) {
        throw new Error('更新檔內容不完整（缺少 ' + missing.join('、') + '），請確認 ZIP 是 Web 版程式檔。');
    }
    let versionInPkg = '';
    try { versionInPkg = String(JSON.parse(fs.readFileSync(path.join(stagedDir, 'package.json'), 'utf-8')).version || ''); } catch (e) {}
    return { stagedDir: stagedDir, file: dl.file, size: dl.size, files: written.length, versionInPkg: versionInPkg };
}

// 收集目前程式檔（備份用）
function collectAppFiles(root) {
    const out = [];
    const pushFile = (full) => {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (isAllowedRel(rel) && fs.existsSync(full)) out.push({ name: rel, data: fs.readFileSync(full) });
    };
    ALLOW_FILES.forEach(f => pushFile(path.join(root, f)));
    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
            const full = path.join(dir, d.name);
            if (d.isDirectory()) walk(full);
            else if (d.isFile()) pushFile(full);
        });
    };
    ALLOW_DIRS.forEach(d => walk(path.join(root, d)));
    return out;
}

// 備份 → 覆蓋程式檔（不動資料）
function applyStaged(stagedDir, fromVersion, toVersion) {
    const backupsDir = path.join(APP_ROOT, 'backups');
    ensureDir(backupsDir);
    const backupFile = path.join(backupsDir, 'app_before_update_' + String(fromVersion).replace(/[^\w.-]/g, '_') + '_' + stamp() + '.zip');
    const current = collectAppFiles(APP_ROOT);
    fs.writeFileSync(backupFile, buildZip(current));

    const staged = collectAppFiles(stagedDir);
    if (!staged.length) throw new Error('暫存區沒有可套用的檔案，請先重新下載更新檔。');
    staged.forEach(f => {
        const dest = path.join(APP_ROOT, f.name);
        if (!isInside(APP_ROOT, dest)) return;
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, f.data);
    });
    const info = { at: new Date().toISOString(), from: fromVersion, to: toVersion, files: staged.length, backup: backupFile };
    fs.writeFileSync(path.join(APP_ROOT, 'updates', 'last-update.json'), JSON.stringify(info, null, 2), 'utf-8');
    cache = { at: 0, data: null };
    return { applied: staged.length, backup: backupFile, info: info };
}

// 套用後重新啟動（先結束目前進程，再由 helper 拉起新的）
function scheduleRestart() {
    const helper = path.join(APP_ROOT, 'scripts', 'update-restart.mjs');
    if (!fs.existsSync(helper)) return { scheduled: false, reason: '找不到 scripts/update-restart.mjs' };
    const child = spawn(process.execPath, [helper, String(process.pid), APP_ROOT], {
        cwd: APP_ROOT, detached: true, stdio: 'ignore', env: process.env
    });
    child.unref();
    setTimeout(() => { try { process.exit(0); } catch (e) {} }, 700);
    return { scheduled: true };
}

module.exports = {
    repoSlug, releasesPageUrl, fetchLatest, pickAsset, stage, applyStaged, scheduleRestart,
    compareVersions, isAllowedRel
};

