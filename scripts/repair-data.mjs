// 資料修復（命令列版；與「📥 匯入／備份 → 🧰 資料修復」相同功能）
//   用法：
//     npm run repair:data -- --db data/asset_data.db            # 實際修復（會先備份）
//     npm run repair:data -- --db data/asset_data.db --dry-run  # 只預覽
//     npm run repair:data -- --db data/asset_data.db --only=renumber
//     npm run repair:data -- --db data/asset_data.db --only=notes
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dbLib = require('../lib/db.js');
const repair = require('../lib/repair.js');

const args = process.argv.slice(2);
const getArg = (name, def) => {
    const i = args.indexOf('--' + name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const dryRun = args.includes('--dry-run');
const only = getArg('only', '');
const dbPath = path.resolve(getArg('db', path.join(process.cwd(), 'data', 'asset_data.db')));

if (!fs.existsSync(dbPath)) {
    console.error('❌ 找不到資料庫：' + dbPath);
    process.exit(1);
}

const db = await dbLib.openDb(dbPath, { readOnly: false });
const ctx = dbLib.makeCtx(db);

try {
    if (!dryRun) {
        try { await ctx.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) {}
        const backupsDir = path.join(path.dirname(dbPath), 'backups');
        fs.mkdirSync(backupsDir, { recursive: true });
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
        const safety = path.join(backupsDir, 'repair_before_' + stamp + '.db');
        fs.copyFileSync(dbPath, safety);
        console.log('💾 已備份資料庫：' + safety);
    }

    const out = await repair.repairData(ctx, {
        dryRun: dryRun,
        renumber: only !== 'notes',
        fixNotes: only !== 'renumber'
    });

    console.log('');
    console.log((dryRun ? '🔍 預覽（未變更）' : '✅ 修復完成'));
    console.log('   資產總數      ：' + out.totalAssets);
    console.log('   重新編號筆數  ：' + out.renumbered);
    console.log('   清除重複備註  ：' + out.notesCleared);
    if (out.sample.length) {
        console.log('   編號變更範例：');
        out.sample.forEach(s => console.log('     ' + s.oldNo + '  →  ' + s.newNo));
    }
    if (dryRun) console.log('\n（若要實際執行，請移除 --dry-run）');
} finally {
    await dbLib.close(db);
}
