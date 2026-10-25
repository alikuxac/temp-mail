import { createId } from "@paralleldrive/cuid2";
import type { EmailAddress } from "@temp-mail/shared-types";
import type { Context } from "hono";
import { getQuotaConfig, parseJsonStringArray } from "@/config/env";
import * as db from "@/database/d1";
import { getDiscordQuotaState, isOwnerUser } from "@/discord/relations";
import { getMiniAppQuotaState, type MiniAppEnv } from "@/middlewares/auth";
import { now } from "@/utils/helpers";
import { ERR, OK } from "@/utils/http";

/** Response returned by Hono handlers (kept explicit to avoid deep type inference). */
type HandlerResponse = Response;

const PREFIX_PATTERN = /^[a-z0-9._-]{2,64}$/;

/**
 * Resolve the D1 user targeted by a request: the authenticated Mini App user by
 * default, or an explicit `user_id` for the owner/admin.
 *
 * Handles both providers: the Telegram Mini App (`telegram`) and a Discord
 * Activity (`discord`). A Discord request has no `user_id` to request, so it
 * always resolves to the authenticated Discord user.
 */
export function resolveTargetUserId(c: Context<MiniAppEnv>, requested?: number): number | null {
	const discord = c.get("discord");
	if (discord) return discord.userId;

	const identity = c.get("telegram");
	if (!identity) return requested ?? null;
	if (requested === undefined || requested === identity.userId) return identity.userId;
	return identity.isOwner ? requested : null;
}

export function denyTargetUser(c: Context<MiniAppEnv>) {
	return c.json(ERR("You can only access your own addresses", "Forbidden"), 403);
}

/**
 * Username generation of the Telegram bot, kept as the first candidate so
 * existing addresses remain addressable.
 */
function legacyUsername(userId: number) {
	const derived = String(userId).split("").reverse().join("");
	return `${derived}9${userId}${derived}`.slice(0, 10);
}

/**
 * Insert a random address for a user, retrying on collisions.
 */
export async function insertRandomAddress(env: Env, userId: number) {
	const candidates: string[] = [];
	const legacy = legacyUsername(userId);
	if (/^\d{10}$/.test(legacy)) candidates.push(legacy);

	for (let i = 0; i < 3; i++) {
		candidates.push(createId().toLowerCase().slice(0, 10));
	}

	for (const username of candidates) {
		const address: EmailAddress = {
			id: createId(),
			user_id: userId,
			address: `${username}@${env.DOMAIN}`,
			created_at: now(),
		};

		const { success, error } = await db.createEmailAddress(env.D1, address);
		if (success) return { address, error: null as null };
		if (!error?.message.toLowerCase().includes("unique")) {
			return { address: null, error };
		}
	}

	return { address: null, error: new Error("Failed to generate a unique address") };
}

/**
 * Enforce the shared quota/cooldown; returns an error response when exceeded.
 */
async function checkAddressQuota(c: Context<MiniAppEnv>) {
	const discord = c.get("discord");
	if (discord) {
		const quota = getQuotaConfig(c.env);
		const exempt = isOwnerUser(c.env, discord.discordUserId, discord.userId);
		const state = await getDiscordQuotaState(c.env, discord.discordUserId, quota, exempt);
		if (state.exempt) return { error: null as HandlerResponse | null };

		if (state.retryAfterSeconds > 0) {
			return {
				error: c.json(
					ERR(
						`Please wait ${state.retryAfterSeconds}s before creating a new address`,
						"RateLimited",
						{ retry_after_seconds: state.retryAfterSeconds },
					),
					429,
				),
			};
		}

		if (state.addressCount >= state.limit) {
			return {
				error: c.json(
					ERR(`You have reached the limit of ${state.limit} addresses`, "QuotaExceeded", {
						max_addresses: state.limit,
					}),
					403,
				),
			};
		}

		return { error: null };
	}

	const identity = c.get("telegram");
	if (!identity) return { error: null as HandlerResponse | null };

	const state = await getMiniAppQuotaState(c.env, identity.userId, identity.isOwner);
	if (state.exempt) return { error: null };

	if (state.retryAfterSeconds > 0) {
		return {
			error: c.json(
				ERR(
					`Please wait ${state.retryAfterSeconds}s before creating a new address`,
					"RateLimited",
					{ retry_after_seconds: state.retryAfterSeconds },
				),
				429,
			),
		};
	}

	if (state.addressCount >= state.limit) {
		return {
			error: c.json(
				ERR(`You have reached the limit of ${state.limit} addresses`, "QuotaExceeded", {
					max_addresses: state.limit,
				}),
				403,
			),
		};
	}

	return { error: null };
}

