@echo off
rem single.bat - open the standalone single-file build (no server needed)
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" single
exit /b %errorlevel%
