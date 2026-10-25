# Cloudflare

Create the resources that `apps/workers/wrangler.jsonc` binds. Run everything from `apps/workers`:

```bash
cd apps/workers
```

## D1 database

1.  **Create the database**:
    ```bash
    npm run db:create
    ```
2.  **Copy the `database_id`** from the output into `wrangler.jsonc` (the `D1` binding).
3.  **Apply schema and indexes**:
    ```bash
    npm run db:tables
    npm run db:indexes
    ```

`db:indexes` must run **after** the schema and after any migration that adds a column an index
depends on. See [Database](database.md) for the full ordering rules.

## KV namespace

1.  **Create the namespace**:
    ```bash
    npm run kv:create
    ```
2.  **Copy the `id`** and update both `id` and `preview_id` in `wrangler.jsonc`.

KV stores sender statistics and the daily AI summary counter.

## R2 bucket

The `ATTACHMENTS_BUCKET` binding expects a bucket named `temp-mail-attachments`. Create it in the
dashboard (or with `npx wrangler r2 bucket create temp-mail-attachments`) and adjust
`bucket_name` if you use a different name.

Inbound attachments are stored under `attachments/<emailId>/<attachmentId>_<filename>`.

## Email Routing

1.  Go to **Cloudflare Dashboard** and select your domain.
2.  Navigate to **Email → Email Routing**.
3.  Create a **Catch-all Rule** with the action **Send to Worker**, targeting this Worker.

`DOMAIN` in the Worker env must match the domain whose routing you configured.

## Secrets

Secrets are never written to `wrangler.jsonc`. Set them with:

```bash
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put ADMIN_ID
npx wrangler secret put DOMAIN
npx wrangler secret put WORKER_DOMAIN
npx wrangler secret put RESEND_API_KEY       # optional
npx wrangler secret put MINI_APP_URL         # optional
npx wrangler secret put DISCORD_CLIENT_ID    # Discord Activity only
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put AI_API_KEY           # optional, OpenAI-compatible provider
```

Verify what is already deployed with:

```bash
npx wrangler secret list
```

## Scheduled triggers

`wrangler.jsonc` registers two crons: `0 */4 * * *` for retention cleanup and `0 0 * * *` for the
daily report. They run without extra configuration, but the cleanup deletes uploads from
`ATTACHMENTS_BUCKET`, so keep the bucket bound or R2 objects will be orphaned.

## Related documents

- [Setup](setup.md) — environment variables
- [Database](database.md) — schema and migrations
- [Integrations](integrations.md) — Telegram and Discord configuration