// =====================================================================
// 額外報表：單筆資產履歷 / 廠商清單 / 廠商維護歷程 / 匯入範本
// 版面沿用單機版配色（深藍標題列 + 淺藍表頭 + 斑馬紋）
// =====================================================================
const ExcelJS = require('exceljs');

const CLR = { primary: 'FF1F4E78', header: 'FF2E75B6', sub: 'FFDDEBF7', zebra: 'FFF2F7FC', label: 'FFEAF1F9', border: 'FFB4C6E7' };
const thinBorder = (color) => { const b = { style: 'thin', color: { argb: color || CLR.border } }; return { top: b, left: b, bottom: b, right: b }; };
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb } });

const CAT_NAMES = {
    hardware: '硬體設備 (HW)', software: '軟體授權 (SW)', network: '網路設備 (NET)',
    peripheral: '資訊周邊 (DEV)', credentials: '資訊與資料庫帳密 (SEC)'
};
const STATUS_NAMES = { active: '線上正常使用', inventory: '庫存備用', repair: '維修中', scrapped: '已報廢' };
const DEPT_NAMES = {
    IT: '資訊部門', DR: '院長室,醫師辦公室', TL: '督導', GA: '總務', MO: '行政', PT: '主任',
    AC: '人事,會計', CK: '廚房', SM: '倉庫', WO: '工務', LA: '檢驗室', OP: '婦科', IN: '兒科',
    PO: '警衛', OR: '產房', WA: '病房', HE: '申報', BR: '嬰兒室', CH: '病歷室', CO: '櫃台', P1: '藥局'
};

const fmtD = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? String(s) : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
const nowText = () => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fileNameStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const todayISO = () => new Date().toISOString().slice(0, 10);
const soonISO = () => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

// 🗂️ 維護合約狀態（多筆合約共用）
function contractState(end) {
    if (!end) return { text: '未設定截止日', kind: 'none' };
    const day = String(end).slice(0, 10).replace(/[./]/g, '-');
    if (day < todayISO()) return { text: '已到期', kind: 'expired' };
    if (day <= soonISO()) return { text: '60 天內到期', kind: 'soon' };
    return { text: '有效', kind: 'valid' };
}
function contractDaysLeft(end) {
    if (!end) return '';
    const day = String(end).slice(0, 10).replace(/[./]/g, '-');
    const e = new Date(day + 'T00:00:00');
    if (isNaN(e.getTime())) return '';
    const t = new Date(todayISO() + 'T00:00:00');
    return Math.ceil((e - t) / 86400000);
}
function contractSummary(list) {
    if (!list || !list.length) return '未設定';
    const cnt = { valid: 0, soon: 0, expired: 0, none: 0 };
    list.forEach(c => { cnt[contractState(c.maint_end).kind]++; });
    const parts = [];
    if (cnt.valid) parts.push('有效 ' + cnt.valid + ' 筆');
    if (cnt.soon) parts.push('60 天內到期 ' + cnt.soon + ' 筆');
    if (cnt.expired) parts.push('已到期 ' + cnt.expired + ' 筆');
    if (cnt.none) parts.push('未填截止日 ' + cnt.none + ' 筆');
    return parts.join('、');
}
function latestContractEnd(list) {
    let max = '';
    (list || []).forEach(c => {
        const d = String(c.maint_end || '').slice(0, 10).replace(/[./]/g, '-');
        if (d && d > max) max = d;
    });
    return max;
}
async function vendorContractMap(ctx, vendors) {
    const rows = await ctx.all(`SELECT * FROM vendor_contracts_new ORDER BY vendor_id ASC, sort_order ASC, id ASC`);
    const map = {};
    rows.forEach(c => {
        if (!map[c.vendor_id]) map[c.vendor_id] = [];
        map[c.vendor_id].push(c);
    });
    (vendors || []).forEach(v => {
        if (!map[v.id]) map[v.id] = [];
        // 保險：尚未遷移的舊資料
        if (!map[v.id].length && (v.service_items || v.maint_start || v.maint_end)) {
            map[v.id].push({ name: '維護合約', service_items: v.service_items, maint_start: v.maint_start, maint_end: v.maint_end });
        }
    });
    return map;
}

