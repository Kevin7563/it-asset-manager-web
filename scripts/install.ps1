# ============================================================
#  IT 資產管理系統 - Web 版｜安裝（建立桌面執行圖示）
#  · 在桌面與開始功能表建立「IT 資產管理系統」捷徑
#  · 可加 -Quiet 只建立捷徑、不顯示任何視窗
# ============================================================

[CmdletBinding()]
param(
    [switch]$Quiet,
    [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'app-common.ps1')

$root = Get-AppRoot -Hint $Root

try {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'scripts\launch.ps1'))) {
        throw ('找不到 ' + (Join-Path $root 'scripts\launch.ps1') + '，請重新解壓縮完整的程式包。')
    }

    $links = @(Install-AppShortcuts -Root $root)

    # 記錄「已建立捷徑」，避免每次啟動 start.bat 都重建
    try {
        $dataDir = Join-Path $root 'data'
        if (-not (Test-Path -LiteralPath $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
        Set-Content -LiteralPath (Join-Path $dataDir '.desktop-shortcut') -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Encoding UTF8
    } catch { }
    Write-AppLog -Root $root -Message ('已建立捷徑：' + ($links -join '、'))

    if ($Quiet) { exit 0 }

    $msg = "已在下列位置建立執行圖示：`n`n" + ($links -join "`n") +
           "`n`n之後雙擊桌面圖示即可啟動（服務會在背景執行，右下角會有常駐圖示）。`n`n要現在啟動嗎？"
    if (Show-AppConfirm $msg) {
        $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $launch = Join-Path $PSScriptRoot 'launch.ps1'
        $argString = '-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launch + '"' +
                     ' -Root "' + $root + '"'
        Start-Process -FilePath $psExe -ArgumentList $argString -WindowStyle Hidden | Out-Null
    }
    exit 0
} catch {
    $msg = $_.Exception.Message
    try { Write-AppLog -Root $root -Message ('建立捷徑失敗：' + $msg) } catch { }
    if (-not $Quiet) { Show-AppMessage -Icon 'Error' -Text ("建立執行圖示失敗：`n" + $msg) }
    exit 1
}
