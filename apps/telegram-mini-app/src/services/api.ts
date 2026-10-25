import type {
	Attachment,
	BlockRule,
	Email,
	EmailAddress,
	EmailSummary,
	ReplyEmailRequest,
	SendEmailRequest,
} from "@temp-mail/shared-types";
import { getDiscordAccessToken } from "./discordToken";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiResponse<T> {
	success: boolean;
	result?: T;
	error?: {
		name: string;
		message: string;
	};
}

export interface RandomAddress {
	id?: string;
	user_id?: number;
	address: string;
	created_at?: number;
}

export interface FeatureFlags {
	/** Outbound send + reply through Resend. */
	outbound: boolean;
	/** On-demand forwarding (also requires Resend). */
	forward: boolean;
	/** Email summary generation is available. */
	aiSummary: boolean;
	/** Backend provider used for summaries. */
	aiProvider: "workers-ai" | "openai-compatible";
}

export interface SessionInfo {
	user: {
		discord_user_id?: string | null;
		guild_id?: string | null;
		user_id?: number;
		telegram_id?: number | null;
		username?: string | null;
		first_name?: string | null;
		is_admin: boolean;
	};
	quota?: {
		address_count: number;
		max_addresses: number;
		rate_limit_seconds: number;
		retry_after_seconds: number;
		exempt: boolean;
	};
	addresses: EmailAddress[];
	settings?: Record<string, string>;
	/** Domain currently served by the worker (used to build custom addresses). */
	domain: string;
	/** Optional backend capabilities; absent flags mean disabled. */
	features?: FeatureFlags;
}

function getTelegramWebApp() {
	return typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
}

/**
 * Headers used by the Worker to identify the caller.
 * - Telegram Mini App: `X-Telegram-Init-Data` (HMAC verified server side).
 * - Discord Activity: `Authorization: Bearer <access_token>` (the OAuth2 token
 *   Discord issued to the Activity, verified against `/users/@me` server side).
 *   `frame_id` / `instance_id` query parameters come from {@link withDiscordQuery}.
 */
function authHeaders(): Record<string, string> {
	const initData = getTelegramWebApp()?.initData;
	if (initData) return { "X-Telegram-Init-Data": initData };

	const discordToken = getDiscordAccessToken();
	if (discordToken) return { Authorization: `Bearer ${discordToken}` };

	const user = getTelegramWebApp()?.initDataUnsafe?.user;
	if (user?.id) return { "X-Telegram-User-Id": String(user.id) };

	return {};
}

const DISCORD_QUERY_KEYS = ["frame_id", "instance_id", "signature", "timestamp"];

/**
 * Discord signs the proxied request URL, so the query string must be forwarded
 * exactly as received (only `code` is dropped after the token exchange).
 */
export function withDiscordQuery(url: string): string {
	const current = new URL(window.location.href);
	if (!current.searchParams.has("frame_id")) return url;

	const target = new URL(url, current.origin);
	for (const key of DISCORD_QUERY_KEYS) {
		const value = current.searchParams.get(key);
		if (value) target.searchParams.set(key, value);
	}
	return target.toString();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
	const res = await fetch(withDiscordQuery(`${BASE_URL}${path}`), {
		...init,
		headers: {
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...authHeaders(),
			...init.headers,
		},
	});

	if (!res.ok) {
		const errData = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
		const error = new Error(errData.error?.message || `Request failed: ${res.status}`);
		error.name = errData.error?.name ?? `HTTP${res.status}`;
		throw error;
	}

	if (res.status === 204) return undefined;
	const data = (await res.json()) as ApiResponse<T>;
	return data.result;
}

