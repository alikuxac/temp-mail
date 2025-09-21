import * as db from "@/database/d1";
import * as kv from "@/database/kv";
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
	ctx: ExecutionContext,
) {
	const cutoffTimestamp = now() - env.HOURS_TO_DELETE_D1 * 60 * 60;

	const { success, error } = await db.deleteOldEmails(env.D1, cutoffTimestamp);

	if (success) {
		logInfo("Email cleanup completed successfully.");
		// ctx.waitUntil(sendMessage("Email cleanup completed successfully.", env));
	} else {
		throw new Error(`Email cleanup failed: ${error}`);
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
		ctx.waitUntil(bot.api.sendMessage(admin, message))
	}
}
