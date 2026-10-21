@echo off
chcp 65001 >nul
echo ========================================================
echo   EduConnect Windows Server Setup and Runner
echo ========================================================

echo.
echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error during npm install!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Running database migrations...
call npx knex migrate:latest --knexfile src/config/knexfile.js

echo.
echo [3/4] Checking and installing PM2 globally...
call npm list -g pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing PM2...
    call npm install -g pm2
)

echo.
echo [4/4] Starting EduConnect with PM2...
call pm2 delete educonnect-backend >nul 2>&1
call pm2 start src/app.js --name "educonnect-backend"
call pm2 save

echo.
echo ========================================================
echo   EduConnect is now running online in background!
echo   Local Address: http://localhost:5000/api/health
echo ========================================================
pause
