-- =============================================================================
-- Migration 0003: Discord Activity integration
-- =============================================================================
--
-- Run ONCE against the remote database:
--   cd apps/workers && npm run db:migrate:discord
--
-- Fresh databases (created with `npm run db:tables`) already have every object
-- below; this script only exists to upgrade existing installations.
--
-- Order matters: `sql/indexes.sql` (run by `npm run db:indexes`) creates
-- `idx_users_telegram_user_id`, so it must run AFTER this migration on an
-- upgraded database. Verified flow for an existing install:
--
--   npm run db:migrate          # 0002 (skip if already applied)
--   npm run db:migrate:discord  # 0003 (this file)
--   npm run db:indexes          # indexes, including the new one
--
-- The only step that cannot be repeated is the ALTER TABLE below; the rest is
-- idempotent (`CREATE ... IF NOT EXISTS`, `DELETE` on derived data).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Discord <-> internal user binding
--    One row per Discord snowflake. The internal `user_id` lives in a reserved
--    band (500_000_000_000 + hash) so it never collides with Telegram user IDs.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discord_user_links (
    discord_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_user_links_user_id ON discord_user_links(user_id);

-- -----------------------------------------------------------------------------
-- 2. Telegram chat ID of an internal user
--    Mail notifications go to this chat only. Discord-only accounts have none,
--    so their inbox is never forwarded to the owner's Telegram chat.
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN telegram_user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users (telegram_user_id);

-- Legacy rows: the Telegram bot stored `ctx.from.id` directly as `users.id`.
-- Discord rows are excluded, they have no Telegram identity.
UPDATE users
SET telegram_user_id = id
WHERE telegram_user_id IS NULL
  AND id NOT IN (SELECT user_id FROM discord_user_links);

-- -----------------------------------------------------------------------------
-- 3. Clean up leftover data from the pre-integration code paths
--    - Emails addressed to an address that no longer exists (the old Discord
--      delete endpoint removed addresses without purging their inbox).
--    - Attachments of those emails (R2 objects are purged by the cron job).
-- -----------------------------------------------------------------------------
DELETE FROM attachments
WHERE email_id IN (
    SELECT e.id
    FROM emails e
    WHERE e.to_address NOT IN (SELECT address FROM email_addresses)
);

DELETE FROM emails
WHERE to_address NOT IN (SELECT address FROM email_addresses);