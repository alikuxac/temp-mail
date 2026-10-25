# API

All `/api/*` routes require either a verified Telegram `initData` header
(`X-Telegram-Init-Data`) or a signed Discord Activity request. See
[Access Control](access-control.md) for the rules applied afterwards.

Responses always use the envelope `{ success, result }` on success and
`{ success: false, error: { name, message } }` on failure.

## Session

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/session` | Current user, quota, addresses, settings, active domain and `features` flags (`outbound`, `forward`, `aiSummary`, `aiProvider`) |
| `GET` | `/api/discord/me` | Signed Discord identity pre-check |

## Email

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/emails/{emailAddress}` | List emails for an address |
| `GET` | `/api/emails/count/{emailAddress}` | Email count for an address |
| `GET` | `/api/inbox/{emailId}` | Email detail |
| `DELETE` | `/api/emails/{emailAddress}` | Delete all emails for an address |
| `DELETE` | `/api/inbox/{emailId}` | Delete a single email |
| `PATCH` | `/api/inbox/{emailId}/star` | Toggle starred |
| `POST` | `/api/inbox/{emailId}/forward` | Forward an email (optional, requires `RESEND_API_KEY`) |
| `POST` | `/api/emails/send` | Send an email (optional, requires `RESEND_API_KEY`) |
| `POST` | `/api/emails/reply` | Reply to an email (optional, requires `RESEND_API_KEY`) |

`GET /api/emails/{emailAddress}` accepts `limit` (default 50, max 100) and `offset` (default 0).

## Addresses

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/addresses/random` | Generate a random address (quota + cooldown enforced) |
| `POST` | `/api/addresses/custom` | Create a custom-prefix address |

## Attachments

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/attachments/email/{emailId}` | List attachments (owner only) |
| `GET` | `/api/attachments/{id}/download` | Download an attachment (owner only) |

Downloads are served with `Cache-Control: private`; the Mini App fetches them with the session in
headers so the `initData` token never appears in a URL.

## Settings

| Method | Path | Description |
|---|---|---|
| `GET` / `PUT` | `/api/settings` | Read/update global settings (owner only) |
| `GET` / `POST` | `/api/settings/blocklist` | List/add block rules (owner only) |
| `DELETE` | `/api/settings/blocklist/{id}` | Remove a block rule (owner only) |

## Discord Activity

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/discord/token` | Validate the Activity launch code (never returns the access token) |
| `GET` | `/api/discord/session` | Identity, quota, addresses and settings |
| `GET` / `POST` | `/api/discord/addresses` | List / create addresses |
| `POST` | `/api/discord/addresses/random` | Generate a random address |
| `POST` | `/api/discord/addresses/custom` | Create a custom-prefix address |
| `DELETE` | `/api/discord/addresses/{emailAddress}` | Delete an address and its emails |
| `GET` | `/api/discord/emails/{emailAddress}` | Inbox listing |
| `GET` / `DELETE` | `/api/discord/inbox/{emailId}` | Email detail / delete |
| `PATCH` | `/api/discord/inbox/{emailId}/star` | Toggle starred |

## Telegram / Health

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Telegram webhook |
| `POST` | `/commands` | Register bot commands |
| `GET` | `/health` | Service health status (checks D1 and KV) |

## Generated documentation

Interactive docs are served at `GET /swagger` and `GET /` (Scalar), backed by `GET /openapi.json`.

## Related documents

- [Access Control](access-control.md) — who may call what
- [Configuration](configuration.md) — optional features behind some endpoints