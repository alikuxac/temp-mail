import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

/**
 * Show any startup failure on screen. Environments we run in (Telegram Mini App,
 * Discord Activity iframe) usually have no reachable browser console, so a blank
 * page would otherwise be undebuggable.
 */
function renderFatal(message: string, detail?: unknown) {
	const root = document.getElementById("root");
	const detailText =
		detail instanceof Error
			? `${detail.name}: ${detail.message}`
			: detail !== undefined
				? String(detail)
				: "";

	if (root) {
		root.innerHTML =
			'<div style="padding:16px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#ff6b6b;white-space:pre-wrap;word-break:break-word">' +
			`<b>Startup error</b>\n\n${message}${detailText ? `\n\n${detailText}` : ""}` +
			"</div>";
	}
}

window.addEventListener("error", (event) => {
	renderFatal(event.message || "Uncaught error", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
	renderFatal("Unhandled promise rejection", event.reason);
});

const rootElement = document.getElementById("root");

if (rootElement) {
	try {
		ReactDOM.createRoot(rootElement).render(
			<React.StrictMode>
				<ErrorBoundary>
					<App />
				</ErrorBoundary>
			</React.StrictMode>,
		);
	} catch (err) {
		renderFatal("React failed to mount", err);
	}
}
