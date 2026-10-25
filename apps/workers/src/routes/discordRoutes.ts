import { OpenAPIHono } from "@hono/zod-openapi";
import { createId } from "@paralleldrive/cuid2";
import { exchangeDiscordCode } from "@/config/discord";
import { getQuotaConfig } from "@/config/env";
import * as db from "@/database/d1";
import {
	buildSessionPayload,
	createDiscordAddress,
	getDiscordQuotaState,
	isOwnerUser,
	listDiscordAddresses,
} from "@/discord/relations";
import {
	type DiscordActivityIdentity,
	discordCors,
	requireDiscordActivity,
} from "@/middlewares/discord";
import { now } from "@/utils/helpers";
import { ERR, OK } from "@/utils/http";

type DiscordEnv = {
	Bindings: Env;
	Variables: { discord: DiscordActivityIdentity };
};

const discordRoutes = new OpenAPIHono<DiscordEnv>();

const EMAIL_PATTERN = /^[a-z0-9._-]{2,64}$/;

// ---------------------------------------------------------------------------
// OAuth bootstrap (called from the client SDK, before the first proxied call)
// ---------------------------------------------------------------------------

// POST /api/discord/token - Exchange the Activity launch code for an access token
discordRoutes.post("/api/discord/token", discordCors, async (c) => {
	const body = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
	const code = body.code?.trim();

	if (!code) {
		return c.json(ERR("Missing OAuth 'code'", "ValidationError"), 400);
	}

	if (!c.env.DISCORD_CLIENT_ID || !c.env.DISCORD_CLIENT_SECRET) {
		return c.json(
			ERR(
				"Discord OAuth is not configured (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)",
				"ConfigError",
			),
			503,
		);
	}

	// Exchange the code for an access token. The client needs it for
	// `sdk.commands.authenticate`, which completes the Discord SDK handshake;
	// our own API authorization still relies on the signed Activity headers.
	const token = await exchangeDiscordCode(c.env, code);
	if (!token) {
		return c.json(
			ERR(
				"Discord rejected the authorization code (check Redirect URLs, client secret and scopes)",
				"AuthError",
			),
			401,
		);
	}

	return c.json(OK({ access_token: token.accessToken, scope: token.scope }));
});

// GET /api/discord/me - Signed identity pre-check (Ed25519 verified by the middleware)
discordRoutes.get("/api/discord/me", discordCors, requireDiscordActivity, async (c) => {
	const identity = c.get("discord");
	return c.json(
		OK({
			discord_user_id: identity.userId,
			guild_id: identity.guildId,
			user_id: identity.internalUserId,
			username: identity.username,
			is_admin: identity.isAdmin,
		}),
	);
});

// ---------------------------------------------------------------------------
// Protected Activity API (signature + user id allowlist)
// ---------------------------------------------------------------------------

discordRoutes.use("/api/discord/*", discordCors, requireDiscordActivity);

// GET /api/discord/session - Bootstrap payload for the Activity front-end
discordRoutes.get("/api/discord/session", async (c) => {
	const identity = c.get("discord");
	const payload = await buildSessionPayload(
		c.env,
		{
			discordUserId: identity.userId,
			internalUserId: identity.internalUserId,
			username: identity.username,
			isAdmin: identity.isAdmin,
		},
		getQuotaConfig(c.env),
	);
	const settings = await db.getAllSettings(c.env.D1);

	return c.json(
		OK({
			user: { ...payload.user, guild_id: identity.guildId },
			settings,
			quota: payload.quota,
			addresses: payload.addresses,
			domain: payload.domain,
		}),
	);
});

// POST /api/discord/addresses/random - Generate a random address
discordRoutes.post("/api/discord/addresses/random", async (c) => {
	const identity = c.get("discord");
	const quota = getQuotaConfig(c.env);
	const exempt = isOwnerUser(c.env, identity.userId, identity.internalUserId);
	const state = await getDiscordQuotaState(c.env, identity.userId, quota, exempt);

	if (state.retryAfterSeconds > 0) {
		return c.json(
			ERR(`Please wait ${state.retryAfterSeconds}s before creating a new address`, "RateLimited", {
				retry_after_seconds: state.retryAfterSeconds,
			}),
			429,
		);
	}

	if (!state.exempt && state.addressCount >= state.limit) {
		return c.json(
			ERR(`You have reached the limit of ${state.limit} addresses`, "QuotaExceeded", {
				max_addresses: state.limit,
				address_count: state.addressCount,
			}),
			403,
		);
	}

	const { address, error } = await createDiscordAddress(
		c.env,
		identity.userId,
		identity.internalUserId,
	);

	if (!address) {
		return c.json(ERR(error?.message || "Failed to generate address", "D1Error"), 500);
	}

	return c.json(OK({ address }), 201);
});

// GET /api/discord/addresses - List the user's addresses
discordRoutes.get("/api/discord/addresses", async (c) => {
	const identity = c.get("discord");
	const addresses = await listDiscordAddresses(c.env, identity.userId);
	return c.json(OK(addresses));
});

