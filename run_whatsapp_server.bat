@echo off
title تشغيل خادم الواتساب المدمج (WhatsApp Gateway - Port 3100)
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   🚀 خادم الواتساب المدمج لمنظومة الموارد البشرية والرواتب
echo   المنفذ: 3100  ^|  المحرك: Baileys Engine  ^|  الشبكة: 0.0.0.0 (LAN + Local)
echo ======================================================================

:: تنظيف أي عملية سابقة عالقة على المنفذ 3100 لضمان إقلاع نظيف
powershell -Command "Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [*] جاري بدء تشغيل السيرفر وتوليد رمز الاقتران...
node server\whatsapp-server.js

if %errorLevel% neq 0 (
    echo.
    echo [-] حدث خطأ أثناء تشغيل الخادم. تأكد من سلامة ملفات Node.js.
)
pause
