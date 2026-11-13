# ============================================================
#  IT 資產管理系統 - Web 版｜啟動器
#  1. 顯示「啟動說明」視窗
#  2. 第一次啟動自動安裝相依套件（含進度視窗）
#  3. 以「背景／隱藏」方式啟動常駐程式（系統匣 tray.ps1）
#  參數：-Yes（略過說明視窗）、-NoBrowser（不自動開瀏覽器）
# ============================================================

[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$NoBrowser,
    [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'app-common.ps1')
Add-Type -AssemblyName System.Drawing | Out-Null

$root = Get-AppRoot -Hint $Root
$port = Get-AppPort -Root $root
$url = 'http://localhost:' + $port

function Show-StartDialog {
    param([string]$AppRoot, [int]$AppPort, [bool]$ShortcutCreated)

    $dbPath = Join-Path $AppRoot 'data\asset_data.db'
    $lines = @(
        '本程式會在「背景」啟動 Web 服務，不會再出現黑色命令視窗。',
        '',
        '啟動後會：',
        '  • 右下角通知區域（系統匣）出現常駐圖示',
        '  • 在圖示上按右鍵 →「開啟網頁」「重新啟動服務」「停止服務」',
        '  • 自動開啟瀏覽器',
        '',
        ('服務網址：http://localhost:' + $AppPort),
        ('資料庫　：' + $dbPath),
        '　　　　　（第一次啟動會自動建立，含預設帳號）',
        '預設帳號：admin / 5508888（登入後請立即修改密碼）'
    )
    if ($ShortcutCreated) {
        $lines += ''
        $lines += '✔ 已在桌面建立「IT 資產管理系統」執行圖示，之後直接雙擊即可。'
    }

    $font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9.75)
    $fontTitle = New-Object System.Drawing.Font('Microsoft JhengHei UI', 14, [System.Drawing.FontStyle]::Bold)

    # 依內容行數自動決定視窗高度，避免文字被截掉或留下大片空白
    $bodyHeight = ($lines.Count * 24) + 8
    $formHeight = $bodyHeight + 128

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'IT 資產管理系統 - Web 版'
    $form.ClientSize = New-Object System.Drawing.Size(620, $formHeight)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowIcon = $false
    $form.Font = $font
    $form.TopMost = $true
    $form.add_Shown({ $this.Activate() })

    $title = New-Object System.Windows.Forms.Label
    $title.Text = 'IT 資產管理系統 - Web 版'
    $title.Font = $fontTitle
    $title.SetBounds(20, 16, 580, 32)
    $form.Controls.Add($title)

    $body = New-Object System.Windows.Forms.Label
    $body.Text = ($lines -join "`r`n")
    $body.AutoSize = $false
    $body.UseMnemonic = $false
    $body.SetBounds(20, 58, 580, $bodyHeight)
    $form.Controls.Add($body)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Text = '啟動服務'
    $btnOk.SetBounds(400, $formHeight - 58, 100, 32)
    $btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btnOk)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text = '取消'
    $btnCancel.SetBounds(508, $formHeight - 58, 90, 32)
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($btnCancel)

    $form.AcceptButton = $btnOk
    $form.CancelButton = $btnCancel

    $result = $form.ShowDialog()
    $form.Dispose()
    $font.Dispose()
    $fontTitle.Dispose()
    return ($result -eq [System.Windows.Forms.DialogResult]::OK)
}

