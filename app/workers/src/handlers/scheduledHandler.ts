import * as db from "@/database/d1";
import { now } from "@/utils/helpers";
import { logInfo } from "@/utils/logger";
import { TempMailBot as bot } from "@/telegram/bot";
import { getTop10Sender } from "@/services/schedule-service";

/**
 * Cloudflare Scheduled Function
 * Delete emails older than 4 hours
 */
export async function handleScheduled(
	_event: ScheduledEvent,
	env: Env,
	_ctx: ExecutionContext,
) {
	const currentTimestamp = now();
	const cutoffTimestamp = currentTimestamp - env.HOURS_TO_DELETE_D1 * 60 * 60;

	// Cleanup old emails
	const emailCleanup = await db.deleteOldEmails(env.D1, cutoffTimestamp);
	
	// Cleanup expired addresses
	const addressCleanup = await db.deleteExpiredEmailAddresses(env.D1, currentTimestamp);

	if (emailCleanup.success && addressCleanup.success) {
		logInfo("Database cleanup completed successfully (Emails & Addresses).");
	} else {
		if (!emailCleanup.success) logInfo(`Email cleanup failed: ${emailCleanup.error}`);
		if (!addressCleanup.success) logInfo(`Address cleanup failed: ${addressCleanup.error}`);
		throw new Error("Cleanup failed for one or more tables.");
	}
}

/**
 * Cloudflare Scheduled Function
 * Send daily top senders report
 */
export async function handleDailyReport(
	_event: ScheduledEvent,
	env: Env,
	ctx: ExecutionContext,
) {
	const message = await getTop10Sender();

	const adminLists = env.ADMIN_ID.split(',');
	for (const admin of adminLists) {
		ctx.waitUntil(bot.api.sendMessage(admin, message, {
			parse_mode: "Markdown",
		}))
	}
}
