

/**
 * Get current timestamp in seconds
 */
export function now() {
	return Math.floor(Date.now() / 1000);
}

export function generateUsername() {
	return Math.random().toString(36).substring(2, 12);
}