# AgentCenter Infra

Infrastructure and admin dashboard for AgentCenter. Manages tenant provisioning, license issuance, and container lifecycle via Docker.

## Overview

```
.
├── dashboard/          # Next.js admin dashboard + REST API
├── clients/            # Tenant registry (registry.json) — created at runtime
├── data/               # License registry + activations — created at runtime
├── keys/               # RSA key pair for license signing — created at runtime
├── scripts/            # plan-config.json + maintenance scripts
├── templates/          # Docker Compose template per client
├── traefik/            # Reverse proxy config
├── docker-compose.yml  # Main compose (Traefik + dashboard)
├── ac                  # CLI tool for managing clients
└── setup-server.sh     # Server bootstrap script
```

## Dashboard

The Next.js app in `dashboard/` is the admin UI and API. It runs as a Docker container managed by the root `docker-compose.yml`.

### Environment Variables

Copy `dashboard/.env.example` to `dashboard/.env.local`:

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Password to log into the dashboard UI. Use a strong random value. |
| `API_KEY` | Shared secret for server-to-server calls from the website Vercel app. Must match `INFRA_API_KEY` in the website Vercel environment variables. Generate: `openssl rand -base64 32` |

### API Endpoints

All endpoints require either a valid session cookie (admin UI) or `X-API-Key: <API_KEY>` header.

#### Clients

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/clients` | List all tenants + aggregate stats |
| `POST` | `/api/clients` | Create a new tenant (hosted or self-hosted) |
| `GET` | `/api/clients/:slug` | Get a single tenant |
| `POST` | `/api/clients/:slug/reprovision` | Retry a failed provisioning (max 3 attempts) |
| `POST` | `/api/clients/:slug/restart` | Restart the tenant container |
| `POST` | `/api/clients/:slug/upgrade` | Upgrade the tenant container image |
| `GET` | `/api/clients/lookup` | Look up a tenant by email + plan type |

#### Licenses

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/license/public-key` | Get the RSA public key (used by clients to verify tokens) |
| `POST` | `/api/license/activate` | Activate a license on a self-hosted instance |
| `POST` | `/api/license/token` | Exchange a refresh token for a short-lived access token (24h) |

### Creating a Tenant

**Hosted tenant** (Docker container managed by infra):
```json
POST /api/clients
{
  "slug": "mycompany",
  "name": "My Company",
  "email": "user@mycompany.com",
  "type": "hosted"
}
```

**Self-hosted tenant** (registry entry + license only):
```json
POST /api/clients
{
  "slug": "mycompany",
  "name": "My Company",
  "email": "user@mycompany.com",
  "planName": "Self-Hosting"
}
```
Returns `{ licenseKey: "<refresh_token>" }` immediately — no container wait.

### buildbase Workspace-per-Tenant

Each hosted tenant is bound to a **buildbase (SaaSOS) workspace**. The monorepo
app (running inside the tenant container) uses this to enforce that a human
logging in is a member of *this* tenant's workspace — the cross-tenant gate.

**Infra does NOT create buildbase workspaces.** buildbase auto-creates each
user's workspace on signup (the org runs in `personal` mode), and the website
already has it via `useSaaSWorkspaces().currentWorkspace`. So the workspace id is
**passed in by the caller** at provision time; infra just receives and binds it.

**Provisioning step** (`ac create` / `POST /api/clients`):

1. The caller (the website) supplies the signed-in user's `workspaceId` — via
   `ac create <slug> --workspace-id <id>` or the `POST /api/clients` request body.
2. The provided id is stored in `clients/registry.json` (`.<slug>.workspaceId`)
   and substituted into the client container env as `TENANT_WORKSPACE_ID`.
3. The container also receives the shared platform buildbase config
   (`SAAS_SERVER_URL`, `SAAS_ORG_ID`, `SAAS_CLIENT_ID`, `SAAS_CLIENT_SECRET`),
   its public URL (`NEXT_PUBLIC_APP_URL`), and `AUTH_COOKIE_DOMAIN` (parent-domain
   cookie for cross-subdomain SSO) — these are what the tenant dashboard needs to
   run the buildbase SSO.

**No service credential and no org reconfiguration are required.** If no
`workspaceId` is provided (e.g. self-host), it's left empty and the tenant runs
**single-tenant** (no cross-tenant gate — the monorepo bridge treats it as a
single-tenant instance). Set or change it later on an existing tenant:

```bash
./ac set-workspace <slug> --workspace-id <id>
```

`set-workspace` stores the id, regenerates the compose file (injecting
`TENANT_WORKSPACE_ID`), and restarts the container.

