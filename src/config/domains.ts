// List of supported email domains

export const DOMAINS = [
	{
		owner: "alikuxac",
		domain: "alikuxac.xyz",
	},
] satisfies {
	owner: string;
	domain: string;
}[];

export const DOMAINS_SET = new Set(DOMAINS.map((d) => d.domain));