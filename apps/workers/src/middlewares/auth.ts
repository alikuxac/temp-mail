import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { extractDiscordGuildId, verifyDiscordAccessToken } from "@/config/discord";
import {
	getAdminIds,
	getFeatureFlags,
	getQuotaConfig,
	parseBoolVar,
	parseIdList,
	parseJsonStringArray,
} from "@/config/env";
import * as db from "@/database/d1";
import { buildSessionPayload, resolveDiscordAccess } from "@/discord/relations";
import { ERR } from "@/utils/http";

/**
 * Canonical internal user ID for a Telegram user.
 *
 * Must match the bot (`telegram/commands/user.ts`), which stores `ctx.from.id`,
 * so the Telegram bot and the Mini App share the same users, addresses and quotas.
 */
export function deriveTelegramUserId(telegramUserId: number): number {
	return telegramUserId;
}

export interface TelegramAuthPayload {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	language_code?: string;
}

function getWebAppToken(env: Env): string | null {
	if (env.TELEGRAM_TOKEN) return env.TELEGRAM_TOKEN;
	const { TELEGRAM_TOKEN: token } = process.env;
	return token || null;
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function timingSafeStringEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const left = new TextEncoder().encode(a);
	const right = new TextEncoder().encode(b);
	return crypto.subtle.timingSafeEqual(left, right);
}

/**
 * Verify Telegram Web App `initData` as documented at
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyTelegramInitData(
	initData: string,
	botToken: string,
): Promise<TelegramAuthPayload | null> {
	if (!initData) return null;

	const params = new URLSearchParams(initData);
	const hash = params.get("hash");
	if (!hash) return null;

	const pairs: string[] = [];
	for (const [key, value] of params.entries()) {
		// Per the spec, the data-check-string includes every received field except
		// `hash`. `signature` is only excluded from the third-party Ed25519 path.
		if (key === "hash") continue;
		pairs.push(`${key}=${value}`);
	}
	pairs.sort();
	const dataCheckString = pairs.join("\n");

	// Spec: secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
	const webAppDataKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("WebAppData"),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const secretKey = await crypto.subtle.sign(
		"HMAC",
		webAppDataKey,
		new TextEncoder().encode(botToken),
	);

	const messageKey = await crypto.subtle.importKey(
		"raw",
		secretKey,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const expectedHash = toHex(
		await crypto.subtle.sign("HMAC", messageKey, new TextEncoder().encode(dataCheckString)),
	);

	if (!timingSafeStringEqual(expectedHash, hash.toLowerCase())) return null;

	const authDate = Number.parseInt(params.get("auth_date") ?? "", 10);
	if (!Number.isFinite(authDate)) return null;

	const maxAgeSeconds = 24 * 60 * 60;
	if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) return null;

	const userJson = params.get("user");
	if (!userJson) return null;

	try {
		const parsed = JSON.parse(userJson) as { id?: unknown };
		const id = Number(parsed.id);
		if (!Number.isSafeInteger(id) || id <= 0) return null;
		return { ...(parsed as TelegramAuthPayload), id };
	} catch {
		return null;
	}
}

function getAllowedOrigins(env: Env): string[] {
	return parseIdList(env.ALLOWED_ORIGINS);
}

/**
 * Resolve and persist the Telegram user for an already authenticated request.
 */
async function bindTelegramUser(env: Env, payload: TelegramAuthPayload): Promise<number | null> {
	const userId = deriveTelegramUserId(payload.id);
	const { result } = await db.getUserById(env.D1, userId);

	if (result) {
		if (Number(result.telegram_user_id ?? 0) !== payload.id) {
			await db.setTelegramUserIdForUser(env.D1, userId, payload.id);
		}
		return userId;
	}

	const created = await db.createOrUpdateUser(env.D1, {
		id: userId,
		username: payload.username,
		first_name: payload.first_name,
		last_name: payload.last_name,
		language_code: payload.language_code,
		created_at: Math.floor(Date.now() / 1000),
	});

	return created.success ? userId : null;
}

