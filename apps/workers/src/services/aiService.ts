/**
 * Email summarization service.
 *
 * Two providers are supported and selected through `AI_PROVIDER`:
 *   - `workers-ai`: the Cloudflare Workers AI binding (`env.AI`).
 *   - `openai-compatible`: any OpenAI-compatible `/chat/completions` endpoint
 *     (DeepSeek, OpenAI, OpenRouter, a self-hosted gateway, ...) configured with
 *     `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL`.
 */
import { type AiConfig, getAiConfig } from "@/config/env";

const SYSTEM_PROMPT =
	"You are an assistant that summarizes emails concisely for push notifications. Provide maximum 2 short sentences summarizing the key message or action required. Do not include introductory phrases like 'This email is about' or 'Here is a summary'. Output the summary directly.";

/**
 * Daily summarization budget (free-tier safety).
 *
 * Uses a KV counter keyed by UTC date. Returns `false` when the budget is spent,
 * so callers skip the AI call instead of failing the whole email pipeline.
 */
export async function canUseAiSummary(
	kv: KVNamespace | undefined,
	limit: number,
): Promise<boolean> {
	// 0 disables the budget limiter entirely.
	if (!kv || limit <= 0) return true;

	try {
		const day = new Date().toISOString().slice(0, 10);
		const key = `ai_summary_count:${day}`;
		const current = Number.parseInt((await kv.get(key)) ?? "0", 10) || 0;
		if (current >= limit) return false;

		// KV is eventually consistent, so this is a soft cap on concurrent bursts.
		await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 });
		return true;
	} catch (error) {
		console.error("AI summary budget check failed:", error);
		return true;
	}
}

interface ChatMessage {
	role: "system" | "user";
	content: string;
}

function buildMessages(subject: string | null, body: string): ChatMessage[] {
	// Truncate to keep execution fast and within token limits.
	const truncatedBody = body.length > 1500 ? `${body.substring(0, 1500)}...` : body;
	return [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: `Subject: ${subject || "(No Subject)"}\n\nBody:\n${truncatedBody}` },
	];
}

/**
 * Summarize through the Cloudflare Workers AI binding.
 */
async function summarizeWithWorkersAi(
	ai: Ai | undefined,
	config: AiConfig,
	messages: ChatMessage[],
): Promise<string | null> {
	if (!ai) {
		console.warn("Workers AI binding (env.AI) is not configured.");
		return null;
	}

	const response = (await ai.run(config.model as keyof AiModels, {
		messages,
		max_tokens: config.maxTokens,
		temperature: config.temperature,
	})) as { response?: string };

	return response?.response?.trim() || null;
}

interface ChatCompletionResponse {
	choices?: Array<{ message?: { content?: string | null } }>;
	error?: { message?: string };
}

/**
 * Summarize through any OpenAI-compatible `/chat/completions` endpoint.
 */
async function summarizeWithOpenAiCompatible(
	config: AiConfig,
	messages: ChatMessage[],
): Promise<string | null> {
	if (!config.apiKey) {
		console.warn("AI_API_KEY is not configured for the openai-compatible provider.");
		return null;
	}

	const res = await fetch(`${config.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			max_tokens: config.maxTokens,
			temperature: config.temperature,
			stream: false,
		}),
	});

	const data = (await res.json().catch(() => ({}))) as ChatCompletionResponse;

	if (!res.ok) {
		console.error(
			`AI provider request failed (${res.status}):`,
			data.error?.message ?? "unknown error",
		);
		return null;
	}

	return data.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Summarize an inbound email with the configured provider.
 *
 * Never throws: on failure it falls back to a truncated plain-text excerpt so the
 * notification always has something useful to show.
 */
export async function summarizeEmail(
	env: Env,
	textContent: string | null,
	subject: string | null,
): Promise<string | null> {
	const config = getAiConfig(env);

	const body = (textContent || "").trim();
	if (!body) return null;

	const messages = buildMessages(subject, body);

	try {
		const summary =
			config.provider === "openai-compatible"
				? await summarizeWithOpenAiCompatible(config, messages)
				: await summarizeWithWorkersAi(env.AI, config, messages);

		if (summary) return summary;
	} catch (error) {
		console.error(`AI summarization failed (${config.provider}):`, error);
	}

	// Graceful fallback to the first 120 characters of the body.
	const fallback = body.replace(/\s+/g, " ").trim();
	return fallback.length > 120 ? `${fallback.substring(0, 117)}...` : fallback;
}
