/**
 * Get current timestamp in seconds
 */
export function now() {
	return Math.floor(Date.now() / 1000);
}

/**
 * Generate a random username
 */
export function generateUsername() {
	return crypto.randomUUID().replace(/-/g, "").substring(0, 10);
}