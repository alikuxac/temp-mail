# Architecture

Cloudflare Worker that acts as a temporary email inbox, with three front-ends sharing the same
data: the **Telegram bot**, the **Telegram Mini App**, and a **Discord Activity**.

## Components

| App | Path | Runtime | Auth |
|---|---|---|---|
| API / bot / Discord routes | `apps/workers` | Cloudflare Worker | — |
| Telegram Mini App | `apps/telegram-mini-app` | Cloudflare Pages | Telegram `initData` HMAC **or** Discord Ed25519 signature |
| Shared types | `packages/shared-types` | — | — |

Both front-ends hit the **same** `/api/*` routes and the **same** `users.id`, so an address created
in the bot appears in the Mini App and vice versa.

## Cloudflare bindings

| Binding | Type | Used for |
|---|---|---|
| `D1` | D1 database | Users, addresses, emails, attachments metadata, settings |
| `KV` | KV namespace | Sender statistics, AI summary budget counter |
| `ATTACHMENTS_BUCKET` | R2 bucket | Raw attachment payloads |
| `AI` | Workers AI | Email summaries (optional, one of two providers) |

## Request authentication

Every request reaching `/api/*` is authenticated before any handler runs:

1. **Telegram Mini App** — `X-Telegram-Init-Data` is verified with an HMAC built from
   `TELEGRAM_TOKEN` (24 hour freshness window). The Mini App also accepts the signed Discord
   request when it is embedded in Discord.
2. **Discord Activity** — Discord proxies the request and appends signed `frame_id` /
   `instance_id` query parameters. The Worker verifies both against Discord's public key
   (Ed25519, 5 minute clock window), then applies the user ID allowlist.

See [Access Control](access-control.md) for the authorization rules that follow authentication.

## Email ingestion

Cloudflare Email Routing delivers to the Worker's `email` handler:

1. Reject blocked senders.
2. Parse MIME, resolve the recipient address in D1, reject unknown/expired addresses and
   addresses whose owner is no longer allowlisted.
3. Extract OTP codes, generate an optional AI summary, store attachments in R2.
4. Persist the email in D1.
5. Apply forwarding and webhook settings.
6. Notify the owner on Telegram (Discord-only accounts have no Telegram chat).

Scheduled crons run retention cleanup and a daily report; see
[Database](database.md) for the cleanup behaviour.

## Related documents

- [Setup](setup.md) — environment variables and first run
- [Cloudflare](cloudflare.md) — creating the resources
- [Configuration](configuration.md) — quotas and optional features