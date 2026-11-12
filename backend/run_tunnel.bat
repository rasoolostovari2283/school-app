@echo off
title EduConnect Cloudflare Tunnel
cd /d "%~dp0"
echo ========================================================
echo   EduConnect Cloudflare Tunnel Launcher
echo ========================================================
echo.

if not exist cloudflared.exe (
    echo [INFO] Downloading Cloudflare Tunnel (cloudflared.exe)...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', 'cloudflared.exe')"
)

if not exist cloudflared.exe (
    echo [ERROR] Could not download cloudflared.exe automatically.
    echo Please download cloudflared-windows-amd64.exe and put it here as cloudflared.exe
    pause
    exit /b
)

echo [INFO] Starting Cloudflare Tunnel for http://localhost:3000...
echo [INFO] Look for the URL below (ending with .trycloudflare.com):
echo ========================================================
echo.
cloudflared.exe tunnel --url http://localhost:3000
pause
