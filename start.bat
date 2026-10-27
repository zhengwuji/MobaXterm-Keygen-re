@echo off
rem start.bat - MobaXterm Keygen launcher (thin wrapper around launch.ps1)
rem All Chinese messages come from PowerShell, so this file stays pure ASCII
rem and is safe under any console code page.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" start
if errorlevel 1 (
    echo.
    echo  Launcher failed.
    echo  Try: powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1 start
    pause
)
exit /b %errorlevel%
