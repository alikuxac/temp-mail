/**
 * Discord Activity identity helpers: allowlist checks and D1 user binding.
 */
import { createId } from "@paralleldrive/cuid2";
import type { User } from "@temp-mail/shared-types";
import { getAdminIds, getDiscordGuardConfig, type QuotaConfig } from "@/config/env";
import * as db from "@/database/d1";
import { now } from "@/utils/helpers";

/**
 * Response payload shared by the Discord Activity and the Mini App session endpoint.
 */
export async function buildSessionPayload(
	env: Env,
	identity: {
		discordUserId: string;
		internalUserId: number;
		username: string | null;
		isAdmin: boolean;
	},
	quotaConfig: QuotaConfig,
) {
	const exempt = isOwnerUser(env, identity.discordUserId, identity.internalUserId);
	const state = await getDiscordQuotaState(env, identity.discordUserId, quotaConfig, exempt);

	return {
		user: {
			discord_user_id: identity.discordUserId,
			user_id: identity.internalUserId,
			username: identity.username,
			is_admin: identity.isAdmin,
		},
		quota: {
			address_count: state.addressCount,
			max_addresses: state.limit,
			rate_limit_seconds: quotaConfig.rateLimitSeconds,
			retry_after_seconds: state.retryAfterSeconds,
			exempt: state.exempt,
		},
		addresses: await listDiscordAddresses(env, identity.discordUserId),
		domain: env.DOMAIN,
	};
}

export interface DiscordGuardResult {
	allowed: boolean;
	/** The snowflake was explicitly allowlisted. */
	isAdmin: boolean;
	/** Reason of the rejection, `null` when allowed. */
	reason: string | null;
	/** Launch context after normalization. */
	userId: string;
	guildId: string | null;
	/** Resolved D1 user (only set when allowed). */
	internalUserId: number | null;
}

/**
 * Upper bound of the reserved Discord namespace in `users.id`.
 *
 * `users.id` is a 64-bit SQLite INTEGER, but every id must stay inside
 * JavaScript's safe integer range. Discord snowflakes (~1.2e18) do not, so a
 * truncated hash is mapped into a dedicated million-wide band that cannot
 * collide with Telegram user IDs (< 1e10).
 */
const DISCORD_ID_BASE = 500_000_000_000;
const DISCORD_ID_SPAN = 1_000_000;

/**
 * Deterministic internal user ID for a Discord snowflake.
 * Uses a 63-bit FNV-1a hash folded into the reserved Discord band.
 */
function deriveDiscordUserId(discordUserId: string): number {
	let hash = 0xcbf29ce484222325n;
	const prime = 0x100000001b3n;
	const mask = 0xffffffffffffffffn;

	for (const char of discordUserId) {
		hash ^= BigInt(char.charCodeAt(0));
		hash = (hash * prime) & mask;
	}

	return DISCORD_ID_BASE + Number(hash % BigInt(DISCORD_ID_SPAN));
}

/**
 * Load (or create) the D1 user linked to a Discord snowflake.
 */
async function resolveDiscordUser(env: Env, discordUserId: string, profileName?: string) {
	const { userId: linked } = await db.getUserIdByDiscordId(env.D1, discordUserId);
	if (linked !== null) return linked;

	const userId = deriveDiscordUserId(discordUserId);

	const user: User = {
		id: userId,
		username: profileName ?? `discord:${discordUserId}`,
		first_name: profileName ?? "Discord User",
		created_at: now(),
	};
	const created = await db.createOrUpdateUser(env.D1, user);
	if (!created.success) {
		console.error("Failed to create Discord user:", created.error);
		return null;
	}

	const link = await db.createDiscordUserLink(env.D1, discordUserId, userId);
	if (!link.success) {
		console.error("Failed to link Discord user:", link.error);
		return null;
	}

	return userId;
}

/**
 * Enforce the Discord allowlist (by user ID, optional guild ID, optional installer).
 * Returns the internal user id when the snowflake is authorized.
 */