function banner(ws, rowNo, lastCol, text, size) {
    ws.mergeCells(rowNo, 1, rowNo, lastCol);
    const c = ws.getCell(rowNo, 1);
    c.value = text;
    c.font = { bold: true, size: size || 14, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = solid(CLR.primary);
    ws.getRow(rowNo).height = (size >= 16) ? 32 : 24;
}
function subBanner(ws, rowNo, lastCol, text) {
    ws.mergeCells(rowNo, 1, rowNo, lastCol);
    const c = ws.getCell(rowNo, 1);
    c.value = text;
    c.font = { size: 10, italic: true, color: { argb: 'FF555555' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = solid(CLR.sub);
    ws.getRow(rowNo).height = 20;
}
function sectionBar(ws, rowNo, lastCol, text) {
    ws.mergeCells(rowNo, 1, rowNo, lastCol);
    const c = ws.getCell(rowNo, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    c.fill = solid(CLR.header);
    c.border = thinBorder('FF9DC3E6');
    ws.getRow(rowNo).height = 24;
}
function headerCells(ws, rowNo, headers) {
    const row = ws.getRow(rowNo);
    headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = solid(CLR.header);
        cell.border = thinBorder('FF9DC3E6');
    });
    row.height = 28;
}
function paintRow(row, cols, zebra) {
    for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder();
        if (zebra) cell.fill = solid(CLR.zebra);
    }
}
function labelCell(cell, text) {
    cell.value = text;
    cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.fill = solid(CLR.label);
}
function valueCell(cell, text, wrap) {
    cell.value = text;
    cell.font = { size: 10 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: !!wrap };
}

async function mapOptions(ctx) {
    const cats = Object.assign({}, CAT_NAMES);
    const deps = Object.assign({}, DEPT_NAMES);
    try {
        (await ctx.all(`SELECT value,label,code FROM field_options WHERE field_type='category'`)).forEach(o => { cats[o.value] = o.label + ' (' + o.code + ')'; });
        (await ctx.all(`SELECT code,label FROM field_options WHERE field_type='department'`)).forEach(o => { deps[o.code] = o.label; });
    } catch (e) {}
    return { cats, deps };
}
const deptText = (deps, code) => {
    const c = String(code || 'IT').toUpperCase();
    return deps[c] ? c + ' ' + deps[c] : c;
};

async function buildAssetHistoryXlsx(ctx, assetId) {
    const rows = await ctx.all(`SELECT a.*, COALESCE(v.name,'') AS vendor_name FROM assets_new a LEFT JOIN vendors_new v ON a.vendor_id = v.id WHERE a.id = ?`, [parseInt(assetId) || 0]);
    const asset = rows[0];
    if (!asset) throw new Error('找不到該資產。');
    const repairs = await ctx.all(`SELECT * FROM repairs_new WHERE asset_id = ? ORDER BY id DESC`, [asset.id]);
    const transfers = await ctx.all(`SELECT * FROM transfers_new WHERE asset_id = ? ORDER BY id DESC`, [asset.id]);
    const { cats, deps } = await mapOptions(ctx);
    const exportTime = nowText();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    wb.created = new Date();

    // ===== 工作表 1：資產基本資料 =====
    const s1 = wb.addWorksheet('資產基本資料', { views: [{ state: 'frozen', ySplit: 3 }] });
    s1.columns = [{ width: 20 }, { width: 34 }, { width: 18 }, { width: 30 }];
    const L1 = 4;
    banner(s1, 1, L1, '📋 資訊資產履歷表', 16);
    subBanner(s1, 2, L1, `資產編號：${asset.asset_no || ''}　｜　匯出時間：${exportTime}`);
    subBanner(s1, 3, L1, '※ 本表為單一資產完整維運履歷；維修與轉移明細請參閱後續工作表。');
    sectionBar(s1, 4, L1, '【一、資產基本資料】');

    const infoRows = [
        ['資產編號', asset.asset_no || '', '資產大類', cats[asset.category] || asset.category || ''],
        ['設備名稱', asset.name || '', '購買廠商', asset.vendor_name || '其他 (預設)'],
        ['原廠序列號 (S/N)', asset.sn || '未填寫', '當前狀態', STATUS_NAMES[asset.status] || asset.status || ''],
        ['保管使用窗口', asset.custodian || '未填寫', '購置日期', fmtD(asset.purchase_date)],
        ['實體擺放地點', asset.location || '未填寫', '保固到期日', fmtD(asset.warranty_date)],
        ['所屬部門', deptText(deps, asset.department), '部門代碼', String(asset.department || 'IT').toUpperCase()]
    ];
    infoRows.forEach((row, i) => {
        const rowObj = s1.getRow(5 + i);
        rowObj.height = 22;
        paintRow(rowObj, L1, i % 2 === 1);
        labelCell(rowObj.getCell(1), row[0]); valueCell(rowObj.getCell(2), row[1]);
        labelCell(rowObj.getCell(3), row[2]); valueCell(rowObj.getCell(4), row[3]);
    });

    const sec2 = 5 + infoRows.length;
    sectionBar(s1, sec2, L1, '【二、資產規格、維運備註與報廢資訊】');
    const noteRows = [
        ['資產規格/備註', asset.spec_note || '無'],
        ['維運備註', asset.notes || '無'],
        ['報廢原因', (asset.status === 'scrapped') ? (asset.scrap_reason || '未填寫') : '—']
    ];
    noteRows.forEach((row, i) => {
        const r = sec2 + 1 + i;
        s1.mergeCells(r, 2, r, L1);
        const rowObj = s1.getRow(r);
        const txt = String(row[1] == null ? '' : row[1]);
        rowObj.height = Math.max(24, Math.min(150, Math.max(1, Math.ceil(txt.length / 38)) * 16 + 10));
        rowObj.getCell(1).border = thinBorder();
        labelCell(rowObj.getCell(1), row[0]);
        rowObj.getCell(2).border = thinBorder();
        rowObj.getCell(2).fill = solid(i % 2 === 1 ? CLR.zebra : 'FFFFFFFF');
        valueCell(rowObj.getCell(2), row[1], true);
    });

    const sec3 = sec2 + 1 + noteRows.length;
    sectionBar(s1, sec3, L1, '【三、維運統計總覽】');
    const statRows = [
        ['維修總次數', `${repairs.length} 次`, '轉移總次數', `${transfers.length} 次`],
        ['已完工維修', `${repairs.filter(r => r.status === 'completed').length} 次`, '維修中工單', `${repairs.filter(r => r.status === 'pending').length} 次`]
    ];
    statRows.forEach((row, i) => {
        const rowObj = s1.getRow(sec3 + 1 + i);
        rowObj.height = 22;
        paintRow(rowObj, L1, i % 2 === 1);
        labelCell(rowObj.getCell(1), row[0]); valueCell(rowObj.getCell(2), row[1]);
        labelCell(rowObj.getCell(3), row[2]); valueCell(rowObj.getCell(4), row[3]);
    });
    s1.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    // ===== 工作表 2：維修紀錄 =====
    const s2 = wb.addWorksheet('維修紀錄', { views: [{ state: 'frozen', ySplit: 3 }] });
    s2.columns = [{ width: 6 }, { width: 22 }, { width: 32 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 30 }];
    const S2 = 8;
    banner(s2, 1, S2, `🔧 維修紀錄　共 ${repairs.length} 筆`, 14);
    subBanner(s2, 2, S2, `資產編號：${asset.asset_no || ''}　｜　匯出時間：${exportTime}`);
    headerCells(s2, 3, ['次數', '資產編號', '故障情形', '維修廠商', '送修日期', '完工/結案', '費用(元)', '狀態 / 備註']);
    const repStatus = { pending: '維修中', completed: '已完工', scrapped: '因報廢結案' };
    if (!repairs.length) {
        s2.mergeCells(4, 1, 4, S2);
        const ec = s2.getCell(4, 1);
        ec.value = '本資產尚無維修紀錄。';
        ec.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
        ec.alignment = { horizontal: 'center', vertical: 'middle' };
        ec.fill = solid(CLR.sub);
        ec.border = thinBorder();
        s2.getRow(4).height = 24;
    } else {
        repairs.forEach((rp, i) => {
            const row = s2.getRow(4 + i);
            const vals = [
                repairs.length - i, rp.asset_no || '', rp.fault_description || '', rp.repair_vendor || '未指定',
                fmtD(rp.reported_date), rp.status === 'pending' ? '—' : fmtD(rp.completed_date),
                (rp.cost && Number(rp.cost) > 0) ? Number(rp.cost) : 0,
                (repStatus[rp.status] || rp.status || '') + (rp.notes ? `　${rp.notes}` : '')
            ];
            vals.forEach((v, c) => { row.getCell(c + 1).value = v; });
            paintRow(row, S2, i % 2 === 1);
            [1, 2, 5, 6, 7].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
            row.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
            row.getCell(7).numFmt = '#,##0';
            row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        });
    }
    s2.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: S2 } };
    s2.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

    // ===== 工作表 3：轉移紀錄 =====
    const s3 = wb.addWorksheet('轉移紀錄', { views: [{ state: 'frozen', ySplit: 3 }] });
    s3.columns = [{ width: 6 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 13 }, { width: 30 }];
    const S3 = 10;
    banner(s3, 1, S3, `🔄 轉移紀錄　共 ${transfers.length} 筆`, 14);
    subBanner(s3, 2, S3, `資產編號：${asset.asset_no || ''}　｜　匯出時間：${exportTime}`);
    headerCells(s3, 3, ['次數', '資產編號', '原部門', '新部門', '原保管人', '新保管人', '原位置', '新位置', '轉移日期', '原因 / 備註']);
    if (!transfers.length) {
        s3.mergeCells(4, 1, 4, S3);
        const ec = s3.getCell(4, 1);
        ec.value = '本資產尚無轉移紀錄。';
        ec.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
        ec.alignment = { horizontal: 'center', vertical: 'middle' };
        ec.fill = solid(CLR.sub);
        ec.border = thinBorder();
        s3.getRow(4).height = 24;
    } else {
        transfers.forEach((tf, i) => {
            const row = s3.getRow(4 + i);
            const vals = [
                transfers.length - i, tf.asset_no || '', deptText(deps, tf.from_department), deptText(deps, tf.to_department),
                tf.from_custodian || '—', tf.to_custodian || '—', tf.from_location || '—', tf.to_location || '—',
                fmtD(tf.transfer_date), [tf.reason, tf.notes].filter(x => x && String(x).trim()).join('　') || '—'
            ];
            vals.forEach((v, c) => { row.getCell(c + 1).value = v; });
            paintRow(row, S3, i % 2 === 1);
            row.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
            row.getCell(10).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        });
    }
    s3.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: S3 } };
    s3.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), assetNo: asset.asset_no || String(asset.id), stamp: fileNameStamp() };
}

