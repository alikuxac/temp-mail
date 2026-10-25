import { OpenAPIHono } from "@hono/zod-openapi";
import attachmentRoutes from "@/routes/attachmentRoutes";
import discordRoutes from "@/routes/discordRoutes";
import emailRoutes from "@/routes/emailRoutes";
import healthRoutes from "@/routes/healthRoutes";
import settingsRoutes from "@/routes/settingsRoutes";
import telegramRoutes from "@/routes/telegramRoutes";
import { setupDocumentation } from "@/utils/docs";
import { logError } from "@/utils/logger";
import corsMiddleware from "./middlewares/cors";
import { ERR } from "./utils/http";

const app = new OpenAPIHono<{ Bindings: Env }>();

// --- Middlewares ---
app.use(corsMiddleware);

// --- Routes ---
// Discord Activity (has its own signed-proxy guard + strict CORS)
app.route("/", discordRoutes);
// Email Routes
app.route("/", emailRoutes);
// Attachment Routes
app.route("/", attachmentRoutes);
// Settings & Blocklist Routes
app.route("/", settingsRoutes);
// Telegram Routes
app.route("/", telegramRoutes);
// Health Check
app.route("/", healthRoutes);

// --- Error handling ---
app.onError((err, c) => {
	logError(`Unhandled error: ${err.message}`, err);
	return c.json(ERR(err.name, err.message), 500);
});

// --- OpenAPI Documentation ---
setupDocumentation(app);

export default app;
