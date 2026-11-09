import assert from "node:assert/strict";
import test from "node:test";

import {
	canAccessExport,
	canAccessVideo,
	canDeleteVideo,
	requireVideoAccess,
} from "../controllers/video/video-helpers.js";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const GUEST_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GUEST_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VIDEO_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_VIDEO_ID = "44444444-4444-4444-4444-444444444444";

function authenticatedRequest(userId = USER_A) {
	return { user: { id: userId }, guestId: GUEST_A };
}

function guestRequest(guestId = GUEST_A) {
	return { user: null, guestId };
}

function userVideo() {
	return { id: VIDEO_ID, userId: USER_A, guestId: null };
}

function guestVideo() {
	return { id: VIDEO_ID, userId: null, guestId: GUEST_A };
}

function createResponse() {
	return {
		statusCode: null,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
}

test("authenticated videos are accessible only to their authenticated owner", () => {
	const video = userVideo();

	assert.equal(canAccessVideo(authenticatedRequest(USER_A), video), true);
	assert.equal(canAccessVideo(authenticatedRequest(USER_B), video), false);
	assert.equal(canAccessVideo(guestRequest(GUEST_A), video), false);
	assert.equal(canAccessVideo({ user: null, guestId: null }, video), false);
});

test("guest videos are accessible only to the matching guest identity", () => {
	const video = guestVideo();

	assert.equal(canAccessVideo(guestRequest(GUEST_A), video), true);
	assert.equal(canAccessVideo(guestRequest(GUEST_B), video), false);
	assert.equal(canAccessVideo(guestRequest(null), video), false);
});

test("authenticated users cannot access guest videos even with the same guest cookie", () => {
	const video = guestVideo();

	assert.equal(canAccessVideo(authenticatedRequest(USER_A), video), false);
	assert.equal(canAccessVideo(authenticatedRequest(USER_B), video), false);
});

test("videos without a verified owner are not publicly accessible", () => {
	const video = { id: VIDEO_ID, userId: null, guestId: null };

	assert.equal(canAccessVideo(authenticatedRequest(USER_A), video), false);
	assert.equal(canAccessVideo(guestRequest(GUEST_A), video), false);
	assert.equal(canAccessVideo(authenticatedRequest(USER_A), null), false);
});

test("video deletion keeps its existing authenticated-owner-only behavior", () => {
	assert.equal(canDeleteVideo(authenticatedRequest(USER_A), userVideo()), true);
	assert.equal(canDeleteVideo(authenticatedRequest(USER_B), userVideo()), false);
	assert.equal(canDeleteVideo(guestRequest(GUEST_A), guestVideo()), false);
	assert.equal(canDeleteVideo(authenticatedRequest(USER_A), guestVideo()), false);
});

test("export access follows the parent video and export ownership", () => {
	const video = userVideo();
	const exportJob = { videoId: VIDEO_ID, userId: USER_A, guestId: null };

	assert.equal(canAccessExport(authenticatedRequest(USER_A), exportJob, video), true);
	assert.equal(canAccessExport(authenticatedRequest(USER_B), exportJob, video), false);
	assert.equal(canAccessExport(guestRequest(GUEST_A), exportJob, video), false);
});

test("guest exports are inaccessible to other guests and authenticated users", () => {
	const video = guestVideo();
	const exportJob = { videoId: VIDEO_ID, userId: null, guestId: GUEST_A };

	assert.equal(canAccessExport(guestRequest(GUEST_A), exportJob, video), true);
	assert.equal(canAccessExport(guestRequest(GUEST_B), exportJob, video), false);
	assert.equal(canAccessExport(authenticatedRequest(USER_A), exportJob, video), false);
});

test("export access rejects mismatched parent videos and ownership records", () => {
	const video = userVideo();

	assert.equal(
		canAccessExport(
			authenticatedRequest(USER_A),
			{ videoId: OTHER_VIDEO_ID, userId: USER_A, guestId: null },
			video,
		),
		false,
	);
	assert.equal(
		canAccessExport(
			authenticatedRequest(USER_A),
			{ videoId: VIDEO_ID, userId: USER_B, guestId: null },
			video,
		),
		false,
	);
	assert.equal(canAccessExport(authenticatedRequest(USER_A), null, video), false);
	assert.equal(canAccessExport(authenticatedRequest(USER_A), { videoId: VIDEO_ID }, null), false);
});

test("requireVideoAccess allows owners without writing an error response", () => {
	const response = createResponse();

	assert.equal(requireVideoAccess(authenticatedRequest(USER_A), response, userVideo()), true);
	assert.equal(requireVideoAccess(guestRequest(GUEST_A), response, guestVideo()), true);
	assert.equal(response.statusCode, null);
	assert.equal(response.body, null);
});

test("requireVideoAccess rejects unauthorized requests without returning video data", () => {
	const response = createResponse();

	assert.equal(requireVideoAccess(authenticatedRequest(USER_B), response, userVideo()), false);
	assert.equal(response.statusCode, 403);
	assert.deepEqual(response.body, { error: "You cannot access this video." });
	assert.equal(Object.hasOwn(response.body, "video"), false);
	assert.equal(Object.hasOwn(response.body, "transcript"), false);
});

test("requireVideoAccess returns 404 only when the video does not exist", () => {
	const response = createResponse();

	assert.equal(requireVideoAccess(authenticatedRequest(USER_A), response, null), false);
	assert.equal(response.statusCode, 404);
	assert.deepEqual(response.body, { error: "Video not found." });
});
