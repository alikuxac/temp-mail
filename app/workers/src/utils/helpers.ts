/**
 * Get current timestamp in seconds
 */
export function now() {
	return Math.floor(Date.now() / 1000);
}

export function generateUsername() {
<<<<<<< HEAD
<<<<<<< HEAD
	return crypto.randomUUID().replace(/-/g, "").substring(0, 10);
=======
	return Math.random().toString(36).substring(2, 12);
>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
	return crypto.randomUUID().replace(/-/g, "").substring(0, 10);
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
}