// ── 廠商清單 ──────────────────────────────────────────
async function buildVendorListXlsx(ctx) {
    const vendors = await ctx.all(`
        SELECT v.*,
          (SELECT COUNT(*) FROM assets_new a WHERE a.vendor_id = v.id AND a.is_deleted = 0) AS asset_count,
          (SELECT COUNT(*) FROM vendor_maint_records m WHERE m.vendor_id = v.id OR m.vendor_name = v.name) AS maint_count
        FROM vendors_new v ORDER BY v.id DESC`);
    const contractMap = await vendorContractMap(ctx, vendors);
    const details = [];
    vendors.forEach(v => (contractMap[v.id] || []).forEach(c => details.push({ vendor: v, contract: c })));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('合作廠商清單', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = [{ width: 6 }, { width: 24 }, { width: 16 }, { width: 18 }, { width: 26 }, { width: 12 }, { width: 10 }, { width: 26 }, { width: 16 }, { width: 10 }, { width: 10 }];
    const LAST = 11;
    banner(ws, 1, LAST, `🏢 合作廠商清單　共 ${vendors.length} 家／${details.length} 筆合約　｜　匯出時間：${nowText()}`, 16);
    subBanner(ws, 2, LAST, '※ 維護合約可有多筆；本表顯示合約筆數與狀態彙總，合約名稱、維護範圍與逐筆狀態請見「維護合約明細」工作表。');
    headerCells(ws, 3, ['項次', '廠商名稱', '主要服務專員', '聯絡窗口電話', '通訊地址', '資安 NDA', '合約筆數', '維護合約狀態', '最近合約到期日', '使用資產數', '維護紀錄數']);
    if (!vendors.length) {
        ws.mergeCells(4, 1, 4, LAST);
        const ec = ws.getCell(4, 1);
        ec.value = '目前沒有廠商資料。';
        ec.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
        ec.alignment = { horizontal: 'center', vertical: 'middle' };
        ec.fill = solid(CLR.sub);
        ec.border = thinBorder();
    } else {
        vendors.forEach((v, i) => {
            const row = ws.getRow(4 + i);
            const list = contractMap[v.id] || [];
            const summary = contractSummary(list);
            const lastEnd = latestContractEnd(list);
            const vals = [i + 1, v.name || '', v.representative || '—', v.phone || '—', v.address || '—',
                v.has_nda ? '已簽署' : '未簽署', list.length || '—', summary, lastEnd ? fmtD(lastEnd) : '—',
                v.asset_count || 0, v.maint_count || 0];
            vals.forEach((val, c) => { row.getCell(c + 1).value = val; });
            paintRow(row, LAST, i % 2 === 1);
            row.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            [1, 6, 7, 9, 10, 11].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
            [5, 8].forEach(c => { row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
            const nda = row.getCell(6);
            nda.fill = solid(v.has_nda ? 'FFDCFCE7' : 'FFFEE2E2');
            nda.font = { size: 10, bold: true, color: { argb: v.has_nda ? 'FF166534' : 'FFB91C1C' } };
            const sum = row.getCell(8);
            const bad = summary.indexOf('已到期') >= 0;
            const warn = summary.indexOf('60 天內') >= 0;
            const noSet = summary === '未設定' || (summary.indexOf('未填截止日') >= 0 && summary.indexOf('有效') < 0 && !warn && !bad);
            sum.font = { size: 10, bold: true, color: { argb: bad ? 'FFB91C1C' : (warn ? 'FFB45309' : (noSet ? 'FF64748B' : 'FF166534')) } };
            sum.fill = solid(bad ? 'FFFEE2E2' : (warn ? 'FFFEF3C7' : (noSet ? 'FFF1F5F9' : 'FFDCFCE7')));
        });
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST } };
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

    // ── 工作表 2：維護合約明細（每列一筆合約）──
    const ds = wb.addWorksheet('維護合約明細', { views: [{ state: 'frozen', ySplit: 3 }] });
    ds.columns = [{ width: 6 }, { width: 24 }, { width: 24 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }];
    const DL = 8;
    banner(ds, 1, DL, `🗂️ 維護合約明細　共 ${details.length} 筆　｜　匯出時間：${nowText()}`, 16);
    subBanner(ds, 2, DL, '※ 每列為一筆維護合約；狀態依截止日自動判斷（有效／60 天內到期／已到期），剩餘天數為負值代表已逾期。');
    headerCells(ds, 3, ['項次', '廠商名稱', '合約名稱', '維護範圍', '開始日', '截止日', '合約狀態', '剩餘天數']);
    if (!details.length) {
        ds.mergeCells(4, 1, 4, DL);
        const ec = ds.getCell(4, 1);
        ec.value = '目前沒有維護合約資料。';
        ec.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
        ec.alignment = { horizontal: 'center', vertical: 'middle' };
        ec.fill = solid(CLR.sub);
        ec.border = thinBorder();
    } else {
        details.forEach((d, i) => {
            const row = ds.getRow(4 + i);
            const st = contractState(d.contract.maint_end);
            const left = contractDaysLeft(d.contract.maint_end);
            const vals = [i + 1, d.vendor.name || '', d.contract.name || '（未命名）', d.contract.service_items || '—',
                fmtD(d.contract.maint_start), fmtD(d.contract.maint_end), st.text, left === '' ? '—' : left];
            vals.forEach((val, c) => { row.getCell(c + 1).value = val; });
            paintRow(row, DL, i % 2 === 1);
            row.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            [1, 5, 6, 7, 8].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
            [3, 4].forEach(c => { row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
            const stc = row.getCell(7);
            stc.font = { size: 10, bold: true, color: { argb: st.kind === 'expired' ? 'FFB91C1C' : st.kind === 'soon' ? 'FFB45309' : st.kind === 'valid' ? 'FF166534' : 'FF64748B' } };
            stc.fill = solid(st.kind === 'expired' ? 'FFFEE2E2' : st.kind === 'soon' ? 'FFFEF3C7' : st.kind === 'valid' ? 'FFDCFCE7' : 'FFF1F5F9');
        });
    }
    ds.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: DL } };
    ds.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), count: vendors.length, contracts: details.length, stamp: fileNameStamp() };
}

