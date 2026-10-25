import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
	extractDiscordGuildId,
	isDevPlaceholder,
	verifyDiscordAccessToken,
} from "@/config/discord";
import { parseIdList } from "@/config/env";
import * as db from "@/database/d1";
import { resolveDiscordAccess } from "@/discord/relations";
import { ERR } from "@/utils/http";

export interface DiscordActivityIdentity {
	/** Discord user snowflake. */
	userId: string;
	/** Guild snowflake when the Activity runs inside a server. */
	guildId: string | null;
	/** Linked D1 user. */
	internalUserId: number;
	/** Snowflake explicitly listed in ALLOWED_DISCORD_USER_IDS. */
	isAdmin: boolean;
	username: string | null;
}

const getOrigin = (c: Context) => c.req.header("Origin")?.trim() ?? "";

/** Bearer access token issued by Discord for the current Activity. */
const getBearerToken = (c: Context): string | null => {
	const header = c.req.header("Authorization")?.trim() ?? "";
	const [scheme, token] = header.split(" ");
	return scheme?.toLowerCase() === "bearer" && token ? token : null;
};

/**
 * Optional CORS handling for Discord Activity front-ends.
 * Runs before the identity guard so even rejected requests receive CORS headers.
 */
export const discordCors = async (c: Context, next: () => Promise<void>) => {
	const origin = getOrigin(c);
	const allowed = parseIdList(c.env.DISCORD_ALLOWED_ORIGINS);

	if (origin && (allowed.length === 0 || allowed.includes(origin))) {
		c.header("Access-Control-Allow-Origin", origin);
		c.header("Vary", "Origin");
		c.header("Access-Control-Allow-Credentials", "true");
	}

	if (c.req.method === "OPTIONS") {
		c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
		c.header(
			"Access-Control-Allow-Headers",
			c.req.header("Access-Control-Request-Headers") ||
				"Content-Type, Authorization, X-Telegram-Init-Data, X-Telegram-User-Id",
		);
		c.header("Access-Control-Max-Age", "600");
		return c.body(null, 204);
	}

	await next();
	return;
};

/**
 * Guard for every `/api/discord/*` route (except OAuth bootstrap routes).
 *
 * Chain: OAuth2 access token -> Discord `/users/@me` -> user/guild allowlist
 * -> D1 user binding.
 *
 * Identity comes from the access token, which Discord issued to the Activity
 * client during the OAuth handshake. The `frame_id` / `instance_id` query
 * parameters are NOT trusted: the Activity proxy does not sign requests to
 * mapped backend prefixes, so they can be forged.
 */
export const requireDiscordActivity = createMiddleware<{
	Bindings: Env;
	Variables: { discord: DiscordActivityIdentity };
}>(async (c, next) => {
	const url = new URL(c.req.url);
	const origin = getOrigin(c);
	const allowedOrigins = parseIdList(c.env.DISCORD_ALLOWED_ORIGINS);

	if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
		return c.json(ERR("Origin not allowed for Discord Activity", "Forbidden"), 403);
	}

	if (c.req.method === "OPTIONS") {
		await next();
		return;
	}

	if (isDevPlaceholder(c.env.DISCORD_CLIENT_ID) && c.env.ENVIRONMENT === "development") {
		return c.json(
			ERR(
				"DISCORD_CLIENT_ID is not configured. Copy .env.example to .env and run `npm run dev` again.",
				"ConfigError",
			),
			503,
		);
	}

	const accessToken = getBearerToken(c);
	if (!accessToken) {
		return c.json(ERR("Missing Discord Activity access token", "AuthError"), 401);
	}

	const identity = await verifyDiscordAccessToken(accessToken);
	if (!identity) {
		return c.json(ERR("Invalid or expired Discord access token", "AuthError"), 401);
	}

	const guildId = extractDiscordGuildId(url);
	const access = await resolveDiscordAccess(c.env, identity.userId, guildId);

	if (!access.allowed || access.internalUserId === null) {
		return c.json(
			ERR(access.reason ?? "Discord access denied", "Forbidden", {
				discord_user_id: identity.userId,
				guild_id: guildId,
			}),
			403,
		);
	}

	const { result: profile } = await db.getUserById(c.env.D1, access.internalUserId);

	c.set("discord", {
		userId: identity.userId,
		guildId,
		internalUserId: access.internalUserId,
		isAdmin: access.isAdmin,
		username: identity.username ?? profile?.username ?? null,
	});

	await next();
});