export async function resolveDiscordAccess(
	env: Env,
	discordUserId: string,
	guildId: string | null,
	profileName?: string,
): Promise<DiscordGuardResult> {
	const config = getDiscordGuardConfig(env);
	const isAdmin = config.allowedUserIds.includes(discordUserId);

	const deny = (reason: string): DiscordGuardResult => ({
		allowed: false,
		isAdmin,
		reason,
		userId: discordUserId,
		guildId,
		internalUserId: null,
	});

	if (config.allowedUserIds.length === 0 && !config.allowInstaller) {
		return deny("Discord Activity access is disabled (no ALLOWED_DISCORD_USER_IDS configured)");
	}

	if (!isAdmin) {
		if (!config.allowInstaller) {
			return deny("Your Discord user ID is not allowed to use this Activity");
		}
		const link = await db.getUserIdByDiscordId(env.D1, discordUserId);
		if (link.userId === null) {
			return deny("Your Discord user ID is not allowed to use this Activity");
		}
	}

	if (
		config.allowedGuildIds.length > 0 &&
		(!guildId || !config.allowedGuildIds.includes(guildId))
	) {
		return deny("This Discord server is not allowed to use this Activity");
	}

	const internalUserId = await resolveDiscordUser(env, discordUserId, profileName);
	if (internalUserId === null) {
		return deny("Failed to initialize your Discord profile");
	}

	return {
		allowed: true,
		isAdmin,
		reason: null,
		userId: discordUserId,
		guildId,
		internalUserId,
	};
}

/**
 * True when the internal user is exempt from quotas (owner or Telegram admin).
 */
export function isOwnerUser(env: Env, discordUserId: string, userId: number | null): boolean {
	if (getDiscordGuardConfig(env).allowedUserIds.includes(discordUserId)) return true;
	return userId !== null && getAdminIds(env).includes(String(userId));
}

export interface QuotaState {
	exempt: boolean;
	addressCount: number;
	limit: number;
	retryAfterSeconds: number;
	latestCreatedAt: number | null;
}

/**
 * Compute the quota state of a Discord user (address count + cooldown).
 */
export async function getDiscordQuotaState(
	env: Env,
	discordUserId: string,
	quota: QuotaConfig,
	exempt: boolean,
): Promise<QuotaState> {
	const [{ count }, { result: latest }] = await Promise.all([
		db.countEmailAddressesByDiscordId(env.D1, discordUserId),
		db.getLatestEmailAddressByDiscordId(env.D1, discordUserId),
	]);

	const latestCreatedAt = latest?.created_at ?? null;
	const elapsed = latestCreatedAt === null ? Number.POSITIVE_INFINITY : now() - latestCreatedAt;
	const retryAfterSeconds =
		elapsed >= quota.rateLimitSeconds ? 0 : Math.max(1, quota.rateLimitSeconds - elapsed);

	return {
		exempt,
		addressCount: count,
		limit: quota.maxAddresses,
		retryAfterSeconds,
		latestCreatedAt,
	};
}

let randomAddressCounter = 0;

/**
 * Generate a random address and persist it for the Discord user.
 */
export async function createDiscordAddress(env: Env, discordUserId: string, userId: number) {
	const { userId: ownerId } = await db.getUserIdByDiscordId(env.D1, discordUserId);
	if (ownerId !== userId) {
		return { address: null, error: new Error("Discord profile not linked") };
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		randomAddressCounter = (randomAddressCounter + 1) % 0x10000;
		const suffix = randomAddressCounter.toString(16).padStart(4, "0");
		const address = `${createId().toLowerCase()}${suffix}@${env.DOMAIN}`;

		const { success, error } = await db.createEmailAddress(env.D1, {
			id: createId(),
			user_id: userId,
			address,
			created_at: now(),
		});

		if (success) return { address, error: null };
		if (error?.message.toLowerCase().includes("unique")) continue;
		return { address: null, error };
	}

	return { address: null, error: new Error("Failed to generate a unique address") };
}

export interface DiscordAddressRecord {
	id: string;
	address: string;
	created_at: number;
	expires_at: number | null;
}

/**
 * List the addresses owned by a Discord user.
 */
export async function listDiscordAddresses(
	env: Env,
	discordUserId: string,
): Promise<DiscordAddressRecord[]> {
	const { userId } = await db.getUserIdByDiscordId(env.D1, discordUserId);
	if (userId === null) return [];

	const { results } = await db.getEmailAddressesByUserId(env.D1, userId);
	return results.map((row) => ({
		id: row.id,
		address: row.address,
		created_at: row.created_at,
		expires_at: row.expires_at ?? null,
	}));
}
