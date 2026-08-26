@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Building Employee Portal Android APK
echo   بوابة الموظف - استخراج تطبيق أندرويد
echo ===================================================

:: Set JAVA_HOME if needed
if exist "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot" (
    set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"
) else if exist "C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
)

set "BASE_DIR=%~dp0"
set "SRC_ICON=%BASE_DIR%public\icons\logo_512x512.png"
set "RES_DIR=%BASE_DIR%android\app\src\main\res"

echo [1/4] Copying app launcher icons...
if exist "%SRC_ICON%" (
    for %%D in (mipmap-hdpi mipmap-mdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi) do (
        if exist "%RES_DIR%\%%D" (
            copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher.png" >nul
            copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher_round.png" >nul
            copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher_foreground.png" >nul
        )
    )
)

echo [2/4] Building web assets (npm run build)...
call npm run build

echo [3/4] Syncing with Capacitor Android...
call npx cap sync android

echo [4/4] Compiling Android APK with Gradle...
cd "%BASE_DIR%android"
call gradlew.bat assembleDebug

if exist "app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "app\build\outputs\apk\debug\app-debug.apk" "%USERPROFILE%\Desktop\بوابة_الموظف.apk" >nul
    copy /y "app\build\outputs\apk\debug\app-debug.apk" "%BASE_DIR%بوابة_الموظف.apk" >nul
    echo.
    echo ===================================================
    echo  SUCCESS! تم استخراج ملف التطبيق بنجاح:
    echo  1. على سطح المكتب: %USERPROFILE%\Desktop\بوابة_الموظف.apk
    echo  2. في مجلد المشروع: %BASE_DIR%بوابة_الموظف.apk
    echo ===================================================
) else (
    echo.
    echo [ERROR] فشل استخراج ملف الـ APK. يرجى مراجعة مخرجات Gradle أعلاه.
)

cd "%BASE_DIR%"
pause
