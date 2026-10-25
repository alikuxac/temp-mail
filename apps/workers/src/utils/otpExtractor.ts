/**
 * OTP and Magic Link Extractor
 * Extracts verification codes (4-8 chars) and activation links from email text/html
 */

export interface ExtractedAuthInfo {
	otpCode: string | null;
	magicLink: string | null;
}

const OTP_PATTERNS = [
	// Explicit labels: "code: 123456", "verification code is: 123456", "OTP: 123-456"
	/(?:verification\s*code|security\s*code|login\s*code|one-time\s*password|auth\s*code|otp|pin)\s*(?:is|:|=|-)?\s*["']?([A-Za-z0-9]{4,8})["']?/i,
	// "Your code is 123456"
	/(?:your|the)\s+(?:verification|confirmation|login|security)?\s*code\s+is\s*[:\s]?\s*["']?([A-Za-z0-9]{4,8})["']?/i,
	// Markdown or HTML bolded numeric/alphanumeric code: **123456**, <b>123456</b>, `123456`
	/(?:[*_`<b>]{1,3})([0-9]{4,8}|[A-Z0-9]{5,8})(?:[*_`</b>]{1,3})/,
	// Standalone 4 to 8 digit numbers on their own line or surrounded by spaces near keyword
	/(?:code|verify|confirm)[\s\S]{1,40}?\b([0-9]{4,8})\b/i,
];

const MAGIC_LINK_PATTERNS = [
	/https?:\/\/[^\s"'<>]+(?:activate|confirm|verify|token=|magic-link|auth\/)[^\s"'<>]*/i,
	/<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"'>]+(?:activate|confirm|verify|token=|login)[^"'>]*)["']/i,
];

export function extractOtpAndLinks(
	textContent: string | null,
	htmlContent: string | null,
): ExtractedAuthInfo {
	const contentToScan = `${textContent || ""} \n ${htmlContent || ""}`;
	if (!contentToScan.trim()) {
		return { otpCode: null, magicLink: null };
	}

	let otpCode: string | null = null;
	for (const pattern of OTP_PATTERNS) {
		const match = contentToScan.match(pattern);
		if (match?.[1]) {
			const candidate = match[1].trim();
			// Filter out common false positives like years (1990-2030), common words
			if (candidate.length === 4 && /^20[0-3][0-9]$/.test(candidate)) {
				continue;
			}
			otpCode = candidate;
			break;
		}
	}

	let magicLink: string | null = null;
	for (const pattern of MAGIC_LINK_PATTERNS) {
		const match = contentToScan.match(pattern);
		if (match?.[1]) {
			magicLink = match[1].trim();
			break;
		}
	}

	return { otpCode, magicLink };
}
