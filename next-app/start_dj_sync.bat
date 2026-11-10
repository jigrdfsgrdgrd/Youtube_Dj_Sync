@echo off
title DJ Local Sync Launcher
echo ============================================================
echo                 DJ LOCAL SYNC - LAUNCHER
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js via:
    echo   winget install OpenJS.NodeJS
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [SETUP] Installiere Abhaengigkeiten (npm install)...
    call npm install
    echo.
)

echo Starte DJ Local Sync Web-Server...
start "DJ Local Sync Server" cmd /k "npm run dev"

echo Warte auf Server-Start...
timeout /t 3 /nobreak >nul
start http://localhost:3000
exit
