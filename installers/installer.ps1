Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ── Paths ──
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$claudeDir   = Join-Path $env:USERPROFILE ".claude"
$installDir  = Join-Path $claudeDir "level-skill-pipeline"
$commandsDir = Join-Path $claudeDir "commands"
$dataDir     = Join-Path $scriptDir "data"
$cmdsDir     = Join-Path $scriptDir "commands"

# ── Log file ──
$ts        = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile   = Join-Path $env:USERPROFILE "level-skill-pipeline_install_$ts.log"
$startTime = Get-Date

function Write-LogLine($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}

# Header
$header = @(
    "===========================================",
    " Level Skill Pipeline Installer Log",
    " Time:     $(Get-Date)",
    " Host:     $env:COMPUTERNAME",
    " User:     $env:USERNAME",
    " OS:       $((Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption) $([System.Environment]::OSVersion.Version)",
    " PSVer:    $($PSVersionTable.PSVersion)",
    " Script:   $scriptDir",
    " HOME:     $env:USERPROFILE",
    "==========================================="
) -join "`r`n"
try { Set-Content -Path $logFile -Value $header -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}

# ── Colors ──
$bgColor      = [System.Drawing.Color]::FromArgb(24, 24, 27)
$cardColor    = [System.Drawing.Color]::FromArgb(39, 39, 42)
$accentColor  = [System.Drawing.Color]::FromArgb(99, 102, 241)
$greenColor   = [System.Drawing.Color]::FromArgb(34, 197, 94)
$yellowColor  = [System.Drawing.Color]::FromArgb(234, 179, 8)
$redColor     = [System.Drawing.Color]::FromArgb(239, 68, 68)
$textColor    = [System.Drawing.Color]::FromArgb(228, 228, 231)
$dimColor     = [System.Drawing.Color]::FromArgb(161, 161, 170)
$barBgColor   = [System.Drawing.Color]::FromArgb(63, 63, 70)

# ── Fonts ──
$fontTitle  = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$fontSub    = New-Object System.Drawing.Font("Segoe UI", 10)
$fontNormal = New-Object System.Drawing.Font("Segoe UI", 9.5)
$fontBtn    = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$fontMono   = New-Object System.Drawing.Font("Consolas", 9)

# ── Main Form ──
$form = New-Object System.Windows.Forms.Form
$form.Text = "Level Skill Pipeline Installer"
$form.Size = New-Object System.Drawing.Size(520, 530)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = $bgColor
$form.ForeColor = $textColor
$form.Font = $fontNormal

# ── Title ──
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Level Skill Pipeline"
$lblTitle.Font = $fontTitle
$lblTitle.ForeColor = $textColor
$lblTitle.Location = New-Object System.Drawing.Point(30, 20)
$lblTitle.AutoSize = $true
$form.Controls.Add($lblTitle)

$lblVer = New-Object System.Windows.Forms.Label
$lblVer.Text = "v1.0"
$lblVer.Font = $fontSub
$lblVer.ForeColor = $accentColor
$lblVer.Location = New-Object System.Drawing.Point(195, 28)
$lblVer.AutoSize = $true
$form.Controls.Add($lblVer)

$lblDesc = New-Object System.Windows.Forms.Label
$lblDesc.Text = "Level Design AI Agent — Install slash commands for Claude Code"
$lblDesc.Font = $fontSub
$lblDesc.ForeColor = $dimColor
$lblDesc.Location = New-Object System.Drawing.Point(30, 52)
$lblDesc.AutoSize = $true
$form.Controls.Add($lblDesc)

# ── Separator ──
$sep = New-Object System.Windows.Forms.Label
$sep.BorderStyle = "Fixed3D"
$sep.Location = New-Object System.Drawing.Point(30, 80)
$sep.Size = New-Object System.Drawing.Size(445, 2)
$form.Controls.Add($sep)

# ── Check Panel ──
$panelCheck = New-Object System.Windows.Forms.Panel
$panelCheck.Location = New-Object System.Drawing.Point(30, 95)
$panelCheck.Size = New-Object System.Drawing.Size(445, 105)
$panelCheck.BackColor = $cardColor
$form.Controls.Add($panelCheck)

$lblCheckTitle = New-Object System.Windows.Forms.Label
$lblCheckTitle.Text = "Environment Check"
$lblCheckTitle.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$lblCheckTitle.ForeColor = $textColor
$lblCheckTitle.Location = New-Object System.Drawing.Point(15, 10)
$lblCheckTitle.AutoSize = $true
$panelCheck.Controls.Add($lblCheckTitle)

$lblNode = New-Object System.Windows.Forms.Label
$lblNode.Location = New-Object System.Drawing.Point(15, 38)
$lblNode.Size = New-Object System.Drawing.Size(415, 20)
$lblNode.Font = $fontMono
$panelCheck.Controls.Add($lblNode)

