const DEFAULT_GUEST_VIDEO_LIMIT = 3;
const DEFAULT_AUTH_VIDEO_LIMIT = 5;
const DEFAULT_GUEST_VIDEO_TTL_HOURS = 24;

function positiveInteger(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const GUEST_VIDEO_LIMIT = positiveInteger(process.env.GUEST_VIDEO_LIMIT, DEFAULT_GUEST_VIDEO_LIMIT);
export const AUTH_VIDEO_LIMIT = positiveInteger(process.env.AUTH_VIDEO_LIMIT, DEFAULT_AUTH_VIDEO_LIMIT);

const guestVideoTtlHours = positiveInteger(process.env.GUEST_VIDEO_TTL_HOURS, DEFAULT_GUEST_VIDEO_TTL_HOURS);

export const GUEST_VIDEO_TTL_MS = guestVideoTtlHours * 60 * 60 * 1000;

export function guestVideoExpiresAt(createdAt = Date.now()) {
	return createdAt + GUEST_VIDEO_TTL_MS;
}