const getHeader = (c: Context, name: string) => c.req.header(name)?.trim() ?? "";

export interface TelegramMiniAppIdentity {
	userId: number;
	telegramId: number;
	payload: TelegramAuthPayload;
	isOwner: boolean;
}

/** Hono environment of every Mini App guarded route. */
export type MiniAppEnv = {
	Bindings: Env;
	Variables: {
		telegram: TelegramMiniAppIdentity | undefined;
		discord: DiscordMiniAppIdentity | undefined;
		userId: number;
	};
};

/** Identity resolved for a Mini App request coming from a Discord Activity. */
export interface DiscordMiniAppIdentity {
	discordUserId: string;
	userId: number;
	isAdmin: boolean;
}

/**
 * Routes a signed Discord Activity request may reach when
 * `MINI_APP_DISCORD_PROVIDER` is off: the Activity API, the session bootstrap,
 * the inbox reads and the attachment downloads.
 *
 * `/api/emails/*` and `/api/addresses/*` stay out of the allowlist on purpose:
 * they build random addresses from the internal numeric user id, which is a
 * hash band for Discord accounts. The Activity front-end uses `/api/discord/*`
 * for those instead.
 */
const DISCORD_MINI_APP_PATHS: ReadonlyArray<string | RegExp> = [
	/^\/api\/discord\//,
	"/api/session",
	/^\/api\/inbox\//,
	/^\/api\/attachments\//,
];

function isDiscordMiniAppPath(pathname: string): boolean {
	return DISCORD_MINI_APP_PATHS.some((entry) =>
		typeof entry === "string" ? entry === pathname : entry.test(pathname),
	);
}

/**
 * Resolve the caller from the Discord Activity access token carried by the
 * request, if any. Returns `undefined` when the request is not a Discord
 * Activity request.
 *
 * The Activity proxy does not sign requests to mapped backend prefixes, so the
 * `frame_id` / `instance_id` query parameters only mark the request as coming
 * from an Activity. Identity comes from the OAuth2 access token, verified
 * directly against Discord's `/users/@me`.
 */
async function authenticateDiscordMiniApp(
	c: Context<MiniAppEnv>,
): Promise<DiscordMiniAppIdentity | undefined | Response> {
	const url = new URL(c.req.url);
	if (!url.searchParams.get("frame_id") || !url.searchParams.get("instance_id")) {
		return undefined;
	}

	const accessToken = getBearerToken(c);
	if (!accessToken) {
		if (
			!parseBoolVar(c.env.MINI_APP_DISCORD_PROVIDER, false) &&
			!isDiscordMiniAppPath(url.pathname)
		) {
			return undefined;
		}
		return c.json(ERR("Missing Discord Activity access token", "AuthError"), 401);
	}

	// Default: Discord requests are only accepted from the Activity routes
	// (`/api/discord/*`) and the session bootstrap; other Mini App routes opt in
	// explicitly with `MINI_APP_DISCORD_PROVIDER=true`.
	if (!parseBoolVar(c.env.MINI_APP_DISCORD_PROVIDER, false)) {
		if (!isDiscordMiniAppPath(url.pathname)) return undefined;
	}

	const identity = await verifyDiscordAccessToken(accessToken);
	if (!identity) {
		return c.json(ERR("Invalid or expired Discord access token", "AuthError"), 401);
	}

	const guildId = extractDiscordGuildId(url);
	const access = await resolveDiscordAccess(c.env, identity.userId, guildId);
	if (!access.allowed || access.internalUserId === null) {
		return c.json(ERR(access.reason ?? "Discord access denied", "Forbidden"), 403);
	}

	c.set("discord", {
		discordUserId: identity.userId,
		userId: access.internalUserId,
		isAdmin: access.isAdmin,
	});
	c.set("userId", access.internalUserId);

	return {
		discordUserId: identity.userId,
		userId: access.internalUserId,
		isAdmin: access.isAdmin,
	};
}

