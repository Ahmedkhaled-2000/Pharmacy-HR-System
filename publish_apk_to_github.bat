@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo =================================================================
echo   نشر وتفعيل تحديث أندرويد التلقائي عبر GitHub Releases
echo   Publish In-App Update to GitHub
echo =================================================================

set "BASE_DIR=%~dp0"
set "APK_FILE=%BASE_DIR%بوابة_الموظف.apk"

if not exist "%APK_FILE%" (
    echo [1/3] ملف الـ APK غير موجود، جاري بناؤه الآن...
    call "%BASE_DIR%build_apk.bat"
) else (
    echo [1/3] تم العثور على ملف APK: %APK_FILE%
)

echo.
set /p TAG_NAME="أدخل رقم الإصدار الجديد (مثال: v1.2.40): "
if "%TAG_NAME%"=="" set "TAG_NAME=v1.2.40"

echo.
set /p NOTES="أدخل ملاحظات التحديث للموظفين (أو اضغط Enter للافتراضي): "
if "%NOTES%"=="" set "NOTES=تحديث جديد يتضمن تحسينات في الاتصال المباشر بالسحابة، الأداء، والمزامنة التلقائية."

echo.
echo [2/3] فحص تسجيل الدخول في GitHub CLI (gh)...
gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] لم يتم تسجيل الدخول في GitHub CLI بعد.
    echo.
    echo يمكنك اختيار أحد الخيارين:
    echo 1. تسجيل الدخول في GitHub CLI عبر المتصفح تلقائياً (gh auth login)
    echo 2. فتح صفحة رفع التحديث يدوياً على GitHub في المتصفح
    echo.
    set /p CHOICE="اختر 1 أو 2: "
    if "!CHOICE!"=="1" (
        gh auth login --web -h github.com
    ) else (
        echo جاري فتح صفحة إنشاء الإصدار على GitHub...
        start https://github.com/Ahmedkhaled-2000/Pharmacy-HR-System/releases/new
        echo.
        echo قم بكتابة Tag: %TAG_NAME%
        echo واسحب ملف بوابة_الموظف.apk في المرفقات واضغط Publish Release.
        pause
        exit /b 0
    )
)

echo.
echo [3/3] رفع التحديث الجديد إلى GitHub Releases...
set "APK_ENG=%BASE_DIR%pharmacy-employee-portal.apk"
if not exist "%APK_ENG%" copy /y "%APK_FILE%" "%APK_ENG%" >nul
gh release create %TAG_NAME% "%APK_ENG%" "%APK_FILE%" --title "تحديث بوابة الموظف %TAG_NAME%" --notes "%NOTES%"

if %errorlevel% equ 0 (
    echo.
    echo =================================================================
    echo  SUCCESS! تم نشر التحديث بنجاح على GitHub Releases:
    echo  https://github.com/Ahmedkhaled-2000/Pharmacy-HR-System/releases/tag/%TAG_NAME%
    echo.
    echo  سيتلقى جميع الموظفين إشعار التحديث التلقائي فور فتح التطبيق!
    echo =================================================================
) else (
    echo.
    echo [!] حدث خطأ أثناء الرفع عبر gh CLI. يمكنك رفعه يدوياً عبر:
    echo https://github.com/Ahmedkhaled-2000/Pharmacy-HR-System/releases/new
    start https://github.com/Ahmedkhaled-2000/Pharmacy-HR-System/releases/new
)

pause
