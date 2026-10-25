import * as db from "@/database/d1";
import { getTop10Sender } from "@/services/schedule-service";
import { TempMailBot as bot } from "@/telegram/bot";
import { now } from "@/utils/helpers";
import { logInfo } from "@/utils/logger";

async function cleanupEmailAttachments(env: Env, emailId: string): Promise<void> {
	if (!env.ATTACHMENTS_BUCKET) return;
	try {
		const { results: attachments } = await db.getAttachmentsByEmailId(env.D1, emailId);
		for (const att of attachments) {
			if (att.r2_key) {
				await env.ATTACHMENTS_BUCKET.delete(att.r2_key).catch((delErr) =>
					console.error(`Failed to delete R2 key ${att.r2_key}:`, delErr),
				);
			}
		}
		await db.deleteAttachmentsByEmailId(env.D1, emailId);
	} catch (err) {
		console.error(`Error cleaning attachments for email ${emailId}:`, err);
	}
}

async function getRetentionHours(dbInstance: D1Database, defaultTtl: number): Promise<number> {
	const configured = await db.getSetting(dbInstance, "auto_cleanup_ttl_hours");
	return configured ? parseInt(configured, 10) : defaultTtl || 72;
}

/**
 * Cloudflare Scheduled Function
 * Retention policy: Deletes non-starred emails older than threshold,
 * cleaning up R2 attachment files before removing D1 rows.
 */
export async function handleScheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
	const currentTimestamp = now();
	const ttlHours = await getRetentionHours(env.D1, env.HOURS_TO_DELETE_D1);
	const cutoffTimestamp = currentTimestamp - ttlHours * 3600;

	// 1. Fetch unstarred emails older than cutoff and purge R2 attachments
	const { results: oldEmails } = await db.getOldUnstarredEmails(env.D1, cutoffTimestamp);
	if (oldEmails?.length) {
		await Promise.all(oldEmails.map((email) => cleanupEmailAttachments(env, email.id)));
	}

	// 2. Delete old emails, orphaned emails and expired addresses
	const emailCleanup = await db.deleteOldEmails(env.D1, cutoffTimestamp);
	const orphanCleanup = await db.deleteOrphanEmails(env.D1);
	const addressCleanup = await db.deleteExpiredEmailAddresses(env.D1, currentTimestamp);

	if (!emailCleanup.success || !orphanCleanup.success || !addressCleanup.success) {
		throw new Error("Scheduled cleanup failed for one or more tables.");
	}

	logInfo(
		`Retention cleanup done. Threshold: ${ttlHours}h. Orphaned emails removed: ${orphanCleanup.meta?.changes ?? 0}.`,
	);
}

/**
 * Cloudflare Scheduled Function
 * Send daily top senders report
 */
export async function handleDailyReport(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
	const message = await getTop10Sender();
	if (!env.ADMIN_ID) return;

	const adminLists = env.ADMIN_ID.split(",");
	for (const admin of adminLists) {
		ctx.waitUntil(
			bot.api.sendMessage(admin.trim(), message, {
				parse_mode: "Markdown",
			}),
		);
	}
}
