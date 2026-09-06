<#
One-click local setup for U-Tender on Windows.

What this does:
  1. Checks that Docker Desktop is installed and running.
  2. Creates backend\.env from backend\.env.example the first time you run
     it, filling in random secrets automatically (JWT_SECRET,
     STORAGE_SIGNING_SECRET, CRON_SECRET) so you don't have to.
  3. Builds and starts the app with docker compose.

Safe to run again later -- it won't overwrite an existing backend\.env,
and docker compose will just rebuild/restart whatever changed.
#>

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host ""; Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Step "Checking Docker"
# A native command exiting non-zero doesn't throw in PowerShell -- it only
# sets $LASTEXITCODE -- so a try/catch here would silently miss "Docker is
# installed but the daemon isn't running", the most common failure mode.
# The catch block still matters separately, for "docker" not being a
# recognized command at all.
try {
    docker version *> $null
} catch {
    Fail "Docker doesn't seem to be installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/, start it, then run this again."
}
if ($LASTEXITCODE -ne 0) {
    Fail "Docker is installed but doesn't seem to be running. Start Docker Desktop, wait for it to finish starting, then run this again."
}
try {
    docker compose version *> $null
} catch {
    Fail "'docker compose' isn't available. Update Docker Desktop to a recent version."
}
if ($LASTEXITCODE -ne 0) {
    Fail "'docker compose' isn't available. Update Docker Desktop to a recent version."
}
Write-Ok "Docker is available."

Write-Step "Setting up backend\.env"
$envExample = Join-Path $repoRoot "backend\.env.example"
$envFile = Join-Path $repoRoot "backend\.env"

function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([Convert]::ToBase64String($bytes) -replace '[^a-zA-Z0-9]', '')
}

if (Test-Path $envFile) {
    Write-Ok "backend\.env already exists -- leaving it as-is."
} else {
    if (-not (Test-Path $envExample)) {
        Fail "Can't find backend\.env.example -- make sure install.ps1 is sitting in the repo root."
    }
    Copy-Item $envExample $envFile

    $content = Get-Content $envFile -Raw
    $content = $content -replace 'JWT_SECRET=.*', ("JWT_SECRET=" + (New-Secret))
    $content = $content -replace 'STORAGE_SIGNING_SECRET=.*', ("STORAGE_SIGNING_SECRET=" + (New-Secret))
    $content = $content -replace 'CRON_SECRET=.*', ("CRON_SECRET=" + (New-Secret))
    Set-Content -Path $envFile -Value $content -NoNewline

    Write-Ok "Created backend\.env with freshly generated secrets."
    Write-Warn "Stripe and email are left blank -- the app runs fine without them (billing checkout and emails just no-op). Fill them in later in backend\.env if you need them."
}

Write-Step "Building and starting the app (the first run can take a few minutes)"
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed -- scroll up for the error." }

Write-Step "Waiting for the backend to come up"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if ($ready) {
    Write-Ok "Backend is up."
} else {
    Write-Warn "Backend didn't respond yet. Check what's happening with: docker compose logs backend"
}

Write-Host ""
Write-Host "U-Tender is running:" -ForegroundColor Cyan
Write-Host "  App:  http://localhost:5173"
Write-Host "  API:  http://localhost:8000"
Write-Host ""
Write-Host "First time here? Sign up through the app (as an owner or contractor)," -ForegroundColor Cyan
Write-Host "then make that account an admin:"
Write-Host '  docker compose exec mysql mysql -uutender -putender utender -e "UPDATE users SET role=''admin'' WHERE email=''YOUR-EMAIL-HERE'';"'
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  docker compose logs -f      (watch the logs)"
Write-Host "  docker compose down         (stop everything)"
Write-Host "  .\install.bat               (start it again later)"
