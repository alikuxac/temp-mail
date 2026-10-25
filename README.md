# Temp Mail Worker

Cloudflare Worker that acts as a temporary email inbox, with three front-ends sharing the same
data: the **Telegram bot**, the **Telegram Mini App**, and a **Discord Activity**.

## Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/architecture.md) | Apps, data flow, request authentication |
| [Setup](docs/setup.md) | Prerequisites, project setup, environment variables |
| [Cloudflare](docs/cloudflare.md) | D1, KV, R2, Email Routing, secrets |
| [Integrations](docs/integrations.md) | Telegram bot + webhook, Discord Activity |
| [Configuration](docs/configuration.md) | Quotas, feature flags, optional providers |
| [Access Control](docs/access-control.md) | Allowlists and per-user authorization |
| [Development](docs/development.md) | Local dev, build, deploy, release, scripts |
| [API](docs/api.md) | HTTP endpoints and authentication |
| [Database](docs/database.md) | Schema, migrations and their order |

## Features

*   Receives emails via Cloudflare Email Routing.
*   Stores email data in a Cloudflare D1 database, attachments in R2.
*   **Telegram Bot Interface**: Manage addresses and read emails directly in Telegram.
*   **Telegram Mini App**: Full inbox UI with OTP extraction, starring, blocking and settings.
*   **Discord Activity**: The same inbox embedded in Discord, verified with Discord's signature.
*   Providers with Hono + OpenAPI.
*   Automatically cleans up old emails, empty inboxes and expired addresses.
*   Per-user quotas and cooldowns, shared across all three front-ends.

## Quick start

```bash
npm install
npx wrangler login

cp apps/workers/.env.example apps/workers/.env
cp apps/telegram-mini-app/.env.example apps/telegram-mini-app/.env

cd apps/workers
npm run db:tables
npm run db:indexes
npm run dev
```

See [Setup](docs/setup.md) for the full walkthrough and
[Development](docs/development.md) for build and deployment commands.

## Repository layout

```
apps/workers           # Cloudflare Worker: API, Telegram bot, Discord routes, email ingestion
apps/telegram-mini-app # React Mini App (Cloudflare Pages)
packages/shared-types  # Shared Zod schemas and TypeScript types
scripts/               # Maintenance scripts (env sync, ...)
docs/                  # Project documentation
```

## License

MIT