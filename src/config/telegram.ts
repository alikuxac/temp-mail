export const tmaModeDescription: { [key: string]: string } = {
	test: "Test an email address",
	whitelist: "Manage the white list",
	blocklist: "Manage the block list",
};

export const telegramCommands = [
	{
		command: "id",
		description: "/id - Get your chat ID",
	},
	{
		command: "test",
		description: `/test - ${tmaModeDescription.test}`,
	},
	{
		command: "whitelist",
		description: `/whitelist - ${tmaModeDescription.whitelist}`,
	},
	{
		command: "blocklist",
		description: `/block - ${tmaModeDescription.blocklist}`,
	},
] as const;
