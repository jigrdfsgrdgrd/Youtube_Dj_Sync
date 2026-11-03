@echo off
title YouTube DJ Sync - Stoppen

echo ======================================================================
echo                  STOPPE YOUTUBE DJ SYNC SERVER
echo ======================================================================
echo.

:: Beende Prozesse auf Port 8000 (Uvicorn / Python)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Beende Backend-Prozess (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

:: Beende Prozesse auf Port 3000 (Next.js / Node)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Beende Frontend-Prozess (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Alle Server wurden gestoppt!
timeout /t 2 /nobreak >nul
