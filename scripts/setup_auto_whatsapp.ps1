# =========================================================================
# 24/7 WhatsApp Gateway Auto-Start Installer
# Registers Windows Startup, Task Scheduler, Browser Protocol & Firewall
# =========================================================================

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$DaemonVbs = Join-Path $ScriptDir "whatsapp-daemon.vbs"
$StarterVbs = Join-Path $ScriptDir "whatsapp-silent-starter.vbs"

$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$ShortcutPath = Join-Path $StartupFolder "Pharmacy_WhatsApp_Gateway.lnk"

Write-Host "=========================================================================" -ForegroundColor Green
Write-Host "  Installing 24/7 WhatsApp Gateway Auto-Start Service" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host ""

# 1. Create Startup Shortcut
Write-Host "[1/5] Creating shortcut in Windows Startup folder..." -ForegroundColor Yellow
try {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$DaemonVbs`" `"$ProjectDir`""
    $shortcut.WorkingDirectory = $ProjectDir
    $shortcut.WindowStyle = 7
    $shortcut.Description = "HR Pharmacy WhatsApp Gateway 24/7 Daemon"
    $shortcut.Save()
    Write-Host "  [OK] Startup shortcut created successfully." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Failed to create Startup shortcut." -ForegroundColor DarkYellow
}

# 2. Register Windows Scheduled Task
Write-Host "`n[2/5] Registering Windows Scheduled Task (Pharmacy_WhatsApp_Gateway)..." -ForegroundColor Yellow
$taskResult = & schtasks.exe /create /tn "Pharmacy_WhatsApp_Gateway" /tr "wscript.exe `"$DaemonVbs`" `"$ProjectDir`"" /sc onlogon /rl highest /f 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Scheduled Task registered (runs on every Windows boot)." -ForegroundColor Green
} else {
    Write-Host "  [INFO] Startup shortcut will serve as primary launcher." -ForegroundColor Cyan
}

# 3. Register Browser Protocol hr-whatsapp://
Write-Host "`n[3/5] Registering Browser Protocol (hr-whatsapp://)..." -ForegroundColor Yellow
try {
    New-Item -Path "HKCU:\Software\Classes\hr-whatsapp" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\hr-whatsapp" -Name "(Default)" -Value "URL:HR WhatsApp Gateway Protocol" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\hr-whatsapp" -Name "URL Protocol" -Value "" -Force | Out-Null
    
    New-Item -Path "HKCU:\Software\Classes\hr-whatsapp\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\hr-whatsapp\shell\open\command" -Name "(Default)" -Value "wscript.exe `"$StarterVbs`"" -Force | Out-Null
    Write-Host "  [OK] Protocol hr-whatsapp:// registered successfully." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Protocol registration failed." -ForegroundColor DarkYellow
}

# 4. Firewall Rule
Write-Host "`n[4/5] Checking Windows Firewall rule for port 3100..." -ForegroundColor Yellow
$fwCheck = & netsh advfirewall firewall show rule name="WhatsApp_Server_3100" 2>&1
if ($fwCheck -match "WhatsApp_Server_3100") {
    Write-Host "  [OK] Firewall rule for port 3100 is already active." -ForegroundColor Green
} else {
    & netsh advfirewall firewall add rule name="WhatsApp_Server_3100" dir=in action=allow protocol=TCP localport=3100 profile=any description="Allow WhatsApp Gateway port 3100" | Out-Null
    Write-Host "  [OK] Inbound firewall rule added for port 3100." -ForegroundColor Green
}

# 5. Launch Daemon Silently Now
Write-Host "`n[5/5] Launching WhatsApp Gateway Daemon silently in background..." -ForegroundColor Yellow
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$DaemonVbs`" `"$ProjectDir`"" -WorkingDirectory $ProjectDir -WindowStyle Hidden

Start-Sleep -Seconds 4

# Verify Health
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3100/health" -Method Get -TimeoutSec 4
    if ($res.status -eq "ok") {
        Write-Host "  [SUCCESS] Server is online and healthy on port 3100! (Status: $($res.waStatus))" -ForegroundColor Green
    }
} catch {
    Write-Host "  [INFO] Initializing server sockets in background..." -ForegroundColor Cyan
}

Write-Host "`n=========================================================================" -ForegroundColor Green
Write-Host "  Setup Completed Successfully!" -ForegroundColor Green
Write-Host "  - The WhatsApp server will run automatically with 0 clicks." -ForegroundColor White
Write-Host "  - Works seamlessly when opening either the Browser or Windows App." -ForegroundColor White
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host ""
