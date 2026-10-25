import type { ReplyEmailRequest, SendEmailRequest } from "@temp-mail/shared-types";

export interface ResendResponse {
	id?: string;
	error?: {
		message: string;
		name: string;
	};
}

/**
 * Validates whether the sender address belongs to a verified domain
 */
export function isAllowedSender(fromAddress: string, primaryDomain: string): boolean {
	const senderDomain = fromAddress.trim().toLowerCase().split("@").pop();
	const allowedDomain = primaryDomain.trim().toLowerCase();
	return senderDomain === allowedDomain;
}

/**
 * Sends an email using the Resend REST API
 */
export async function sendEmailWithResend(
	apiKey: string,
	primaryDomain: string,
	payload: SendEmailRequest,
	headers?: Record<string, string>,
): Promise<{ success: boolean; id?: string; error?: string }> {
	if (!apiKey) {
		return { success: false, error: "RESEND_API_KEY is not configured in environment" };
	}

	if (!isAllowedSender(payload.from, primaryDomain)) {
		return {
			success: false,
			error: `Sender domain mismatch. Outbound emails must be sent from @${primaryDomain}`,
		};
	}

	const toArray = Array.isArray(payload.to) ? payload.to : [payload.to];

	const body: Record<string, unknown> = {
		from: payload.from,
		to: toArray,
		subject: payload.subject,
		text: payload.text,
		html: payload.html,
	};

	if (headers && Object.keys(headers).length > 0) {
		body.headers = headers;
	}

	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		const data = (await res.json()) as ResendResponse;

		if (!res.ok || data.error) {
			const errMsg = data.error?.message || `Resend API failed with status ${res.status}`;
			return { success: false, error: errMsg };
		}

		return { success: true, id: data.id };
	} catch (e: unknown) {
		const error = e instanceof Error ? e.message : String(e);
		return { success: false, error };
	}
}

/**
 * Sends a reply to an existing email with threading headers
 */
export async function replyEmailWithResend(
	apiKey: string,
	primaryDomain: string,
	payload: ReplyEmailRequest,
): Promise<{ success: boolean; id?: string; error?: string }> {
	const subject = payload.subject.toLowerCase().startsWith("re:")
		? payload.subject
		: `Re: ${payload.subject}`;

	const headers: Record<string, string> = {
		"In-Reply-To": `<${payload.email_id}@${primaryDomain}>`,
		References: `<${payload.email_id}@${primaryDomain}>`,
	};

	const sendPayload: SendEmailRequest = {
		from: payload.from,
		to: payload.to,
		subject,
		text: payload.text,
		html: payload.html,
	};

	return sendEmailWithResend(apiKey, primaryDomain, sendPayload, headers);
}
