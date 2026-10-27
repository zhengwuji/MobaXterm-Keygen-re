@echo off
rem restart.bat - restart launcher (thin wrapper around launch.ps1)
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" restart
exit /b %errorlevel%
