@echo off
rem stop.bat - MobaXterm Keygen stopper (thin wrapper around launch.ps1)
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" stop
if errorlevel 1 pause
exit /b %errorlevel%
