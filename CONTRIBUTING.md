# Contributing

Thanks for your interest. This repository is the infrastructure behind the former hosted AgentCenter
service: an admin dashboard (Next.js) plus Docker Compose, Traefik and shell tooling for multi-tenant
provisioning and license issuance.

## Ground rules

- Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security problems go through [private reporting](SECURITY.md), never a public issue or pull request.
- For anything larger than a fix, start a [discussion](https://github.com/MissionControlSquad/infra/discussions)
  or open an issue first so the approach is agreed before you build it.

## Development setup

Requirements: Node.js 22 and npm. Docker is optional; without it the dashboard skips container
operations and works on the registry files only.

```bash
cd dashboard
cp .env.example .env.local   # set ADMIN_PASSWORD and API_KEY to random local values
npm ci
npm run dev                  # http://localhost:4000
```

## Before you open a pull request

Run the same checks CI runs:

```bash
cd dashboard
npx tsc --noEmit
npm test
npm run build
cd .. && shellcheck --severity=error ac setup-server.sh scripts/*.sh
```

- Add or update tests in `dashboard/tests/` for behaviour you change, especially in `lib/shell.ts`,
  which builds shell commands and must keep escaping untrusted input.
- If you add or rename an environment variable, update both `.env.example` files and the README.
- New GitHub Actions must be pinned to a full commit SHA, with the narrowest `permissions` the job needs.

## Never commit secrets

`.env`, `keys/` and `data/` are git-ignored because they hold credentials, the license-signing key
and tenant data. Example values must be obvious placeholders. Secret scanning with push protection
is enabled and blocks pushes that contain recognised credentials.

## Commits and review

Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`, `chore:`).
Every change lands through a pull request that passes CI and is reviewed by a code owner. Pull
requests are squash-merged, so the PR title becomes the commit message.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
