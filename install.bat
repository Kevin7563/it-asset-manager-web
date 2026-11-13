@echo off
rem ============================================================
rem  IT Asset Manager - Web Edition :: installer
rem  Creates a desktop shortcut (executable icon) and a
rem  Start Menu shortcut, then optionally starts the service.
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "scripts\install.ps1" (
    echo [ERROR] scripts\install.ps1 not found. Please extract the ZIP again.
    pause
    exit /b 1
)

powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
exit /b 0
