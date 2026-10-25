import { createId } from "@paralleldrive/cuid2";
import type { Attachment, Email } from "@temp-mail/shared-types";
import { emailSchema } from "@temp-mail/shared-types";
import { InlineKeyboard } from "grammy";
import PostalMime from "postal-mime";
import { getAdminIds, getAiConfig, getDiscordGuardConfig, isAiConfigured } from "@/config/env";
import * as db from "@/database/d1";
import { updateSenderStats } from "@/database/kv";
import { canUseAiSummary, summarizeEmail } from "@/services/aiService";
import { TempMailBot } from "@/telegram/bot";
import { now } from "@/utils/helpers";
import { processEmailContent } from "@/utils/mail";
import { extractOtpAndLinks } from "@/utils/otpExtractor";
import { PerformanceTimer } from "@/utils/performance";

async function saveInboundAttachments(
	bucket: R2Bucket | undefined,
	d1: D1Database,
	emailId: string,
	rawAttachments: Array<{ filename?: string | null; mimeType?: string; content: unknown }>,
): Promise<Attachment[]> {
	if (!bucket || rawAttachments.length === 0) return [];
	const records: Attachment[] = [];

	for (const att of rawAttachments) {
		const attachmentId = createId();
		const safeName = (att.filename || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
		const r2Key = `attachments/${emailId}/${attachmentId}_${safeName}`;
		const contentBuffer =
			att.content instanceof Uint8Array ? att.content : new Uint8Array(att.content as ArrayBuffer);

		await bucket.put(r2Key, contentBuffer, {
			httpMetadata: { contentType: att.mimeType || "application/octet-stream" },
			customMetadata: { emailId, originalName: att.filename || "attachment" },
		});

		const record: Attachment = {
			id: attachmentId,
			email_id: emailId,
			file_name: att.filename || "attachment",
			file_type: att.mimeType || null,
			file_size: contentBuffer.byteLength,
			r2_key: r2Key,
			created_at: now(),
		};

		await db.insertAttachment(d1, record);
		records.push(record);
	}

	return records;
}

function buildTelegramNotification(emailData: Email, attachmentCount: number, miniAppUrl?: string) {
	let msg = `📧 *New Email Received!*\n\n`;
	if (emailData.otp_code) {
		msg += `🔑 *Verification Code:* \`${emailData.otp_code}\` _(tap to copy)_\n\n`;
	}
	msg += `👤 *From:* \`${emailData.from_address}\`\n📬 *To:* \`${emailData.to_address}\`\n📝 *Subject:* ${emailData.subject || "(No Subject)"}\n`;

	if (emailData.summary) {
		msg += `\n🤖 *Summary:*\n_${emailData.summary}_\n`;
	}
	if (attachmentCount > 0) {
		msg += `\n📎 *Attachments:* ${attachmentCount} file(s)\n`;
	}

	const keyboard = new InlineKeyboard()
		.text("📖 Read", `read_email:${emailData.id}`)
		.text("⭐ Star", `star_email:${emailData.id}`)
		.row()
		.text("↗️ Forward", `forward_email:${emailData.id}`)
		.text("🚫 Block Sender", `block_sender:${emailData.from_address}`)
		.row();

	if (miniAppUrl) {
		keyboard.webApp("📱 Open in Mini App", miniAppUrl);
	}

	return { text: msg, keyboard };
}

/**
 * Address creation is restricted to allowlisted Telegram / Discord user IDs, so an
 * inbound message is only delivered when its recipient owner passes the same guard.
 */
async function isRecipientAllowed(env: Env, userId: number): Promise<boolean> {
	if (getAdminIds(env).includes(String(userId))) return true;

	const { userId: discordUserId } = await db.getUserIdByDiscordIdForUser(env.D1, userId);
	if (discordUserId === null) return true;

	return getDiscordGuardConfig(env).allowedUserIds.includes(discordUserId);
}

function sendNotifications(
	ctx: ExecutionContext,
	env: Env,
	chatId: number,
	emailData: Email,
	attachmentCount: number,
) {
	const { text, keyboard } = buildTelegramNotification(
		emailData,
		attachmentCount,
		env.MINI_APP_URL,
	);
	const targetIds = [chatId.toString()];

	for (const adminId of getAdminIds(env)) {
		if (String(chatId) === adminId) continue;
		if (!targetIds.includes(adminId)) targetIds.push(adminId);
	}

	for (const id of targetIds) {
		ctx.waitUntil(
			TempMailBot.api
				.sendMessage(id, text, { parse_mode: "Markdown", reply_markup: keyboard })
				.catch((e) => console.error(`Failed to send Telegram notification to ${id}:`, e)),
		);
	}
}

/**
 * Resolve the summary: skipped when no provider is configured or the daily budget is spent.
 */
async function buildSummary(
	env: Env,
	textContent: string | null,
	subject: string | null,
): Promise<string | null> {
	if (!isAiConfigured(env)) return null;

	const budgetAvailable = await canUseAiSummary(env.KV, getAiConfig(env).dailyLimit);
	if (!budgetAvailable) return null;

	return await summarizeEmail(env, textContent, subject);
}

/**
 * Cloudflare email router handler
 */
export async function handleEmail(
	message: ForwardableEmailMessage,
	env: Env,
	ctx: ExecutionContext,
) {
	const timer = new PerformanceTimer("email-processing");
	const emailId = createId();

	// 1. Block check
	if (await db.isSenderBlocked(env.D1, message.from)) {
		timer.end();
		message.setReject("Sender or domain blocked by policy.");
		return;
	}

	// 2. Parse MIME & Recipient check
	const email = await PostalMime.parse(message.raw);
	const { htmlContent, textContent } = processEmailContent(email.html ?? null, email.text ?? null);

	ctx.waitUntil(
		updateSenderStats(env.KV, message.from).catch((err) =>
			console.error("Failed to update sender stats:", err),
		),
	);

	const { result: addr } = await db.getEmailAddressByAddress(env.D1, message.to);
	if (!addr || (addr.expires_at && addr.expires_at < now())) {
		timer.end();
		message.setReject("Invalid or expired recipient.");
		return;
	}

	if (!(await isRecipientAllowed(env, addr.user_id))) {
		timer.end();
		message.setReject("Recipient owner is not allowed to use this service.");
		return;
	}

	// 3. Process components
	const { otpCode } = extractOtpAndLinks(textContent, htmlContent);
	const summary = await buildSummary(env, textContent, email.subject || null);
	const rawAttachments = email.attachments || [];
	const attachmentRecords = await saveInboundAttachments(
		env.ATTACHMENTS_BUCKET,
		env.D1,
		emailId,
		rawAttachments,
	);

	// 4. Persist Email
	const emailData: Email = emailSchema.parse({
		id: emailId,
		from_address: message.from,
		to_address: message.to,
		subject: email.subject || null,
		received_at: now(),
		html_content: htmlContent,
		text_content: textContent,
		is_read: false,
		is_starred: false,
		otp_code: otpCode,
		summary,
		has_attachments: attachmentRecords.length > 0,
	});

	const { success, error } = await db.insertEmail(env.D1, emailData);
	if (!success) throw new Error(`Failed to insert email: ${error}`);

	// 5. Forwarding & Webhook
	const forwardingTarget = await db.getSetting(env.D1, "forwarding_target");
	if (forwardingTarget?.includes("@")) {
		await message
			.forward(forwardingTarget.trim())
			.catch((e) => console.error("Forwarding failed:", e));
	}

	const webhookUrl = await db.getSetting(env.D1, "webhook_url");
	if (webhookUrl?.startsWith("http")) {
		ctx.waitUntil(
			fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...emailData, attachments: attachmentRecords }),
			}).catch((e) => console.error("Webhook dispatch failed:", e)),
		);
	}

	// 6. Notify the owner only (Discord accounts have no Telegram chat)
	const ownerChatId = await db.getTelegramChatIdForUser(env.D1, addr.user_id);
	if (ownerChatId !== null) {
		sendNotifications(ctx, env, ownerChatId, emailData, attachmentRecords.length);
	}
	timer.end();
}
