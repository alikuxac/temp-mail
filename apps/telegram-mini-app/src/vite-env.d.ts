/// <reference types="vite/client" />

interface TelegramWebAppUser {
	id: number;
	is_bot?: boolean;
	first_name: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	photo_url?: string;
}

interface TelegramWebAppThemeParams {
	bg_color?: string;
	text_color?: string;
	hint_color?: string;
	link_color?: string;
	button_color?: string;
	button_text_color?: string;
	secondary_bg_color?: string;
	header_bg_color?: string;
	bottom_bar_bg_color?: string;
	accent_text_color?: string;
	section_bg_color?: string;
	section_header_text_color?: string;
	subtitle_text_color?: string;
	destructive_text_color?: string;
}

interface TelegramWebApp {
	initData: string;
	initDataUnsafe: {
		query_id?: string;
		user?: TelegramWebAppUser;
		auth_date?: number;
		hash?: string;
	};
	version: string;
	platform: string;
	colorScheme: "light" | "dark";
	themeParams: TelegramWebAppThemeParams;
	isExpanded: boolean;
	viewportHeight: number;
	viewportStableHeight: number;
	headerColor: string;
	backgroundColor: string;
	ready: () => void;
	expand: () => void;
	close: () => void;
	HapticFeedback: {
		impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
		notificationOccurred: (type: "error" | "success" | "warning") => void;
		selectionChanged: () => void;
	};
	MainButton: {
		text: string;
		color: string;
		textColor: string;
		isVisible: boolean;
		isActive: boolean;
		show: () => void;
		hide: () => void;
		enable: () => void;
		disable: () => void;
		showProgress: (leaveActive?: boolean) => void;
		hideProgress: () => void;
		onClick: (callback: () => void) => void;
		offClick: (callback: () => void) => void;
	};
	BackButton: {
		isVisible: boolean;
		show: () => void;
		hide: () => void;
		onClick: (callback: () => void) => void;
		offClick: (callback: () => void) => void;
	};
	openLink: (url: string) => void;
	openTelegramLink: (url: string) => void;
	showAlert: (message: string, callback?: () => void) => void;
	showConfirm: (message: string, callback?: (ok: boolean) => void) => void;
}

interface Window {
	Telegram?: {
		WebApp: TelegramWebApp;
	};
}
