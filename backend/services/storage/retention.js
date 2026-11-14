export const VIDEO_EXPIRED_MESSAGE =
	"This video has expired. Please upload it again.";
export const EXPORT_EXPIRED_MESSAGE =
	"This export has expired. Please create it again.";

export function hasExpired(expiresAt, now = Date.now()) {
	if (expiresAt === null || expiresAt === undefined) return false;

	const timestamp = typeof expiresAt === "number"
		? expiresAt
		: Date.parse(expiresAt);

	return Number.isFinite(timestamp) && timestamp <= now;
}
