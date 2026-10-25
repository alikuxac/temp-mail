import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import * as db from "@/database/d1";
import { type MiniAppEnv, requireMiniAppUser } from "@/middlewares/auth";
import { ERR, OK } from "@/utils/http";

const attachmentRoutes = new OpenAPIHono<MiniAppEnv>();

// Attachments are private: require a verified Mini App / Discord Activity session.
attachmentRoutes.use("/api/attachments/*", requireMiniAppUser);

/**
 * Attachments (and their emails) are only readable by the owner of the recipient
 * address, or by the owner/admin of the instance.
 */
async function canAccessEmail(c: Context<MiniAppEnv>, emailId: string) {
	const identity = c.get("telegram");
	const isOwner = identity ? identity.isOwner : (c.get("discord")?.isAdmin ?? false);
	if (isOwner) return true;

	const { result: email } = await db.getEmailById(c.env.D1, emailId);
	if (!email) return false;

	const { result: address } = await db.getEmailAddressByAddress(c.env.D1, email.to_address);
	return address?.user_id === c.get("userId");
}

// GET /api/attachments/email/:emailId - List attachments for email
attachmentRoutes.get("/api/attachments/email/:emailId", async (c) => {
	const emailId = c.req.param("emailId");

	if (!(await canAccessEmail(c, emailId))) {
		return c.json(ERR("This email does not belong to you", "Forbidden"), 403);
	}

	const { results, error } = await db.getAttachmentsByEmailId(c.env.D1, emailId);

	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}

	return c.json(OK(results));
});

// GET /api/attachments/:id/download - Stream binary download from R2
attachmentRoutes.get("/api/attachments/:id/download", async (c) => {
	const id = c.req.param("id");

	if (!c.env.ATTACHMENTS_BUCKET) {
		return c.json(ERR("ATTACHMENTS_BUCKET is not configured", "ConfigError"), 500);
	}

	const { result: attachment, error } = await db.getAttachmentById(c.env.D1, id);
	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}
	if (!attachment) {
		return c.json(ERR("Attachment not found", "NotFound"), 404);
	}

	if (!(await canAccessEmail(c, attachment.email_id))) {
		return c.json(ERR("This attachment does not belong to you", "Forbidden"), 403);
	}

	const object = await c.env.ATTACHMENTS_BUCKET.get(attachment.r2_key);
	if (!object?.body) {
		return c.json(ERR("Attachment file not found in storage", "NotFound"), 404);
	}

	const headers = new Headers();
	headers.set("Content-Type", attachment.file_type || "application/octet-stream");
	headers.set(
		"Content-Disposition",
		`attachment; filename="${encodeURIComponent(attachment.file_name)}"`,
	);
	headers.set("Content-Length", String(attachment.file_size));
	// Private data: only the browser may cache it, never shared proxies.
	headers.set("Cache-Control", "private, max-age=86400");

	return new Response(object.body, {
		status: 200,
		headers,
	});
});

export default attachmentRoutes;