function Invoke-NpmInstall {
    param([string]$AppRoot)

    $logDir = Get-AppLogDir -Root $AppRoot
    $outLog = Join-Path $logDir 'install.out.log'
    $errLog = Join-Path $logDir 'install.err.log'

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'IT 資產管理系統 - 第一次啟動'
    $form.ClientSize = New-Object System.Drawing.Size(470, 140)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.add_Shown({ $this.Activate() })

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "正在安裝相依套件（第一次啟動需要 1～3 分鐘，請稍候）…`r`n完成後會自動啟動服務。"
    $label.AutoSize = $false
    $label.SetBounds(16, 16, 440, 50)
    $form.Controls.Add($label)

    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.SetBounds(16, 76, 440, 20)
    $bar.Style = 'Marquee'
    $bar.MarqueeAnimationSpeed = 30
    $form.Controls.Add($bar)

    $comspec = $env:ComSpec
    $proc = Start-Process -FilePath $comspec -ArgumentList '/c', 'npm install --no-audit --no-fund' `
        -WorkingDirectory $AppRoot -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 500
    $timer.add_Tick({ if ($proc.HasExited) { $timer.Stop(); $form.Close() } })
    $timer.Start()
    [void]$form.ShowDialog()
    $timer.Stop()
    $timer.Dispose()
    $form.Dispose()
    try { $proc.WaitForExit(10000) | Out-Null } catch { }

    return ($proc.ExitCode -eq 0 -and (Test-Path -LiteralPath (Join-Path $AppRoot 'node_modules\sqlite3')))
}

# ── 主流程 ─────────────────────────────────────────────
try {
    [System.Windows.Forms.Application]::EnableVisualStyles()

    if (Test-AppTrayRunning) {
        if (-not $NoBrowser) { try { Start-Process -FilePath $url } catch { } }
        if (-not $Yes) {
            Show-AppMessage ("服務已在背景執行中（請看右下角系統匣圖示）。`n`n如需重新啟動或停止服務，請在圖示上按右鍵。")
        }
        exit 0
    }

    if (-not (Get-AppNodeExe -Root $root)) {
        Show-AppMessage -Icon 'Error' -Text ("找不到 Node.js（node.exe）。`n`n" +
            "請先安裝 Node.js LTS（20／22 以上）：https://nodejs.org/`n" +
            "或改用「可攜版」程式包（已內含 Node.js，免安裝）。")
        exit 1
    }

    # 第一次啟動：自動建立桌面／開始功能表捷徑（只做一次；可再執行 install.bat 重建）
    $shortcutCreated = $false
    $marker = Join-Path $root 'data\.desktop-shortcut'
    if (-not (Test-Path -LiteralPath $marker)) {
        try {
            New-Item -ItemType Directory -Force -Path (Join-Path $root 'data') | Out-Null
            $links = Install-AppShortcuts -Root $root
            Set-Content -LiteralPath $marker -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Encoding UTF8
            $shortcutCreated = $true
            Write-AppLog -Root $root -Message ('已建立捷徑：' + (@($links) -join '、'))
        } catch {
            Write-AppLog -Root $root -Message ('建立捷徑失敗：' + $_.Exception.Message)
        }
    }

    # 第一次啟動：缺少相依套件時自動安裝（需 npm；可攜版已內含）
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\sqlite3'))) {
        if (-not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue)) {
            Show-AppMessage -Icon 'Error' -Text ("第一次啟動需要安裝相依套件，但找不到 npm.cmd。`n`n" +
                "請安裝 Node.js LTS（含 npm）後再執行 start.bat，`n" +
                "或改用內含相依套件的可攜版程式包。")
            exit 1
        }
        if (-not (Invoke-NpmInstall -AppRoot $root)) {
            Show-AppMessage -Icon 'Error' -Text ("相依套件安裝失敗。`n`n" +
                "請確認網路連線，或查看記錄檔：`n" +
                (Join-Path (Get-AppLogDir -Root $root) 'install.err.log') +
                "`n`n（公司網路可能需要設定 npm proxy）")
            exit 1
        }
        Write-AppLog -Root $root -Message '相依套件安裝完成'
    }

    if (-not $Yes) {
        if (-not (Show-StartDialog -AppRoot $root -AppPort $port -ShortcutCreated $shortcutCreated)) {
            Write-AppLog -Root $root -Message '使用者取消啟動'
            exit 0
        }
    }

    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $tray = Join-Path $PSScriptRoot 'tray.ps1'
    $argString = '-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $tray + '"' +
                 ' -Root "' + $root + '" -Port ' + $port
    if ($NoBrowser) { $argString += ' -NoBrowser' }
    Start-Process -FilePath $psExe -ArgumentList $argString -WindowStyle Hidden | Out-Null
    Write-AppLog -Root $root -Message '已啟動常駐程式（背景執行）'
    exit 0
} catch {
    $msg = $_.Exception.Message
    try { Write-AppLog -Root $root -Message ('啟動失敗：' + $msg) } catch { }
    Show-AppMessage -Icon 'Error' -Text ("啟動失敗：`n" + $msg)
    exit 1
}
