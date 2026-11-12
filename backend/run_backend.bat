@echo off
title EduConnect Backend Server
cd /d "%~dp0"
echo ========================================================
echo   EduConnect Enterprise Backend Server
echo ========================================================
echo.

set PORT=3000
set NODE_ENV=development

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b
)

echo [INFO] Updating dependencies...
call npm install --omit=dev

echo [INFO] Checking database migrations...
call npx knex migrate:latest --knexfile ./src/config/knexfile.js
echo.
echo [INFO] Starting EduConnect Server on port 3000...
node src/app.js
pause
