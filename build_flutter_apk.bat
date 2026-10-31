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

echo [3/3] Copying APK to destinations...
cd /d "%~dp0"
node -e "const fs = require('fs'); const path = require('path'); const os = require('os'); const src = path.join(__dirname, 'pharma_employee_app/build/app/outputs/flutter-apk/app-release.apk'); if (!fs.existsSync(src)) { console.error('APK not found at:', src); process.exit(1); } const dests = [path.join(__dirname, 'pharma_employee_app.apk'), path.join(__dirname, 'بوابة_الموظف_flutter.apk'), path.join(os.homedir(), 'Desktop', 'pharma_employee_app.apk'), path.join(os.homedir(), 'Desktop', 'بوابة_الموظف_flutter.apk')]; dests.forEach(d => { fs.copyFileSync(src, d); console.log('Successfully copied to:', d, '(' + Math.round(fs.statSync(d).size / (1024 * 1024) * 10) / 10 + ' MB)'); });"

echo.
echo ===================================================
echo  SUCCESS! APK generated and deployed successfully.
echo ===================================================

if not "%1"=="--no-pause" pause
