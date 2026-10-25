/**
 * Environment normalization.
 *
 * Cloudflare `vars` can be booleans/number literals and secrets are strings,
 * so every accessor here is defensive: it never throws and falls back to a safe default.
 */

/**
 * Split a comma separated env value into a trimmed, non empty list.
 */
export function parseIdList(raw: string | undefined | null): string[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

/**
 * Parse a non-negative integer from env, falling back to `fallback` for invalid input.
 * `0` is accepted so quotas or cooldowns can be disabled explicitly.
 */
export function parseIntVar(raw: unknown, fallback: number): number {
	const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.floor(parsed);
}

/**
 * Parse a boolean flag from env ("true", "1", "yes", real booleans).
 */
export function parseBoolVar(raw: unknown, fallback = false): boolean {
	if (typeof raw === "boolean") return raw;
	if (raw === undefined || raw === null || raw === "") return fallback;
	return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

/**
 * Parse a JSON array of strings from env, falling back to an empty list.
 */
export function parseJsonStringArray(raw: string | undefined | null): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
	} catch {
		return [];
	}
}

/**
 * Parse a list of Discord snowflakes (comma separated), ignoring malformed entries.
 */
export function parseSnowflakeList(raw: string | undefined | null): string[] {
	return parseIdList(raw).filter((id) => /^\d{5,25}$/.test(id));
}

export interface QuotaConfig {
	/** Max addresses per user (owner/admins are exempt). */
	maxAddresses: number;
	/** Per user cooldown between two address creations, in seconds. */
	rateLimitSeconds: number;
}

/** Default quotas, identical to the historical Telegram bot behaviour. */
export const DEFAULT_QUOTA: QuotaConfig = {
	maxAddresses: 5,
	rateLimitSeconds: 20,
};

/**
 * Resolve the shared quota configuration used by Telegram, Mini App and Discord.
 */
export function getQuotaConfig(env: Env): QuotaConfig {
	return {
		maxAddresses: parseIntVar(env.MAX_ADDRESSES_PER_USER, DEFAULT_QUOTA.maxAddresses),
		rateLimitSeconds: parseIntVar(env.RATE_LIMIT_SECONDS, DEFAULT_QUOTA.rateLimitSeconds),
	};
}

/**
 * Admin / owner IDs (Telegram). The first entry is considered the owner.
 */
export function getAdminIds(env: Env): string[] {
	return parseIdList(env.ADMIN_ID);
}

/**
 * Sender domains accepted for outbound mail through Resend.
 */
export function getAllowedSenderDomains(env: Env): string[] {
	const configured = parseIdList(env.RESEND_ALLOWED_DOMAINS);
	const domains = configured.length > 0 ? configured : [env.DOMAIN];
	return [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Capability flags exposed to the front-ends via `/api/session`.
 *
 * Optional features are enabled by explicit configuration only, so a deployment
 * without the required secrets still reports `false` and the UI hides the action.
 */
export type AiProvider = "workers-ai" | "openai-compatible";

export interface AiConfig {
	provider: AiProvider;
	/** Model id sent to the provider (Workers AI: `@cf/...`; OpenAI-compatible: `model`). */
	model: string;
	/** Base URL for `openai-compatible` providers, without the trailing `/chat/completions`. */
	baseUrl: string;
	/** Bearer token for `openai-compatible` providers. */
	apiKey: string;
	/** Max tokens for the summary response. */
	maxTokens: number;
	/** Sampling temperature. */
	temperature: number;
	/** Daily summary budget (`0` disables the limiter). */
	dailyLimit: number;
}

/** Default OpenAI-compatible endpoint (DeepSeek) used when only the key is set. */
const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_MODEL = "deepseek-chat";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct";

function parseFloatVar(raw: unknown, fallback: number): number {
	const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve the summarization provider.
 *
 * `AI_PROVIDER` is explicit; when unset it is inferred so an existing deployment
 * keeps working: an OpenAI-compatible key wins, otherwise the Workers AI binding.
 */
export function getAiConfig(env: Env): AiConfig {
	const apiKey = (env.AI_API_KEY ?? "").trim();
	const explicit = (env.AI_PROVIDER ?? "").trim().toLowerCase();

	const provider: AiProvider =
		explicit === "openai-compatible" || explicit === "openai"
			? "openai-compatible"
			: explicit === "workers-ai" || explicit === "workers"
				? "workers-ai"
				: apiKey
					? "openai-compatible"
					: "workers-ai";

	return {
		provider,
		model:
			(env.AI_MODEL ?? "").trim() ||
			(provider === "openai-compatible"
				? DEFAULT_OPENAI_COMPATIBLE_MODEL
				: DEFAULT_WORKERS_AI_MODEL),
		baseUrl: ((env.AI_BASE_URL ?? "").trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL).replace(
			/\/+$/,
			"",
		),
		apiKey,
		maxTokens: parseIntVar(env.AI_MAX_TOKENS, 100),
		temperature: parseFloatVar(env.AI_TEMPERATURE, 0.3),
		dailyLimit: parseIntVar(env.MAX_DAILY_AI_SUMMARIES, 150),
	};
}

/**
 * True when the configured provider can actually be called.
 */
export function isAiConfigured(env: Env): boolean {
	const config = getAiConfig(env);
	if (config.provider === "openai-compatible") return config.apiKey.length > 0;
	return Boolean(env.AI);
}

export interface FeatureFlags {
	/** Outbound send + reply through Resend (`RESEND_API_KEY`). */
	outbound: boolean;
	/** On-demand forwarding (`RESEND_API_KEY`). */
	forward: boolean;
	/** Email summaries are available (Workers AI binding or an OpenAI-compatible key). */
	aiSummary: boolean;
	/** Provider currently used for summaries. */
	aiProvider: AiProvider;
}

/**
 * Resolve the optional-feature flags for the current environment.
 */
export function getFeatureFlags(env: Env): FeatureFlags {
	const outbound = Boolean(env.RESEND_API_KEY?.trim());
	return {
		outbound,
		forward: outbound,
		aiSummary: isAiConfigured(env),
		aiProvider: getAiConfig(env).provider,
	};
}

export interface DiscordGuardConfig {
	/** Discord user snowflakes allowed to use the Activity. */
	allowedUserIds: string[];
	/** Discord guild snowflakes allowed to run the Activity in. */
	allowedGuildIds: string[];
	/** Let the Activity installer pass, even without an explicit allowlist entry. */
	allowInstaller: boolean;
}

/**
 * Discord allowlist configuration. Deny-by-default: an empty user list blocks everyone.
 */
export function getDiscordGuardConfig(env: Env): DiscordGuardConfig {
	return {
		allowedUserIds: parseSnowflakeList(env.ALLOWED_DISCORD_USER_IDS),
		allowedGuildIds: parseSnowflakeList(env.ALLOWED_DISCORD_GUILD_IDS),
		allowInstaller: parseBoolVar(env.DISCORD_ALLOW_INSTALLER, false),
	};
}
