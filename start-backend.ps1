# PowerShell script to run PostgreSQL + Redis + Socket.io HR Stack
$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  تشغيل منظومة HR فائقة الأداء (PostgreSQL + Redis)     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$dockerFound = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerFound) {
    Write-Host "[+] تم العثور على Docker - جاري التشغيل عبر Docker Compose..." -ForegroundColor Green
    docker compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  تم تشغيل المنظومة بنجاح عبر Docker!                   " -ForegroundColor Green
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "- خادم الـ Backend و WebSockets: http://localhost:5000" -ForegroundColor White
        Write-Host "- قاعدة بيانات PostgreSQL:        localhost:5432" -ForegroundColor White
        Write-Host "- ذاكرة Redis الكاش السريعة:      localhost:6379" -ForegroundColor White
        Write-Host "========================================================" -ForegroundColor Green
        exit 0
    }
}

Write-Host "[!] جاري تشغيل خادم Node.js المحلي مباشرة..." -ForegroundColor Yellow
npm run backend