/**
 * Create a custom prefix address owned by the caller.
 */
async function createCustomAddress(c: Context<MiniAppEnv>, userId: number, prefix: string) {
	const cleanPrefix = prefix.trim().toLowerCase();
	if (!PREFIX_PATTERN.test(cleanPrefix)) {
		return c.json(
			ERR(
				"Prefix must be 2-64 characters using letters, digits, dots, dashes or underscores",
				"ValidationError",
			),
			400,
		);
	}

	const domain = c.env.DOMAIN.trim().toLowerCase();
	const fullAddress = `${cleanPrefix}@${domain}`;

	const existing = await db.getEmailAddressByAddress(c.env.D1, fullAddress);
	if (existing.result) {
		return c.json(ERR("This custom address is already in use", "Conflict"), 409);
	}

	const id = createId();
	const created = await db.createEmailAddress(c.env.D1, {
		id,
		user_id: userId,
		address: fullAddress,
		created_at: now(),
	});

	if (!created.success) {
		return c.json(ERR(created.error?.message || "Failed to create custom address", "D1Error"), 500);
	}

	return c.json(OK({ id, user_id: userId, address: fullAddress, created_at: now() }), 201);
}

/**
 * Create an address (random or custom) enforcing the shared quota and cooldown.
 */
export async function createAddressHandler(c: Context<MiniAppEnv>) {
	const body = await c.req
		.json<{ prefix?: string; domain?: string; user_id?: number }>()
		.catch(() => ({ prefix: undefined, domain: undefined, user_id: undefined }));

	const userId = resolveTargetUserId(c, body.user_id);
	if (userId === null) return denyTargetUser(c);

	if (body.domain && body.domain.trim().toLowerCase() !== c.env.DOMAIN.trim().toLowerCase()) {
		return c.json(ERR("Domain not supported", "DomainError"), 400);
	}

	const quota = await checkAddressQuota(c);
	if (quota.error) return quota.error;

	if (body.prefix) return createCustomAddress(c, userId, body.prefix);

	const generated = await insertRandomAddress(c.env, userId);
	if (!generated.address) {
		return c.json(ERR(generated.error?.message || "Failed to generate address", "D1Error"), 500);
	}

	return c.json(OK(generated.address), 201);
}

/**
 * Merge a prefix into the preset list (case insensitive, max 20 entries).
 */
export function mergePrefixPresets(existing: string[], candidate: string): string[] {
	const unique = new Set(existing.map((p) => p.trim().toLowerCase()).filter(Boolean));
	const normalized = candidate.trim().toLowerCase();
	if (normalized) unique.add(normalized);
	return [...unique].slice(-20);
}

/**
 * Persist a prefix into `settings.custom_prefix_presets` when it changed.
 */
export async function rememberPrefixPreset(env: Env, prefix: string): Promise<void> {
	const current = parseJsonStringArray(await db.getSetting(env.D1, "custom_prefix_presets"));
	const next = mergePrefixPresets(current, prefix);
	if (next.length === current.length && next.every((p, i) => p === current[i])) return;
	await db.setSetting(env.D1, "custom_prefix_presets", JSON.stringify(next), now());
}