/**
 * Enforce the Telegram allowlist and bind the user, setting the context variables.
 * Returns an error response when the request must be rejected.
 */
async function authorizeTelegramUser(
	c: Context<MiniAppEnv>,
	payload: TelegramAuthPayload,
): Promise<Response | null> {
	const telegramId = String(payload.id);
	const allowedUsers = parseIdList(c.env.ALLOWED_TELEGRAM_USER_IDS);
	const isAdmin = getAdminIds(c.env).includes(telegramId);

	if (allowedUsers.length > 0 && !allowedUsers.includes(telegramId) && !isAdmin) {
		return c.json(
			ERR("Your Telegram user ID is not allowed to use this service", "Forbidden"),
			403,
		);
	}

	const userId = await bindTelegramUser(c.env, payload);
	if (userId === null) {
		return c.json(ERR("Failed to initialize your profile", "D1Error"), 500);
	}

	c.set("telegram", {
		userId,
		telegramId: payload.id,
		payload,
		isOwner: isAdmin || allowedUsers.length > 0,
	});
	c.set("userId", userId);
	return null;
}

/**
 * Middleware protecting every `/api/*` route consumed by the Mini App.
 *
 * - `TELEGRAM_AUTH_MODE=strict` (default): only a valid Telegram `initData` HMAC is accepted.
 * - `TELEGRAM_AUTH_MODE=lenient`: unsigned `X-Telegram-User-Id` is accepted when
 *   `ENVIRONMENT=development` or `ALLOW_UNSIGNED_MINI_APP=true` (browser preview only).
 *
 * `TELEGRAM_AUTH_ENABLED=false` fully disables the guard (legacy behaviour, not recommended).
 */
export const requireMiniAppUser = createMiddleware<MiniAppEnv>(async (c, next) => {
	const mode = (c.env.TELEGRAM_AUTH_MODE || "strict").toLowerCase();
	if (mode === "off" || c.env.TELEGRAM_AUTH_ENABLED === false) {
		await next();
		return;
	}

	// Discord Activity requests are authenticated by Discord's Ed25519 signature.
	const discord = await authenticateDiscordMiniApp(c);
	if (discord instanceof Response) return discord;
	if (discord) {
		await next();
		return;
	}

	const token = getWebAppToken(c.env);
	if (!token) {
		return c.json(
			ERR("TELEGRAM_TOKEN is not configured; Mini App API is disabled", "ConfigError"),
			500,
		);
	}

	const rejected = await authenticateMiniAppRequest(c, token, mode);
	if (rejected) return rejected;

	await next();
});

/**
 * GET /api/session - Identity, quota and addresses for the current Mini App session.
 *
 * Works for both a Discord Activity (signed proxy + user ID allowlist) and the
 * Telegram Mini App (verified `initData`).
 */
export async function buildMiniAppSession(c: Context<MiniAppEnv>) {
	const discord = c.get("discord");
	if (discord) {
		const payload = await buildSessionPayload(
			c.env,
			{
				discordUserId: discord.discordUserId,
				internalUserId: discord.userId,
				username: null,
				isAdmin: discord.isAdmin,
			},
			getQuotaConfig(c.env),
		);
		return {
			user: { ...payload.user, guild_id: null, telegram_id: null, first_name: null },
			quota: payload.quota,
			addresses: payload.addresses,
			settings: await db.getAllSettings(c.env.D1),
			domain: c.env.DOMAIN,
			features: getFeatureFlags(c.env),
		};
	}

	const identity = c.get("telegram");
	if (!identity) {
		return null;
	}

	const state = await getMiniAppQuotaState(c.env, identity.userId, identity.isOwner);
	const quota = getQuotaConfig(c.env);
	const { results } = await db.getEmailAddressesByUserId(c.env.D1, identity.userId);

	return {
		user: {
			discord_user_id: null,
			guild_id: null,
			user_id: identity.userId,
			telegram_id: identity.telegramId,
			first_name: identity.payload.first_name ?? null,
			username: identity.payload.username ?? null,
			is_admin: identity.isOwner,
		},
		quota: {
			address_count: state.addressCount,
			max_addresses: state.limit,
			rate_limit_seconds: quota.rateLimitSeconds,
			retry_after_seconds: state.retryAfterSeconds,
			exempt: state.exempt,
		},
		addresses: results,
		settings: await db.getAllSettings(c.env.D1),
		domain: c.env.DOMAIN,
		features: getFeatureFlags(c.env),
	};
}

