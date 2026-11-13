# ============================================================
#  IT 資產管理系統 - Web 版｜常駐程式（系統匣）
#  在背景執行 node server.js，並提供右鍵選單：
#    開啟網頁 / 啟動服務 / 重新啟動服務 / 停止服務 / 開啟資料夾 / 結束
#  由 launch.ps1 以隱藏方式啟動；結束程式時圖示隨之移除
# ============================================================

[CmdletBinding()]
param(
    [string]$Root = '',
    [int]$Port = 0,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'app-common.ps1')
Add-Type -AssemblyName System.Drawing | Out-Null

$script:Root = Get-AppRoot -Hint $Root
$script:Port = Get-AppPort -Port $Port -Root $script:Root
$script:Url = 'http://localhost:' + $script:Port
$script:Busy = $false
$script:PrevRunning = $false

# 單一實例：已經有常駐程式就直接結束
$mutex = New-Object System.Threading.Mutex($false, $script:AppMutexName)
if (-not $mutex.WaitOne(0)) { exit 0 }

Write-AppLog -Root $script:Root -Message ('常駐程式啟動（port ' + $script:Port + '）')

# ── 圖示 ───────────────────────────────────────────────
$iconPath = Join-Path $script:Root 'public\app.ico'
if (Test-Path -LiteralPath $iconPath) {
    try { $script:AppIcon = New-Object System.Drawing.Icon($iconPath) }
    catch { $script:AppIcon = [System.Drawing.SystemIcons]::Application }
} else {
    $script:AppIcon = [System.Drawing.SystemIcons]::Application
}

# ── 動作 ───────────────────────────────────────────────
function Show-Balloon {
    param([string]$Title, [string]$Body = ' ', [string]$Icon = 'Info')
    try {
        $script:Notify.BalloonTipTitle = $Title
        $script:Notify.BalloonTipText = $Body
        $script:Notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]$Icon
        $script:Notify.ShowBalloonTip(5000)
    } catch { }
}

function Open-AppUrl {
    try { Start-Process -FilePath $script:Url } catch { }
}

function Open-AppFolder {
    try { Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $script:Root + '"') } catch { }
}

function Open-AppLog {
    try {
        $dir = Get-AppLogDir -Root $script:Root
        Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $dir + '"')
    } catch { }
}

function Invoke-StartService {
    $script:Busy = $true
    try {
        if (Test-AppServerRunning -Port $script:Port) {
            Show-Balloon '服務已在執行' ('http://localhost:' + $script:Port)
            return
        }
        $node = Get-AppNodeExe -Root $script:Root
        if (-not $node) {
            Show-AppMessage "找不到 Node.js（node.exe）。`n`n請安裝 Node.js LTS 後再試，或重新解壓縮完整的程式包。"
            return
        }
        if (Start-AppServer -Root $script:Root -Port $script:Port) {
            Show-Balloon '服務已啟動' ('http://localhost:' + $script:Port + "`n右鍵圖示可重新啟動或停止服務")
            if (-not $script:NoBrowser) { Open-AppUrl }
        } else {
            Show-Balloon '服務啟動失敗' '請開啟 data\logs\server.err.log 查看原因' 'Error'
        }
    } finally {
        $script:Busy = $false
        Update-TrayState
    }
}

function Invoke-StopService {
    param([switch]$Ask)
    $script:Busy = $true
    try {
        $proc = Get-AppServerProcess -Port $script:Port
        if (-not $proc) {
            Show-Balloon '服務目前沒有在執行' ('http://localhost:' + $script:Port)
            return
        }
        if ($proc.ProcessName -notmatch 'node') {
            Show-AppMessage ("連接埠 " + $script:Port + " 目前被「" + $proc.ProcessName + "」使用，不是本系統的服務，因此不處理。" + "`n`n請確認是否重複啟動，或改用其他連接埠（config.json 的 port）。")
            return
        }
        if ($Ask) {
            $yes = Show-AppConfirm ("確定要停止 IT 資產管理系統的服務嗎？`n`n停止後，已開啟的網頁將無法使用，直到再次啟動。")
            if (-not $yes) { return }
        }
        if (Stop-AppServer -Port $script:Port) {
            Write-AppLog -Root $script:Root -Message '服務已停止（由常駐程式）'
            Show-Balloon '服務已停止' '可由圖示右鍵「啟動服務」重新啟動。' 'Warning'
        } else {
            Show-Balloon '停止服務失敗' '請開啟「工作管理員」確認 node.exe 是否仍在執行' 'Error'
        }
    } finally {
        $script:Busy = $false
        Update-TrayState
    }
}

