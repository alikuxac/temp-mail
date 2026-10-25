/**
 * Discord Embedded App SDK bridge.
 * Only used when the Mini App runs inside a Discord Activity iframe.
 *
 * The SDK is imported through npm and bundled by Vite. Loading it from a CDN
 * script tag does not work: the package's bare entry is a CommonJS build that
 * never defines `window.DiscordSDK`.
 *
 * Launch flow (per the Activity development guide):
 *   1. Discord loads the app in an iframe and injects signed `frame_id` /
 *      `instance_id` query parameters.
 *   2. `new DiscordSDK(clientId)` + `sdk.ready()` handshakes with the client.
 *   3. `sdk.commands.authorize({ client_id, response_type: "code", scope })`
 *      returns an OAuth `code`. The code is NOT in the URL; only the SDK can
 *      produce it, and the RPC expects snake_case keys.
 *   4. The code is exchanged for an access token by our Worker.
 */
import { DiscordSDK, patchUrlMappings } from "@discord/embedded-app-sdk";
import { withDiscordQuery } from "./api";
import { setDiscordAccessToken } from "./discordToken";

/**
 * Base URL of the Worker API. Must match `services/api.ts`, because the Discord
 * Activity iframe is served from Pages while the API lives on the Worker.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const FRAME_ID = "frame_id";
const INSTANCE_ID = "instance_id";

/**
 * Discord proxy mapping for the Worker API.
 *
 * Activities are sandboxed: absolute requests to a non-mapped host are blocked
 * (`blocked:csp` / "Failed to fetch"). Create the matching mapping in the
 * Discord Developer Portal (URL Mappings):
 *   prefix `/worker`  ->  target `mail-api.alikuxac.xyz`
 * `patchUrlMappings` then rewrites `https://mail-api.alikuxac.xyz/*` requests to
 * `https://{clientId}.discordsays.com/worker/*`, which Discord forwards upstream.
 */
const API_PROXY_PREFIX = "/worker";
const API_PROXY_TARGET_HOST = "mail-api.alikuxac.xyz";

/** Permissions requested in the OAuth authorize step. */
const OAUTH_SCOPES = ["identify"] as const;

export interface DiscordLaunch {
	/** Initialized SDK client, `null` outside an Activity. */
	sdk: DiscordSDK | null;
	/** True when the page runs inside the Discord Activity iframe. */
	isActivity: boolean;
	/** Human readable failure reason, `null` on success (shown in the UI). */
	error: string | null;
	/** Which bootstrap step failed, for on-screen diagnostics. */
	stage: string | null;
}

let cached: Promise<DiscordLaunch | null> | null = null;

/**
 * Requests an OAuth code from Discord, then exchanges it on the Worker.
 * Returns the raw access token so `sdk.commands.authenticate` can be called.
 */
async function authorize(clientId: string, sdk: DiscordSDK): Promise<string> {
	const { code } = await sdk.commands.authorize({
		client_id: clientId,
		scope: [...OAUTH_SCOPES],
		response_type: "code",
		state: "",
		prompt: "none",
	});

	if (!code) {
		throw new Error("Discord did not return an authorization code");
	}

	// Discord signs the proxied request URL, so the Activity query parameters
	// (`frame_id` / `instance_id` / `signature` / `timestamp`) must be forwarded
	// exactly as received. Without them the signed proxy cannot authorize the
	// call and the browser reports an opaque "Failed to fetch".
	const res = await fetch(withDiscordQuery(`${BASE_URL}/api/discord/token`), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, client_id: clientId }),
	});

	const data = (await res.json().catch(() => ({}))) as {
		result?: { access_token?: string };
		error?: { message?: string };
	};

	if (!res.ok) {
		throw new Error(data.error?.message || `Discord token exchange failed (${res.status})`);
	}

	const accessToken = data.result?.access_token;
	if (!accessToken) {
		throw new Error("Discord token exchange returned no access token");
	}

	return accessToken;
}

/**
 * Initialize the Discord Runtime (only callable inside the Activity iframe).
 *
 * Never throws: on failure it returns a launch object carrying the failed step and
 * message, so the UI can display it without a browser console.
 */
export function initDiscordActivity(): Promise<DiscordLaunch | null> {
	if (cached) return cached;

	cached = (async () => {
		const params = new URLSearchParams(window.location.search);
		// Discord injects these on every Activity request; without them we are not
		// in an Activity and must not try to start the SDK.
		if (!params.has(FRAME_ID) || !params.has(INSTANCE_ID)) {
			return null;
		}

		const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
		if (!clientId) {
			return {
				sdk: null,
				isActivity: true,
				stage: "config",
				error: "VITE_DISCORD_CLIENT_ID is missing from the build",
			};
		}

		let sdk: DiscordSDK | null = null;
		let stage = "create-sdk";
		try {
			sdk = new DiscordSDK(clientId, { disableConsoleLogOverride: true });

			// Inside an Activity every request is sandboxed behind Discord's proxy;
			// direct calls to the Worker host fail with `blocked:csp` (surfaced as
			// "Failed to fetch"). Rewrite absolute requests to `API_PROXY_TARGET`
			// into the `API_PROXY_PREFIX` mapped in the Developer Portal so they
			// travel through `{clientId}.discordsays.com`. This patches global
			// `fetch`, so no other module needs to change.
			patchUrlMappings([{ prefix: API_PROXY_PREFIX, target: API_PROXY_TARGET_HOST }]);

			stage = "sdk-ready";
			await sdk.ready();

			stage = "authorize";
			const accessToken = await authorize(clientId, sdk);
			// The Worker authenticates Discord requests with this token (the proxy
			// does not sign mapped backend requests), so keep it for every call.
			setDiscordAccessToken(accessToken);

			stage = "authenticate";
			await sdk.commands.authenticate({ access_token: accessToken });

			return { sdk, isActivity: true, error: null, stage: null };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`Discord Activity bootstrap failed at "${stage}":`, err);
			return { sdk, isActivity: true, stage, error: message };
		}
	})();

	return cached;
}

/** Only used for documentation of the expected query payloads. */
export const DISCORD_QUERY_KEYS = { FRAME_ID, INSTANCE_ID } as const;
