import { z } from "@hono/zod-openapi";

export const attachmentSchema = z
	.object({
		id: z.string().openapi({
			description: "Unique identifier for the attachment",
			example: "att_cm729b13x0001",
		}),
		email_id: z.string().openapi({
			description: "Associated email ID",
			example: "usm2sw0qfv9a5ku9z4xmh8og",
		}),
		file_name: z.string().openapi({
			description: "Original filename",
			example: "invoice.pdf",
		}),
		file_type: z.string().nullable().openapi({
			description: "MIME type of the attachment",
			example: "application/pdf",
		}),
		file_size: z.number().openapi({
			description: "Size in bytes",
			example: 1048576,
		}),
		r2_key: z.string().openapi({
			description: "Storage key in Cloudflare R2 bucket",
			example: "attachments/usm2sw0qfv9a5ku9z4xmh8og/att_cm729b13x0001_invoice.pdf",
		}),
		created_at: z.number().openapi({
			description: "Creation timestamp (Unix epoch in seconds)",
			example: 1753317948,
		}),
	})
	.openapi("Attachment");

export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentListResponseSchema = z
	.array(attachmentSchema)
	.openapi("AttachmentListResponse");
