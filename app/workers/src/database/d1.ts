import type { EmailAddress } from "@/schemas/addresses/schema";
import type { Email, EmailSummary } from "@/schemas/emails/schema";
import type { User } from "@/schemas/users/schema";

/**
 * Insert an email into the database
 */
export async function insertEmail(db: D1Database, emailData: Email) {
	try {
		const { success, error, meta } = await db
			.prepare(
				`INSERT INTO emails (id, from_address, to_address, subject, received_at, html_content, text_content)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				emailData.id,
				emailData.from_address,
				emailData.to_address,
				emailData.subject,
				emailData.received_at,
				emailData.html_content,
				emailData.text_content,
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
				`SELECT id, from_address, to_address, subject, received_at
         FROM emails
         WHERE to_address = ?
         ORDER BY received_at DESC
         LIMIT ? OFFSET ?`,
			)
			.bind(emailAddress, limit, offset)
			.all();

		return { results: results as EmailSummary[], error: undefined };
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
		const emailResult = await db.prepare("SELECT * FROM emails WHERE id = ?").bind(emailId).first();

		if (emailResult) {
			// Convert SQLite boolean integers to proper booleans
			return { result: emailResult as Email, error: undefined };
		}

		return { result: null, error: undefined };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { result: null, error: error };
	}
}

/**
 * Delete emails older than a specific timestamp
 */
export async function deleteOldEmails(db: D1Database, timestamp: number) {
	try {
		const { success, error, meta } = await db
			.prepare("DELETE FROM emails WHERE received_at < ?")
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
	try {
		const { success, error, meta } = await db
			.prepare("UPDATE emails SET pinned = ? WHERE id = ?")
			.bind(isPinned, emailId)
			.run();
		return { success, error, meta };
	} catch (e: unknown) {
		const error = e instanceof Error ? e : new Error(String(e));
		return { success: false, error: error, meta: undefined };
	}
}

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
				user.username,
				user.first_name,
				user.last_name,
				user.language_code,
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
				emailAddress.expires_at,
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
		const result = await db
			.prepare("SELECT * FROM email_addresses WHERE id = ?")
			.bind(id)
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