// ── 廠商維護歷程（可指定廠商）────────────────────────
async function buildVendorMaintXlsx(ctx, vendorName) {
    const name = String(vendorName || '').trim();
    const rows = name
        ? await ctx.all(`SELECT * FROM vendor_maint_records WHERE vendor_name = ? ORDER BY maint_date DESC, id DESC`, [name])
        : await ctx.all(`SELECT * FROM vendor_maint_records ORDER BY maint_date DESC, id DESC`);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('廠商維護歷程', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = [{ width: 6 }, { width: 12 }, { width: 20 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 30 }, { width: 24 }];
    const LAST = 11;
    banner(ws, 1, LAST, `🗂️ 廠商維護歷程${name ? '　' + name : ''}　共 ${rows.length} 筆　｜　匯出時間：${nowText()}`, 16);
    subBanner(ws, 2, LAST, '※ 本表為廠商設備維護紀錄（日期、設備、類型、費用、簽收與內容）。');
    headerCells(ws, 3, ['項次', '維護日期', '廠商', '設備 / 項目', '設備序號', '維護類型', '處理人員', '費用(元)', '簽收', '維護內容', '備註']);
    if (!rows.length) {
        ws.mergeCells(4, 1, 4, LAST);
        const ec = ws.getCell(4, 1);
        ec.value = '目前沒有維護紀錄。';
        ec.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
        ec.alignment = { horizontal: 'center', vertical: 'middle' };
        ec.fill = solid(CLR.sub);
        ec.border = thinBorder();
    } else {
        rows.forEach((r, i) => {
            const row = ws.getRow(4 + i);
            const vals = [i + 1, fmtD(r.maint_date), r.vendor_name || '', r.equipment || '', r.equipment_sn || '',
                r.maint_type || '—', r.handler || '—', Number(r.cost) || 0, r.signed ? '✔' : '', r.content || '', r.notes || ''];
            vals.forEach((val, c) => { row.getCell(c + 1).value = val; });
            paintRow(row, LAST, i % 2 === 1);
            [1, 2, 8, 9].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
            row.getCell(4).font = { size: 10, bold: true };
            row.getCell(8).numFmt = '#,##0';
            [10, 11].forEach(c => { row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
        });
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST } };
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), count: rows.length, stamp: fileNameStamp() };
}

