// =====================================================================
// 資料修復（一次性工具）
//   1) 重新產生資產編號：類別-部門-採購日期-流水號（依 id 順序配流水號）
//   2) 清除「維運備註說明」誤存成「資產規格/備註」的資料（notes === spec_note）
//   · 會同步更新 repairs_new / asset_history_new / transfers_new(asset_no) 的編號
//   · 呼叫端負責先備份資料庫
// =====================================================================
const service = require('./service');

const TMP_PREFIX = '__tmp__';

async function collectPlan(ctx) {
    const options = await ctx.all(`SELECT field_type, value, code FROM field_options WHERE field_type='category'`);
    const codeOf = {};
    options.forEach(o => { if (o.value && o.code) codeOf[o.value] = String(o.code).toUpperCase(); });
    const fallback = { hardware: 'HW', software: 'SW', network: 'NET', peripheral: 'DEV', credentials: 'SEC' };

    const rows = await ctx.all(`SELECT id, asset_no, category, department, purchase_date FROM assets_new ORDER BY id ASC`);
    const seqMap = {};
    const plan = [];
    rows.forEach(r => {
        const pfx = codeOf[r.category] || fallback[r.category] || 'AST';
        const dept = String(r.department || 'IT').toUpperCase();
        const stamp = service.dateStamp(r.purchase_date);
        const key = pfx + '-' + dept;
        seqMap[key] = (seqMap[key] || 0) + 1;
        const newNo = pfx + '-' + dept + '-' + stamp + '-' + String(seqMap[key]).padStart(4, '0');
        if (newNo !== r.asset_no) plan.push({ id: r.id, oldNo: r.asset_no, newNo: newNo });
    });
    return plan;
}

async function repairData(ctx, opts) {
    const options = opts || {};
    const dryRun = !!options.dryRun;
    const fixNotes = options.fixNotes !== false;
    const renumber = options.renumber !== false;

    const noteRows = await ctx.all(`SELECT id FROM assets_new
        WHERE TRIM(COALESCE(notes,'')) <> ''
          AND TRIM(COALESCE(notes,'')) = TRIM(COALESCE(spec_note,''))
          AND TRIM(COALESCE(spec_note,'')) <> ''`);
    const plan = renumber ? await collectPlan(ctx) : [];

    const result = {
        dryRun: dryRun,
        notesCleared: fixNotes ? noteRows.length : 0,
        renumbered: plan.length,
        sample: plan.slice(0, 8),
        totalAssets: (await ctx.get(`SELECT COUNT(*) AS c FROM assets_new`)).c
    };
    if (dryRun || (!result.notesCleared && !result.renumbered)) return result;

    await ctx.tx(async (t) => {
        if (result.notesCleared) {
            await t.run(`UPDATE assets_new SET notes = ''
                WHERE TRIM(COALESCE(notes,'')) <> ''
                  AND TRIM(COALESCE(notes,'')) = TRIM(COALESCE(spec_note,''))
                  AND TRIM(COALESCE(spec_note,'')) <> ''`);
        }
        if (plan.length) {
            // 先改成暫存編號，避免 UNIQUE(asset_no) 在逐筆更新時衝突
            await t.run(`UPDATE assets_new SET asset_no = ? || id`, [TMP_PREFIX]);
            for (const p of plan) {
                await t.run(`UPDATE assets_new SET asset_no = ? WHERE id = ?`, [p.newNo, p.id]);
                await t.run(`UPDATE repairs_new SET asset_no = ? WHERE asset_id = ?`, [p.newNo, p.id]);
                await t.run(`UPDATE asset_history_new SET asset_no = ? WHERE asset_id = ?`, [p.newNo, p.id]);
                await t.run(`UPDATE transfers_new SET asset_no = ? WHERE asset_id = ?`, [p.newNo, p.id]);
            }
        }
    });
    return result;
}

module.exports = { repairData, collectPlan };
