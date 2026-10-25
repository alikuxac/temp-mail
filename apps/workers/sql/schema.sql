CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT,
    received_at INTEGER NOT NULL,
    html_content TEXT,
    text_content TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    otp_code TEXT,
    summary TEXT,
    has_attachments BOOLEAN DEFAULT FALSE
);

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

CREATE TABLE IF NOT EXISTS block_rules (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('sender', 'domain')),
    pattern TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_block_rules_type ON block_rules(type);
CREATE INDEX IF NOT EXISTS idx_block_rules_pattern ON block_rules(pattern);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT,
    created_at INTEGER NOT NULL,
    telegram_user_id INTEGER
);

CREATE TABLE IF NOT EXISTS email_addresses (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    address TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_addresses_user_id ON email_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_email_addresses_address ON email_addresses(address);

CREATE TABLE IF NOT EXISTS discord_user_links (
    discord_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_user_links_user_id ON discord_user_links(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users (telegram_user_id);