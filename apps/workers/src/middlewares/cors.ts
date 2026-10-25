import { cors } from "hono/cors";

/**
 * Enhanced CORS Middleware for safe Mini App and frontend consumption
 */
const corsMiddleware = cors({
	origin: "*",
	allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowHeaders: [
		"Content-Type",
		"Authorization",
		"X-Custom-Header",
		"X-Telegram-Init-Data",
		"X-Telegram-User-Id",
	],
	exposeHeaders: ["Content-Length", "Content-Type", "Content-Disposition"],
	maxAge: 86400,
});

export default corsMiddleware;
