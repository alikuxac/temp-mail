# Access Control

Everything is deny-by-default and scoped by user ID. Authentication is covered in
[Architecture](architecture.md#request-authentication); this page describes the authorization
rules applied afterwards.

## Guards per surface

| Surface | Guard |
|---|---|
| Telegram bot | `ADMIN_ID` for admin commands, `MAX_ADDRESSES_PER_USER` / `RATE_LIMIT_SECONDS` for everyone else |
| Mini App API | verified `initData` HMAC (24h) + optional `ALLOWED_TELEGRAM_USER_IDS` |
| Discord Activity | Ed25519 signature + `ALLOWED_DISCORD_USER_IDS` + optional `ALLOWED_DISCORD_GUILD_IDS` |
| Inbox / attachments | ownership check on `email_addresses.user_id`, owner or allowlisted user only |
| Settings / blocklist | owner only |

## Identity model

| Front-end | Internal `users.id` | Notes |
|---|---|---|
| Telegram | The Telegram user ID | The bot and the Mini App share it, so both see the same inboxes |
| Discord | `500_000_000_000` + a 63-bit hash of the snowflake | A reserved band, so Discord IDs can never collide with Telegram IDs |

A snowflake does not fit in JavaScript's safe integer range, which is why Discord accounts use a
derived ID rather than the raw snowflake. The mapping lives in `discord_user_links`.

## Telegram allowlist

`ALLOWED_TELEGRAM_USER_IDS` is optional:

*   **Empty** — any Telegram user with a valid `initData` may use the service.
*   **Non-empty** — only the listed IDs may, plus `ADMIN_ID`. Everyone else gets
    `403 Forbidden`.

`ADMIN_ID` entries are additionally treated as owners: exempt from quotas and allowed to manage
global settings, the blocklist and other users' inboxes.

## Discord allowlist

`ALLOWED_DISCORD_USER_IDS` is **required for the Activity to work at all**; an empty list denies
every user. `ALLOWED_DISCORD_GUILD_IDS` optionally restricts the Activity to specific servers
(an empty list allows any guild, including DMs).

See [Integrations](integrations.md#allowlist) for how to find user and guild IDs.

## Ownership rules

Once the caller is identified:

*   Inbox reads, star, delete, forward and attachment downloads require the caller to own the
    recipient address (`email_addresses.user_id`), unless they are an owner.
*   Address deletion also purges the address's emails so no orphan rows remain.
*   Attachment listing and downloads re-check ownership on the parent email, so an ID alone is
    not enough to fetch someone else's file.
*   The Telegram bot applies the same checks to its inline buttons; the global blocklist is
    owner-only because a rule currently affects every inbox.

## Related documents

- [Configuration](configuration.md) — quota and auth-mode variables
- [Integrations](integrations.md) — setting the allowlists