function Invoke-RestartService {
    $script:Busy = $true
    try {
        $proc = Get-AppServerProcess -Port $script:Port
        if ($proc -and $proc.ProcessName -notmatch 'node') {
            Show-AppMessage ("連接埠 " + $script:Port + " 目前被「" + $proc.ProcessName + "」使用，不是本系統的服務，因此無法重新啟動。" + "`n`n請確認是否重複啟動，或改用其他連接埠（config.json 的 port）。")
            return
        }
        if ($proc) {
            if (-not (Stop-AppServer -Port $script:Port)) {
                Show-Balloon '重新啟動失敗' '無法停止舊的服務，請開啟工作管理員確認。' 'Error'
                return
            }
        }
        Start-Sleep -Milliseconds 400
        if (Start-AppServer -Root $script:Root -Port $script:Port) {
            Write-AppLog -Root $script:Root -Message '服務已重新啟動（由常駐程式）'
            Show-Balloon '服務已重新啟動' ('http://localhost:' + $script:Port)
        } else {
            Show-Balloon '重新啟動失敗' '請開啟 data\logs\server.err.log 查看原因' 'Error'
        }
    } finally {
        $script:Busy = $false
        Update-TrayState
    }
}

function Exit-AppTray {
    $proc = Get-AppServerProcess -Port $script:Port
    $msg = "要結束常駐程式嗎？`n`n"
    if ($proc) { $msg += "結束後會同時停止服務（http://localhost:$($script:Port)），網頁將無法使用。" }
    else { $msg += '服務目前沒有在執行，結束後圖示會從右下角移除。' }
    if (-not (Show-AppConfirm $msg)) { return }
    $script:Timer.Stop()
    if ($proc -and $proc.ProcessName -match 'node') {
        [void](Stop-AppServer -Port $script:Port)
        Write-AppLog -Root $script:Root -Message '服務已停止（結束常駐程式）'
    }
    Write-AppLog -Root $script:Root -Message '常駐程式結束'
    $script:Notify.Visible = $false
    $script:Notify.Dispose()
    [System.Windows.Forms.Application]::ExitThread()
}

# ── 系統匣圖示與選單 ───────────────────────────────────
function New-MenuItem {
    param([string]$Text, [scriptblock]$OnClick, [bool]$Enabled = $true, [string]$Shortcut = '')
    $item = New-Object System.Windows.Forms.ToolStripMenuItem($Text)
    $item.Enabled = $Enabled
    if ($Shortcut) { $item.ShortcutKeyDisplayString = $Shortcut }
    if ($OnClick) { $item.add_Click($OnClick) }
    return $item
}

$script:Notify = New-Object System.Windows.Forms.NotifyIcon
$script:Notify.Icon = $script:AppIcon
$script:Notify.Text = 'IT 資產管理系統（Web 版）'
$script:Notify.Visible = $true
$script:Notify.add_DoubleClick({ Open-AppUrl })

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.ShowImageMargin = $false

