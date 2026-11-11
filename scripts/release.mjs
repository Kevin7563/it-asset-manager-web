// 發行版本：推送分支與標籤 → 打包 ZIP → 建立 GitHub Release
//   用法：npm run release:patch（或 minor / major）
//   前置：npm version patch/minor/major 已先建立 vX.Y.Z 標籤（package.json 的 scripts 已包含）
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd, opts) => {
    console.log('> ' + cmd);
    execSync(cmd, Object.assign({ stdio: 'inherit' }, opts || {}));
};
const tryRun = (cmd, opts) => { try { run(cmd, opts); return true; } catch (e) { return false; } };

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const tag = 'v' + version;
const repo = 'Kevin7563/it-asset-manager-web';

console.log('\n準備發行 Web 版 ' + tag + '\n');

run('git add -A');
tryRun('git commit -m "chore(release): ' + tag + '"');
run('git push origin HEAD');
run('git push origin --tags');

// 打包程式檔 ZIP（不依賴 GitHub Actions）
run('node scripts/pack-release.mjs');
const zip = path.join(root, 'out', 'it-asset-manager-web-' + tag + '.zip');

const hasGh = tryRun('gh --version', { stdio: 'ignore' });
if (hasGh && fs.existsSync(zip)) {
    const notes = (() => {
        try {
            const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
            const idx = md.indexOf('## [' + version + ']');
            return idx >= 0 ? md.slice(idx, idx + 1200) : ('Web 版 ' + tag);
        } catch (e) { return 'Web 版 ' + tag; }
    })();
    const notesFile = path.join(root, 'out', 'release-notes.md');
    fs.writeFileSync(notesFile, notes, 'utf-8');
    tryRun('gh release create ' + tag + ' "' + zip + '" --repo ' + repo +
        ' --title "IT 資產管理系統 Web ' + tag + '" --notes-file "' + notesFile + '"');
} else {
    console.log('⚠️ 找不到 gh CLI 或 ZIP，請手動把 out\\ 內的 ZIP 上傳到 GitHub Release。');
}

console.log('\n✅ 已完成 ' + tag + ' 發行流程。');
console.log('   Release：https://github.com/' + repo + '/releases');
console.log('   Web 版「🔄 檢查更新」即可看到新版本。');

