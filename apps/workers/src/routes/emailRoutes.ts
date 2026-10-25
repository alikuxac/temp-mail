import { OpenAPIHono } from "@hono/zod-openapi";
import {
	deleteEmailRoute,
	deleteEmailsRoute,
	getEmailRoute,
	getEmailsCountRoute,
	getEmailsRoute,
	type ReplyEmailRequest,
	type SendEmailRequest,
} from "@temp-mail/shared-types";
import type { Context } from "hono";
import { parseBoolVar } from "@/config/env";
import * as db from "@/database/d1";
import { buildMiniAppSession, type MiniAppEnv, requireMiniAppUser } from "@/middlewares/auth";
import validateDomain from "@/middlewares/validateDomain";
import { createAddressHandler, rememberPrefixPreset } from "@/services/addressService";
import { replyEmailWithResend, sendEmailWithResend } from "@/services/resendService";
import { ERR, OK } from "@/utils/http";

const emailRoutes = new OpenAPIHono<MiniAppEnv>();

// --- Authentication ---
// Every inbox mutation/read requires a valid Telegram initData (see middlewares/auth.ts).
emailRoutes.use("/api/*", requireMiniAppUser);

// --- Middlewares ---
emailRoutes.use("/api/emails/:emailAddress", validateDomain);
emailRoutes.use("/api/emails/count/:emailAddress", validateDomain);

/**
 * Owner (Telegram admin) or a Discord user explicitly allowlisted for the Activity.
 */
function isOwnerSession(c: Context<MiniAppEnv>): boolean {
	const identity = c.get("telegram");
	if (identity) return identity.isOwner;
	return c.get("discord")?.isAdmin ?? false;
}

/**
 * Ensure the authenticated user owns the address.
 * Used by every inbox endpoint so list, detail, star, delete and forward agree.
 */
async function canAccessAddress(c: Context<MiniAppEnv>, address: string) {
	if (isOwnerSession(c)) return true;

	const { result } = await db.getEmailAddressByAddress(c.env.D1, address);
	if (result) {
		return result.user_id === c.get("userId");
	}

	// Unregistered addresses (legacy inboxes) are readable unless RESTRICT_ADDRESS_ACCESS is enabled.
	return !parseBoolVar(c.env.RESTRICT_ADDRESS_ACCESS, false);
}

// --- Routes ---
// GET /api/session - Identity, quota and addresses of the current session
emailRoutes.get("/api/session", async (c) => {
	const session = await buildMiniAppSession(c);
	if (!session) return c.json(ERR("Missing Telegram init data", "AuthError"), 401);
	return c.json(OK(session));
});

// GET /api/emails/{emailAddress}
// @ts-expect-error - OpenAPI route handler type mismatch with error response status codes
emailRoutes.openapi(getEmailsRoute, async (c) => {
	const { emailAddress } = c.req.valid("param");
	const { limit, offset } = c.req.valid("query");

	if (!(await canAccessAddress(c, emailAddress))) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	const { results, error } = await db.getEmailsByRecipient(c.env.D1, emailAddress, limit, offset);

	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	return c.json(OK(results));
});

// GET /api/emails/count/{emailAddress}
// @ts-expect-error - OpenAPI route handler type mismatch with error response status codes
emailRoutes.openapi(getEmailsCountRoute, async (c) => {
	const { emailAddress } = c.req.valid("param");

	if (!(await canAccessAddress(c, emailAddress))) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	const { count, error } = await db.countEmailsByRecipient(c.env.D1, emailAddress);

	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	return c.json(OK({ count }));
});

// DELETE /api/emails/{emailAddress}
// @ts-expect-error - OpenAPI route handler type mismatch with error response status codes
emailRoutes.openapi(deleteEmailsRoute, async (c) => {
	const { emailAddress } = c.req.valid("param");

	if (!(await canAccessAddress(c, emailAddress))) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	const { meta, error } = await db.deleteEmailsByRecipient(c.env.D1, emailAddress);

	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	if (meta && meta.changes === 0)
		return c.json(ERR("No emails found for deletion", "NotFound"), 404);
	return c.json(OK({ message: "Emails deleted successfully", deleted_count: meta?.changes }));
});