export const apiService = {
	async getSession(): Promise<SessionInfo | null> {
		// `/api/session` works for both a Discord Activity (signed proxy) and Telegram (initData).
		return (await request<SessionInfo>("/api/session")) ?? null;
	},

	/** Every address on the server. Admin/owner only (403 otherwise). */
	async getAdminAddresses(): Promise<EmailAddress[]> {
		const result = await request<EmailAddress[]>("/api/admin/addresses?limit=500");
		return result ?? [];
	},

	/** Delete one of the caller's addresses (admins may delete any). */
	async deleteAddress(address: string): Promise<void> {
		await request(`/api/addresses/${encodeURIComponent(address)}`, { method: "DELETE" });
	},

	async getEmails(emailAddress: string, limit = 50, offset = 0): Promise<EmailSummary[]> {
		const result = await request<EmailSummary[]>(
			`/api/emails/${encodeURIComponent(emailAddress)}?limit=${limit}&offset=${offset}`,
		);
		return result ?? [];
	},

	async getEmailDetail(emailId: string): Promise<Email> {
		const result = await request<Email>(`/api/inbox/${encodeURIComponent(emailId)}`);
		if (!result) throw new Error("Email not found");
		return result;
	},

	async getEmailCount(emailAddress: string): Promise<number> {
		const result = await request<{ count: number }>(
			`/api/emails/count/${encodeURIComponent(emailAddress)}`,
		);
		return result?.count ?? 0;
	},

	async deleteEmail(emailId: string): Promise<void> {
		await request(`/api/inbox/${encodeURIComponent(emailId)}`, { method: "DELETE" });
	},

	async toggleStar(emailId: string, isStarred: boolean): Promise<void> {
		await request(`/api/inbox/${encodeURIComponent(emailId)}/star`, {
			method: "PATCH",
			body: JSON.stringify({ is_starred: isStarred }),
		});
	},

	async forwardEmail(emailId: string, targetEmail?: string): Promise<{ message: string }> {
		const result = await request<{ message: string }>(
			`/api/inbox/${encodeURIComponent(emailId)}/forward`,
			{
				method: "POST",
				body: JSON.stringify({ target_email: targetEmail }),
			},
		);
		return result ?? { message: "Email forwarded successfully" };
	},

	async createCustomAddress(
		prefix: string,
		domain?: string,
		userId?: number,
	): Promise<EmailAddress> {
		const result = await request<EmailAddress>("/api/addresses/custom", {
			method: "POST",
			body: JSON.stringify({ prefix, domain, user_id: userId }),
		});
		if (!result) throw new Error("Failed to create custom address");
		return result;
	},

	async createRandomAddress(): Promise<RandomAddress> {
		const result = await request<RandomAddress>("/api/addresses/random", {
			method: "POST",
			body: JSON.stringify({}),
		});
		if (!result) throw new Error("Failed to generate address");
		return result;
	},

	async getAttachments(emailId: string): Promise<Attachment[]> {
		const result = await request<Attachment[]>(
			`/api/attachments/email/${encodeURIComponent(emailId)}`,
		);
		return result ?? [];
	},

	getAttachmentDownloadUrl(attachmentId: string): string {
		return withDiscordQuery(
			`${BASE_URL}/api/attachments/${encodeURIComponent(attachmentId)}/download`,
		);
	},

	/**
	 * Download an attachment with the session credentials in headers and open it
	 * as a blob URL, so the Telegram `initData` never ends up in a URL/log.
	 */
	async downloadAttachment(attachment: Attachment): Promise<void> {
		const res = await fetch(this.getAttachmentDownloadUrl(attachment.id), {
			headers: authHeaders(),
		});

		if (!res.ok) {
			const errData = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
			throw new Error(errData.error?.message || `Download failed: ${res.status}`);
		}

		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);
		try {
			const link = document.createElement("a");
			link.href = objectUrl;
			link.download = attachment.file_name;
			link.rel = "noopener";
			document.body.appendChild(link);
			link.click();
			link.remove();
		} finally {
			setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
		}
	},

	async getBlocklist(): Promise<BlockRule[]> {
		const result = await request<BlockRule[]>("/api/settings/blocklist");
		return result ?? [];
	},

	async addBlockRule(type: "sender" | "domain", pattern: string): Promise<BlockRule> {
		const result = await request<BlockRule>("/api/settings/blocklist", {
			method: "POST",
			body: JSON.stringify({ type, pattern }),
		});
		if (!result) throw new Error("Failed to add block rule");
		return result;
	},

	async deleteBlockRule(id: string): Promise<void> {
		await request(`/api/settings/blocklist/${encodeURIComponent(id)}`, { method: "DELETE" });
	},

	async getSettings(): Promise<Record<string, string>> {
		return (await request<Record<string, string>>("/api/settings")) ?? {};
	},

	async updateSettings(settings: Record<string, unknown>): Promise<Record<string, string>> {
		return (
			(await request<Record<string, string>>("/api/settings", {
				method: "PUT",
				body: JSON.stringify(settings),
			})) ?? {}
		);
	},

	async sendEmail(payload: SendEmailRequest): Promise<void> {
		await request("/api/emails/send", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	},

	async replyEmail(payload: ReplyEmailRequest): Promise<void> {
		await request("/api/emails/reply", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	},
};
