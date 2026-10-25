import { z } from "@hono/zod-openapi";

export const sendEmailRequestSchema = z
	.object({
		from: z.string().email().openapi({
			description: "Verified sender email address",
			example: "hello@barid.site",
		}),
		to: z.union([z.string().email(), z.array(z.string().email())]).openapi({
			description: "Recipient email address(es)",
			example: "friend@example.com",
		}),
		subject: z.string().min(1).openapi({
			description: "Email subject line",
			example: "Hello from Temp Mail",
		}),
		text: z.string().optional().openapi({
			description: "Plain text body",
			example: "Hello, this is a test message.",
		}),
		html: z.string().optional().openapi({
			description: "HTML formatted body",
			example: "<p>Hello, this is a test message.</p>",
		}),
	})
	.openapi("SendEmailRequest");

export type SendEmailRequest = z.infer<typeof sendEmailRequestSchema>;

export const replyEmailRequestSchema = z
	.object({
		email_id: z.string().openapi({
			description: "ID of the email being replied to",
			example: "usm2sw0qfv9a5ku9z4xmh8og",
		}),
		from: z.string().email().openapi({
			description: "Sender email address (must match recipient of original email)",
			example: "temp.user@barid.site",
		}),
		to: z.string().email().openapi({
			description: "Recipient email address",
			example: "original.sender@example.com",
		}),
		subject: z.string().min(1).openapi({
			description: "Reply subject line",
			example: "Re: Your inquiry",
		}),
		text: z.string().optional().openapi({
			description: "Plain text body",
			example: "Thank you for contacting me.",
		}),
		html: z.string().optional().openapi({
			description: "HTML formatted body",
			example: "<p>Thank you for contacting me.</p>",
		}),
	})
	.openapi("ReplyEmailRequest");

export type ReplyEmailRequest = z.infer<typeof replyEmailRequestSchema>;

export const forwardEmailRequestSchema = z
	.object({
		target_email: z.string().email().optional().openapi({
			description: "Target email address to forward to (optional, defaults to settings)",
			example: "backup@example.com",
		}),
	})
	.openapi("ForwardEmailRequest");

export type ForwardEmailRequest = z.infer<typeof forwardEmailRequestSchema>;

export const createCustomAddressRequestSchema = z
	.object({
		prefix: z
			.string()
			.min(2)
			.max(40)
			.regex(/^[a-zA-Z0-9._-]+$/, {
				message: "Prefix can only contain alphanumeric characters, dots, underscores, and dashes",
			})
			.openapi({
				description: "Custom prefix before the @ sign",
				example: "github.login",
			}),
		domain: z.string().optional().openapi({
			description: "Target domain (optional, defaults to primary domain)",
			example: "barid.site",
		}),
	})
	.openapi("CreateCustomAddressRequest");

export type CreateCustomAddressRequest = z.infer<typeof createCustomAddressRequestSchema>;

export const toggleStarRequestSchema = z
	.object({
		is_starred: z.boolean().openapi({
			description: "Target star state",
			example: true,
		}),
	})
	.openapi("ToggleStarRequest");

export type ToggleStarRequest = z.infer<typeof toggleStarRequestSchema>;
