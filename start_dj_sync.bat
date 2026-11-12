@echo off
title DJ Local Sync Launcher
cd /d "%~dp0next-app"

:: Falls der Server bereits im Hintergrund laeuft -> Browser sofort ohne Wartezeit oeffnen!
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    start http://localhost:3000
    exit /b 0
)

:: 1. Node.js Check
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js via: winget install OpenJS.NodeJS
    pause
    exit /b 1
)

:: 2. Abhaengigkeiten installieren (nur beim allerersten Start auf neuem PC)
if not exist "node_modules" (
    echo [SETUP] Erstinstallation der Pakete ^(npm install^)...
    call npm install
)

:: 3. Production-Build erstellen (nur falls noch nicht vorhanden -> macht den Start danach extrem schnell!)
if not exist ".next\BUILD_ID" (
    echo [SETUP] Erstelle schnellen Production-Build ^(einmalig^)...
    call npm run build
)

:: 4. Starte den schnellen Production-Server minimiert im Hintergrund
start "DJ Local Sync Server" /min cmd /k "npm run start"

:: Kurz warten (~1 Sekunde reicht fuer Production-Server) und Browser oeffnen
timeout /t 1 /nobreak >nul
start http://localhost:3000
exit
