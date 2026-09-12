@echo off
cd /d "%~dp0"
echo Starting WhatsApp Gateway on Port 3100...
node server\whatsapp-server.js
pause
