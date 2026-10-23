import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@temp-mail/shared-types": path.resolve(
				__dirname,
				"../../packages/shared-types/src/index.ts",
			),
		},
	},
	server: {
		port: 5173,
		host: true,
	},
});