// ── 匯入範本 ──────────────────────────────────────────
function styleTemplateSheet(ws, title, headers, widths, example) {
    ws.columns = widths.map(w => ({ width: w }));
    const last = headers.length;
    ws.mergeCells(1, 1, 1, last);
    const t = ws.getCell(1, 1);
    t.value = title + '　—　請從「第 4 列」開始填寫資料';
    t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    t.fill = solid(CLR.primary);
    ws.getRow(1).height = 30;

    ws.mergeCells(2, 1, 2, last);
    const s = ws.getCell(2, 1);
    s.value = '※ 請勿修改第 3 列的欄位名稱；填寫完成後存成 .xlsx，回到系統「📥 匯入／備份」上傳匯入。';
    s.font = { size: 10, italic: true, color: { argb: 'FF555555' } };
    s.alignment = { horizontal: 'center', vertical: 'middle' };
    s.fill = solid(CLR.sub);
    ws.getRow(2).height = 20;

    headerCells(ws, 3, headers);
    const ex = ws.getRow(4);
    example.forEach((v, i) => { ex.getCell(i + 1).value = v; });
    paintRow(ex, last, false);
    ex.eachCell(c => { c.font = { size: 10, color: { argb: 'FF888888' }, italic: true }; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    return headerCells;
}

async function buildAssetTemplateXlsx() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('匯入資料');
    styleTemplateSheet(ws,
        '📦 資產資料表匯入（可直接修改「匯出資產資料」的檔案後重新匯入）',
        ['資產編號', '設備/項目名稱', '資產大類', '原廠序列號(S/N)', '保管使用窗口', '購置擺放地點', '連動合作廠商', '維運狀態', '採購日期', '保固到期日', '報廢原因', '資產規格/備註', '維運備註說明', '所屬部門'],
        [22, 26, 22, 20, 16, 16, 20, 16, 14, 14, 20, 30, 28, 20],
        ['', 'ASUS 商用電腦', '硬體設備 (HW)', 'SN12345678', 'kevin', 'B2', '聯強國際', '線上正常使用', '2026/09/29', '2029/09/29', '', 'i7-12700 / 32GB / 1TB SSD', '資產貼紙已張貼', '資訊部門']);

    const note = wb.addWorksheet('填寫說明');
    note.columns = [{ width: 24 }, { width: 12 }, { width: 40 }, { width: 34 }];
    headerCells(note, 1, ['欄位名稱', '必填', '可填值 / 格式', '說明']);
    const rows = [
        ['資產編號', '', '文字（可空白）', '空白＝新增資產；填「既有編號」＝更新該筆（建議直接用「匯出資產資料」修改）'],
        ['設備/項目名稱', '✔', '文字', '必填'],
        ['資產大類', '✔', '硬體設備 (HW)、軟體授權 (SW)、網路設備 (NET)、資訊周邊 (DEV)、帳密安全性 (SEC)，或 hardware/software…', '必填；決定資產編號前綴'],
        ['原廠序列號(S/N)', '', '文字', '新增時若序號已存在，會更新該筆資產'],
        ['保管使用窗口', '', '文字', ''],
        ['購置擺放地點', '', '文字', ''],
        ['連動合作廠商', '', '系統內既有廠商名稱', '找不到則記為「其他 (預設)」'],
        ['維運狀態', '', '線上正常使用 / 庫存備用 / 維修中 / 已報廢（空白＝庫存備用）', ''],
        ['採購日期', '', 'YYYY/MM/DD 或 YYYY-MM-DD', '資產編號中間的日期採用此欄'],
        ['保固到期日', '', 'YYYY/MM/DD 或 YYYY-MM-DD', ''],
        ['報廢原因', '', '文字', '狀態為已報廢時建議填寫'],
        ['資產規格/備註', '', '文字', '會顯示於總覽、履歷與盤點總表'],
        ['維運備註說明', '', '文字', ''],
        ['所屬部門', '', '部門名稱（例：資訊部門）或代碼（例：IT）', '空白＝資訊部門 (IT)；變更部門會重新產生資產編號']
    ];
    rows.forEach((r, i) => {
        const row = note.getRow(2 + i);
        r.forEach((v, c) => { row.getCell(c + 1).value = v; });
        paintRow(row, 4, i % 2 === 1);
        row.getCell(1).font = { size: 10, bold: true };
        [3, 4].forEach(c => { row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
        row.height = 30;
    });

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer) };
}

async function buildVendorTemplateXlsx() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('匯入資料');
    styleTemplateSheet(ws,
        '🏢 廠商資料匯入範本（同一廠商可填多列，每列一筆維護合約）',
        ['廠商公司名稱', '主要服務專員', '聯絡窗口電話', '通訊地址', '資安 NDA 狀態', '合約名稱', '維護範圍', '合約開始日', '合約截止日'],
        [26, 16, 18, 34, 16, 26, 30, 16, 16],
        ['聯強國際', '張工程師', '02-2508-1234', '台北市中山區民生東路三段 2 號', '已簽署', '伺服器年度維護合約', '機房伺服器與儲存設備', '2026/01/01', '2026/12/31']);
    const ex2 = ws.getRow(5);
    ['聯強國際', '張工程師', '02-2508-1234', '台北市中山區民生東路三段 2 號', '已簽署', '網路設備維護合約', '防火牆、交換器與無線網路', '2026/03/01', '2027/02/28']
        .forEach((v, i) => { ex2.getCell(i + 1).value = v; });
    paintRow(ex2, 9, false);
    ex2.eachCell(c => { c.font = { size: 10, color: { argb: 'FF888888' }, italic: true }; });

    const note = wb.addWorksheet('填寫說明');
    note.columns = [{ width: 24 }, { width: 12 }, { width: 40 }, { width: 34 }];
    headerCells(note, 1, ['欄位名稱', '必填', '可填值 / 格式', '說明']);
    const rows = [
        ['廠商公司名稱', '✔', '文字', '同名視為同一廠商；同一廠商可填多列以建立多筆合約'],
        ['主要服務專員', '', '文字', '同廠商多列時，留空會沿用同廠商其他列的資料'],
        ['聯絡窗口電話', '', '文字', ''],
        ['通訊地址', '', '文字', ''],
        ['資安 NDA 狀態', '', '已簽署 / 尚未簽署（或 1 / 0）', '空白＝新增時預設未簽署'],
        ['合約名稱', '', '文字', '例：伺服器年度維護合約；可留空（僅填維護範圍或日期也會建立合約）'],
        ['維護範圍', '', '文字', '該合約涵蓋的設備或服務範疇，例如：機房伺服器與網路設備'],
        ['合約開始日', '', 'YYYY/MM/DD 或 YYYY-MM-DD', ''],
        ['合約截止日', '', 'YYYY/MM/DD 或 YYYY-MM-DD', '狀態依此日期判斷（有效／60 天內到期／已到期）'],
        ['（重新匯入）', '', '', '同一廠商的合約以檔案內容覆蓋；留空＝清除該廠商合約']
    ];
    rows.forEach((r, i) => {
        const row = note.getRow(2 + i);
        r.forEach((v, c) => { row.getCell(c + 1).value = v; });
        paintRow(row, 4, i % 2 === 1);
        row.getCell(1).font = { size: 10, bold: true };
        [3, 4].forEach(c => { row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
        row.height = 28;
    });

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer) };
}

