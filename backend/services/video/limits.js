const DEFAULT_GUEST_VIDEO_LIMIT = 3;
const DEFAULT_AUTH_VIDEO_LIMIT = 5;
const DEFAULT_GUEST_VIDEO_TTL_HOURS = 3;
const DEFAULT_AUTH_VIDEO_TTL_DAYS = 3;

function positiveInteger(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const GUEST_VIDEO_LIMIT = positiveInteger(process.env.GUEST_VIDEO_LIMIT, DEFAULT_GUEST_VIDEO_LIMIT);
export const AUTH_VIDEO_LIMIT = positiveInteger(process.env.AUTH_VIDEO_LIMIT, DEFAULT_AUTH_VIDEO_LIMIT);

const guestVideoTtlHours = positiveInteger(process.env.GUEST_VIDEO_TTL_HOURS, DEFAULT_GUEST_VIDEO_TTL_HOURS);

export const GUEST_VIDEO_TTL_MS = guestVideoTtlHours * 60 * 60 * 1000;

const authVideoTtlDays = positiveInteger(process.env.AUTH_VIDEO_TTL_DAYS, DEFAULT_AUTH_VIDEO_TTL_DAYS);

export const AUTH_VIDEO_TTL_MS = authVideoTtlDays * 24 * 60 * 60 * 1000;

export function guestVideoExpiresAt(createdAt = Date.now()) {
	return createdAt + GUEST_VIDEO_TTL_MS;
}

export function authVideoExpiresAt(createdAt = Date.now()) {
	return createdAt + AUTH_VIDEO_TTL_MS;
}
