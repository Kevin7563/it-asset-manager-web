# ============================================================
#  IT 資產管理系統 - Web 版｜共用函式
#  由 launch.ps1 / tray.ps1 / install.ps1 以 dot-source 方式載入
#  僅使用 Windows 內建 PowerShell 5.1 與 .NET，不引入外部套件
# ============================================================

Add-Type -AssemblyName System.Windows.Forms | Out-Null

$script:AppMutexName = 'Local\ITAssetManagerWebTray'
$script:AppTitle = 'IT 資產管理系統 - Web 版'
$script:AppCommonDir = $PSScriptRoot

# ── 路徑與環境 ─────────────────────────────────────────
function Get-AppRoot {
    param([string]$Hint = '')
    if ($Hint) { return [System.IO.Path]::GetFullPath($Hint) }
    # 呼叫端位於 <root>\scripts\，往上一層就是程式根目錄
    return [System.IO.Path]::GetFullPath((Join-Path $script:AppCommonDir '..'))
}

function Get-AppPort {
    param([int]$Port = 0, [string]$Root = '')
    if ($Port -gt 0) { return $Port }
    $envPort = 0
    if ([int]::TryParse([string]$env:WEB_PORT, [ref]$envPort) -and $envPort -gt 0) { return $envPort }
    if ($Root) {
        $cfg = Join-Path $Root 'config.json'
        if (Test-Path -LiteralPath $cfg) {
            try {
                $json = Get-Content -LiteralPath $cfg -Raw -Encoding UTF8 | ConvertFrom-Json
                $p = 0
                if ($json.port -and [int]::TryParse([string]$json.port, [ref]$p) -and $p -gt 0) { return $p }
            } catch { }
        }
    }
    return 3010
}

function Get-AppNodeExe {
    param([string]$Root)
    # 可攜版：優先使用資料夾內的 node.exe
    if ($Root) {
        $local = Join-Path $Root 'node.exe'
        if (Test-Path -LiteralPath $local) { return $local }
    }
    $cmd = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ''
}

function Get-AppLogDir {
    param([string]$Root)
    $dir = Join-Path $Root 'data\logs'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    return $dir
}

function Write-AppLog {
    param([string]$Root, [string]$Message)
    try {
        $dir = Get-AppLogDir -Root $Root
        $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
        Add-Content -LiteralPath (Join-Path $dir 'tray.log') -Value $line -Encoding UTF8
    } catch { }
}

function Get-AppDesktopDir {
    $dir = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    if (-not $dir) { $dir = Join-Path $env:USERPROFILE 'Desktop' }
    return $dir
}

function Get-AppStartMenuDir {
    $dir = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
    if (-not $dir) { $dir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
    return $dir
}

# ── 服務狀態 / 程序控制 ────────────────────────────────
function Get-ListeningProcessId {
    param([int]$Port)
    if ($Port -le 0) { return 0 }
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) { return [int]$conn.OwningProcess }
    } catch { }
    try {
        $netstat = Join-Path $env:SystemRoot 'System32\netstat.exe'
        $lines = & $netstat -ano -p TCP 2>$null
        foreach ($line in @($lines)) {
            if ($line -match ('^\s*TCP\s+\S+:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$')) { return [int]$Matches[1] }
        }
    } catch { }
    return 0
}

function Test-AppServerRunning {
    param([int]$Port)
    return ((Get-ListeningProcessId -Port $Port) -gt 0)
}

function Get-AppServerProcess {
    param([int]$Port)
    $targetId = Get-ListeningProcessId -Port $Port
    if ($targetId -le 0) { return $null }
    return (Get-Process -Id $targetId -ErrorAction SilentlyContinue)
}

function Wait-AppServer {
    param([int]$Port, [int]$TimeoutSeconds = 40)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-AppServerRunning -Port $Port) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return (Test-AppServerRunning -Port $Port)
}