// POST /api/discord/addresses/custom - Create a custom prefix address
discordRoutes.post("/api/discord/addresses/custom", async (c) => {
	const identity = c.get("discord");
	const body = await c.req
		.json<{ prefix?: string; domain?: string }>()
		.catch(() => ({ prefix: undefined, domain: undefined }));

	const prefix = (body.prefix ?? "").trim().toLowerCase();
	if (prefix.length < 2) {
		return c.json(ERR("Prefix must be at least 2 characters", "ValidationError"), 400);
	}

	if (!EMAIL_PATTERN.test(prefix)) {
		return c.json(
			ERR("Prefix accepts only letters, digits, dots, dashes and underscores", "ValidationError"),
			400,
		);
	}

	const domain = (body.domain ?? c.env.DOMAIN).trim().toLowerCase();
	if (domain !== c.env.DOMAIN.trim().toLowerCase()) {
		return c.json(ERR("Domain not supported", "DomainError"), 400);
	}

	const quota = getQuotaConfig(c.env);
	const exempt = isOwnerUser(c.env, identity.userId, identity.internalUserId);
	const state = await getDiscordQuotaState(c.env, identity.userId, quota, exempt);

	if (state.retryAfterSeconds > 0) {
		return c.json(
			ERR(`Please wait ${state.retryAfterSeconds}s before creating a new address`, "RateLimited", {
				retry_after_seconds: state.retryAfterSeconds,
			}),
			429,
		);
	}

	if (!state.exempt && state.addressCount >= state.limit) {
		return c.json(
			ERR(`You have reached the limit of ${state.limit} addresses`, "QuotaExceeded", {
				max_addresses: state.limit,
			}),
			403,
		);
	}

	const fullAddress = `${prefix}@${domain}`;
	const { result: existing } = await db.getEmailAddressByAddress(c.env.D1, fullAddress);
	if (existing) {
		return c.json(ERR("This address is already in use", "Conflict"), 409);
	}

	const created = await db.createEmailAddress(c.env.D1, {
		id: createId(),
		user_id: identity.internalUserId,
		address: fullAddress,
		created_at: now(),
	});

	if (!created.success) {
		return c.json(ERR(created.error?.message || "Failed to create address", "D1Error"), 500);
	}

	return c.json(OK({ address: fullAddress }), 201);
});

// DELETE /api/discord/addresses/:emailAddress - Delete one of the user's addresses
discordRoutes.delete("/api/discord/addresses/:emailAddress", async (c) => {
	const identity = c.get("discord");
	const address = decodeURIComponent(c.req.param("emailAddress")).trim().toLowerCase();

	const { result } = await db.getEmailAddressByAddress(c.env.D1, address);
	if (!result) {
		return c.json(ERR("Address not found", "NotFound"), 404);
	}

	if (result.user_id !== identity.internalUserId && !identity.isAdmin) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	// Remove the inbox contents first so the address deletion leaves no orphan rows.
	const { meta: deletedEmails } = await db.deleteEmailsByRecipient(c.env.D1, result.address);

	const { success, error } = await db.deleteEmailAddress(c.env.D1, result.id);
	if (!success) {
		return c.json(ERR(error?.message || "Failed to delete address", "D1Error"), 500);
	}

	return c.json(OK({ id: result.id, address, deleted_emails: deletedEmails?.changes ?? 0 }));
});

// GET /api/discord/emails/:emailAddress - Inbox listing
discordRoutes.get("/api/discord/emails/:emailAddress", async (c) => {
	const identity = c.get("discord");
	const address = decodeURIComponent(c.req.param("emailAddress")).trim().toLowerCase();

	const { result } = await db.getEmailAddressByAddress(c.env.D1, address);
	if (!result) {
		return c.json(ERR("Address not found", "NotFound"), 404);
	}

	if (result.user_id !== identity.internalUserId && !identity.isAdmin) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 100);
	const offset = Math.max(Number.parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);

	const { results, error } = await db.getEmailsByRecipient(c.env.D1, address, limit, offset);
	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}

	return c.json(OK(results));
});

// GET /api/discord/inbox/:emailId - Email detail (masked only for foreign admins)
discordRoutes.get("/api/discord/inbox/:emailId", async (c) => {
	const identity = c.get("discord");
	const emailId = c.req.param("emailId");

	const { result: email, error } = await db.getEmailById(c.env.D1, emailId);
	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}

	if (!email) {
		return c.json(ERR("Email not found", "NotFound"), 404);
	}

	if (!identity.isAdmin) {
		const { result: address } = await db.getEmailAddressByAddress(c.env.D1, email.to_address);
		if (address?.user_id !== identity.internalUserId) {
			return c.json(ERR("This email does not belong to you", "Forbidden"), 403);
		}
	}

	return c.json(OK(email));
});

// DELETE /api/discord/inbox/:emailId - Delete an email owned by the user
discordRoutes.delete("/api/discord/inbox/:emailId", async (c) => {
	const identity = c.get("discord");
	const emailId = c.req.param("emailId");

	const { meta, error } = await db.deleteEmailByIdForUser(
		c.env.D1,
		emailId,
		identity.internalUserId,
	);

	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}

	if (!meta || meta.changes === 0) {
		return c.json(ERR("Email not found", "NotFound"), 404);
	}

	return c.json(OK({ id: emailId }));
});

// PATCH /api/discord/inbox/:emailId/star - Toggle star
discordRoutes.patch("/api/discord/inbox/:emailId/star", async (c) => {
	const identity = c.get("discord");
	const emailId = c.req.param("emailId");
	const body = await c.req.json<{ is_starred?: boolean }>().catch(() => ({ is_starred: true }));

	const { result: email } = await db.getEmailById(c.env.D1, emailId);
	if (!email) {
		return c.json(ERR("Email not found", "NotFound"), 404);
	}

	if (!identity.isAdmin) {
		const { result: address } = await db.getEmailAddressByAddress(c.env.D1, email.to_address);
		if (address?.user_id !== identity.internalUserId) {
			return c.json(ERR("This email does not belong to you", "Forbidden"), 403);
		}
	}

	const isStarred = Boolean(body.is_starred);
	const { success, error } = await db.toggleStarEmail(c.env.D1, emailId, isStarred);
	if (!success) {
		return c.json(ERR(error?.message || "Failed to update star", "D1Error"), 500);
	}

	return c.json(OK({ id: emailId, is_starred: isStarred }));
});

export default discordRoutes;
