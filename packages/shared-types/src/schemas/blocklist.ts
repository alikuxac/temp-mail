import { z } from "@hono/zod-openapi";

export const blockRuleTypeSchema = z.enum(["sender", "domain"]).openapi({
	description: "Type of block rule: specific sender address or full sender domain",
	example: "sender",
});

export const blockRuleSchema = z
	.object({
		id: z.string().openapi({
			description: "Unique identifier for the block rule",
			example: "blk_cm729b13x0002",
		}),
		type: blockRuleTypeSchema,
		pattern: z.string().min(1).openapi({
			description: "Email address or domain pattern to block",
			example: "spammer@evil.com",
		}),
		created_at: z.number().openapi({
			description: "Creation timestamp (Unix epoch in seconds)",
			example: 1753317948,
		}),
	})
	.openapi("BlockRule");

export type BlockRule = z.infer<typeof blockRuleSchema>;

export const createBlockRuleSchema = z
	.object({
		type: blockRuleTypeSchema,
		pattern: z.string().min(1).openapi({
			description: "Email address or domain name to block",
			example: "spammer@evil.com",
		}),
	})
	.openapi("CreateBlockRuleRequest");

export type CreateBlockRuleRequest = z.infer<typeof createBlockRuleSchema>;

export const blockRulesResponseSchema = z.array(blockRuleSchema).openapi("BlockRulesResponse");
