@echo off
chcp 65001 > nul
title بناء مثبت الويندوز (.exe) - منظومة الموارد البشرية
echo ==============================================================================
echo   بناء وتجهيز ملف التثبيت المكتبي لنظام Windows (.exe) بنظام التحديث التلقائي
echo ==============================================================================
echo.
echo [1/3] توليد وضبط أيقونة سطح المكتب Windows (ICO)...
call npm run generate-ico
if %errorlevel% neq 0 (
    echo [X] فشل توليد الأيقونة.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] بناء حزمة الواجهة البرمجية (React 19 + Vite)...
call npm run build:electron
if %errorlevel% neq 0 (
    echo [X] فشل بناء الواجهة.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] تحزيم البرنامج وبناء المثبت التنفيذي Setup.exe عبر electron-builder...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [X] فشل تحزيم ملف .exe.
    pause
    exit /b %errorlevel%
)

echo.
echo ==============================================================================
echo   تهانينا! تم إنشاء ملف المثبت بنجاح داخل مجلد: release
echo   الملف: release\منظومة الموارد البشرية-Setup-1.0.0.exe
echo ==============================================================================
echo.
pause
