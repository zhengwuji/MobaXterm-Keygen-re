@echo off
rem status.bat - show launcher status (thin wrapper around launch.ps1)
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" status
pause
exit /b %errorlevel%
