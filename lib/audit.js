// =====================================================================
// 使用日誌（稽核紀錄）
//   · 記錄：誰、什麼時候、做了什麼、對象、IP
//   · 查詢 / 篩選 / 匯出 Excel
// =====================================================================
const ExcelJS = require('exceljs');

const ACTION_LABELS = {
    'login': '登入系統',
    'login.fail': '登入失敗',
    'logout': '登出系統',
    'password.change': '修改自己的密碼',
    'password.reset': '重設他人密碼',
    'asset.create': '新增資產',
    'asset.update': '修改資產',
    'asset.delete': '移至回收桶',
    'asset.restore': '還原資產',
    'repair.create': '登記維修',
    'repair.complete': '維修完工',
    'repair.delete': '刪除維修紀錄',
    'transfer.create': '資產轉移',
    'transfer.delete': '刪除轉移紀錄',
    'vendor.create': '新增廠商',
    'vendor.update': '修改廠商',
    'vendor.delete': '刪除廠商',
    'maint.create': '新增維護紀錄',
    'maint.delete': '刪除維護紀錄',
    'vendor.file.upload': '上傳廠商附件',
    'vendor.file.delete': '刪除廠商附件',
    'maint.doc.upload': '上傳維護單據',
    'maint.doc.delete': '刪除維護單據',
    'field.create': '新增欄位選項',
    'field.delete': '刪除欄位選項',
    'user.create': '新增帳號',
    'user.update': '修改帳號權限／狀態',
    'user.delete': '刪除帳號',
    'import.assets': '匯入資產資料',
    'import.vendors': '匯入廠商資料',
    'import.desktop': '匯入單機版備份',
    'attachment.repair': '附件路徑修復',
    'export.assets_sheet': '匯出資產資料表',
    'export.vendors_sheet': '匯出廠商資料表',
    'export.inventory': '匯出盤點總表',
    'export.vendor_list': '匯出廠商清單',
    'export.vendor_maint': '匯出維護歷程',
    'export.asset_history': '匯出資產履歷',
    'export.logs': '匯出使用日誌',
    'backup.db': '下載資料庫備份',
    'backup.files': '下載附件 ZIP',
    'restore.db': '還原資料庫',
    'repair.data': '資料修復（重編號／清備註）',
    'update.download': '下載更新檔',
    'update.apply': '套用更新',
    'update.restart': '重新啟動服務'
};

const nowISO = () => new Date().toISOString();
const str = (v) => String(v == null ? '' : v).trim();

async function ensureSchema(ctx) {
    await ctx.exec(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT,
        username TEXT,
        display_name TEXT,
        perms TEXT,
        action TEXT,
        target TEXT,
        target_id INTEGER DEFAULT 0,
        target_no TEXT,
        detail TEXT,
        ip TEXT
    )`);
    await ctx.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_at ON activity_logs(at DESC)`);
    await ctx.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(username)`);
}

// 寫入一筆（不影響主要流程；失敗只印錯誤）
function write(ctx, entry) {
    const e = entry || {};
    const user = e.session || {};
    const args = [
        nowISO(),
        str(user.username) || str(e.username),
        str(user.displayName),
        Array.isArray(user.perms) ? user.perms.join(',') : str(user.role),
        str(e.action),
        str(e.target),
        parseInt(e.targetId, 10) || 0,
        str(e.targetNo).slice(0, 200),
        str(e.detail).slice(0, 1000),
        str(e.ip)
    ];
    return ctx.run(`INSERT INTO activity_logs (at, username, display_name, perms, action, target, target_id, target_no, detail, ip)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args)
        .catch(err => console.error('[audit] ' + (err && err.message ? err.message : err)));
}

