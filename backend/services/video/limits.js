export const GUEST_VIDEO_LIMIT = 2;
export const AUTH_VIDEO_LIMIT = 3;

export const GUEST_MAX_UPLOAD_SIZE_BYTES = 300 * 1024 * 1024;
export const AUTH_MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export const GUEST_VIDEO_TTL_MS = 60 * 60 * 1000;
export const AUTH_VIDEO_TTL_MS = 24 * 60 * 60 * 1000;
export const EXPORT_TTL_MS = 3 * 60 * 1000;

export function uploadSizeLimitForOwner(userId) {
	return userId ? AUTH_MAX_UPLOAD_SIZE_BYTES : GUEST_MAX_UPLOAD_SIZE_BYTES;
}

export function uploadSizeLimitLabel(maximumSizeBytes) {
	return `${Math.round(maximumSizeBytes / (1024 * 1024))} MB`;
}

export function guestVideoExpiresAt(confirmedAt = Date.now()) {
	return confirmedAt + GUEST_VIDEO_TTL_MS;
}

export function authVideoExpiresAt(confirmedAt = Date.now()) {
	return confirmedAt + AUTH_VIDEO_TTL_MS;
}

export function videoExpiresAtForOwner(userId, confirmedAt = Date.now()) {
	return userId
		? authVideoExpiresAt(confirmedAt)
		: guestVideoExpiresAt(confirmedAt);
}

export function exportExpiresAt(uploadedAt = Date.now()) {
	return uploadedAt + EXPORT_TTL_MS;
}
