@echo off
chcp 65001 >nul
title GitHub Workflow Scope Authorization
echo =================================================================
echo   تفعيل صلاحية (Workflow Scope) لرفع التحديثات إلى GitHub
echo =================================================================
echo.
echo جاري فتح المتصفح لمنح الصلاحية...
"C:\Users\Ahmed Khaled\AppData\Local\Programs\bin\gh.exe" auth refresh -h github.com -s workflow
echo.
if %errorlevel% equ 0 (
    echo [OK] تمت المصادقة وتفعيل الصلاحية بنجاح!
) else (
    echo [X] تعذرت المصادقة، يرجى المحاولة مرة أخرى.
)
echo.
pause