$lblClaude = New-Object System.Windows.Forms.Label
$lblClaude.Location = New-Object System.Drawing.Point(15, 58)
$lblClaude.Size = New-Object System.Drawing.Size(415, 20)
$lblClaude.Font = $fontMono
$panelCheck.Controls.Add($lblClaude)

$lblMmdc = New-Object System.Windows.Forms.Label
$lblMmdc.Location = New-Object System.Drawing.Point(15, 78)
$lblMmdc.Size = New-Object System.Drawing.Size(415, 20)
$lblMmdc.Font = $fontMono
$panelCheck.Controls.Add($lblMmdc)

# ── Install Path ──
$lblPath = New-Object System.Windows.Forms.Label
$lblPath.Text = "Install to:  $installDir"
$lblPath.Font = $fontMono
$lblPath.ForeColor = $dimColor
$lblPath.Location = New-Object System.Drawing.Point(30, 215)
$lblPath.AutoSize = $true
$form.Controls.Add($lblPath)

# ── Progress Bar ──
$progressPanel = New-Object System.Windows.Forms.Panel
$progressPanel.Location = New-Object System.Drawing.Point(30, 245)
$progressPanel.Size = New-Object System.Drawing.Size(445, 20)
$progressPanel.BackColor = $barBgColor
$form.Controls.Add($progressPanel)

$progressFill = New-Object System.Windows.Forms.Panel
$progressFill.Location = New-Object System.Drawing.Point(0, 0)
$progressFill.Size = New-Object System.Drawing.Size(0, 20)
$progressFill.BackColor = $accentColor
$progressPanel.Controls.Add($progressFill)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = ""
$lblStatus.Font = $fontNormal
$lblStatus.ForeColor = $dimColor
$lblStatus.Location = New-Object System.Drawing.Point(30, 272)
$lblStatus.Size = New-Object System.Drawing.Size(445, 20)
$form.Controls.Add($lblStatus)

# ── Log Box ──
$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.Location = New-Object System.Drawing.Point(30, 300)
$txtLog.Size = New-Object System.Drawing.Size(445, 110)
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 33)
$txtLog.ForeColor = $dimColor
$txtLog.Font = $fontMono
$txtLog.BorderStyle = "None"
$form.Controls.Add($txtLog)

# ── Buttons ──
$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text = "Install"
$btnInstall.Font = $fontBtn
$btnInstall.Size = New-Object System.Drawing.Size(200, 44)
$btnInstall.Location = New-Object System.Drawing.Point(82, 428)
$btnInstall.FlatStyle = "Flat"
$btnInstall.BackColor = $accentColor
$btnInstall.ForeColor = [System.Drawing.Color]::White
$btnInstall.FlatAppearance.BorderSize = 0
$btnInstall.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnInstall)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = "Close"
$btnClose.Font = $fontBtn
$btnClose.Size = New-Object System.Drawing.Size(120, 44)
$btnClose.Location = New-Object System.Drawing.Point(300, 428)
$btnClose.FlatStyle = "Flat"
$btnClose.BackColor = $cardColor
$btnClose.ForeColor = $dimColor
$btnClose.FlatAppearance.BorderSize = 0
$btnClose.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnClose)

# ── Helpers ──
function Log($msg) {
    $txtLog.AppendText("$msg`r`n")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.ScrollToCaret()
    Write-LogLine $msg
    [System.Windows.Forms.Application]::DoEvents()
}

function LogFileOnly($msg) { Write-LogLine $msg }

function SetProgress($pct, $statusText) {
    $progressFill.Width = [int]($progressPanel.Width * $pct / 100)
    $lblStatus.Text = $statusText
    [System.Windows.Forms.Application]::DoEvents()
}

function SetCheck($label, $icon, $text, $color) {
    $label.Text = "$icon  $text"
    $label.ForeColor = $color
    [System.Windows.Forms.Application]::DoEvents()
}

# ── Environment Check (runs on load) ──
$canInstall = $true

try {
    $nodeVer = & node --version 2>$null
    if ($nodeVer) {
        SetCheck $lblNode "OK" "Node.js $nodeVer" $greenColor
        LogFileOnly "Env check: Node.js $nodeVer"
    } else { throw "not found" }
} catch {
    SetCheck $lblNode "X " "Node.js not found  —  install from nodejs.org" $redColor
    LogFileOnly "Env check: Node.js NOT FOUND"
    $canInstall = $false
}

if (Test-Path $claudeDir) {
    SetCheck $lblClaude "OK" "Claude Code directory found" $greenColor
    LogFileOnly "Env check: claudeDir present at $claudeDir"
} else {
    SetCheck $lblClaude "X " "~/.claude/ not found  —  install Claude Code first" $redColor
    LogFileOnly "Env check: claudeDir MISSING ($claudeDir)"
    $canInstall = $false
}