// GET /api/inbox/{emailId}
// @ts-expect-error - OpenAPI route handler type mismatch with error response status codes
emailRoutes.openapi(getEmailRoute, async (c) => {
	const { emailId } = c.req.valid("param");
	const { result, error } = await db.getEmailById(c.env.D1, emailId);

	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	if (!result) return c.json(ERR("Email not found", "NotFound"), 404);

	if (!(await canAccessAddress(c, result.to_address))) {
		return c.json(ERR("This email does not belong to you", "Forbidden"), 403);
	}

	return c.json(OK(result));
});

// DELETE /api/inbox/{emailId}
// @ts-expect-error - OpenAPI route handler type mismatch with error response status codes
emailRoutes.openapi(deleteEmailRoute, async (c) => {
	const { emailId } = c.req.valid("param");
	const { meta, error } = isOwnerSession(c)
		? await db.deleteEmailById(c.env.D1, emailId)
		: await db.deleteEmailByIdForUser(c.env.D1, emailId, c.get("userId"));

	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	if (meta && meta.changes === 0) return c.json(ERR("Email not found", "NotFound"), 404);
	return c.json(OK({ message: "Email deleted successfully" }));
});

// PATCH /api/inbox/:emailId/star - Toggle starred status
emailRoutes.patch("/api/inbox/:emailId/star", async (c) => {
	const emailId = c.req.param("emailId");
	const body = await c.req.json<{ is_starred: boolean }>().catch(() => ({ is_starred: true }));

	const { result: email } = await db.getEmailById(c.env.D1, emailId);
	if (!email) return c.json(ERR("Email not found", "NotFound"), 404);
	if (!(await canAccessAddress(c, email.to_address))) {
		return c.json(ERR("This email does not belong to you", "Forbidden"), 403);
	}

	const { success, error } = await db.toggleStarEmail(c.env.D1, emailId, Boolean(body.is_starred));
	if (!success) {
		return c.json(ERR(error?.message || "Failed to update star state", "D1Error"), 500);
	}

	return c.json(OK({ id: emailId, is_starred: Boolean(body.is_starred) }));
});

/**
 * Load an email and verify that the caller owns its recipient address.
 */
async function getOwnedEmail(c: Context<MiniAppEnv>, emailId: string) {
	const { result: email, error } = await db.getEmailById(c.env.D1, emailId);
	if (error || !email) return { email: null, forbidden: false };

	return { email, forbidden: !(await canAccessAddress(c, email.to_address)) };
}

// POST /api/inbox/:emailId/forward - Forward an email on demand
emailRoutes.post("/api/inbox/:emailId/forward", async (c) => {
	const emailId = c.req.param("emailId");
	const body = await c.req
		.json<{ target_email?: string }>()
		.catch(() => ({ target_email: undefined as string | undefined }));

	const { email, forbidden } = await getOwnedEmail(c, emailId);
	if (!email) return c.json(ERR("Email not found", "NotFound"), 404);
	if (forbidden) return c.json(ERR("This email does not belong to you", "Forbidden"), 403);

	const targetEmail = body.target_email || (await db.getSetting(c.env.D1, "forwarding_target"));
	if (!targetEmail) {
		return c.json(
			ERR(
				"No forwarding target specified and no default forwarding address is set in settings",
				"ConfigError",
			),
			400,
		);
	}

	// Forwarding is an optional feature: without Resend the action is unavailable.
	if (!c.env.RESEND_API_KEY) {
		return c.json(
			ERR(
				"Forwarding is disabled because RESEND_API_KEY is not configured on the server",
				"ConfigError",
			),
			503,
		);
	}

	{
		const sendResult = await sendEmailWithResend(c.env.RESEND_API_KEY, c.env.DOMAIN, {
			from: `forwarder@${c.env.DOMAIN}`,
			to: targetEmail,
			subject: `Fwd: ${email.subject || "(No Subject)"}`,
			text: `---------- Forwarded message ---------\nFrom: ${email.from_address}\nTo: ${email.to_address}\nDate: ${new Date(email.received_at * 1000).toISOString()}\nSubject: ${email.subject || ""}\n\n${email.text_content || ""}`,
			html: email.html_content
				? `<div style="border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 10px;"><b>Forwarded from:</b> ${email.from_address}<br/><b>Original Subject:</b> ${email.subject || ""}</div>${email.html_content}`
				: undefined,
		});

		if (!sendResult.success) {
			return c.json(ERR(sendResult.error || "Forward delivery failed", "SendError"), 502);
		}
	}

	return c.json(OK({ message: `Email forwarded successfully to ${targetEmail}` }));
});

