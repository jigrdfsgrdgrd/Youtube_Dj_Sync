@echo off
setlocal enabledelayedexpansion
title YouTube DJ Sync - Launcher

echo ======================================================================
echo                  YOUTUBE DJ SYNC - LAUNCHER
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Python Check
echo [1/5] Ueberpruefe Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Python wurde nicht gefunden!
    echo Bitte installiere Python (mind. Version 3.10) oder fuehre aus:
    echo   winget install Python.Python.3.11
    echo (Achte bei der Installation darauf, 'Add Python to PATH' zu aktivieren!)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version') do set PYTHON_VERSION=%%v
echo  -> Gefunden: !PYTHON_VERSION!

:: 2. Node.js Check
echo [2/5] Ueberpruefe Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js oder fuehre aus:
    echo   winget install OpenJS.NodeJS
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo  -> Gefunden: Node !NODE_VERSION!

:: 3. FFmpeg Check (Hinweis)
echo [3/5] Ueberpruefe FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo  -> [HINWEIS] FFmpeg wurde nicht im PATH gefunden.
    echo     Fuer die Audio-Konvertierung kannst du FFmpeg installieren mit:
    echo     winget install Gyan.FFmpeg
    echo.
) else (
    echo  -> Gefunden: FFmpeg verfuegbar
)

:: 4. Python Virtual Environment einrichten
echo [4/5] Richte Python-Umgebung ein (.venv)...
if not exist ".venv" (
    echo  -> Erstelle neue virtuelle Python-Umgebung...
    python -m venv .venv
)

echo  -> Installiere/Aktualisiere Backend-Abhaengigkeiten...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
pip install -r backend\requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNUNG] Einige Python-Pakete konnten nicht automatisch installiert werden.
)

:: 5. Node.js Dependencies pruefen
echo [5/5] Ueberpruefe Frontend-Abhaengigkeiten...
if not exist "next-app\node_modules" (
    echo  -> Installiere npm-Pakete in next-app...
    cd next-app
    call npm install
    cd ..
)

echo.
echo ======================================================================
echo               STARTE BACKEND & FRONTEND SERVER...
echo ======================================================================
echo.

:: Starte Backend auf Port 8000
echo Starte Python FastAPI Backend (Port 8000)...
start "DJ Sync - Backend" cmd /k "cd /d "%~dp0" && .venv\Scripts\activate.bat && python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000"

:: Starte Frontend auf Port 3000
echo Starte Next.js Web-Frontend (Port 3000)...
start "DJ Sync - Frontend" cmd /k "cd /d "%~dp0\next-app" && npm run dev"

:: 3 Sekunden warten, dann Browser oeffnen
timeout /t 3 /nobreak >nul
echo Oeffne Web-Interface im Browser...
start http://localhost:3000

echo.
echo ======================================================================
echo               YOUTUBE DJ SYNC LAEUFT JETZT!
echo ======================================================================
echo Web-Interface: http://localhost:3000
echo Backend API:   http://localhost:8000/docs
echo.
echo Zum Beenden kannst du die beiden Server-Fenster schliessen
echo oder 'stop_app.bat' doppelklicken.
echo.
pause
