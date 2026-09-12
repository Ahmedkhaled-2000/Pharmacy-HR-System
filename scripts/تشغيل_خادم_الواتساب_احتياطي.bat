@echo off
:: =========================================================================
:: أداة التشغيل الاحتياطية المباشرة لخادم الواتساب (منظومة إدارة الموارد البشرية)
:: تعمل تلقائياً دون الحاجة لتطبيق الويندوز، وتفتح جدار الحماية، وتكشف الشبكة
:: =========================================================================
chcp 65001 >nul
title خادم الواتساب الاحتياطي - منظومة الموارد البشرية

echo ======================================================================
echo    خادم الواتساب الاحتياطي - منظومة الموارد البشرية والرواتب
echo ======================================================================
echo.

:: 1. التحقق من صلاحيات المدير (Run as Administrator) لفتح جدار الحماية وضبط المنفذ
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] جاري طلب صلاحيات المدير تلقائياً لفتح جدار الحماية وتشغيل الخادم...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: 2. فتح منفذ 3100 في جدار الحماية (Windows Defender Firewall) تلقائياً
echo [+] فحص وتأمين منفذ خادم الواتساب (3100) في جدار حماية الويندوز...
netsh advfirewall firewall delete rule name="WhatsApp_Server_3100" >nul 2>&1
netsh advfirewall firewall add rule name="WhatsApp_Server_3100" dir=in action=allow protocol=TCP localport=3100 profile=any description="Allow incoming WhatsApp Gateway connections on port 3100" >nul 2>&1
echo [✓] تم تفعيل منفذ الواتساب 3100 في جدار الحماية بنجاح.
echo.

:: 3. تنظيف وإنهاء أي عملية معلقة على المنفذ 3100
echo [+] فحص العمليات المعلقة وتحرير المنفذ 3100...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 4. البحث عن محرك Node.js أو محرك تطبيق الويندوز المدمج
set "NODE_CMD="

if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files (x86)\nodejs\node.exe"
) else if exist "%LocalAppData%\Programs\node\node.exe" (
    set "NODE_CMD=%LocalAppData%\Programs\node\node.exe"
) else (
    where node >nul 2>&1
    if %errorLevel% equ 0 (
        set "NODE_CMD=node"
    )
)

if "%NODE_CMD%"=="" (
    if exist "C:\Program Files\منظومة الموارد البشرية\منظومة الموارد البشرية.exe" (
        set "NODE_CMD=C:\Program Files\منظومة الموارد البشرية\منظومة الموارد البشرية.exe"
        set "ELECTRON_RUN_AS_NODE=1"
    ) else if exist "%LocalAppData%\Programs\منظومة الموارد البشرية\منظومة الموارد البشرية.exe" (
        set "NODE_CMD=%LocalAppData%\Programs\منظومة الموارد البشرية\منظومة الموارد البشرية.exe"
        set "ELECTRON_RUN_AS_NODE=1"
    )
)

:: 5. البحث عن ملف السيرفر whatsapp-server.js
set "SERVER_JS="
set "APP_DIR="

if exist "%~dp0server\whatsapp-server.js" (
    set "SERVER_JS=%~dp0server\whatsapp-server.js"
    set "APP_DIR=%~dp0"
) else if exist "%~dp0whatsapp-server.js" (
    set "SERVER_JS=%~dp0whatsapp-server.js"
    set "APP_DIR=%~dp0"
) else if exist "%~dp0..\server\whatsapp-server.js" (
    set "SERVER_JS=%~dp0..\server\whatsapp-server.js"
    set "APP_DIR=%~dp0..\"
) else if exist "d:\Project\HR last\HR New\server\whatsapp-server.js" (
    set "SERVER_JS=d:\Project\HR last\HR New\server\whatsapp-server.js"
    set "APP_DIR=d:\Project\HR last\HR New"
) else if exist "C:\Program Files\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js" (
    set "SERVER_JS=C:\Program Files\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"
    set "APP_DIR=C:\Program Files\منظومة الموارد البشرية\resources\app.asar.unpacked"
) else if exist "%LocalAppData%\Programs\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js" (
    set "SERVER_JS=%LocalAppData%\Programs\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"
    set "APP_DIR=%LocalAppData%\Programs\منظومة الموارد البشرية\resources\app.asar.unpacked"
)

if "%NODE_CMD%"=="" (
    echo [X] تعذر العثور على محرك Node.js أو تطبيق المنظومة على هذا الجهاز!
    echo.
    echo يرجى التأكد من تثبيت Node.js من الموقع الرسمي:
    echo https://nodejs.org
    echo أو تثبيت تطبيق المنظومة لسطح المكتب.
    echo.
    pause
    exit /b
)

if "%SERVER_JS%"=="" (
    echo [!] جاري البحث عن ملف whatsapp-server.js على أقراص الجهاز...
    for %%D in (C D E F) do (
        if exist "%%D:\Project\HR last\HR New\server\whatsapp-server.js" (
            set "SERVER_JS=%%D:\Project\HR last\HR New\server\whatsapp-server.js"
            set "APP_DIR=%%D:\Project\HR last\HR New"
        )
    )
)

if "%SERVER_JS%"=="" (
    echo [X] تعذر العثور على ملف السيرفر whatsapp-server.js تلقائياً.
    echo يرجى وضع هذا الملف داخل مجلد المنظومة الرئيسي وتشغيله من هناك.
    echo.
    pause
    exit /b
)

:: 6. عرض عناوين الاتصال للهواتف والمتصفحات
cd /d "%APP_DIR%"
echo ======================================================================
echo  [✓] جاهز لإطلاق خادم الواتساب الاحتياطي:
echo   - محرك التشغيل: %NODE_CMD%
echo   - ملف الخادم: %SERVER_JS%
echo   - المنفذ: 3100 (مفتوح بجدار الحماية)
echo.
echo  عناوين الربط للهواتف والأجهزة على الشبكة:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Host ('   📱 رابط الهاتف: http://' + $_.IPAddress + ':3100') -ForegroundColor Green }"
echo   💻 رابط الجهاز الحالي: http://127.0.0.1:3100
echo ======================================================================
echo.
echo  الخادم يعمل الآن بشكل مستمر. لا تغلق هذه النافذة طالما أنك تستخدم الواتساب.
echo ======================================================================
echo.

"%NODE_CMD%" "%SERVER_JS%"

pause