// GET /api/admin/addresses - List every address (admin/owner only)
//
// Owners and allowlisted admins can already read and mutate any inbox through
// `canAccessAddress` / `isOwnerSession`. This endpoint gives them the missing
// piece: the list of every address so they can pick one to inspect.
emailRoutes.get("/api/admin/addresses", async (c) => {
	if (!isOwnerSession(c)) {
		return c.json(ERR("This action requires an admin account", "Forbidden"), 403);
	}

	const limit = Math.min(
		Math.max(Number.parseInt(c.req.query("limit") ?? "100", 10) || 100, 1),
		500,
	);
	const offset = Math.max(Number.parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
	const { results, error } = await db.getAllEmailAddresses(c.env.D1, limit, offset);
	if (error) return c.json(ERR(error.message, "D1Error"), 500);
	return c.json(OK(results));
});

// DELETE /api/addresses/{emailAddress} - Delete one of the caller's addresses
emailRoutes.delete("/api/addresses/:emailAddress", async (c) => {
	const address = decodeURIComponent(c.req.param("emailAddress")).trim().toLowerCase();

	const { result } = await db.getEmailAddressByAddress(c.env.D1, address);
	if (!result) return c.json(ERR("Address not found", "NotFound"), 404);

	if (!isOwnerSession(c) && result.user_id !== c.get("userId")) {
		return c.json(ERR("This address does not belong to you", "Forbidden"), 403);
	}

	// Remove the inbox contents first so the address deletion leaves no orphan rows.
	const { meta: deletedEmails } = await db.deleteEmailsByRecipient(c.env.D1, address);
	const { success, error } = await db.deleteEmailAddress(c.env.D1, result.id);
	if (!success) return c.json(ERR(error?.message || "Failed to delete address", "D1Error"), 500);

	return c.json(OK({ id: result.id, address, deleted_emails: deletedEmails?.changes ?? 0 }));
});

// POST /api/addresses/custom - Create a custom prefix address (owned by the caller)
emailRoutes.post("/api/addresses/custom", async (c) => {
	const response = await createAddressHandler(c);
	if (response.status === 201) {
		const body = await response.clone().json<{ result?: { address?: string } }>();
		const prefix = body.result?.address?.split("@")[0];
		if (prefix) await rememberPrefixPreset(c.env, prefix);
	}
	return response;
});

// POST /api/addresses/random - Generate a random address (quota enforced)
emailRoutes.post("/api/addresses/random", async (c) => createAddressHandler(c));

// POST /api/emails/send - Send outbound email via Resend
emailRoutes.post("/api/emails/send", async (c) => {
	try {
		const body = await c.req.json<SendEmailRequest>();
		if (!c.env.RESEND_API_KEY) {
			return c.json(ERR("RESEND_API_KEY is not configured on the server", "ConfigError"), 503);
		}

		const result = await sendEmailWithResend(c.env.RESEND_API_KEY, c.env.DOMAIN, body);
		if (!result.success) {
			return c.json(ERR(result.error || "Failed to send email", "ResendError"), 400);
		}

		return c.json(OK({ id: result.id, message: "Email queued and sent successfully" }));
	} catch (e: unknown) {
		const error = e instanceof Error ? e.message : String(e);
		return c.json(ERR(error, "InvalidRequest"), 400);
	}
});

// POST /api/emails/reply - Send reply to existing email via Resend
emailRoutes.post("/api/emails/reply", async (c) => {
	try {
		const body = await c.req.json<ReplyEmailRequest>();
		if (!c.env.RESEND_API_KEY) {
			return c.json(ERR("RESEND_API_KEY is not configured on the server", "ConfigError"), 503);
		}

		const result = await replyEmailWithResend(c.env.RESEND_API_KEY, c.env.DOMAIN, body);
		if (!result.success) {
			return c.json(ERR(result.error || "Failed to send reply", "ResendError"), 400);
		}

		return c.json(OK({ id: result.id, message: "Reply sent successfully" }));
	} catch (e: unknown) {
		const error = e instanceof Error ? e.message : String(e);
		return c.json(ERR(error, "InvalidRequest"), 400);
	}
});

export default emailRoutes;
