import { createId } from "@paralleldrive/cuid2";
import PostalMime from "postal-mime";
import { ATTACHMENT_LIMITS } from "@/config/constants";
import * as db from "@/database/d1";
import { updateSenderStats } from "@/database/kv";
import { emailSchema } from "@/schemas/emails/schema";
import { now } from "@/utils/helpers";
import { processEmailContent } from "@/utils/mail";
import { PerformanceTimer } from "@/utils/performance";

// Type for PostalMime attachments
interface EmailAttachment {
	filename: string | null;
	mimeType?: string;
	content?: string | ArrayBuffer;
}

/**
 * Validate and filter email attachments
 */
function _validateAttachments(attachments: EmailAttachment[], emailId: string): EmailAttachment[] {
	const validAttachments = [];
	let totalAttachmentSize = 0;

	for (const attachment of attachments) {
		// Skip attachments without filename
		if (!attachment.filename) {
			console.warn(`Email ${emailId}: Attachment without filename, skipping`);
			continue;
		}

		if (validAttachments.length >= ATTACHMENT_LIMITS.MAX_COUNT_PER_EMAIL) {
			console.warn(`Email ${emailId}: Too many attachments, skipping remaining`);
			break;
		}

		const attachmentSize =
			attachment.content instanceof ArrayBuffer
				? attachment.content.byteLength
				: new TextEncoder().encode(attachment.content || "").byteLength;

		// Check file type
		const contentType = attachment.mimeType || "application/octet-stream";
		if (
			!ATTACHMENT_LIMITS.ALLOWED_TYPES.includes(
				contentType as (typeof ATTACHMENT_LIMITS.ALLOWED_TYPES)[number],
			)
		) {
			console.warn(
				`Email ${emailId}: Attachment ${attachment.filename} has unsupported type (${contentType}), skipping`,
			);
			continue;
		}

		if (attachmentSize > ATTACHMENT_LIMITS.MAX_SIZE) {
			console.warn(
				`Email ${emailId}: Attachment ${attachment.filename} too large (${attachmentSize} bytes), skipping`,
			);
			continue;
		}

		totalAttachmentSize += attachmentSize;
		if (totalAttachmentSize > ATTACHMENT_LIMITS.MAX_SIZE * ATTACHMENT_LIMITS.MAX_COUNT_PER_EMAIL) {
			console.warn(
				`Email ${emailId}: Total attachment size too large, skipping remaining attachments`,
			);
			break;
		}

		validAttachments.push(attachment);
	}

	return validAttachments;
}

/**
 * Cloudflare email router handler - optimized version
 */
export async function handleEmail(
	message: ForwardableEmailMessage,
	env: CloudflareBindings,
	ctx: ExecutionContext,
) {
	try {
		const timer = new PerformanceTimer("email-processing");
		const emailId = message.headers.get("Message-ID") || createId();
		const email = await PostalMime.parse(message.raw);

		// Process email content
		const { htmlContent, textContent } = processEmailContent(
			email.html ?? null,
			email.text ?? null,
		);

		// Update sender stats
		ctx.waitUntil(
			updateSenderStats(env.KV, message.from).catch((error) => {
				console.error("Failed to update sender stats:", error);
			}),
		);

		// Check if there are attachments
		const attachments = email.attachments || [];
		if (attachments.length > 0) {
			timer.end();
			return;
		}

		const emailData = emailSchema.parse({
			id: emailId,
			from_address: message.from,
			to_address: message.to,
			subject: email.subject || null,
			received_at: now(),
			html_content: htmlContent,
			text_content: textContent,
		});

		// Insert email
		const { success, error } = await db.insertEmail(env.D1, emailData);

		if (!success) {
			throw new Error(`Failed to insert email: ${error}`);
		}

		timer.end(); // Log processing time
	} catch (error) {
		console.error("Failed to process email:", error);
		throw error;
	}
}
