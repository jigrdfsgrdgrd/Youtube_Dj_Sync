@echo off
title DJ Local Sync Launcher
cd /d "%~dp0next-app"

:: Falls der Server bereits im Hintergrund laeuft -> Browser sofort ohne Wartezeit oeffnen!
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    start http://localhost:3000
    exit /b 0
)

:: Frischen Status sicherstellen (loescht haengengebliebene Download-Zustaende vorheriger Abstuerze)
if exist "progress.json" del /f /q "progress.json" >nul 2>&1

:: 1. Node.js Check
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js via: winget install OpenJS.NodeJS
    pause
    exit /b 1
)

:: 2. Pruefe ob Next.js wirklich vollstaendig in node_modules installiert ist
if not exist "node_modules\next\dist\bin\next" (
    echo ============================================================
    echo [SETUP 1/2] Installiere alle Pakete ^(npm install^)...
    echo Bitte kurz warten, bis der Download abgeschlossen ist.
    echo ============================================================
    call npm install
    if not exist "node_modules\next\dist\bin\next" (
        echo.
        echo [FEHLER] npm install ist fehlgeschlagen! Bitte pruefe deine Internetverbindung.
        pause
        exit /b 1
    )
)

:: 3. Production-Build erstellen (falls noch nicht vorhanden oder neuer Git-Commit vorhanden)
set NEED_BUILD=0
if not exist ".next\BUILD_ID" set NEED_BUILD=1

set CURRENT_COMMIT=
for /f %%i in ('git rev-parse HEAD 2^>nul') do set CURRENT_COMMIT=%%i
set LAST_COMMIT=
if exist ".next\LAST_COMMIT" set /p LAST_COMMIT=<.next\LAST_COMMIT

if defined CURRENT_COMMIT (
    if not "%CURRENT_COMMIT%"=="%LAST_COMMIT%" set NEED_BUILD=1
)

if "%NEED_BUILD%"=="1" (
    echo ============================================================
    echo [SETUP 2/2] Erstelle schnellen Production-Build...
    echo Bitte kurz warten, die App wird fuer die neue Version gebaut.
    echo ============================================================
    call node "node_modules\next\dist\bin\next" build
    if exist ".next\BUILD_ID" (
        if defined CURRENT_COMMIT echo %CURRENT_COMMIT%>.next\LAST_COMMIT
    ) else (
        echo.
        echo [HINWEIS] Production-Build nicht erstellt, starte im Dev-Modus...
        start "DJ Local Sync Server" /min cmd /k "node node_modules\next\dist\bin\next dev"
        timeout /t 3 /nobreak >nul
        start http://localhost:3000
        exit /b 0
    )
)

:: 4. Starte den schnellen Production-Server direkt ueber Node (verhindert 'next konnte nicht gefunden werden' Fehler!)
start "DJ Local Sync Server" /min cmd /k "node node_modules\next\dist\bin\next start"

:: Kurz warten (~1 Sekunde) und Browser oeffnen
ping 127.0.0.1 -n 2 >nul
start http://localhost:3000
exit
