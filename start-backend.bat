@echo off
chcp 65001 > nul
echo ========================================================
echo   تشغيل منظومة HR فائقة الأداء (PostgreSQL + Redis + Socket.io)
echo ========================================================
echo.

where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo [+] تم العثور على Docker - جاري التشغيل عبر الحاويات...
    docker compose up -d
    if %errorlevel% equ 0 (
        echo.
        echo ========================================================
        echo   تم تشغيل المنظومة بنجاح عبر Docker!
        echo ========================================================
        echo - خادم الـ Backend و WebSockets: http://localhost:5000
        echo - قاعدة بيانات PostgreSQL:        localhost:5432
        echo - ذاكرة Redis الكاش السريعة:      localhost:6379
        echo ========================================================
        goto finish
    )
)

echo [!] تعذر التشغيل عبر Docker أو لم يتم العثور عليه.
echo [+] جاري تشغيل خادم Node.js المحلي مباشرة...
echo.
npm run backend

:finish
echo.
pause
