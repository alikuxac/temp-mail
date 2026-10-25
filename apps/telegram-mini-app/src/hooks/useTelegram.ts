import { useEffect, useMemo, useState } from "react";
import { initDiscordActivity } from "../services/discord";

export type AuthProvider = "telegram" | "discord" | "browser";

export interface SessionUser {
	id?: number;
	first_name?: string;
	username?: string;
	language_code?: string;
}

export function useTelegram() {
	const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
	const [discordReady, setDiscordReady] = useState(false);
	const [discordError, setDiscordError] = useState<string | null>(null);

	useEffect(() => {
		if (tg) {
			tg.ready();
			tg.expand();
		}
	}, [tg]);

	// Discord Activity bootstrap (no-op when running inside Telegram or a normal tab)
	useEffect(() => {
		let cancelled = false;
		initDiscordActivity()
			.then((launch) => {
				if (cancelled) return;
				setDiscordReady(Boolean(launch?.isActivity && launch.sdk));
				if (launch?.error) {
					setDiscordError(
						launch.stage ? `Discord [${launch.stage}]: ${launch.error}` : launch.error,
					);
				}
			})
			.catch((err) => {
				if (!cancelled) setDiscordError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const user = tg?.initDataUnsafe?.user;

	const provider: AuthProvider = tg?.initData ? "telegram" : discordReady ? "discord" : "browser";

	const haptic = useMemo(
		() => ({
			impact: (style: "light" | "medium" | "heavy" = "light") => {
				tg?.HapticFeedback?.impactOccurred(style);
			},
			notification: (type: "error" | "success" | "warning") => {
				tg?.HapticFeedback?.notificationOccurred(type);
			},
			selection: () => {
				tg?.HapticFeedback?.selectionChanged();
			},
		}),
		[tg],
	);

	return {
		tg,
		user,
		provider,
		discordReady,
		discordError,
		haptic,
		colorScheme: tg?.colorScheme ?? "dark",
		close: () => tg?.close(),
	};
}
