@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0تشغيل_خادم_الواتساب_احتياطي.exe" (
    start "" "%~dp0تشغيل_خادم_الواتساب_احتياطي.exe"
    exit /b
)
if exist "%~dp0scripts\تشغيل_خادم_الواتساب_احتياطي.exe" (
    start "" "%~dp0scripts\تشغيل_خادم_الواتساب_احتياطي.exe"
    exit /b
)
if exist "%~dp0public\scripts\تشغيل_خادم_الواتساب_احتياطي.exe" (
    start "" "%~dp0public\scripts\تشغيل_خادم_الواتساب_احتياطي.exe"
    exit /b
)
exit /b
