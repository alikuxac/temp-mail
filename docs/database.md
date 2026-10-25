# Database

The Worker stores everything in a single Cloudflare D1 database bound as `D1`. SQL lives in
`apps/workers/sql/`.

## Schema

| Table | Contents |
|---|---|
| `users` | One row per Telegram or Discord identity, plus `telegram_user_id` for notifications |
| `email_addresses` | Addresses owned by a user (`user_id`), with optional `expires_at` |
| `emails` | Received messages, including OTP code and optional AI summary |
| `attachments` | Attachment metadata; the payload lives in R2 |
| `block_rules` | Global sender/domain blocklist |
| `settings` | Key/value store for runtime settings |
| `discord_user_links` | Maps a Discord snowflake to an internal `users.id` |

`sql/schema.sql` is the current shape (used for fresh databases), `sql/indexes.sql` holds indexes,
and `sql/migrations/` holds incremental upgrades for existing databases.

## Creating a database

```bash
cd apps/workers
npm run db:create     # then paste database_id into wrangler.jsonc
npm run db:tables     # schema.sql
npm run db:indexes    # indexes.sql
```

## Migrations

| Script | File | Adds |
|---|---|---|
| `npm run db:migrate` | `0002_upgrade_features.sql` | Attachment, blocklist, settings and starred-email columns/tables |
| `npm run db:migrate:discord` | `0003_discord_activity.sql` | `discord_user_links`, `users.telegram_user_id`, backfill and orphan cleanup |

### Order

Run them in this order against an existing database, and re-run the indexes afterwards:

```bash
npm run db:migrate          # 0002 (skip if already applied)
npm run db:migrate:discord  # 0003
npm run db:indexes          # adds the indexes created by 0003
```

`indexes.sql` creates `idx_users_telegram_user_id` and `idx_discord_user_links_user_id`, which
only exist after `0003` — running it first fails with `no such column` / `no such table`.

### Re-running

D1 (SQLite) has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The `ALTER TABLE` statement in
`0003` therefore cannot be repeated: a second run fails with
`duplicate column name: telegram_user_id`. Every other statement is idempotent
(`CREATE ... IF NOT EXISTS`), so a partial failure can be resumed by skipping that one line.

### What `0003` cleans up

Older deployments deleted Discord addresses without removing their emails. The migration deletes
`attachments` and `emails` whose `to_address` no longer exists, so those rows do not linger.

Back up the database before migrating; D1 does not provide automatic snapshots.

## Retention

Two crons run from `wrangler.jsonc`:

*   `0 */4 * * *` — retention cleanup. Deletes R2 objects and D1 rows for unstarred emails older
    than `HOURS_TO_DELETE_D1` (overridable at runtime through the `auto_cleanup_ttl_hours`
    setting), purges orphaned emails, then deletes expired addresses.
*   `0 0 * * *` — daily top-senders report sent to admins.

## Related documents

- [Cloudflare](cloudflare.md) — creating the D1, KV and R2 resources
- [Development](development.md) — deploy and script reference