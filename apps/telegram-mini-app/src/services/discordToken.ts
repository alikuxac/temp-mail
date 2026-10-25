/**
 * Holds the Discord Activity OAuth2 access token for the current page.
 *
 * The Activity proxy does not sign requests to mapped backend prefixes, so the
 * Worker authenticates Discord requests with this token instead of an Ed25519
 * signature. Both the SDK bootstrap (`services/discord.ts`) and every API call
 * (`services/api.ts`) read from here.
 */
let accessToken: string | null = null;

export function setDiscordAccessToken(token: string | null): void {
	accessToken = token;
}

export function getDiscordAccessToken(): string | null {
	return accessToken;
}
