# Per-Client Deployment System

## Architecture

Each client gets an isolated Next.js container with its own PostgreSQL database, all behind a shared Traefik reverse proxy on a single Hetzner VPS.

```
Hetzner VPS
├── Traefik         (reverse proxy, auto-SSL via Cloudflare DNS)
├── PostgreSQL 16   (shared instance, one DB per client)
├── Redis 7         (shared pubsub for real-time subscriptions)
├── Cron            (shared, hits /api/cron/auto-sleep for all clients)
└── Per-client:
    ├── app-acme    (Next.js standalone, ~200-300MB RAM)
    ├── app-widgetco
    └── ...
```

**Capacity:** ~40 clients on CX41 (16GB), ~100 clients on CCX22 (32GB).

## Management

All operations are done via the `./ac` CLI:

```sh
./ac create <slug> [--name "Name"]   # Provision new client
./ac delete <slug> --confirm         # Remove client + database
./ac list                            # List all clients
./ac logs <slug>                     # Tail logs
./ac restart <slug>                  # Restart container
./ac add-domain <slug> <domain>      # Add custom domain
./ac update [slug|--all]             # Rebuild + restart
./ac status                          # System resource usage
```

## Setup

1. Copy `.env.example` to `.env` and fill in secrets
2. Build the app image: `docker build -t agentcenter-app:latest ../app`
3. Start base infra: `docker compose up -d`
4. Create first client: `./ac create test --name "Test Client"`
5. Visit `https://test.agentcenter.cloud`

## File Structure

```
infra/
├── ac                      # CLI management tool
├── docker-compose.yml      # Base infra (Traefik + PG + Redis + Cron)
├── .env                    # Shared secrets (from .env.example)
├── traefik/
│   └── traefik.yml         # Traefik static config
├── templates/
│   └── client.yml          # Per-client compose template
├── scripts/
│   └── cron-all.sh         # Shared cron runner
└── clients/
    ├── registry.json       # Client metadata
    ├── acme.yml            # Generated compose override
    └── widgetco.yml        # Generated compose override
```

## Storage Isolation

All clients share one R2 bucket. Each client's files are prefixed with `clients/<slug>/` via the `R2_PREFIX` env var.
