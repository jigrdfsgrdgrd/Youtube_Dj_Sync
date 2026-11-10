@echo off
title DJ Local Sync Launcher
echo ============================================================
echo                 DJ LOCAL SYNC - LAUNCHER
echo ============================================================
echo.

cd /d "%~dp0next-app"

:: 1. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js via:
    echo   winget install OpenJS.NodeJS
    echo.
    pause
    exit /b 1
)

:: 2. Check yt-dlp
where yt-dlp >nul 2>&1
if %errorlevel% neq 0 (
    echo [HINWEIS] yt-dlp wurde nicht im PATH gefunden.
    echo Falls der Download fehlschlaegt, installiere yt-dlp mit:
    echo   winget install yt-dlp
    echo.
)

:: 3. Install npm packages if missing
if not exist "node_modules" (
    echo [SETUP] Installiere Abhaengigkeiten (npm install)...
    call npm install
    echo.
)

:: 4. Start Next.js App
echo Starte DJ Local Sync Web-Server...
start "DJ Local Sync Server" cmd /k "npm run dev"

echo Warte auf Server-Start...
timeout /t 3 /nobreak >nul
echo Oeffne http://localhost:3000 im Browser...
start http://localhost:3000
exit
