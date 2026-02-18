#!/usr/bin/env bash
# AgentCenter.Cloud — Server Provisioning Script
# Run on a fresh Ubuntu 24.04 VPS
set -euo pipefail

echo "=== AgentCenter.Cloud Server Setup ==="

# ── 1. System updates ─────────────────────────────────────────────
echo "[1/5] Updating system..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl jq git ufw

# ── 2. Install Docker ─────────────────────────────────────────────
echo "[2/5] Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi
docker --version

# ── 3. Firewall ───────────────────────────────────────────────────
echo "[3/5] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 4. Create app directory ───────────────────────────────────────
echo "[4/5] Setting up /opt/agentcenter..."
mkdir -p /opt/agentcenter

echo "[5/5] Done! Next steps:"
echo ""
echo "  1. Copy your project files to the server:"
echo "     scp -r infra/* root@\$(hostname -I | awk '{print \$1}'):/opt/agentcenter/"
echo ""
echo "  2. Copy and build the app image:"
echo "     scp -r app root@\$(hostname -I | awk '{print \$1}'):/tmp/app-build"
echo "     ssh root@<server-ip> 'docker build -t agentcenter-app:latest /tmp/app-build && rm -rf /tmp/app-build'"
echo ""
echo "  3. Configure .env:"
echo "     ssh root@<server-ip> 'cp /opt/agentcenter/.env.example /opt/agentcenter/.env && nano /opt/agentcenter/.env'"
echo ""
echo "  4. Start infrastructure:"
echo "     ssh root@<server-ip> 'cd /opt/agentcenter && docker compose up -d'"
echo ""
echo "  5. Create your first client:"
echo "     ssh root@<server-ip> 'cd /opt/agentcenter && ./ac create test --name \"Test Client\"'"
echo ""
