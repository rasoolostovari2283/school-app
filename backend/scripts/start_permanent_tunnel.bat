@echo off
chcp 65001 >nul
echo ========================================================
echo   EduConnect Permanent Tunnel Watchdog (Windows)
echo ========================================================
echo.

:LOOP
echo [%date% %time%] Starting persistent SSH tunnel with keep-alive...
ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no -o TCPKeepAlive=yes -p 443 -R0:localhost:5000 a.pinggy.io

echo [%date% %time%] Tunnel disconnected! Auto-reconnecting in 3 seconds...
timeout /t 3 /nobreak >nul
goto LOOP