// ── 資料表匯出（與匯入範本相同格式，可直接編輯後重新匯入）──
const ASSET_SHEET_HEADERS = ['資產編號', '設備/項目名稱', '資產大類', '原廠序列號(S/N)', '保管使用窗口', '購置擺放地點', '連動合作廠商', '維運狀態', '採購日期', '保固到期日', '報廢原因', '資產規格/備註', '維運備註說明', '所屬部門'];
const ASSET_SHEET_WIDTHS = [22, 26, 22, 20, 16, 16, 20, 16, 14, 14, 20, 30, 28, 20];

function assetSheetBase(wb, title) {
    const ws = wb.addWorksheet('匯入資料');
    styleTemplateSheet(ws, title, ASSET_SHEET_HEADERS, ASSET_SHEET_WIDTHS, []);
    ws.spliceRows(4, 1);   // 範本的範例列不使用（資料表匯出直接從第 4 列放實際資料）
    return ws;
}

async function buildAssetDataXlsx(ctx) {
    const assets = await ctx.all(`
        SELECT a.*, COALESCE(v.name, '') AS vendor_name
        FROM assets_new a LEFT JOIN vendors_new v ON a.vendor_id = v.id
        WHERE a.is_deleted = 0
        ORDER BY COALESCE(NULLIF(a.department,''),'IT') ASC, a.asset_no ASC`);
    const opts = await ctx.all(`SELECT field_type, value, label, code FROM field_options`);
    const catLabel = {}, deptLabel = {};
    opts.forEach(o => {
        if (o.field_type === 'category') catLabel[o.value] = (o.label || o.value) + (o.code ? ' (' + o.code + ')' : '');
        if (o.field_type === 'department') deptLabel[o.value] = o.label || o.value;
    });
    const statusText = { active: '線上正常使用', inventory: '庫存備用', repair: '維修中', scrapped: '已報廢' };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = assetSheetBase(wb, `📦 資產資料表（共 ${assets.length} 筆）`);
    const last = ASSET_SHEET_HEADERS.length;
    assets.forEach((a, i) => {
        const row = ws.getRow(4 + i);
        const vals = [
            a.asset_no || '', a.name || '', catLabel[a.category] || a.category || '',
            a.sn || '', a.custodian || '', a.location || '', a.vendor_name || '',
            statusText[a.status] || '使用中', fmtD(a.purchase_date), fmtD(a.warranty_date),
            a.scrap_reason || '', a.spec_note || '', a.notes || '', deptLabel[a.department] || a.department || 'IT'
        ];
        vals.forEach((v, c) => { row.getCell(c + 1).value = v; });
        paintRow(row, last, i % 2 === 1);
        row.getCell(1).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
        row.height = 20;
    });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), count: assets.length, stamp: fileNameStamp() };
}

