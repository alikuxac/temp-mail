# Configuration

Runtime behaviour is driven by `wrangler.jsonc` `vars` (public) and Worker secrets. This page
covers the behaviour those values control.

## Quotas and cooldowns

Shared by the Telegram bot, the Mini App and the Discord Activity:

| Variable | Default | Effect |
|---|---|---|
| `MAX_ADDRESSES_PER_USER` | `5` | Addresses a user may own. `0` means unlimited |
| `RATE_LIMIT_SECONDS` | `20` | Minimum delay between two address creations. `0` disables the cooldown |

Owner accounts (`ADMIN_ID` and allowlisted Discord users) are exempt from both.

Exceeding a limit returns `403 QuotaExceeded`, hitting the cooldown returns `429 RateLimited`.
Both responses include the relevant numbers so the UI can explain the state.

## Optional features

Everything outbound is opt-in. The Worker reports the real capabilities through
`GET /api/session` → `features`, and the Mini App renders accordingly:

| Flag | Enabled by | Behaviour when missing |
|---|---|---|
| `outbound` | `RESEND_API_KEY` | `POST /api/emails/send` and `/api/emails/reply` return `503 ConfigError`; the Reply button is hidden |
| `forward` | `RESEND_API_KEY` | `POST /api/inbox/{emailId}/forward` returns `503 ConfigError`; the Forward button is hidden |
| `aiSummary` | an AI provider (see below) | No summary is generated; the AI banner is hidden |
| `aiProvider` | — | Reports which provider generated the summary, used to label the banner |

Inbound mail, inbox reading, address generation, starring, deleting and blocklist
management always work without any optional binding.

## AI summarization providers

`AI_PROVIDER` selects where summaries come from. It is optional: when unset the
Worker infers it, so nothing changes for existing deployments.

| `AI_PROVIDER` | Requirements | Notes |
|---|---|---|
| `workers-ai` (default when no key) | `AI` binding | Uses `AI_MODEL`, default `@cf/meta/llama-3-8b-instruct` |
| `openai-compatible` (default when `AI_API_KEY` is set) | `AI_API_KEY` | Any `/chat/completions` endpoint: DeepSeek, OpenAI, OpenRouter, self-hosted |

`openai-compatible` variables:

| Variable | Default | Purpose |
|---|---|---|
| `AI_BASE_URL` | `https://api.deepseek.com/v1` | Base URL without `/chat/completions` |
| `AI_API_KEY` | — | Bearer token (secret) |
| `AI_MODEL` | `deepseek-chat` | Model id sent to the endpoint |
| `AI_MAX_TOKENS` | `100` | Response token cap |
| `AI_TEMPERATURE` | `0.3` | Sampling temperature |

Example — summarize with a self-hosted OpenAI-compatible gateway:

```bash
npx wrangler secret put AI_API_KEY
# wrangler.jsonc vars:
#   "AI_PROVIDER": "openai-compatible",
#   "AI_BASE_URL": "https://gateway.example.com/v1",
#   "AI_MODEL": "deepseek-chat"
```

If the provider call fails, the Worker never fails the email: it stores a 120-character
plain-text excerpt instead.

### Daily budget

`MAX_DAILY_AI_SUMMARIES` (default `150`, `0` = unlimited) caps how many emails are summarized per
UTC day. The counter lives in KV, so requests that exceed the budget simply skip summarization
rather than failing.

## Mini App API mode

| Variable | Default | Effect |
|---|---|---|
| `TELEGRAM_AUTH_MODE` | `strict` | `strict` requires a valid `initData` HMAC; `lenient` also allows the unsigned `X-Telegram-User-Id` header when `ENVIRONMENT=development` or `ALLOW_UNSIGNED_MINI_APP=true`; `off` disables the guard |
| `ENVIRONMENT` | `production` | `development` enables local shortcuts. `npm run dev` overrides it to `development` |
| `RESTRICT_ADDRESS_ACCESS` | `false` | When `true`, inboxes of addresses without a D1 owner row are denied |

`TELEGRAM_AUTH_MODE=off` is intended for debugging only; it exposes every inbox.

## Related documents

- [Setup](setup.md) — where each variable is set
- [Access Control](access-control.md) — allowlists and authorization