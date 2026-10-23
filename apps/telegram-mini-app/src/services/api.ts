import type { Email, EmailSummary } from "@temp-mail/shared-types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiResponse<T> {
	success: boolean;
	result?: T;
	error?: {
		name: string;
		message: string;
	};
}

export const apiService = {
	async getEmails(emailAddress: string, limit = 20, offset = 0): Promise<EmailSummary[]> {
		const res = await fetch(
			`${BASE_URL}/api/emails/${encodeURIComponent(emailAddress)}?limit=${limit}&offset=${offset}`,
		);
		if (!res.ok) {
			throw new Error(`Failed to fetch emails: ${res.statusText}`);
		}
		const data = (await res.json()) as ApiResponse<EmailSummary[]>;
		return data.result ?? [];
	},

	async getEmailDetail(emailId: string): Promise<Email> {
		const res = await fetch(`${BASE_URL}/api/inbox/${encodeURIComponent(emailId)}`);
		if (!res.ok) {
			throw new Error(`Failed to fetch email details: ${res.statusText}`);
		}
		const data = (await res.json()) as ApiResponse<Email>;
		if (!data.result) {
			throw new Error("Email not found");
		}
		return data.result;
	},

	async getEmailCount(emailAddress: string): Promise<number> {
		const res = await fetch(`${BASE_URL}/api/emails/count/${encodeURIComponent(emailAddress)}`);
		if (!res.ok) {
			throw new Error(`Failed to get count: ${res.statusText}`);
		}
		const data = (await res.json()) as ApiResponse<{ count: number }>;
		return data.result?.count ?? 0;
	},

	async deleteEmail(emailId: string): Promise<void> {
		const res = await fetch(`${BASE_URL}/api/inbox/${encodeURIComponent(emailId)}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			throw new Error(`Failed to delete email: ${res.statusText}`);
		}
	},
};