/**
 * Resolve the caller identity from Telegram headers.
 * Returns an error response when authentication fails, `null` when authenticated.
 */
async function authenticateMiniAppRequest(
	c: Context<MiniAppEnv>,
	token: string,
	mode: string,
): Promise<Response | null> {
	const strictOnly = !(
		mode === "lenient" &&
		(c.env.ENVIRONMENT === "development" || c.env.ALLOW_UNSIGNED_MINI_APP === true)
	);

	const initData = getHeader(c, "X-Telegram-Init-Data");
	if (initData) {
		const payload = await verifyTelegramInitData(initData, token);
		if (!payload) {
			return c.json(ERR("Invalid or expired Telegram init data", "AuthError"), 401);
		}

		return await authorizeTelegramUser(c, payload);
	}

	if (strictOnly) {
		return c.json(ERR("Missing Telegram init data", "AuthError"), 401);
	}

	const rawUserId = getHeader(c, "X-Telegram-User-Id");
	const telegramId = Number.parseInt(rawUserId, 10);
	if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
		return c.json(ERR("Missing Telegram init data", "AuthError"), 401);
	}

	const origin = getHeader(c, "Origin");
	const allowedOrigins = getAllowedOrigins(c.env);
	if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
		return c.json(ERR("Origin not allowed", "Forbidden"), 403);
	}

	return await authorizeTelegramUser(c, { id: telegramId });
}

export interface MiniAppAddressLimitState {
	addressCount: number;
	limit: number;
	retryAfterSeconds: number;
}

/**
 * Shared quota computation for the Mini App, based on the D1 user ID.
 */
export async function getMiniAppQuotaState(
	env: Env,
	userId: number,
	isOwner: boolean,
): Promise<MiniAppAddressLimitState & { exempt: boolean }> {
	const quota = getQuotaConfig(env);
	if (isOwner) {
		return { addressCount: 0, limit: quota.maxAddresses, retryAfterSeconds: 0, exempt: true };
	}

	const [{ count }, { result: latest }] = await Promise.all([
		db.countEmailsByUserId(env.D1, userId),
		db.getLatestEmailByUserId(env.D1, userId),
	]);

	const elapsed = latest
		? Math.floor(Date.now() / 1000) - latest.created_at
		: Number.POSITIVE_INFINITY;

	return {
		addressCount: count,
		limit: quota.maxAddresses,
		retryAfterSeconds:
			elapsed >= quota.rateLimitSeconds ? 0 : Math.max(1, quota.rateLimitSeconds - elapsed),
		exempt: false,
	};
}

/**
 * Read the preset list stored in `settings.custom_prefix_presets`.
 */
export async function getCustomPrefixPresets(env: Env): Promise<string[]> {
	return parseJsonStringArray(await db.getSetting(env.D1, "custom_prefix_presets"));
}

/**
 * Authorization header bearer token (optional, for future CLI/server consumers).
 */
export function getBearerToken(c: Context): string | null {
	const header = getHeader(c, "Authorization");
	if (!header) return null;
	const [scheme, token] = header.split(" ");
	return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
