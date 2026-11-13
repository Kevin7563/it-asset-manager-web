@echo off
rem ============================================================
rem  IT Asset Manager - Web Edition :: background launcher
rem
rem  What it does:
rem    * shows an intro window explaining what will happen
rem    * starts the service in the BACKGROUND (no console window)
rem    * adds a tray icon (notification area) - right click it to
rem      open / restart / stop the service
rem
rem  Options:
rem    start.bat --no-browser   do not open the browser
rem    start.bat --silent       skip the intro window
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "scripts\launch.ps1" (
    echo [ERROR] scripts\launch.ps1 not found. Please extract the ZIP again.
    echo.
    pause
    exit /b 1
)

set "PSARGS=-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%~dp0scripts\launch.ps1"""
if /i "%~1"=="--no-browser" set "PSARGS=%PSARGS% -NoBrowser"
if /i "%~1"=="--silent"     set "PSARGS=%PSARGS% -Yes"
if /i "%~2"=="--no-browser" set "PSARGS=%PSARGS% -NoBrowser"
if /i "%~2"=="--silent"     set "PSARGS=%PSARGS% -Yes"

start "" /min powershell.exe %PSARGS%
exit /b 0
