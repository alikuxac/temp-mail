import { OpenAPIHono } from "@hono/zod-openapi";
import { createId } from "@paralleldrive/cuid2";
import type { BlockRule } from "@temp-mail/shared-types";
import type { Context } from "hono";
import * as db from "@/database/d1";
import { type MiniAppEnv, requireMiniAppUser } from "@/middlewares/auth";
import { now } from "@/utils/helpers";
import { ERR, OK } from "@/utils/http";

const settingsRoutes = new OpenAPIHono<MiniAppEnv>();

// Settings and the blocklist are global (shared), so only the owner may read/write them.
settingsRoutes.use("/api/settings/*", requireMiniAppUser);

/**
 * Guard for the global configuration endpoints.
 */
const requireOwner = async (c: Context<MiniAppEnv>, next: () => Promise<void>) => {
	const identity = c.get("telegram");
	if (!identity?.isOwner) {
		return c.json(ERR("Only the owner can manage global settings", "Forbidden"), 403);
	}
	await next();
};

settingsRoutes.use("/api/settings", requireOwner);
settingsRoutes.use("/api/settings/*", requireOwner);

// GET /api/settings - Read all settings
settingsRoutes.get("/api/settings", async (c) => {
	const settings = await db.getAllSettings(c.env.D1);
	return c.json(OK(settings));
});

// PUT /api/settings - Update settings
settingsRoutes.put("/api/settings", async (c) => {
	try {
		const body = await c.req.json<Record<string, unknown>>();
		const currentTimestamp = now();

		for (const [key, val] of Object.entries(body)) {
			const valueStr = typeof val === "string" ? val : JSON.stringify(val);
			await db.setSetting(c.env.D1, key, valueStr, currentTimestamp);
		}

		const updated = await db.getAllSettings(c.env.D1);
		return c.json(OK(updated));
	} catch (e: unknown) {
		const error = e instanceof Error ? e.message : String(e);
		return c.json(ERR(error, "InvalidRequest"), 400);
	}
});

// GET /api/settings/blocklist - List block rules
settingsRoutes.get("/api/settings/blocklist", async (c) => {
	const { results, error } = await db.getBlockRules(c.env.D1);
	if (error) {
		return c.json(ERR(error.message, "D1Error"), 500);
	}
	return c.json(OK(results));
});

// POST /api/settings/blocklist - Add block rule
settingsRoutes.post("/api/settings/blocklist", async (c) => {
	try {
		const body = await c.req.json<{ type?: string; pattern?: string }>();
		if (!body.pattern || !body.type || !["sender", "domain"].includes(body.type)) {
			return c.json(
				ERR(
					"Invalid block rule. 'type' must be 'sender' or 'domain' and 'pattern' is required.",
					"ValidationError",
				),
				400,
			);
		}

		const newRule: BlockRule = {
			id: createId(),
			type: body.type as "sender" | "domain",
			pattern: body.pattern.trim().toLowerCase(),
			created_at: now(),
		};

		const { success, error } = await db.createBlockRule(c.env.D1, newRule);
		if (!success) {
			return c.json(ERR(error?.message || "Failed to create block rule", "D1Error"), 500);
		}

		return c.json(OK(newRule), 201);
	} catch (e: unknown) {
		const error = e instanceof Error ? e.message : String(e);
		return c.json(ERR(error, "InvalidRequest"), 400);
	}
});

// DELETE /api/settings/blocklist/:id - Remove block rule
settingsRoutes.delete("/api/settings/blocklist/:id", async (c) => {
	const id = c.req.param("id");
	const { success, error } = await db.deleteBlockRule(c.env.D1, id);

	if (!success) {
		return c.json(ERR(error?.message || "Failed to delete block rule", "D1Error"), 500);
	}

	return c.json(OK({ message: "Block rule removed successfully" }));
});

export default settingsRoutes;