function Start-AppServer {
    param([string]$Root, [int]$Port)
    if (Test-AppServerRunning -Port $Port) { return $true }
    $node = Get-AppNodeExe -Root $Root
    if (-not $node) { return $false }
    $logDir = Get-AppLogDir -Root $Root
    $outLog = Join-Path $logDir 'server.out.log'
    $errLog = Join-Path $logDir 'server.err.log'
    try {
        Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $Root -WindowStyle Hidden `
            -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
    } catch {
        Write-AppLog -Root $Root -Message ('啟動服務失敗：' + $_.Exception.Message)
        return $false
    }
    $ok = Wait-AppServer -Port $Port -TimeoutSeconds 40
    Write-AppLog -Root $Root -Message ('啟動服務' + $(if ($ok) { '成功' } else { '失敗' }) + '（port ' + $Port + '）')
    return $ok
}

function Stop-AppServer {
    param([int]$Port, [int]$TimeoutSeconds = 15)
    $targetId = Get-ListeningProcessId -Port $Port
    if ($targetId -le 0) { return $true }
    $proc = Get-Process -Id $targetId -ErrorAction SilentlyContinue
    # 只處理 node 程序，避免誤關其他佔用同一個埠的程式
    if ($proc -and $proc.ProcessName -notmatch 'node') { return $false }
    try { Stop-Process -Id $targetId -Force -ErrorAction Stop } catch { return $false }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-AppServerRunning -Port $Port)) { return $true }
        Start-Sleep -Milliseconds 300
    }
    return (-not (Test-AppServerRunning -Port $Port))
}

# ── 常駐程式（系統匣）單一實例 ─────────────────────────
function Test-AppTrayRunning {
    $m = $null
    try {
        $m = [System.Threading.Mutex]::OpenExisting($script:AppMutexName)
        return $true
    } catch {
        return $false
    } finally {
        if ($m) { $m.Dispose() }
    }
}

# ── 捷徑（桌面／開始功能表）────────────────────────────
function New-AppShortcut {
    param([string]$Root, [string]$LinkPath, [string]$Description = '')
    if (-not $Description) { $Description = $script:AppTitle }
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $launch = Join-Path $Root 'scripts\launch.ps1'
    $ws = New-Object -ComObject WScript.Shell
    try {
        $lnk = $ws.CreateShortcut($LinkPath)
        $lnk.TargetPath = $psExe
        $lnk.Arguments = '-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launch + '"'
        $lnk.WorkingDirectory = $Root
        $lnk.WindowStyle = 7            # 7 = 最小化（背景啟動，不閃黑窗）
        $lnk.Description = $Description
        $icon = Join-Path $Root 'public\app.ico'
        if (Test-Path -LiteralPath $icon) { $lnk.IconLocation = $icon + ',0' }
        $lnk.Save()
    } finally {
        if ($ws) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
    }
    return $LinkPath
}

function Install-AppShortcuts {
    param([string]$Root, [switch]$NoStartMenu)
    $created = @()
    $created += New-AppShortcut -Root $Root -LinkPath (Join-Path (Get-AppDesktopDir) 'IT 資產管理系統.lnk')
    if (-not $NoStartMenu) {
        $created += New-AppShortcut -Root $Root -LinkPath (Join-Path (Get-AppStartMenuDir) 'IT 資產管理系統.lnk')
    }
    return $created
}

# ── 對話框 ─────────────────────────────────────────────
# 以「置頂的透明 owner 視窗」顯示，避免背景啟動時視窗被其他程式蓋住
function New-AppDialogOwner {
    $owner = New-Object System.Windows.Forms.Form
    $owner.Text = $script:AppTitle
    $owner.FormBorderStyle = 'None'
    $owner.ShowInTaskbar = $false
    $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.Opacity = 0
    $owner.TopMost = $true
    [void]$owner.Show()
    return $owner
}

function Show-AppMessage {
    param([string]$Text, [string]$Title = '', [string]$Icon = 'Information')
    if (-not $Title) { $Title = $script:AppTitle }
    $owner = New-AppDialogOwner
    try {
        [void][System.Windows.Forms.MessageBox]::Show($owner, $Text, $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]$Icon)
    } finally {
        $owner.Close()
        $owner.Dispose()
    }
}

function Show-AppConfirm {
    param([string]$Text, [string]$Title = '', [string]$Icon = 'Question')
    if (-not $Title) { $Title = $script:AppTitle }
    $owner = New-AppDialogOwner
    try {
        $result = [System.Windows.Forms.MessageBox]::Show($owner, $Text, $Title,
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]$Icon)
    } finally {
        $owner.Close()
        $owner.Dispose()
    }
    return ($result -eq [System.Windows.Forms.DialogResult]::Yes)
}
