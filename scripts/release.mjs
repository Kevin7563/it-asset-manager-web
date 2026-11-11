// 發行版本：推送目前分支與標籤 → GitHub Actions 會自動打包 ZIP 並建立 Release
//   用法：npm run release:patch（或 minor / major）
//   前置：npm version patch/minor/major 已先建立 vX.Y.Z 標籤（package.json 的 scripts 已包含）
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd) => {
    console.log('> ' + cmd);
    execSync(cmd, { stdio: 'inherit' });
};

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
console.log('\n準備發行 Web 版 v' + pkg.version + '\n');

run('git add -A');
try { run('git commit -m "chore(release): v' + pkg.version + '"'); } catch (e) { console.log('（沒有需要提交的變更，略過 commit）'); }
run('git push origin HEAD');
run('git push origin --tags');

console.log('\n✅ 已推送 v' + pkg.version + ' 標籤。');
console.log('   GitHub Actions 會自動：打包 it-asset-manager-web-v' + pkg.version + '.zip → 建立 Release');
console.log('   查看：https://github.com/Kevin7563/it-asset-manager-web/actions');
console.log('   Web 版「檢查更新」即可看到新版本。');
