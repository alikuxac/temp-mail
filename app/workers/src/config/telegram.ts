import type { BotCommand } from "grammy/types";

export const telegramCommands: BotCommand[] = [
	{
		command: "id",
		description: "/id - Get your chat ID",
	},
	{
		command: "new",
		description: `Generate random email address`,
	},
	{
		command: "cleanup",
		description: `Cleanup expired emails`,
	},
] as const;
