import type {
	Attachment,
	BlockRule,
	Email,
	EmailAddress,
	EmailSummary,
	Setting,
	User,
} from "@temp-mail/shared-types";

/**
 * Insert an email into the database
 */
export async function insertEmail(db: D1Database, emailData: Email) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO emails (
					id, from_address, to_address, subject, received_at,
					html_content, text_content, is_read, is_starred, otp_code, summary, has_attachments
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				emailData.id,
				emailData.from_address,
				emailData.to_address,
				emailData.subject,
				emailData.received_at,
				emailData.html_content,
				emailData.text_content,
				emailData.is_read ? 1 : 0,
				emailData.is_starred ? 1 : 0,
				emailData.otp_code ?? null,
				emailData.summary ?? null,
				emailData.has_attachments ? 1 : 0,
			)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get emails by recipient email address
 */
export async function getEmailsByRecipient(
	db: D1Database,
	emailAddress: string,
	limit = 10,
	offset = 0,
) {
	try {
		const { results } = await db
			.prepare(
				`SELECT id, from_address, to_address, subject, received_at,
				        is_read, is_starred, otp_code, summary, has_attachments
         FROM emails
         WHERE to_address = ?
         ORDER BY received_at DESC
         LIMIT ? OFFSET ?`,
			)
			.bind(emailAddress, limit, offset)
			.all();

		const formatted = (results || []).map((row) => ({
			...(row as unknown as EmailSummary),
			is_read: Boolean(row.is_read),
			is_starred: Boolean(row.is_starred),
			has_attachments: Boolean(row.has_attachments),
		}));

		return { results: formatted, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

/**
 * Get an email by ID
 */
export async function getEmailById(db: D1Database, emailId: string) {
	try {
		const emailResult = await db
			.prepare("SELECT * FROM emails WHERE id = ?")
			.bind(emailId)
			.first<Record<string, unknown>>();

		if (emailResult) {
			const formatted: Email = {
				id: String(emailResult.id),
				from_address: String(emailResult.from_address),
				to_address: String(emailResult.to_address),
				subject: emailResult.subject ? String(emailResult.subject) : null,
				received_at: Number(emailResult.received_at),
				html_content: emailResult.html_content ? String(emailResult.html_content) : null,
				text_content: emailResult.text_content ? String(emailResult.text_content) : null,
				is_read: Boolean(emailResult.is_read),
				is_starred: Boolean(emailResult.is_starred),
				otp_code: emailResult.otp_code ? String(emailResult.otp_code) : null,
				summary: emailResult.summary ? String(emailResult.summary) : null,
				has_attachments: Boolean(emailResult.has_attachments),
			};
			return { result: formatted, error: undefined };
		}

		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Toggle email starred/pinned status
 */
export async function toggleStarEmail(db: D1Database, emailId: string, isStarred: boolean) {
	try {
		const { success, error, meta } = await db
			.prepare("UPDATE emails SET is_starred = ? WHERE id = ?")
			.bind(isStarred ? 1 : 0, emailId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get unstarred emails older than a specific cutoff timestamp for cleanup
 */
export async function getOldUnstarredEmails(db: D1Database, cutoffTimestamp: number) {
	try {
		const { results } = await db
			.prepare(
				"SELECT id FROM emails WHERE (is_starred = 0 OR is_starred IS NULL) AND received_at < ?",
			)
			.bind(cutoffTimestamp)
			.all<{ id: string }>();

		return { results: results ?? [], error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

/**
 * Delete emails older than a specific timestamp (ignoring starred)
 */
export async function deleteOldEmails(db: D1Database, timestamp: number) {
	try {
		const { success, error, meta } = await db
			.prepare(
				"DELETE FROM emails WHERE (is_starred = 0 OR is_starred IS NULL) AND received_at < ?",
			)
			.bind(timestamp)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Delete emails by recipient email address
 */
export async function deleteEmailsByRecipient(db: D1Database, emailAddress: string) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM emails WHERE to_address = ?")
			.bind(emailAddress)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Delete an email by ID
 */
export async function deleteEmailById(db: D1Database, emailId: string) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM emails WHERE id = ?")
			.bind(emailId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Delete emails addressed to addresses that no longer exist (orphans created when
 * an address was removed without purging its inbox).
 */
export async function deleteOrphanEmails(db: D1Database) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`DELETE FROM emails
				 WHERE to_address NOT IN (SELECT address FROM email_addresses)`,
			)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Count emails by recipient email address
 */
export async function countEmailsByRecipient(db: D1Database, emailAddress: string) {
	try {
		const result = await db
			.prepare("SELECT count(*) as count FROM emails WHERE to_address = ?")
			.bind(emailAddress)
			.first<{ count: number }>();
		return { count: result?.count || 0, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { count: 0, error: error };
	}
}

export async function pinEmail(db: D1Database, emailId: string, isPinned: boolean) {
	return toggleStarEmail(db, emailId, isPinned);
}

// =========================================================================
// Attachments
// =========================================================================

export async function insertAttachment(db: D1Database, attachment: Attachment) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO attachments (id, email_id, file_name, file_type, file_size, r2_key, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				attachment.id,
				attachment.email_id,
				attachment.file_name,
				attachment.file_type ?? null,
				attachment.file_size,
				attachment.r2_key,
				attachment.created_at,
			)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

export async function getAttachmentsByEmailId(db: D1Database, emailId: string) {
	try {
		const { results } = await db
			.prepare("SELECT * FROM attachments WHERE email_id = ? ORDER BY created_at ASC")
			.bind(emailId)
			.all<Attachment>();
		return { results: results ?? [], error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

export async function getAttachmentById(db: D1Database, id: string) {
	try {
		const result = await db
			.prepare("SELECT * FROM attachments WHERE id = ?")
			.bind(id)
			.first<Attachment>();
		return { result: result ?? null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

export async function deleteAttachmentsByEmailId(db: D1Database, emailId: string) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM attachments WHERE email_id = ?")
			.bind(emailId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

// =========================================================================
// Block Rules
// =========================================================================

export async function isSenderBlocked(db: D1Database, senderAddress: string): Promise<boolean> {
	try {
		const normalizedSender = senderAddress.trim().toLowerCase();
		const domain = normalizedSender.split("@").pop() ?? "";

		const rule = await db
			.prepare(
				`SELECT id FROM block_rules
				 WHERE (type = 'sender' AND LOWER(pattern) = ?)
				    OR (type = 'domain' AND LOWER(pattern) = ?)
				 LIMIT 1`,
			)
			.bind(normalizedSender, domain)
			.first<{ id: string }>();

		return Boolean(rule?.id);
	} catch (e: unknown) {
		console.error("Failed to check block rule:", e);
		return false;
	}
}

export async function getBlockRules(db: D1Database) {
	try {
		const { results } = await db
			.prepare("SELECT * FROM block_rules ORDER BY created_at DESC")
			.all<BlockRule>();
		return { results: results ?? [], error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

export async function createBlockRule(db: D1Database, rule: BlockRule) {
	try {
		const { success, error, meta } = await db
			.prepare("INSERT INTO block_rules (id, type, pattern, created_at) VALUES (?, ?, ?, ?)")
			.bind(rule.id, rule.type, rule.pattern.toLowerCase().trim(), rule.created_at)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

export async function deleteBlockRule(db: D1Database, id: string) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM block_rules WHERE id = ?")
			.bind(id)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

// =========================================================================
// Settings
// =========================================================================

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
	try {
		const row = await db
			.prepare("SELECT value FROM settings WHERE key = ?")
			.bind(key)
			.first<{ value: string }>();
		return row?.value ?? null;
	} catch (e: unknown) {
		console.error(`Failed to get setting ${key}:`, e);
		return null;
	}
}

export async function getAllSettings(db: D1Database): Promise<Record<string, string>> {
	try {
		const { results } = await db.prepare("SELECT key, value FROM settings").all<Setting>();
		const settingsMap: Record<string, string> = {};
		for (const row of results ?? []) {
			settingsMap[row.key] = row.value;
		}
		return settingsMap;
	} catch (e: unknown) {
		console.error("Failed to get all settings:", e);
		return {};
	}
}

export async function setSetting(db: D1Database, key: string, value: string, updatedAt: number) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO settings (key, value, updated_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(key) DO UPDATE SET
				   value = excluded.value,
				   updated_at = excluded.updated_at`,
			)
			.bind(key, value, updatedAt)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Delete a specific Email Address by ID, restricted to its owner
 */
export async function deleteEmailAddressForUser(db: D1Database, id: string, userId: number) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM email_addresses WHERE id = ? AND user_id = ?")
			.bind(id, userId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get an email address object owned by a specific user
 */
export async function getEmailAddressForUser(db: D1Database, id: string, userId: number) {
	try {
		const result = await db
			.prepare("SELECT * FROM email_addresses WHERE id = ? AND user_id = ?")
			.bind(id, userId)
			.first();

		if (result) {
			return { result: result as unknown as EmailAddress, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Delete an email by ID, restricted to emails addressed to one of the user's addresses
 */
export async function deleteEmailByIdForUser(db: D1Database, emailId: string, userId: number) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`DELETE FROM emails
				 WHERE id = ? AND to_address IN (SELECT address FROM email_addresses WHERE user_id = ?)`,
			)
			.bind(emailId, userId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Delete the latest email address created by a user
 */
export async function deleteLatestEmailAddressByUserId(db: D1Database, userId: number) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`DELETE FROM email_addresses
				 WHERE id = (
				   SELECT id FROM email_addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
				 )`,
			)
			.bind(userId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

// =========================================================================
// Discord identity binding
// =========================================================================

/**
 * Get the linked user for a Discord snowflake
 */
export async function getUserIdByDiscordId(db: D1Database, discordId: string) {
	try {
		const row = await db
			.prepare("SELECT user_id FROM discord_user_links WHERE discord_id = ?")
			.bind(discordId)
			.first<{ user_id: number }>();
		return { userId: row ? Number(row.user_id) : null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { userId: null, error: error };
	}
}

/**
 * Reverse lookup: Discord snowflake linked to an internal user ID
 */
export async function getUserIdByDiscordIdForUser(db: D1Database, userId: number) {
	try {
		const row = await db
			.prepare("SELECT discord_id FROM discord_user_links WHERE user_id = ? LIMIT 1")
			.bind(userId)
			.first<{ discord_id: string }>();
		return { userId: row?.discord_id ? String(row.discord_id) : null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { userId: null, error: error };
	}
}

/**
 * Resolve the Telegram chat ID that owns an internal user.
 *
 * `telegram_user_id` is populated by the Mini App / bot whenever a profile is
 * bound. Legacy rows fall back to the user ID itself (the bot stored
 * `ctx.from.id` directly). Discord users have no Telegram identity and return
 * `null`, so their notifications are not redirected to the owner's chat.
 */
export async function getTelegramChatIdForUser(
	db: D1Database,
	userId: number,
): Promise<number | null> {
	const { userId: discordId } = await getUserIdByDiscordIdForUser(db, userId);
	if (discordId !== null) return null;

	try {
		const row = await db
			.prepare("SELECT telegram_user_id FROM users WHERE id = ?")
			.bind(userId)
			.first<{ telegram_user_id: number | null }>();

		if (row?.telegram_user_id) return Number(row.telegram_user_id);
		return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
	} catch {
		return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
	}
}

/**
 * Link a Telegram identity to an internal user (idempotent)
 */
export async function setTelegramUserIdForUser(
	db: D1Database,
	userId: number,
	telegramUserId: number,
) {
	try {
		const { success, error, meta } = await db
			.prepare("UPDATE users SET telegram_user_id = ? WHERE id = ?")
			.bind(telegramUserId, userId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Link a Discord snowflake to a user (idempotent)
 */
export async function createDiscordUserLink(db: D1Database, discordId: string, userId: number) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO discord_user_links (discord_id, user_id, created_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(discord_id) DO UPDATE SET user_id = excluded.user_id`,
			)
			.bind(discordId, userId, Math.floor(Date.now() / 1000))
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get the latest email address created by a Discord user
 */
export async function getLatestEmailAddressByDiscordId(db: D1Database, discordId: string) {
	try {
		const result = await db
			.prepare(
				`SELECT a.* FROM email_addresses a
				 JOIN discord_user_links l ON l.user_id = a.user_id
				 WHERE l.discord_id = ?
				 ORDER BY a.created_at DESC LIMIT 1`,
			)
			.bind(discordId)
			.first();

		if (result) {
			return { result: result as unknown as EmailAddress, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Count email addresses owned by the same user as a Discord snowflake
 */
export async function countEmailAddressesByDiscordId(db: D1Database, discordId: string) {
	try {
		const result = await db
			.prepare(
				`SELECT count(a.id) as count FROM email_addresses a
				 JOIN discord_user_links l ON l.user_id = a.user_id
				 WHERE l.discord_id = ?`,
			)
			.bind(discordId)
			.first<{ count: number }>();
		return { count: result?.count || 0, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { count: 0, error: error };
	}
}

/**
 * Delete every email address owned by the same user as a Discord snowflake
 */
export async function deleteEmailAddressesByDiscordId(db: D1Database, discordId: string) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`DELETE FROM email_addresses
				 WHERE user_id IN (SELECT user_id FROM discord_user_links WHERE discord_id = ?)`,
			)
			.bind(discordId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

// =========================================================================
// Users & Addresses
// =========================================================================

/**
 * Create or Update a User (Upsert)
 */
export async function createOrUpdateUser(db: D1Database, user: User) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO users (id, username, first_name, last_name, language_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           language_code = excluded.language_code`,
			)
			.bind(
				user.id,
				user.username ?? null,
				user.first_name ?? null,
				user.last_name ?? null,
				user.language_code ?? null,
				user.created_at,
			)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get User by ID
 */
export async function getUserById(db: D1Database, userId: number) {
	try {
		const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();

		if (user) {
			return { result: user as unknown as User, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Create an Email Address for a User
 */
export async function createEmailAddress(db: D1Database, emailAddress: EmailAddress) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO email_addresses (id, user_id, address, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
			)
			.bind(
				emailAddress.id,
				emailAddress.user_id,
				emailAddress.address,
				emailAddress.created_at,
				emailAddress.expires_at ?? null,
			)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get Email Addresses for a User
 */
export async function getEmailAddressesByUserId(db: D1Database, userId: number) {
	try {
		const { results } = await db
			.prepare("SELECT * FROM email_addresses WHERE user_id = ? ORDER BY created_at DESC")
			.bind(userId)
			.all();
		return { results: results as unknown as EmailAddress[], error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

/**
 * Get Email Address by ID
 */
export async function getEmailAddressById(db: D1Database, id: string) {
	try {
		const result = await db.prepare("SELECT * FROM email_addresses WHERE id = ?").bind(id).first();

		if (result) {
			return { result: result as unknown as EmailAddress, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Get Email Address Object by address string
 */
export async function getEmailAddressByAddress(db: D1Database, address: string) {
	try {
		const result = await db
			.prepare("SELECT * FROM email_addresses WHERE address = ?")
			.bind(address)
			.first();

		if (result) {
			return { result: result as unknown as EmailAddress, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Delete a specific Email Address by ID
 */
export async function deleteEmailAddress(db: D1Database, id: string) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM email_addresses WHERE id = ?")
			.bind(id)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

/**
 * Get the latest email address created by a user
 */
export async function getLatestEmailByUserId(db: D1Database, userId: number) {
	try {
		const result = await db
			.prepare("SELECT * FROM email_addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
			.bind(userId)
			.first();

		if (result) {
			return { result: result as unknown as EmailAddress, error: undefined };
		}
		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Count active emails for a user
 */
export async function countEmailsByUserId(db: D1Database, userId: number) {
	try {
		const result = await db
			.prepare("SELECT count(*) as count FROM email_addresses WHERE user_id = ?")
			.bind(userId)
			.first<{ count: number }>();
		return { count: result?.count || 0, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { count: 0, error: error };
	}
}

/**
 * Get all active email addresses with paging
 */
export async function getAllEmailAddresses(db: D1Database, limit = 50, offset = 0) {
	try {
		const { results } = await db
			.prepare("SELECT * FROM email_addresses ORDER BY created_at DESC LIMIT ? OFFSET ?")
			.bind(limit, offset)
			.all();
		return { results: results as unknown as EmailAddress[], error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { results: [], error: error };
	}
}

/**
 * Delete expired email addresses
 */
export async function deleteExpiredEmailAddresses(db: D1Database, timestamp: number) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM email_addresses WHERE expires_at IS NOT NULL AND expires_at < ?")
			.bind(timestamp)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}