try {
    $claudeVer = & claude --version 2>$null
    if ($claudeVer) { LogFileOnly "Env check: claude CLI = $claudeVer" }
} catch {}

try {
    $null = & mmdc --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        SetCheck $lblMmdc "OK" "mermaid-cli installed (optional)" $greenColor
        LogFileOnly "Env check: mermaid-cli present"
    } else { throw "no" }
} catch {
    SetCheck $lblMmdc "--" "mermaid-cli not found (optional, can skip)" $yellowColor
    LogFileOnly "Env check: mermaid-cli not found (optional)"
}

if (-not $canInstall) {
    $btnInstall.Enabled = $false
    $btnInstall.BackColor = $barBgColor
    $btnInstall.ForeColor = $dimColor
    $lblStatus.Text = "Please install prerequisites first."
    $lblStatus.ForeColor = $redColor
}

# ── Install Click ──
$btnInstall.Add_Click({
    $btnInstall.Enabled = $false
    $btnInstall.BackColor = $barBgColor
    $btnInstall.ForeColor = $dimColor

    try {
        # Step 1
        SetProgress 10 "Copying project files..."
        Log "Copying project files to $installDir ..."
        if (Test-Path $installDir) {
            Remove-Item $installDir -Recurse -Force
            Log "  Removed existing installation."
        }
        Copy-Item $dataDir $installDir -Recurse -Force
        Log "  Done."
        SetProgress 40 "Project files copied."

        # Step 2
        SetProgress 45 "Installing slash commands..."
        Log "Installing slash commands..."
        if (-not (Test-Path $commandsDir)) {
            New-Item -ItemType Directory -Path $commandsDir -Force | Out-Null
        }
        Copy-Item (Join-Path $cmdsDir "input-processor.md") (Join-Path $commandsDir "input-processor.md") -Force
        Copy-Item (Join-Path $cmdsDir "design-level.md") (Join-Path $commandsDir "design-level.md") -Force
        Log "  input-processor.md  ->  OK"
        Log "  design-level.md     ->  OK"
        SetProgress 60 "Slash commands installed."

        # Step 3
        SetProgress 65 "Installing npm dependencies..."
        Log "Running npm install in $installDir ..."
        LogFileOnly "Running: cmd /c cd /d `"$installDir`" && npm install --silent"
        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo.FileName = "cmd.exe"
        $proc.StartInfo.Arguments = "/c cd /d `"$installDir`" && npm install --silent 2>&1"
        $proc.StartInfo.UseShellExecute = $false
        $proc.StartInfo.RedirectStandardOutput = $true
        $proc.StartInfo.RedirectStandardError = $true
        $proc.StartInfo.CreateNoWindow = $true
        $proc.Start() | Out-Null
        $npmOut = $proc.StandardOutput.ReadToEnd()
        $proc.WaitForExit()
        if ($npmOut) {
            foreach ($line in ($npmOut -split "`r?`n")) {
                if ($line.Trim().Length -gt 0) { LogFileOnly "  npm: $line" }
            }
        }
        LogFileOnly "npm install exit code: $($proc.ExitCode)"
        if ($proc.ExitCode -eq 0) {
            Log "  npm install succeeded."
        } else {
            Log "  WARNING: npm install had issues."
            if ($npmOut) { Log "  $npmOut" }
            Log "  You can run manually: cd $installDir && npm install"
        }
        SetProgress 90 "Dependencies installed."

        # Step 4
        $duration = [int]((Get-Date) - $startTime).TotalSeconds
        SetProgress 100 "Installation complete!"
        Log ""
        Log "==========================================="
        Log "  Installation complete!  (${duration}s)"
        Log "==========================================="
        Log ""
        Log "  How to use:"
        Log "    1. Open Claude Code (cc)"
        Log "    2. /input-processor <describe your level>"
        Log "    3. /design-level"
        Log ""
        Log "  Output location:"
        Log "    $installDir\outputs\{case_id}\"
        Log ""
        Log "  Log file:"
        Log "    $logFile"

        $lblStatus.ForeColor = $greenColor
        $progressFill.BackColor = $greenColor

    } catch {
        Log ""
        Log "ERROR: $($_.Exception.Message)"
        LogFileOnly "EXCEPTION: $($_.Exception.GetType().FullName)"
        LogFileOnly "STACK: $($_.ScriptStackTrace)"
        Log ""
        Log "Log file: $logFile"
        Log "Please send this log to support."
        $lblStatus.Text = "Installation failed. Log: $logFile"
        $lblStatus.ForeColor = $redColor
        $progressFill.BackColor = $redColor
        $btnInstall.Enabled = $true
        $btnInstall.BackColor = $accentColor
        $btnInstall.ForeColor = [System.Drawing.Color]::White
    }
})

$btnClose.Add_Click({ $form.Close() })

[void]$form.ShowDialog()
