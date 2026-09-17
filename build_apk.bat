@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ===================================================
echo   Building Employee Portal Android APK
echo   بوابة الموظف - استخراج تطبيق أندرويد
echo ===================================================

:: Setup Java JDK 17
if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\javac.exe" goto :found_java
)
if exist "%LOCALAPPDATA%\Programs\Eclipse Adoptium" (
    for /d %%D in ("%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-17*") do (
        if exist "%%D\bin\javac.exe" (
            set "JAVA_HOME=%%D"
            goto :found_java
        )
    )
)
if exist "C:\Program Files\Eclipse Adoptium" (
    for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do (
        if exist "%%D\bin\javac.exe" (
            set "JAVA_HOME=%%D"
            goto :found_java
        )
    )
)
if exist "C:\Program Files\Microsoft" (
    for /d %%D in ("C:\Program Files\Microsoft\jdk-17*") do (
        if exist "%%D\bin\javac.exe" (
            set "JAVA_HOME=%%D"
            goto :found_java
        )
    )
)
:found_java

:: Setup Android SDK
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    )
)
if not defined ANDROID_SDK_ROOT (
    if defined ANDROID_HOME set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
)

if defined JAVA_HOME (
    set "PATH=%JAVA_HOME%\bin;%PATH%"
)
if exist "C:\Program Files\nodejs" (
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
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
call npm.cmd run build
if not exist "%BASE_DIR%dist\index.html" (
    echo [ERROR] Web build failed: dist/index.html was not generated.
    pause
    exit /b 1
)

echo [3/4] Syncing web assets to Capacitor Android assets...
call node scripts/sync_assets.js

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