$script:ItemStatus = New-MenuItem -Text '狀態：檢查中…' -Enabled $false
$itemOpen = New-MenuItem -Text ('開啟網頁（http://localhost:' + $script:Port + '）') -OnClick { Open-AppUrl }
$script:ItemStart = New-MenuItem -Text '啟動服務' -OnClick { Invoke-StartService }
$script:ItemRestart = New-MenuItem -Text '重新啟動服務' -OnClick { Invoke-RestartService }
$script:ItemStop = New-MenuItem -Text '停止服務' -OnClick { Invoke-StopService -Ask }
$itemFolder = New-MenuItem -Text '開啟程式資料夾' -OnClick { Open-AppFolder }
$itemLog = New-MenuItem -Text '開啟服務記錄（log）' -OnClick { Open-AppLog }
$itemExit = New-MenuItem -Text '結束常駐程式（停止服務）' -OnClick { Exit-AppTray }

[void]$menu.Items.Add($script:ItemStatus)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($itemOpen)
[void]$menu.Items.Add($script:ItemStart)
[void]$menu.Items.Add($script:ItemRestart)
[void]$menu.Items.Add($script:ItemStop)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($itemFolder)
[void]$menu.Items.Add($itemLog)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($itemExit)

$script:Notify.ContextMenuStrip = $menu

function Update-TrayState {
    $running = Test-AppServerRunning -Port $script:Port
    if ($running) {
        $script:ItemStatus.Text = '狀態：執行中'
        $script:ItemStart.Enabled = $false
        $script:ItemRestart.Enabled = $true
        $script:ItemStop.Enabled = $true
        $script:Notify.Text = 'IT 資產管理系統：執行中（localhost:' + $script:Port + '）'
    } else {
        $script:ItemStatus.Text = '狀態：已停止'
        $script:ItemStart.Enabled = $true
        $script:ItemRestart.Enabled = $false
        $script:ItemStop.Enabled = $false
        $script:Notify.Text = 'IT 資產管理系統：已停止'
    }
    if (-not $script:Busy -and $script:PrevRunning -and -not $running) {
        Show-Balloon '服務已停止' '可由圖示右鍵「啟動服務」重新啟動。' 'Warning'
    }
    if (-not $script:Busy) { $script:PrevRunning = $running }
}

# ── 啟動服務並進入常駐迴圈 ─────────────────────────────
try {
    $already = Test-AppServerRunning -Port $script:Port
    $started = $false
    if (-not $already) {
        $node = Get-AppNodeExe -Root $script:Root
        if (-not $node) {
            Show-AppMessage "找不到 Node.js（node.exe）。`n`n請安裝 Node.js LTS（20／22 以上）後再執行 start.bat，`n或改用內含 Node.js 的可攜版。"
            $script:Notify.Visible = $false
            $script:Notify.Dispose()
            exit 1
        }
        $started = Start-AppServer -Root $script:Root -Port $script:Port
    }
    $script:PrevRunning = Test-AppServerRunning -Port $script:Port
    Update-TrayState

    if ($started) {
        Show-Balloon 'IT 資產管理系統已啟動' ('http://localhost:' + $script:Port + "`n右鍵圖示可重新啟動或停止服務")
        if (-not $NoBrowser) { Open-AppUrl }
    } elseif ($script:PrevRunning) {
        Show-Balloon '服務已在執行' ('http://localhost:' + $script:Port)
        if (-not $NoBrowser) { Open-AppUrl }
    } else {
        Show-Balloon '服務啟動失敗' '請開啟 data\logs\server.err.log 查看原因' 'Error'
    }
} catch {
    Write-AppLog -Root $script:Root -Message ('常駐程式啟動例外：' + $_.Exception.Message)
    Show-Balloon '常駐程式啟動失敗' $_.Exception.Message 'Error'
}

$script:Timer = New-Object System.Windows.Forms.Timer
$script:Timer.Interval = 4000
$script:Timer.add_Tick({ Update-TrayState })
$script:Timer.Start()

$context = New-Object System.Windows.Forms.ApplicationContext
try {
    [System.Windows.Forms.Application]::Run($context)
} finally {
    try { $script:Timer.Stop(); $script:Timer.Dispose() } catch { }
    try { $script:Notify.Visible = $false; $script:Notify.Dispose() } catch { }
    try { $mutex.ReleaseMutex() } catch { }
    try { $mutex.Dispose() } catch { }
}

