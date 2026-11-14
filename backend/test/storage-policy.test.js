import assert from "node:assert/strict";
import test from "node:test";

import { getOwnerStorageIdentity } from "../services/google/folders.js";
import {
	EXPORT_EXPIRED_MESSAGE,
	hasExpired,
	VIDEO_EXPIRED_MESSAGE,
} from "../services/storage/retention.js";
import {
	AUTH_MAX_UPLOAD_SIZE_BYTES,
	AUTH_VIDEO_LIMIT,
	AUTH_VIDEO_TTL_MS,
	EXPORT_TTL_MS,
	GUEST_MAX_UPLOAD_SIZE_BYTES,
	GUEST_VIDEO_LIMIT,
	GUEST_VIDEO_TTL_MS,
	exportExpiresAt,
	uploadSizeLimitForOwner,
	videoExpiresAtForOwner,
} from "../services/video/limits.js";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-key";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const GUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VIDEO_ID = "33333333-3333-3333-3333-333333333333";

test("storage policy uses the required owner limits and retention periods", () => {
	assert.equal(GUEST_VIDEO_LIMIT, 2);
	assert.equal(AUTH_VIDEO_LIMIT, 3);
	assert.equal(GUEST_MAX_UPLOAD_SIZE_BYTES, 300 * 1024 * 1024);
	assert.equal(AUTH_MAX_UPLOAD_SIZE_BYTES, 500 * 1024 * 1024);
	assert.equal(GUEST_VIDEO_TTL_MS, 60 * 60 * 1000);
	assert.equal(AUTH_VIDEO_TTL_MS, 24 * 60 * 60 * 1000);
	assert.equal(EXPORT_TTL_MS, 3 * 60 * 1000);
	assert.equal(uploadSizeLimitForOwner(null), GUEST_MAX_UPLOAD_SIZE_BYTES);
	assert.equal(uploadSizeLimitForOwner(USER_ID), AUTH_MAX_UPLOAD_SIZE_BYTES);
});

test("video and export retention starts at the supplied confirmation timestamp", () => {
	const confirmedAt = Date.parse("2026-11-10T12:00:00.000Z");

	assert.equal(
		videoExpiresAtForOwner(null, confirmedAt),
		confirmedAt + GUEST_VIDEO_TTL_MS,
	);
	assert.equal(
		videoExpiresAtForOwner(USER_ID, confirmedAt),
		confirmedAt + AUTH_VIDEO_TTL_MS,
	);
	assert.equal(exportExpiresAt(confirmedAt), confirmedAt + EXPORT_TTL_MS);
});

test("expiry checks reject past timestamps but not active reservations", () => {
	const now = Date.parse("2026-11-10T12:00:00.000Z");

	assert.equal(hasExpired(null, now), false);
	assert.equal(hasExpired(undefined, now), false);
	assert.equal(hasExpired(now + 1, now), false);
	assert.equal(hasExpired(now, now), true);
	assert.equal(hasExpired(new Date(now - 1).toISOString(), now), true);
	assert.equal(VIDEO_EXPIRED_MESSAGE, "This video has expired. Please upload it again.");
	assert.equal(EXPORT_EXPIRED_MESSAGE, "This export has expired. Please create it again.");
});

test("Drive owner mapping separates authenticated users and guests", () => {
	assert.deepEqual(
		getOwnerStorageIdentity({ id: VIDEO_ID, userId: USER_ID }),
		{ groupName: "AUTHENTICATED USERS", ownerId: USER_ID },
	);
	assert.deepEqual(
		getOwnerStorageIdentity({ id: VIDEO_ID, guestId: GUEST_ID }),
		{ groupName: "GUEST USERS", ownerId: GUEST_ID },
	);
	assert.throws(
		() => getOwnerStorageIdentity({ id: VIDEO_ID }),
		/verified video owner/,
	);
});

test("video reservations preserve null expiry and fixed database limits", async () => {
	const { supabase } = await import("../db/client.js");
	const { reserveVideoSlot } = await import("../db/videos.js");
	const originalRpc = supabase.rpc;
	let invocation = null;

	supabase.rpc = async (name, parameters) => {
		invocation = { name, parameters };
		return { data: [{ allowed: true, video_limit: 2, active_count: 1 }], error: null };
	};

	try {
		const result = await reserveVideoSlot({
			id: VIDEO_ID,
			userId: null,
			guestId: GUEST_ID,
			sourceType: "upload",
			expiresAt: null,
		});

		assert.equal(result.allowed, true);
		assert.equal(invocation.name, "reserve_video_slot");
		assert.equal(invocation.parameters.p_expires_at, null);
		assert.equal(invocation.parameters.p_guest_limit, 2);
		assert.equal(invocation.parameters.p_auth_limit, 3);
		assert.equal(invocation.parameters.p_user_id, null);
		assert.equal(invocation.parameters.p_guest_id, GUEST_ID);
	} finally {
		supabase.rpc = originalRpc;
	}
});
