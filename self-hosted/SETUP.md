# AgentCenter — Self-Hosted Setup Guide

## Prerequisites

- Docker and Docker Compose v2+
- 2 GB+ RAM
- A license key (contact dharmik.jagodana@agentcenter.cloud or purchase at agentcenter.cloud)

## Quick Start

### 1. Download the configuration files

```bash
mkdir agentcenter && cd agentcenter
curl -O https://raw.githubusercontent.com/missioncontrolsquad/agentcenter-app/main/infra/self-hosted/docker-compose.yml
curl -O https://raw.githubusercontent.com/missioncontrolsquad/agentcenter-app/main/infra/self-hosted/.env.example
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Edit `.env` and set the required values:

```bash
# Generate secrets
AUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
PG_PASS=$(openssl rand -hex 16)

# Set your public URL
PUBLIC_URL=https://agents.yourcompany.com
```

### 3. Start the services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, and the AgentCenter app. On first boot, database migrations run automatically.

### 4. Activate your license

1. Open `http://localhost:3000` (or your `PUBLIC_URL`)
2. You'll see the license activation screen
3. Paste the refresh token you received from your AgentCenter admin
4. Click "Activate"

Once activated, the app will:
- Verify the token with the license server
- Download and cache the public key for offline verification
- Store the license in the database
- Start automatic token refresh (every hour)

### 5. Create your first admin account

After activation, you'll be redirected to the setup page to create your admin account.

## HTTPS Setup

For production deployments, put a reverse proxy in front of the app. Here are common options:

### Caddy (recommended — automatic HTTPS)

```
agents.yourcompany.com {
    reverse_proxy localhost:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    server_name agents.yourcompany.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Upgrading

```bash
# Pull the latest image
docker compose pull

# Restart (migrations run automatically on startup)
docker compose up -d
```

To pin a specific version:

```bash
# In .env
APP_VERSION=v1.2.3

# Then restart
docker compose up -d
```

## Backups

### Database

```bash
# Create a backup
docker compose exec postgres pg_dump -U postgres agentcenter > backup.sql

# Restore from backup
docker compose exec -T postgres psql -U postgres agentcenter < backup.sql
```

### Full backup (database + redis)

```bash
docker compose down
tar czf agentcenter-backup.tar.gz .env docker-compose.yml
docker run --rm -v agentcenter_pg_data:/data -v $(pwd):/backup alpine tar czf /backup/pg_data.tar.gz -C /data .
docker compose up -d
```

## Troubleshooting

### Check container status

```bash
docker compose ps
```

### View logs

```bash
# All services
docker compose logs -f

# App only
docker compose logs -f app
```

### Database connection issues

```bash
# Check if postgres is healthy
docker compose exec postgres pg_isready -U postgres
```

### License issues

- **"License server not configured"** — Set `LICENSE_SERVER_URL` in `.env`
- **"Received invalid access token"** — The public key may not have been fetched yet. Ensure `LICENSE_SERVER_URL` is reachable.
- **"License expired"** — Your subscription may have lapsed. Contact your admin.
- **"Already active on another instance"** — Your license is bound to one container. Wait 2 hours for the old instance to expire, or ask your admin to deactivate it.

### Reset everything

```bash
docker compose down -v  # Warning: this deletes all data
docker compose up -d
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PG_PASS` | Yes | PostgreSQL password |
| `AUTH_SECRET` | Yes | Session signing secret (min 16 chars) |
| `CRON_SECRET` | Yes | Internal API authentication secret |
| `PUBLIC_URL` | Yes | URL users access the app at |
| `LICENSE_SERVER_URL` | Yes | License server URL |
| `APP_VERSION` | No | Docker image tag (default: `latest`) |
| `PORT` | No | Host port (default: `3000`) |
| `R2_ACCOUNT_ID` | No | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | No | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret key |
| `R2_BUCKET_NAME` | No | R2 bucket name |
| `VAPID_PUBLIC_KEY` | No | Web push public key |
| `VAPID_PRIVATE_KEY` | No | Web push private key |
| `VAPID_SUBJECT` | No | Web push subject (mailto:) |
| `RESEND_API_KEY` | No | Resend email API key |
| `NOTIFICATION_FROM_EMAIL` | No | Sender email address |
