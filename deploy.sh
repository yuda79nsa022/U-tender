#!/usr/bin/env bash
# One-shot production deploy for U-Tender on a fresh Linux server.
#
# What this does:
#   1. Installs Docker if it isn't already present (via the official
#      get.docker.com script, which supports basically every mainstream
#      distro on its own).
#   2. Detects the server's public IP address.
#   3. Creates backend/.env from backend/.env.example the first time this
#      runs, with random secrets generated and APP_URL/API_URL/
#      CORS_ORIGINS pointed at the real public IP instead of localhost.
#   4. Builds and starts the app with docker-compose.prod.yml layered on
#      top of the base compose file -- a real nginx-served frontend build
#      on port 80, and MySQL not published to the internet at all.
#
# Safe to run again later: it won't touch an existing backend/.env, and
# docker compose will just rebuild/restart whatever changed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

step() { echo; echo -e "\033[36m==> $*\033[0m"; }
ok()   { echo -e "    \033[32m$*\033[0m"; }
warn() { echo -e "    \033[33m$*\033[0m"; }
fail() { echo; echo -e "\033[31mERROR: $*\033[0m"; exit 1; }

step "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
    warn "Docker isn't installed -- installing it now via get.docker.com."
    curl -fsSL https://get.docker.com | sh
fi
if ! docker version >/dev/null 2>&1; then
    fail "Docker is installed but the daemon isn't running (or this user can't reach it). Try: sudo systemctl start docker -- and if you're not root, either re-run this script with sudo or add your user to the docker group (sudo usermod -aG docker \$USER) and log back in."
fi
if ! docker compose version >/dev/null 2>&1; then
    fail "'docker compose' isn't available even though Docker is. This usually means a very old Docker install -- re-run the install: curl -fsSL https://get.docker.com | sh"
fi
ok "Docker is available."

step "Detecting this server's public IP"
public_ip="$(curl -fsS --max-time 5 https://api.ipify.org || true)"
if [ -z "$public_ip" ]; then
    fail "Couldn't auto-detect the public IP. Re-run as: PUBLIC_IP=your.server.ip ./deploy.sh"
fi
if [ -n "${PUBLIC_IP:-}" ]; then
    public_ip="$PUBLIC_IP"
fi
ok "Using $public_ip"

step "Setting up backend/.env"
env_example="$repo_root/backend/.env.example"
env_file="$repo_root/backend/.env"

new_secret() { openssl rand -hex 32; }

if [ -f "$env_file" ]; then
    ok "backend/.env already exists -- leaving it as-is."
else
    [ -f "$env_example" ] || fail "Can't find backend/.env.example -- make sure deploy.sh is sitting in the repo root."
    cp "$env_example" "$env_file"

    sed -i \
        -e "s|^JWT_SECRET=.*|JWT_SECRET=$(new_secret)|" \
        -e "s|^STORAGE_SIGNING_SECRET=.*|STORAGE_SIGNING_SECRET=$(new_secret)|" \
        -e "s|^CRON_SECRET=.*|CRON_SECRET=$(new_secret)|" \
        -e "s|^APP_URL=.*|APP_URL=http://$public_ip|" \
        -e "s|^API_URL=.*|API_URL=http://$public_ip:8000|" \
        -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://$public_ip|" \
        "$env_file"

    ok "Created backend/.env with generated secrets, pointed at http://$public_ip."
    warn "Stripe and email are left blank -- the app runs fine without them (billing checkout and emails just no-op). Fill them in later in backend/.env if you need them."
fi

step "Building and starting the app (the first run can take a few minutes)"
PUBLIC_API_URL="http://$public_ip:8000" \
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
ok "Containers are up."

step "Waiting for the backend to come up"
ready=false
for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://localhost:8000/docs" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
done
if [ "$ready" = true ]; then
    ok "Backend is up."
else
    warn "Backend didn't respond yet. Check what's happening with: docker compose logs backend"
fi

echo
echo -e "\033[36mU-Tender is running:\033[0m"
echo "  App:  http://$public_ip"
echo "  API:  http://$public_ip:8000"
echo
echo -e "\033[36mFirst time here? Sign up through the app (as an owner or contractor),\033[0m"
echo "then make that account an admin:"
echo "  docker compose exec mysql mysql -uutender -putender utender -e \"UPDATE users SET role='admin' WHERE email='YOUR-EMAIL-HERE';\""
echo
echo "Useful commands:"
echo "  docker compose logs -f                        (watch the logs)"
echo "  docker compose down                            (stop everything)"
echo "  ./deploy.sh                                     (start it again later)"
