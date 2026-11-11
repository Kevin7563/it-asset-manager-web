# IT 資產管理系統｜Web 版

多部門共用的 Web 版資產管理系統（Node.js + SQLite + 原生前端），與單機版（Electron）為**各自獨立的專案**：

| | 專案 |
| --- | --- |
| 🖥️ 單機版 | [it-asset-manager](https://github.com/Kevin7563/it-asset-manager)（Electron，分支 `desktop`） |
| 🌐 Web 版 | **本專案** |

## ✨ 功能

- 📊 總覽看板（統計卡、搜尋、Excel 盤點總表匯出）
- 📦 資產管理（新增／編輯／報廢／回收桶／維修／轉移、履歷彈窗與匯出）
- 🏢 廠商管理（看板／維護／維護歷程／附件 NDA 與合約、廠商與維護歷程匯出）
- 🧩 欄位管理、👥 帳號管理（勾選式權限）、🔒 修改密碼
- 📥 匯入／備份（Excel 匯入、資料庫備份／還原、匯入單機版備份、附件路徑修復、附件 ZIP）
- ✏️ 多人同時編輯鎖定（10 分鐘 TTL）＋登入 Session 持久化（重啟不掉登入）
- 🔄 **線上更新**：從 GitHub Releases 檢查／下載／套用更新並自動重啟

## 🚀 快速開始

### 新電腦安裝（3 步）

1. **安裝 Node.js LTS**（20 或 22 以上）：https://nodejs.org/
2. **取得程式**：到 [Releases](https://github.com/Kevin7563/it-asset-manager-web/releases) 下載 `it-asset-manager-web-vX.Y.Z.zip`，解壓到固定資料夾（例如 `D:\it-asset-manager-web`）
3. **雙擊 `start.bat`**：第一次會自動 `npm install`，完成後自動開啟 http://localhost:3010

> 完整圖文步驟（含區網連線、防火牆、開機自動啟動、常見問題）請看 **[docs\安裝與啟動.md](docs/安裝與啟動.md)**

### 手動啟動

```powershell
cd d:\it-asset-manager-web
npm install
npm start
```

- 預設帳號：`admin` / `5508888`（全功能）、`User` / `1234`（一般查詢與報表匯出）
- 🔒 第一次登入後請立刻更換 `admin` 密碼
- 第一次啟動若找不到資料庫，會**自動建立** `data\asset_data.db` 並寫入預設帳號與欄位選項
- 區網其他電腦／手機：`http://<伺服器IP>:3010`（記得在 Windows 防火牆允許 Node.js）

## ⚙️ 設定

優先順序：**環境變數 > `config.json` > 預設值**

| 設定 | 環境變數 | config.json | 預設 |
| --- | --- | --- | --- |
| 連接埠 | `WEB_PORT` | `port` | `3010` |
| 綁定位址 | `WEB_HOST` | `host` | `0.0.0.0` |
| 資料庫 | `WEB_DB` | `dbPath` | `data\asset_data.db` |
| 更新倉庫 | `WEB_UPDATE_REPO` | `githubRepo` | `Kevin7563/it-asset-manager-web` |
| 自訂更新來源 | `WEB_UPDATE_URL` | `updateUrl` | GitHub Releases API |
| 私有倉庫 Token | `WEB_UPDATE_TOKEN` | `githubToken` | 空 |

```powershell
copy config.json.example config.json
npm start
```

## 📁 資料存放

```
data\asset_data.db                資料庫（WAL）
data\vendor_files\{nda,contract,maint}\<id>\   附件
data\imported_files\              匯入的單機版自訂資料夾附件
data\backups\                     資料庫／程式檔備份
updates\                          線上更新下載與暫存
```

> 搬家時只要複製整個 `data\` 資料夾即可。

## 🔄 線上更新與版本管理

1. 「系統管理 → 📥 匯入／備份 → ℹ️ 版本與系統資訊」→ **🔄 檢查更新**
2. 有新版本時：**⬇️ 下載更新檔** → **✅ 套用並重新啟動**
3. 套用前會自動把目前程式檔備份到 `data\backups\app_before_update_*.zip`；資料庫、附件、`config.json` 不會被更動

發行新版本（維護者）：

```powershell
npm run release:patch     # 或 release:minor / release:major
```

腳本會自動：commit → push 分支與 `vX.Y.Z` 標籤 → 打包 `out\it-asset-manager-web-vX.Y.Z.zip` → 用 gh CLI 建立 GitHub Release（附上 ZIP）。
Web 版的「🔄 檢查更新」就是讀這個 Release（詳見 `docs\更新與版本管理.md`）。

## 🧩 權限

| 權限 | 說明 |
| --- | --- |
| 👑 全功能 | 所有功能（系統管理員） |
| 📊 一般查詢與報表匯出 | 總覽查詢、Excel 報表 |
| 🏢 廠商管理 | 廠商資料、維護歷程、附件 |
| 📦 資產管理 | 資產、維修、轉移、回收桶 |

## 🗂️ 專案結構

```
server.js               HTTP 伺服器與 API
lib/                    service（商業邏輯）、db、auth、files、importer、updater、匯出
public/                 index.html / app.js / styles.css（原生 JS）
scripts/                發行打包、更新後重啟
docs/                   更新與版本管理說明
.github/workflows/      推送標籤自動建立 Release
```

## 📄 授權

Copyright © 2026 KevinChang. 版權所有。
