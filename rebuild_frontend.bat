@echo off
title Stockman - Rebuild Frontend
cd /d "%~dp0frontend"
echo Installing dependencies...
call npm install
echo Building...
call npm run build
echo Done! Restart start.bat to apply changes.
pause
