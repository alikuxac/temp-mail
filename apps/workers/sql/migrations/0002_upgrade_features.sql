-- Migration: Add features upgrade (attachments, block rules, settings, starred emails)

-- 1. Add new columns to emails table
ALTER TABLE emails ADD COLUMN is_starred BOOLEAN DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN otp_code TEXT;
ALTER TABLE emails ADD COLUMN summary TEXT;
ALTER TABLE emails ADD COLUMN has_attachments BOOLEAN DEFAULT FALSE;

-- 2. Create attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    r2_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- 3. Create block_rules table
CREATE TABLE IF NOT EXISTS block_rules (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('sender', 'domain')),
    pattern TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_block_rules_type ON block_rules(type);
CREATE INDEX IF NOT EXISTS idx_block_rules_pattern ON block_rules(pattern);

-- 4. Create settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
