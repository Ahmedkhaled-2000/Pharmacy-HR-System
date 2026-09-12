# =========================================================================
# 24/7 WhatsApp Gateway Uninstaller
# Removes Startup shortcut, Task Scheduler, Protocol and kills port 3100
# =========================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$ShortcutPath = Join-Path $StartupFolder "Pharmacy_WhatsApp_Gateway.lnk"

Write-Host "=========================================================================" -ForegroundColor Red
Write-Host "  إلغاء التشغيل التلقائي لخادم الواتساب" -ForegroundColor Yellow
Write-Host "=========================================================================" -ForegroundColor Red

# 1. Remove Startup Shortcut
if (Test-Path $ShortcutPath) {
    Remove-Item -Path $ShortcutPath -Force -ErrorAction SilentlyContinue
    Write-Host "[1/4] تم حذف اختصار التشغيل من مجلد Startup." -ForegroundColor Green
} else {
    Write-Host "[1/4] اختصار مجلد Startup غير موجود." -ForegroundColor Cyan
}

# 2. Delete Scheduled Task
& schtasks.exe /delete /tn "Pharmacy_WhatsApp_Gateway" /f 2>&1 | Out-Null
Write-Host "[2/4] تمت إزالة المهمة المجدولة من Windows Task Scheduler." -ForegroundColor Green

# 3. Delete Protocol
if (Test-Path "HKCU:\Software\Classes\hr-whatsapp") {
    Remove-Item -Path "HKCU:\Software\Classes\hr-whatsapp" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[3/4] تم حذف تسجيل بروتوكول hr-whatsapp://." -ForegroundColor Green
}

# 4. Stop process on port 3100
Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess | 
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Write-Host "[4/4] تم إيقاف أي عمليات نشطة على المنفذ 3100." -ForegroundColor Green

Write-Host "`nتم إلغاء التشغيل التلقائي بنجاح!" -ForegroundColor Green
