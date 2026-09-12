@echo off
cd /d "%~dp0"
title WhatsApp Gateway Server (Port 3100)
powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo ======================================================================
echo   WhatsApp Gateway Server (Port 3100)
echo   Engine: Baileys Engine  ^|  Host: 0.0.0.0
echo ======================================================================
node server\whatsapp-server.js
pause
