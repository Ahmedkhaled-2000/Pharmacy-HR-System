@echo off
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot
set SRC_ICON=C:\Users\Ahmed Khaled\Desktop\pharmacy-time-tracker\public\icons\logo_512x512.png
set RES_DIR=C:\Users\Ahmed Khaled\Desktop\pharmacy-time-tracker\android\app\src\main\res

for %%D in (mipmap-hdpi mipmap-mdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi) do (
    if exist "%RES_DIR%\%%D" (
        copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher.png"
        copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher_round.png"
        copy /y "%SRC_ICON%" "%RES_DIR%\%%D\ic_launcher_foreground.png"
    )
)

cd android
call gradlew.bat assembleDebug
copy app\build\outputs\apk\debug\app-debug.apk "C:\Users\Ahmed Khaled\Desktop\بوابة_الموظف.apk"
echo APK has been successfully copied to the Desktop!
