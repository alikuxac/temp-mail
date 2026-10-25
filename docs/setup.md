# Setup

## Prerequisites

*   **Node.js** and **npm**.
*   **Cloudflare Account** with Workers, Email Routing, D1, KV, R2 and (optionally) Workers AI.
*   **Telegram Bot**: create one via [@BotFather](https://t.me/BotFather); `ADMIN_ID` is your Telegram user ID.
*   **Discord Application**: needed only for the Discord Activity.

## Project setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Login to Cloudflare**:
    ```bash
    npx wrangler login
    ```

3.  **Create the env files from the templates** (`.env` is gitignored, never commit it).
    For the first setup, copying is enough:

    ```bash
    cp apps/workers/.env.example apps/workers/.env
    cp apps/telegram-mini-app/.env.example apps/telegram-mini-app/.env
    ```

    When `.env` already exists, **do not copy over it** — the templates gain keys as the project
    evolves and `cp` would replace your values. Merge instead:

    ```powershell
    pwsh -NoProfile -File scripts/sync-env.ps1
    ```

    `sync-env.ps1` appends only the keys missing from `.env`, drops their comments in with them,
    never rewrites an existing value, and writes a `.env.bak` backup before touching a non-empty
    file. It is safe to run repeatedly (a second run reports "up to date"). Pass `-Example` and
    `-Target` (relative to the repo root) to sync a single file.

4.  Create the Cloudflare resources following [Cloudflare](cloudflare.md).

5.  Configure the front-ends following [Integrations](integrations.md).

## Environment variables

### Worker secrets (`apps/workers/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_TOKEN` | yes | Bot token, used to verify Mini App `initData` |
| `ADMIN_ID` | yes* | Telegram owner ID(s), comma separated. Exempt from quotas |
| `DOMAIN` | yes | Domain receiving mail |
| `WORKER_DOMAIN` | yes | Full Worker origin, e.g. `https://temp-mail.xxx.workers.dev` (builds the Discord OAuth `redirect_uri`) |
| `RESEND_API_KEY` | no | Enables the **optional** outbound features (send, reply, forward). Without it those endpoints return 503 and the Mini App hides the buttons |
| `MINI_APP_URL` | no | "Open in Mini App" button in Telegram notifications |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | for Discord | OAuth credentials of the Discord app |
| `ALLOWED_DISCORD_USER_IDS` | for Discord | Discord user allowlist (deny-by-default) |
| `DISCORD_OAUTH_PROXY_URL` | no | Playground proxy URL (`trycloudflare.com`) |
| `AI_API_KEY` | no | Enables the OpenAI-compatible summarization provider |

\* Required unless `ALLOWED_DISCORD_USER_IDS` is configured.

`WORKER_DOMAIN` must be the **full origin without a trailing slash**; it is used verbatim to build
the Discord OAuth `redirect_uri`.

### Worker vars (`apps/workers/wrangler.jsonc`)

Public, non-secret configuration lives in the `vars` block:

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `production` | `development` enables local shortcuts |
| `MAX_ADDRESSES_PER_USER` | `5` | Address quota per user (`0` = unlimited) |
| `RATE_LIMIT_SECONDS` | `20` | Cooldown between address creations (`0` = disabled) |
| `ALLOWED_DISCORD_USER_IDS` | `""` | Discord user allowlist |
| `ALLOWED_DISCORD_GUILD_IDS` | `""` | Optional guild allowlist (empty = any guild) |
| `DISCORD_ALLOW_INSTALLER` | `false` | Also allow the Activity installer |
| `DISCORD_ALLOWED_ORIGINS` | `""` | Extra CORS origins (empty = any origin, still signature-checked) |
| `MINI_APP_DISCORD_PROVIDER` | `true` | Accept signed Discord requests on the Mini App inbox routes |
| `MAX_DAILY_AI_SUMMARIES` | `150` | AI summary budget per UTC day (`0` = unlimited) |
| `AI_PROVIDER` | auto | `workers-ai` or `openai-compatible` — see [Configuration](configuration.md#ai-summarization-providers) |
| `AI_MODEL` | per provider | Model id (`@cf/...` for Workers AI) |
| `AI_BASE_URL` | DeepSeek | Base URL for the OpenAI-compatible provider |
| `AI_MAX_TOKENS` | `100` | Response token cap |
| `AI_TEMPERATURE` | `0.3` | Sampling temperature |
| `TELEGRAM_AUTH_MODE` | `strict` | `strict` / `lenient` / `off` |
| `ALLOWED_TELEGRAM_USER_IDS` | — | Optional Telegram allowlist |
| `RESTRICT_ADDRESS_ACCESS` | `false` | Deny inbox access for addresses with no D1 row |

### Mini App (`apps/telegram-mini-app/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Worker origin (empty = same origin) |
| `VITE_DISCORD_CLIENT_ID` | Public Discord client ID |
| `VITE_TELEGRAM_BOT_URL` | Link to the bot |

Vite inlines these at **build** time: rebuild after changing them. The same three values must be
available to CI; see [Development](development.md#continuous-integration).

## Related documents

- [Cloudflare](cloudflare.md) — create the bindings referenced above
- [Configuration](configuration.md) — quotas, feature flags and providers
- [Access Control](access-control.md) — allowlist semantics