import { z } from "@hono/zod-openapi";

// Email object schema
export const emailSchema = z
	.object({
		id: z.string().openapi({
			description: "The unique identifier for the email.",
			example: "usm2sw0qfv9a5ku9z4xmh8og",
		}),
		from_address: z.string().openapi({
			description: "The sender's email address.",
			example: "sender@example.com",
		}),
		to_address: z.string().openapi({
			description: "The recipient's email address.",
			example: "recipient@alikuxac.xyz",
		}),
		subject: z.string().nullable().openapi({
			description: "The subject of the email.",
			example: "Welcome to our service",
		}),
		received_at: z.number().openapi({
			description: "The timestamp when the email was received (Unix epoch).",
			example: 1753317948,
		}),
		html_content: z.string().nullable().openapi({
			description: "The HTML content of the email.",
			example: "<p>Hello world</p>",
		}),
		text_content: z.string().nullable().openapi({
			description: "The plain text content of the email.",
			example: "Hello world",
		}),
		is_read: z.boolean().default(false).openapi({
			description: "Whether the email is marked as read.",
			example: false,
		}),
		is_starred: z.boolean().default(false).openapi({
			description: "Whether the email is starred/pinned.",
			example: false,
		}),
		otp_code: z.string().nullable().optional().openapi({
			description: "Extracted OTP verification code or token.",
			example: "123456",
		}),
		summary: z.string().nullable().optional().openapi({
			description: "AI-generated concise summary of the email.",
			example: "Your verification code is 123456. It will expire in 10 minutes.",
		}),
		has_attachments: z.boolean().default(false).openapi({
			description: "Whether the email contains attachments.",
			example: false,
		}),
	})
	.openapi("Email");

export type Email = z.infer<typeof emailSchema>;

// Email summary schema
export const emailSummarySchema = z
	.object({
		id: z.string().openapi({
			description: "The unique identifier for the email.",
			example: "usm2sw0qfv9a5ku9z4xmh8og",
		}),
		from_address: z.string().openapi({
			description: "The sender's email address.",
			example: "sender@example.com",
		}),
		to_address: z.string().openapi({
			description: "The recipient's email address.",
			example: "recipient@barid.site",
		}),
		subject: z.string().nullable().openapi({
			description: "The subject of the email.",
			example: "Welcome to our service",
		}),
		received_at: z.number().openapi({
			description: "The timestamp when the email was received (Unix epoch).",
			example: 1753317948,
		}),
		is_read: z.boolean().default(false).openapi({
			description: "Whether the email is read.",
			example: false,
		}),
		is_starred: z.boolean().default(false).openapi({
			description: "Whether the email is starred.",
			example: false,
		}),
		otp_code: z.string().nullable().optional().openapi({
			description: "Extracted OTP verification code.",
			example: "123456",
		}),
		summary: z.string().nullable().optional().openapi({
			description: "AI summary preview.",
			example: "Welcome confirmation email.",
		}),
		has_attachments: z.boolean().default(false).openapi({
			description: "Whether attachments exist.",
			example: false,
		}),
	})
	.openapi("EmailSummary");

export type EmailSummary = z.infer<typeof emailSummarySchema>;

// Response schemas
export const emailListResponseSchema = z.array(emailSummarySchema).openapi("EmailListResponse");
export const domainsResponseSchema = z.array(z.string()).openapi("DomainsResponse");
