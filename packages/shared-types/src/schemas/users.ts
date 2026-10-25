export interface User {
	id: number;
	username?: string;
	first_name?: string;
	last_name?: string;
	language_code?: string;
	/** Telegram chat ID of the user, `null` for Discord-only accounts. */
	telegram_user_id?: number | null;
	created_at: number;
}
