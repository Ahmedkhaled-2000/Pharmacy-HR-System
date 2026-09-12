@echo off
chcp 65001 >nul
echo ==========================================================
echo    Registering Browser Protocol: hr-whatsapp://
echo ==========================================================

set "SCRIPT_DIR=%~dp0"
set "STARTER_VBS=%SCRIPT_DIR%whatsapp-silent-starter.vbs"

REM 1. Register Protocol Scheme in HKCU (User-level registry)
reg add "HKCU\Software\Classes\hr-whatsapp" /ve /t REG_SZ /d "URL:HR WhatsApp Gateway Protocol" /f >nul
reg add "HKCU\Software\Classes\hr-whatsapp" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\hr-whatsapp\shell\open\command" /ve /t REG_SZ /d "wscript.exe \"%STARTER_VBS%\"" /f >nul

if %errorlevel% equ 0 (
    echo [OK] hr-whatsapp:// registered successfully!
) else (
    echo [ERROR] Failed to register hr-whatsapp:// protocol.
)
echo ==========================================================
