# ==============================================================================
# 🎓 EduConnect Enterprise Windows Server Auto-Installer & Launcher
# ==============================================================================
# This script configures and launches EduConnect Backend on Windows Server,
# installs dependencies, runs DB migrations, and sets up a permanent,
# high-speed Cloudflare Tunnel (zero inbound ports required).
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🎓 راه‌اندازی خودکار سرور ویندوزی سامانه EduConnect    " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Run as Administrator Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️ لطفاً این اسکریپت را در PowerShell به صورت Run as Administrator اجرا فرمایید." -ForegroundColor Yellow
}

# 2. Check and Install Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[1/5] در حال دانلود و نصب Node.js LTS..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $nodeMsi = "$env:TEMP\node_setup.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "✅ Node.js با موفقیت نصب شد." -ForegroundColor Green
} else {
    Write-Host "✅ Node.js نصب است: $(node -v)" -ForegroundColor Green
}

# 3. Check and Install Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[2/5] در حال دانلود و نصب Git..." -ForegroundColor Yellow
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe"
    $gitExe = "$env:TEMP\git_setup.exe"
    Invoke-WebRequest -Uri $gitUrl -OutFile $gitExe
    Start-Process -FilePath $gitExe -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "✅ Git با موفقیت نصب شد." -ForegroundColor Green
} else {
    Write-Host "✅ Git نصب است: $(git --version)" -ForegroundColor Green
}

# 4. Clone or Pull Project
$installDir = "C:\EduConnect"
Write-Host "[3/5] در حال دریافت آخرین نسخه کدهای پروژه از گیت‌هاب..." -ForegroundColor Yellow
if (-not (Test-Path "$installDir\.git")) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    git clone https://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@github.com/rasoolostovari2283/school-app.git $installDir
} else {
    Set-Location $installDir
    git pull origin main
}

# 5. Install Backend Modules and Run Migrations
Set-Location "$installDir\backend"
Write-Host "[4/5] در حال نصب پکیج‌های بک‌اند و اعمال مایگریشن دیتابیس..." -ForegroundColor Yellow

# Create default .env if not present
if (-not (Test-Path "$installDir\backend\.env")) {
    $envContent = @"
PORT=3000
NODE_ENV=production
JWT_SECRET=educonnect_prod_jwt_secret_$(Get-Random)
JWT_EXPIRES_IN=30d
JWT_REFRESH_SECRET=educonnect_prod_refresh_secret_$(Get-Random)
JWT_REFRESH_EXPIRES_IN=90d
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
FRONTEND_URL=http://localhost:3000
"@
    Set-Content -Path "$installDir\backend\.env" -Value $envContent
}

npm install --omit=dev
npx knex migrate:latest --knexfile ./src/config/knexfile.js

# 6. Install PM2 and Start Backend Daemon
npm install -g pm2
pm2 delete educonnect-backend 2>$null
pm2 start src/app.js --name "educonnect-backend"
pm2 save

Write-Host "✅ بک‌اند سامانه با موفقیت روی پورت 3000 بالا آمد." -ForegroundColor Green

# 7. Setup Cloudflare Tunnel for Permanent Zero-Inbound-Port Access
Write-Host "[5/5] در حال راه‌اندازی تونل پرسرعت و دائمی کلودفلر..." -ForegroundColor Yellow
$cfDir = "C:\cloudflared"
if (-not (Test-Path "$cfDir\cloudflared.exe")) {
    New-Item -ItemType Directory -Path $cfDir -Force | Out-Null
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$cfDir\cloudflared.exe"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🚀 سامانه با موفقیت مستقر شد!" -ForegroundColor Green
Write-Host "اکنون تونل کلودفلر راه‌اندازی می‌شود و لینک دائمی HTTPS را به شما نمایش می‌دهد:" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

& "$cfDir\cloudflared.exe" tunnel --url http://localhost:3000

