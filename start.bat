@echo off
rem ============================================================
rem  IT Asset Manager - Web Edition :: launcher
rem
rem  Normal  : starts the service in the BACKGROUND (no console
rem            window) and adds a tray icon. Needs scripts\launch.ps1
rem  Fallback: if scripts\ is missing (e.g. this install was updated
rem            online from an older version), it starts in CONSOLE
rem            mode so the system keeps working.
rem
rem  Options:
rem    start.bat --no-browser   do not open the browser
rem    start.bat --silent       skip the intro window
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "scripts\launch.ps1" goto legacy

set "PSARGS=-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%~dp0scripts\launch.ps1"""
if /i "%~1"=="--no-browser" set "PSARGS=%PSARGS% -NoBrowser"
if /i "%~1"=="--silent"     set "PSARGS=%PSARGS% -Yes"
if /i "%~2"=="--no-browser" set "PSARGS=%PSARGS% -NoBrowser"
if /i "%~2"=="--silent"     set "PSARGS=%PSARGS% -Yes"

start "" /min powershell.exe %PSARGS%
exit /b 0

:legacy
rem ---------- Fallback: console mode (no tray icon) ----------
if exist "%~dp0node.exe" (
    set "NODE_EXE=%~dp0node.exe"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Node.js not found.
        echo         Install Node.js LTS ^(20/22^) or download the ZIP again.
        echo.
        pause
        exit /b 1
    )
    set "NODE_EXE=node"
)

if not exist "node_modules\sqlite3" (
    echo [1/2] Installing dependencies ^(first run, may take 1-3 minutes^)...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Check your network or use the portable ZIP.
        echo.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

echo.
echo [2/2] Starting in CONSOLE mode ^(tray icon unavailable^).
echo       URL   : http://localhost:3010
echo       Close this window to stop the service.
echo       For background + tray mode: run install.bat, or download the ZIP again.
echo.
if /i not "%~1"=="--no-browser" start "" http://localhost:3010
"%NODE_EXE%" server.js

echo.
echo Server stopped.
pause
exit /b 0
