import { useEffect, useMemo } from "react";

export function useTelegram() {
	const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

	useEffect(() => {
		if (tg) {
			tg.ready();
			tg.expand();
		}
	}, [tg]);

	const user = tg?.initDataUnsafe?.user;

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
		haptic,
		colorScheme: tg?.colorScheme ?? "dark",
		close: () => tg?.close(),
	};
}
