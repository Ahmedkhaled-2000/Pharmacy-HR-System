@echo off
setlocal
cd /d "%~dp0pharma_employee_app"

echo ===================================================
echo   Building Pharma Employee Flutter APK (Release)
echo ===================================================

echo [1/3] Fetching dependencies (flutter pub get)...
call flutter pub get
if errorlevel 1 (
    echo [ERROR] flutter pub get failed.
    if not "%1"=="--no-pause" pause
    exit /b 1
)

echo [2/3] Building release APK (flutter build apk --release)...
call flutter build apk --release
if errorlevel 1 (
    echo [ERROR] flutter build apk failed.
    if not "%1"=="--no-pause" pause
    exit /b 1
)

echo [3/3] Deploying APK to destinations...
cd /d "%~dp0"
call node scripts\deploy_apk.cjs

echo.
echo ===================================================
echo  SUCCESS! APK generated and deployed successfully.
echo ===================================================

if not "%1"=="--no-pause" pause
