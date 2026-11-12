import { createHmac, timingSafeEqual } from "node:crypto";

const guestSecret =
	process.env.GUEST_ID_SECRET ||
	process.env.SUPABASE_SECRET_KEY ||
	"default-secret-key";

function signPayload(payload) {
	return createHmac("sha256", guestSecret).update(payload).digest("base64url");
}

export function createPlaybackTicket({
	videoId,
	userId = null,
	guestId = null,
	ttlSeconds = 3600,
}) {
	const expiresAt = Date.now() + ttlSeconds * 1000;
	const payloadString = `${videoId}:${userId || ""}:${guestId || ""}:${expiresAt}`;
	const encodedPayload = Buffer.from(payloadString, "utf8").toString("base64url");
	const signature = signPayload(payloadString);

	return `${encodedPayload}.${signature}`;
}

export function verifyPlaybackTicket(ticket, expectedVideoId) {
	if (!ticket || typeof ticket !== "string") return null;

	const parts = ticket.split(".");
	if (parts.length !== 2) return null;

	const [encodedPayload, signature] = parts;

	let payloadString;
	try {
		payloadString = Buffer.from(encodedPayload, "base64url").toString("utf8");
	} catch {
		return null;
	}

	const expectedSignature = Buffer.from(signPayload(payloadString));
	const actualSignature = Buffer.from(signature);

	if (
		expectedSignature.length !== actualSignature.length ||
		!timingSafeEqual(expectedSignature, actualSignature)
	) {
		return null;
	}

	const [videoId, userId, guestId, expiresAtStr] = payloadString.split(":");
	const expiresAt = Number(expiresAtStr);

	if (expectedVideoId && videoId !== expectedVideoId) {
		return null;
	}

	if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
		return null;
	}

	return {
		videoId,
		userId: userId || null,
		guestId: guestId || null,
		expiresAt,
	};
}