const VENDOR_SHEET_HEADERS = ['廠商公司名稱', '主要服務專員', '聯絡窗口電話', '通訊地址', '資安 NDA 狀態', '合約名稱', '維護範圍', '合約開始日', '合約截止日'];
const VENDOR_SHEET_WIDTHS = [26, 16, 20, 34, 16, 26, 30, 16, 16];

async function buildVendorDataXlsx(ctx) {
    const vendors = await ctx.all(`SELECT * FROM vendors_new ORDER BY name ASC`);
    const contractMap = await vendorContractMap(ctx, vendors);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Asset Manager (Web)';
    const ws = wb.addWorksheet('匯入資料');
    styleTemplateSheet(ws, `🏢 廠商資料表（共 ${vendors.length} 家／${Object.keys(contractMap).reduce((n, k) => n + contractMap[k].length, 0)} 筆合約）`, VENDOR_SHEET_HEADERS, VENDOR_SHEET_WIDTHS, []);
    ws.spliceRows(4, 1);
    const last = VENDOR_SHEET_HEADERS.length;
    let r = 4, dataRows = 0;
    vendors.forEach(v => {
        const list = contractMap[v.id] || [];
        const rowsData = list.length ? list : [null];   // 無合約廠商仍保留一列基本資料
        rowsData.forEach(c => {
            const row = ws.getRow(r);
            const vals = [
                v.name || '', v.representative || '', v.phone || '', v.address || '',
                v.has_nda ? '已簽署' : '未簽署',
                c ? (c.name || '') : '', c ? (c.service_items || '') : '',
                (c && c.maint_start) ? fmtD(c.maint_start) : '', (c && c.maint_end) ? fmtD(c.maint_end) : ''
            ];
            vals.forEach((val, ci) => { row.getCell(ci + 1).value = val; });
            paintRow(row, last, dataRows % 2 === 1);
            row.getCell(1).font = { size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            [6, 7].forEach(ci => { row.getCell(ci).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }; });
            [5, 8, 9].forEach(ci => { row.getCell(ci).alignment = { horizontal: 'center', vertical: 'middle' }; });
            row.height = 20;
            r++; dataRows++;
        });
    });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), count: vendors.length, rows: dataRows, stamp: fileNameStamp() };
}

module.exports = {
    buildAssetHistoryXlsx,
    buildVendorListXlsx,
    buildVendorMaintXlsx,
    buildAssetTemplateXlsx,
    buildVendorTemplateXlsx,
    buildAssetDataXlsx,
    buildVendorDataXlsx
};




