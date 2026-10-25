import { z } from "@hono/zod-openapi";

export const settingKeyEnum = z.enum([
	"forwarding_target",
	"auto_cleanup_ttl_hours",
	"webhook_url",
	"custom_prefix_presets",
]);

export const settingSchema = z
	.object({
		key: z.string().openapi({
			description: "Unique setting key",
			example: "forwarding_target",
		}),
		value: z.string().openapi({
			description: "Stored setting value (string or JSON serialized)",
			example: "personal@gmail.com",
		}),
		updated_at: z.number().openapi({
			description: "Timestamp when the setting was last updated",
			example: 1753317948,
		}),
	})
	.openapi("Setting");

export type Setting = z.infer<typeof settingSchema>;

export const updateSettingsRequestSchema = z
	.object({
		forwarding_target: z.string().email().optional().or(z.literal("")),
		auto_cleanup_ttl_hours: z.number().int().min(1).max(720).optional(),
		webhook_url: z.string().url().optional().or(z.literal("")),
		custom_prefix_presets: z.array(z.string()).optional(),
	})
	.openapi("UpdateSettingsRequest");

export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