function buildWhere(q) {
    const where = [];
    const args = [];
    const from = str(q.from), to = str(q.to);
    if (from) { where.push(`at >= ?`); args.push(from + 'T00:00:00'); }
    if (to) { where.push(`at <= ?`); args.push(to + 'T23:59:59.999Z'); }
    if (str(q.username)) { where.push(`username = ?`); args.push(str(q.username)); }
    if (str(q.action)) { where.push(`action = ?`); args.push(str(q.action)); }
    const kw = str(q.keyword).toLowerCase();
    if (kw) {
        where.push(`(LOWER(COALESCE(detail,'')) LIKE ? OR LOWER(COALESCE(target_no,'')) LIKE ? OR LOWER(COALESCE(display_name,'')) LIKE ? OR LOWER(COALESCE(username,'')) LIKE ?)`);
        const like = '%' + kw + '%';
        args.push(like, like, like, like);
    }
    return { sql: where.length ? ('WHERE ' + where.join(' AND ')) : '', args: args };
}

async function list(ctx, q) {
    const w = buildWhere(q || {});
    const limit = Math.min(Math.max(parseInt((q || {}).limit, 10) || 200, 1), 2000);
    const offset = Math.max(parseInt((q || {}).offset, 10) || 0, 0);
    const totalRow = await ctx.get(`SELECT COUNT(*) AS c FROM activity_logs ${w.sql}`, w.args);
    const rows = await ctx.all(`SELECT * FROM activity_logs ${w.sql} ORDER BY id DESC LIMIT ? OFFSET ?`, w.args.concat([limit, offset]));
    const users = await ctx.all(`SELECT DISTINCT username FROM activity_logs WHERE TRIM(COALESCE(username,'')) <> '' ORDER BY username ASC`);
    const actions = await ctx.all(`SELECT action, COUNT(*) AS c FROM activity_logs ${w.sql} GROUP BY action ORDER BY c DESC`, w.args);
    return {
        total: (totalRow && totalRow.c) || 0,
        offset: offset, limit: limit,
        rows: rows,
        users: users.map(u => u.username),
        actions: actions.map(a => ({ code: a.action, label: ACTION_LABELS[a.action] || a.action, count: a.c }))
    };
}

// 方便呼叫：log(ctx, session, 'asset.create', { target:'asset', targetId, targetNo, detail })
function log(ctx, user, action, opts) {
    const o = opts || {};
    return write(ctx, {
        session: user, action: action,
        target: o.target, targetId: o.targetId, targetNo: o.targetNo,
        detail: o.detail, ip: o.ip || (user && user.ip) || ''
    });
}

const listAll = async (ctx, q) => {
    const w = buildWhere(q || {});
    return ctx.all(`SELECT * FROM activity_logs ${w.sql} ORDER BY id DESC LIMIT 50000`, w.args);
};

function fmtTime(iso) {
    const s = String(iso || '');
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function buildXlsx(rows, meta) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('使用日誌');
    ws.columns = [{ width: 20 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 22 }, { width: 12 }, { width: 26 }, { width: 46 }, { width: 16 }];
    const last = 9;
    ws.mergeCells(1, 1, 1, last);
    const title = ws.getCell(1, 1);
    title.value = `📜 使用日誌　共 ${rows.length} 筆` + (meta && meta.range ? `　｜　期間：${meta.range}` : '');
    title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    ws.getRow(1).height = 28;

    const headers = ['時間', '帳號', '顯示名稱', '權限', '動作', '對象', '對象編號', '內容', 'IP'];
    const hr = ws.getRow(2);
    headers.forEach((h, i) => {
        const c = hr.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    ws.getRow(2).height = 20;

    rows.forEach((r, i) => {
        const row = ws.getRow(3 + i);
        const vals = [
            fmtTime(r.at), r.username || '', r.display_name || '', r.perms || '',
            ACTION_LABELS[r.action] || r.action || '', r.target || '', r.target_no || '', r.detail || '', r.ip || ''
        ];
        vals.forEach((v, c) => {
            const cell = row.getCell(c + 1);
            cell.value = v;
            cell.font = { size: 10 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
            cell.alignment = { vertical: 'middle', wrapText: c === 7 };
        });
        if (i % 2 === 1) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
        row.height = 18;
    });

    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
    return { buffer: Buffer.from(buffer), count: rows.length, stamp: stamp };
}

module.exports = { ACTION_LABELS, ensureSchema, write, log, list, listAll, buildXlsx, fmtTime };
