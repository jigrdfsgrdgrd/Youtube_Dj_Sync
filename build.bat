@echo off
echo ========================================
echo   YouTube Playlist Downloader - Build
echo ========================================
echo.

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Building EXE with Flet...
flet pack main.py --name "YouTube-Playlist-Downloader" --product-name "YouTube Playlist Downloader" --product-version "1.0.0" --company-name "Custom App"

echo.
echo ========================================
echo   Build Complete!
echo   Check the 'dist' folder for the EXE
echo ========================================
pause
