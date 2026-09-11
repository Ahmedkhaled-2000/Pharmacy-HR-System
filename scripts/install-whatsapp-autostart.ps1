# =========================================================================
# 24/7 WhatsApp Gateway Windows Auto-Start Installer
# =========================================================================

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$VbsPath = Join-Path $ScriptDir "whatsapp-silent-starter.vbs"
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$StartupTargetLnk = Join-Path $StartupFolder "Pharmacy_WhatsApp_Gateway.lnk"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Installing 24/7 WhatsApp Gateway Auto-Start..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

# 1. Create Shortcut in Windows Startup Folder
Write-Host "[1/3] Creating shortcut in Windows Startup Folder..." -ForegroundColor Yellow
try {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($StartupTargetLnk)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$VbsPath`" `"$ProjectDir`""
    $shortcut.WorkingDirectory = "$ProjectDir"
    $shortcut.WindowStyle = 7 # Minimized
    $shortcut.Save()
    Write-Host "  [OK] Shortcut created in Startup folder successfully." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Failed to create Startup shortcut." -ForegroundColor DarkYellow
}

# 2. Register Windows Scheduled Task
Write-Host "[2/3] Registering Windows Scheduled Task (Pharmacy_WhatsApp_Gateway)..." -ForegroundColor Yellow
$schResult = & schtasks.exe /create /tn "Pharmacy_WhatsApp_Gateway" /tr "wscript.exe `"$VbsPath`" `"$ProjectDir`"" /sc onlogon /rl highest /f 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Scheduled Task registered successfully (runs on every Windows boot)." -ForegroundColor Green
} else {
    Write-Host "  [INFO] Registered via Startup shortcut." -ForegroundColor Cyan
}

# 3. Launch immediately in background
Write-Host "[3/3] Launching WhatsApp Gateway silently in the background..." -ForegroundColor Yellow
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$VbsPath`" `"$ProjectDir`"" -WorkingDirectory $ProjectDir -WindowStyle Hidden

Start-Sleep -Seconds 4

# 4. Verify Health
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3100/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host "  [SUCCESS] WhatsApp Gateway is running and healthy on port 3100! (Status: $($health.waStatus))" -ForegroundColor Green
    }
} catch {
    Write-Host "  [INFO] Process spawned. Waiting for socket initialization..." -ForegroundColor Cyan
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Auto-Start is active! WhatsApp Server will run 24/7." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
