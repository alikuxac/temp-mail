import type { Context } from "hono";
import { env } from "cloudflare:workers";
import { ERR } from "@/utils/http";
import { getDomain } from "@/utils/mail";

/**
 * Middleware to validate domain
 */
const validateDomain = async (c: Context, next: () => Promise<void>) => {
	const emailAddress = c.req.param("emailAddress");

	if (emailAddress) {
		const domain = getDomain(emailAddress);

		if (env.DOMAIN !== domain) {
			return c.json(
				ERR("Domain not supported", "DomainError"),
				404,
			);
		}
	}

	await next();
};

export default validateDomain;