### Infra Environment Variables (workspace-per-tenant)

Add to `infra/.env` (see `.env.example`). These are the platform buildbase
values injected into every tenant container so the tenant dashboard can run the
SSO — no create-workspace / service credential is needed:

| Variable | Description |
|---|---|
| `SAAS_SERVER_URL` | Platform buildbase server base URL (same for all tenants). |
| `SAAS_ORG_ID` | Platform buildbase org id (same for all tenants). |
| `SAAS_CLIENT_ID` | buildbase OAuth client id. |
| `SAAS_CLIENT_SECRET` | buildbase OAuth client secret (server-only). |
| `AUTH_COOKIE_DOMAIN` | Parent-domain cookie for cross-subdomain SSO (default `.agentcenter.cloud`). |

The per-tenant `workspaceId` is **not** an env var — it is passed in per tenant
at provision time (see above).

### Lookup by Email

Used by the website to check if a tenant already exists for a user:
```
GET /api/clients/lookup?email=user@example.com&planName=Self-Hosting
```
- `planName` is optional. Pass `"Self-Hosting"` to look up a self-hosted entry. Omit for hosted.
- A single email can have one hosted entry AND one self-hosted entry. The `planName` param selects which one.

### Provisioning States

Hosted tenants go through these states (stored in `clients/registry.json`):

| State | Meaning |
|---|---|
| `provisioning` | Container being created — poll until active or timeout |
| `active` | Container running, tenant ready |
| `failed` | Provisioning timed out (>10 min). Admin or user can retry up to 3 times. |

Self-hosted tenants are always `active` from creation — no container to wait for.

### License System

Licenses use RSA-256 signed JWTs. Keys are generated on first boot in `keys/`.

- **Refresh token** — long-lived, no expiry. Issued once at creation. The self-hosted user enters this on first launch.
- **Access token** — 24-hour JWT containing plan limits (`maxAgents`, `maxProjects`, `maxSeats`, `features`). Client instances call `/api/license/token` with the refresh token to get a new access token.

Plan limits are defined in `scripts/plan-config.json`:
```json
{
  "plans": {
    "starter": { "maxAgents": 5, "maxProjects": 10, "maxSeats": 3, "features": [...] },
    "pro": { ... },
    "enterprise": { "maxAgents": -1, "maxProjects": -1, "maxSeats": -1, "features": [...] }
  }
}
```
Self-hosted tenants are issued on the `enterprise` plan.

## Registry Files

These files are created and managed by the dashboard at runtime. Do not edit manually unless recovering from a corrupted state.

| File | Description |
|---|---|
| `clients/registry.json` | Tenant registry — keyed by slug, stores type, email, provisioning state |
| `data/license-registry.json` | License registry — keyed by slug, stores plan, refresh token, active flag |
| `data/license-activations.json` | Activation records — keyed by instance ID, tracks heartbeats |
| `keys/license-private.pem` | RSA private key (mode 600) — keep secret |
| `keys/license-public.pem` | RSA public key — shared with clients for verification |

## Local Development

```bash
cd dashboard
npm install
cp .env.example .env.local   # fill in values
npm run dev                   # starts on port 3001
```

In local dev, Docker is not available. The dashboard skips container operations and works with registry files only. Registry files are read from `../clients/` and `../data/` relative to the dashboard directory.

## Production Deployment

The full stack runs via Docker Compose at the repo root:

```bash
./setup-server.sh    # first-time server bootstrap (installs Docker, Traefik, etc.)
docker compose up -d # start everything
```

The dashboard is accessible at the domain configured in `docker-compose.yml` via Traefik.

## Key Constants (`dashboard/lib/constants.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `SELF_HOST_PLAN_NAME` | `"Self-Hosting"` | Plan name that triggers self-hosted provisioning |
| `SELF_HOST_LICENSE_PLAN` | `"enterprise"` | License plan issued to all self-hosted tenants |
| `HOSTED_APP_DOMAIN` | `"app.agentcenter.cloud"` | Base domain for hosted tenant URLs |
| `CLIENT_TYPE.HOSTED` | `"hosted"` | Hosted deployment type |
| `CLIENT_TYPE.SELF_HOSTED` | `"self-hosted"` | Self-managed deployment type |
| `PROVISIONING_STATUS.*` | `"provisioning" \| "active" \| "failed"` | Tenant lifecycle states |
| `TENANT_MAX_RETRY_ATTEMPTS` | `3` | Max provisioning retries before requiring manual intervention |

## License

Proprietary. © Jagodana LLC.
