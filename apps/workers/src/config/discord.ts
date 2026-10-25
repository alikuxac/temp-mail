/**
 * Discord Embedded App SDK helpers.
 *
 * The Activity client performs an OAuth2 handshake with the Discord client
 * (`sdk.commands.authorize`) and sends the resulting `code` to this Worker, which
 * exchanges it for an access token (`exchangeDiscordCode`). Every later request
 * from the Activity carries that token as `Authorization: Bearer <token>`, and
 * identity is resolved from Discord's `/users/@me` (`verifyDiscordAccessToken`).
 *
 * The `frame_id` / `instance_id` query parameters injected by Discord are NOT
 * signed for requests to mapped backend prefixes, so they are only used to mark
 * a request as coming from an Activity (and to read the optional guild id).
 *
 * Reference: https://discord.com/developers/docs/activities/development-guides
 */

/** Placeholder token sent by Wrangler in development (`wrangler dev`). */
const DEV_PLACEHOLDER_TOKEN = "0000000000000000000000000000000000000000000000000000000000000000";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

interface DiscordPayload {
	scope?: "applications.commands.permissions.update";
	user?: { id?: string };
	guild_id?: string | null;
	installed_by_user_id?: string | null;
}

/**
 * Discord sends the query values base64 encoded, sometimes double encoded.
 * Decode until we reach the JSON payload or exhaust the encoding layers.
 */
export function decodeDiscordPayload(raw: string): DiscordPayload | null {
	let current = raw.trim();
	if (!current) return null;

	for (let depth = 0; depth < 3; depth++) {
		if (current.startsWith("{")) {
			const parsed: unknown = JSON.parse(current);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as DiscordPayload;
			}
			return null;
		}

		if (current.length % 4 !== 0) current = `${current}${"=".repeat(4 - (current.length % 4))}`;
		if (!BASE64_PATTERN.test(current)) return null;

		current = atob(current);
	}

	return null;
}

/**
 * Extract the guild snowflake from the unsigned `instance_id` query parameter.
 *
 * Unlike the user identity, the guild is only used as an optional allowlist
 * input, never as an authenticated identity, so the unsigned payload is good
 * enough. Returns `null` outside a guild (DMs / group DMs).
 */
export function extractDiscordGuildId(url: URL): string | null {
	const instanceId = url.searchParams.get("instance_id");
	if (!instanceId) return null;
	try {
		const instance = decodeDiscordPayload(instanceId);
		return instance?.guild_id ? String(instance.guild_id) : null;
	} catch {
		return null;
	}
}

export interface DiscordTokenResponse {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	scope?: string;
	error?: string;
	error_description?: string;
}

export interface DiscordUserResponse {
	id?: string;
	username?: string;
	global_name?: string | null;
	avatar?: string | null;
}

/**
 * Exchanges the Activity launch `code` for an access token.
 */
export async function exchangeDiscordCode(
	env: Env,
	code: string,
): Promise<{ accessToken: string; scope: string } | null> {
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return null;

	// Activity token exchange: the Embedded App SDK handles the redirect itself, so
	// no `redirect_uri` is sent. Discord's official sample servers omit it, and
	// sending a value that is absent from the app's Redirect URLs causes
	// `invalid_grant`. `DISCORD_OAUTH_PROXY_URL` only applies to the demo proxy.
	const body = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		client_secret: env.DISCORD_CLIENT_SECRET,
		grant_type: "authorization_code",
		code,
	});

	if (env.DISCORD_OAUTH_PROXY_URL) {
		body.set(
			"redirect_uri",
			`${env.DISCORD_OAUTH_PROXY_URL.replace(/\/+$/, "")}/discord-oauth/exchange`,
		);
	}

	try {
		const res = await fetch("https://discord.com/api/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body,
		});
		const data = (await res.json()) as DiscordTokenResponse;

		if (!res.ok || !data.access_token) {
			console.error(
				"Discord token exchange failed:",
				data.error ?? "unknown",
				data.error_description ?? "",
			);
			return null;
		}

		return { accessToken: data.access_token, scope: data.scope ?? "" };
	} catch (e) {
		console.error("Discord token exchange request failed:", e);
		return null;
	}
}

/**
 * Fetches the OAuth2 `/users/@me` profile behind an access token.
 */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUserResponse | null> {
	try {
		const res = await fetch("https://discord.com/api/users/@me", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) return null;
		return (await res.json()) as DiscordUserResponse;
	} catch {
		return null;
	}
}

/**
 * Trusted Discord identity resolved from an OAuth2 access token.
 *
 * The Activity proxy does not sign requests to mapped backend prefixes, so the
 * `frame_id` / `instance_id` query parameters cannot be trusted for identity.
 * The access token (issued by Discord to the Activity client) is the only
 * trustworthy source: we ask Discord directly who it belongs to.
 */
export interface DiscordTokenIdentity {
	/** Discord user snowflake. */
	userId: string;
	username: string | null;
}

/**
 * Resolve the Discord user behind an access token via `/users/@me`.
 * Returns `null` when the token is missing, expired or rejected by Discord.
 */
export async function verifyDiscordAccessToken(
	accessToken: string | null | undefined,
): Promise<DiscordTokenIdentity | null> {
	if (!accessToken) return null;
	const user = await fetchDiscordUser(accessToken);
	if (!user?.id) return null;
	return { userId: String(user.id), username: user.global_name ?? user.username ?? null };
}

/**
 * Extracts the Activity `code` from the current window (`/?code=...`).
 */
export function extractDiscordCode(source: string | null | undefined): string | null {
	if (!source) return null;
	const match = source.match(/[?&]code=([^&#]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * `wrangler dev` has no OAuth redirect, so it injects a placeholder token that
 * must never reach Discord's API.
 */
export function isDevPlaceholder(token: string | undefined | null): boolean {
	return !token || token === DEV_PLACEHOLDER_TOKEN;
}
