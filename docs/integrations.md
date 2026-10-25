# Integrations

Front-end specific configuration. Both integrations reuse the same Worker and the same
environment variables described in [Setup](setup.md).

## Telegram

### Bot

1.  Create the bot with [@BotFather](https://t.me/BotFather) and copy its token.
2.  Store the token and your own Telegram user ID:
    ```bash
    npx wrangler secret put TELEGRAM_TOKEN
    npx wrangler secret put ADMIN_ID
    ```
    `ADMIN_ID` accepts a comma separated list; every listed ID is exempt from quotas and can use
    the admin commands (`/cleanup`, `/list_all`).

### Webhook

Register the webhook **after** the first deploy:

```
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<WORKER_DOMAIN>/webhook
```

Check for delivery errors with `getWebhookInfo`; `last_error_message` should be empty.

### Commands

Command hints shown in the Telegram UI are registered from the Worker:

```bash
curl -X POST https://<WORKER_DOMAIN>/commands
```

## Discord Activity

Discord embeds the Mini App in an iframe and proxies every request, adding signed
`frame_id` / `instance_id` query parameters that the Worker verifies with an Ed25519 signature.

### Discord Developer Portal

1.  Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2.  **OAuth2** → add the redirect URL `${WORKER_DOMAIN}/discord`.
3.  **Activities** → enable, and set the URL mapping to your Mini App Pages domain.

### Secrets

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
```

### Allowlist

`ALLOWED_DISCORD_USER_IDS` in `wrangler.jsonc` decides who may use the Activity. It is
**deny-by-default**: an empty list blocks everyone. Get a user ID by enabling Developer Mode in
Discord and copying the ID.

| Variable | Effect |
|---|---|
| `ALLOWED_DISCORD_USER_IDS` | Users allowed to open the Activity |
| `ALLOWED_DISCORD_GUILD_IDS` | Restrict the Activity to specific servers (empty = any) |
| `DISCORD_ALLOW_INSTALLER` | Also allow whoever installed the Activity |
| `DISCORD_ALLOWED_ORIGINS` | Extra CORS origins; empty allows any origin (still signature-checked) |
| `MINI_APP_DISCORD_PROVIDER` | Also accept signed Discord requests on the Mini App inbox routes |

### Playground / local testing

The Discord playground has no OAuth redirect. Set `DISCORD_OAUTH_PROXY_URL` to the
`trycloudflare.com` URL it gives you so the Worker can build a matching `redirect_uri`.

## Mini App on Cloudflare Pages

Deploy the front-end to the Pages project referenced by the Discord URL mapping:

```bash
cd apps/telegram-mini-app
npm run build
npm run deploy
```

Set `VITE_API_BASE_URL` to the Worker origin when Pages and the Worker are on different domains,
and `VITE_DISCORD_CLIENT_ID` so the Activity bootstrap can start.

## Related documents

- [Setup](setup.md) — environment variables
- [Access Control](access-control.md) — authorization rules
- [Development](development.md) — build and deploy commands