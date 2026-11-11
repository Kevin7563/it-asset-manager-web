@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title IT 資產管理系統 - Web 版

echo ============================================================
echo   IT 資產管理系統 - Web 版
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [錯誤] 找不到 Node.js。
    echo        請先安裝 Node.js LTS（建議 20 或 22 以上）：https://nodejs.org/
    echo        安裝完成後重新開機，再執行本檔案。
    echo.
    pause
    exit /b 1
)

echo Node.js 版本：
node --version
echo.

if not exist "node_modules\sqlite3" (
    echo [1/2] 首次啟動：正在安裝相依套件（需要網路，約 1-3 分鐘）...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [錯誤] 相依套件安裝失敗。
        echo        請確認網路可連線，或改用系統管理員身分執行。
        echo        若錯誤與 sqlite3 有關，可先安裝 Node.js LTS（20/22）後刪除 node_modules 再試。
        echo.
        pause
        exit /b 1
    )
) else (
    echo [1/2] 相依套件已存在，略過安裝。
)

echo.
echo [2/2] 啟動服務（關閉本視窗即停止服務）...
echo       瀏覽器會自動開啟（預設 http://localhost:3010；若已改 port 請見 config.json）
echo       預設帳號：admin / 5508888（請登入後立即修改密碼）
echo.
start "" http://localhost:3010
node server.js

echo.
echo 服務已停止。
pause
