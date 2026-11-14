import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-secret-key-12345";
process.env.GOOGLE_TOKEN_JSON = JSON.stringify({
	access_token: "mock-token",
	refresh_token: "mock-refresh",
});

const { google } = await import("googleapis");
const { supabase } = await import("../db/client.js");
const { createPlaybackTicket, verifyPlaybackTicket } = await import(
	"../services/video/playback-auth.js"
);
const {
	acquireFileLock,
	isFileLocked,
	releaseFileLock,
	safeDeleteLocalOriginal,
} = await import("../services/video/file-locks.js");
const { checkAndFinalizeVideo } = await import(
	"../services/video/upload-processing.js"
);
const {
	getExportWorkDir,
	deleteExportWorkDir,
} = await import("../services/export/export-files.js");
const { getVideoFile } = await import(
	"../controllers/video/video-query.controller.js"
);
const { recoverInterruptedJobs } = await import(
	"../services/storage/recovery.js"
);
const videoStore = await import("../db/videos.js");

const TEST_VIDEO_ID = "55555555-5555-5555-5555-555555555555";
const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

function createMockQuery(state, table) {
	let operation = "read";
	let update = null;
	const filters = [];

	function filteredRows() {
		return (state[table] || []).filter((row) =>
			filters.every(([column, value]) => row[column] === value),
		);
	}

	function execute() {
		if (operation === "update") {
			const rows = filteredRows();
			for (const row of rows) Object.assign(row, update);
			return { data: rows, error: null };
		}
		if (operation === "delete") {
			const removed = new Set(filteredRows());
			state[table] = (state[table] || []).filter((row) => !removed.has(row));
			return { data: null, error: null };
		}
		return { data: filteredRows(), error: null };
	}

	return {
		select() {
			return this;
		},
		update(value) {
			operation = "update";
			update = value;
			return this;
		},
		delete() {
			operation = "delete";
			return this;
		},
		eq(column, value) {
			filters.push([column, value]);
			return this;
		},
		order() {
			return this;
		},
		maybeSingle() {
			const result = execute();
			return Promise.resolve({ ...result, data: result.data?.[0] || null });
		},
		single() {
			const result = execute();
			return Promise.resolve({ ...result, data: result.data?.[0] || null });
		},
		then(resolve, reject) {
			return Promise.resolve(execute()).then(resolve, reject);
		},
	};
}

test("playback ticket generates valid HMAC signature and verifies correctly", () => {
	const ticket = createPlaybackTicket({
		videoId: TEST_VIDEO_ID,
		userId: TEST_USER_ID,
		guestId: null,
		ttlSeconds: 60,
	});

	assert.ok(ticket);
	const verified = verifyPlaybackTicket(ticket, TEST_VIDEO_ID);
	assert.ok(verified);
	assert.equal(verified.videoId, TEST_VIDEO_ID);
	assert.equal(verified.userId, TEST_USER_ID);
	assert.equal(verified.guestId, null);

	// Rejects mismatching video ID
	assert.equal(verifyPlaybackTicket(ticket, "other-video-id"), null);

	// Rejects tampered ticket
	const tampered = ticket.slice(0, -3) + "xyz";
	assert.equal(verifyPlaybackTicket(tampered, TEST_VIDEO_ID), null);

	// Rejects expired ticket
	const expiredTicket = createPlaybackTicket({
		videoId: TEST_VIDEO_ID,
		userId: TEST_USER_ID,
		guestId: null,
		ttlSeconds: -10,
	});
	assert.equal(verifyPlaybackTicket(expiredTicket, TEST_VIDEO_ID), null);
});

test("file locks prevent premature deletion while files are actively in use", async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vidhntr-lock-test-"));
	const testFile = path.join(tempDir, "sample.mp4");
	fs.writeFileSync(testFile, "test-video-content");

	assert.equal(isFileLocked(testFile), false);

	// Acquire lock
	acquireFileLock(testFile);
	assert.equal(isFileLocked(testFile), true);

	// safeDeleteLocalOriginal must NOT delete while locked
	const deleteAttempt1 = await safeDeleteLocalOriginal(testFile);
	assert.equal(deleteAttempt1, false);
	assert.equal(fs.existsSync(testFile), true);

	// Release lock and delete
	releaseFileLock(testFile);
	assert.equal(isFileLocked(testFile), false);

	const deleteAttempt2 = await safeDeleteLocalOriginal(testFile);
	assert.equal(deleteAttempt2, true);
	assert.equal(fs.existsSync(testFile), false);

	fs.rmSync(tempDir, { recursive: true, force: true });
});

test("checkAndFinalizeVideo marks READY only when all conditions are satisfied", async () => {
	const state = {
		videos: [{
			id: TEST_VIDEO_ID,
			user_id: TEST_USER_ID,
			guest_id: null,
			source_type: "upload",
			status: "PROCESSING",
			storage_status: "UPLOADING",
			transcription_status: "PROCESSING",
			thumbnail_status: "PENDING",
			duration: null,
			drive_file_id: null,
			thumbnail_file_id: null,
			transcript: null,
			created_at: "2026-11-10T10:00:00.000Z",
			expires_at: null,
		}],
	};

	const originalFrom = supabase.from;
	supabase.from = (table) => createMockQuery(state, table);

	try {
		// Attempt 1: Incomplete -> Not ready
		await checkAndFinalizeVideo(TEST_VIDEO_ID);
		let video = await videoStore.getVideo(TEST_VIDEO_ID);
		assert.notEqual(video.status, "READY");

		// Attempt 2: Drive complete, transcription pending -> Not ready
		await videoStore.patchVideo(TEST_VIDEO_ID, {
			storageStatus: "STORED",
			driveFileId: "drive-original-123",
			duration: 60,
		});
		await checkAndFinalizeVideo(TEST_VIDEO_ID);
		video = await videoStore.getVideo(TEST_VIDEO_ID);
		assert.notEqual(video.status, "READY");

		// Attempt 3: Drive & transcription complete, thumbnail pending -> Not ready
		await videoStore.patchVideo(TEST_VIDEO_ID, {
			transcriptionStatus: "COMPLETED",
			transcript: [{ start: 0, end: 5, text: "Hello" }],
		});
		await checkAndFinalizeVideo(TEST_VIDEO_ID);
		video = await videoStore.getVideo(TEST_VIDEO_ID);
		assert.notEqual(video.status, "READY");

		// Attempt 4: All required operations complete -> Transitions to READY!
		await videoStore.patchVideo(TEST_VIDEO_ID, {
			thumbnailStatus: "STORED",
			thumbnailFileId: "drive-thumb-456",
		});
		await checkAndFinalizeVideo(TEST_VIDEO_ID);
		video = await videoStore.getVideo(TEST_VIDEO_ID);
		assert.equal(video.status, "READY");
		assert.equal(video.progress, 100);
	} finally {
		supabase.from = originalFrom;
	}
});

test("export creates isolated working directory and cleans it up completely", () => {
	const exportId = "exp-isolated-dir-test";
	const workDir = getExportWorkDir(exportId);

	assert.ok(fs.existsSync(workDir));

	const testSrt = path.join(workDir, `${exportId}.srt`);
	const testOut = path.join(workDir, `${exportId}_output.mp4`);
	fs.writeFileSync(testSrt, "1\n00:00:01,000 --> 00:00:02,000\nHi");
	fs.writeFileSync(testOut, "fake-mp4-data");

	assert.ok(fs.existsSync(testSrt));
	assert.ok(fs.existsSync(testOut));

	deleteExportWorkDir(exportId);
	assert.equal(fs.existsSync(workDir), false);
});

test("HTTP Range header parsing validates and responds with 206 Partial Content", async () => {
	let capturedStatus = null;
	let capturedHeaders = {};

	const mockResponse = {
		status(code) {
			capturedStatus = code;
			return this;
		},
		writeHead(code, headers) {
			capturedStatus = code;
			capturedHeaders = headers;
			this.headersSent = true;
			return this;
		},
		setHeader(k, v) {
			capturedHeaders[k] = v;
			return this;
		},
		write() {
			return true;
		},
		end() {
			return this;
		},
		type() {
			return this;
		},
		destroy() {},
		on() {
			return this;
		},
		pipe() {
			return this;
		},
	};

	const state = {
		videos: [{
			id: TEST_VIDEO_ID,
			user_id: TEST_USER_ID,
			guest_id: null,
			source_type: "upload",
			status: "READY",
			storage_status: "STORED",
			drive_file_id: "mock-drive-id",
			created_at: "2026-11-10T10:00:00.000Z",
			expires_at: new Date(Date.now() + 60000).toISOString(),
		}],
	};

	const originalFrom = supabase.from;
	supabase.from = (table) => createMockQuery(state, table);

	const originalDrive = google.drive;
	google.drive = (opts) => ({
		files: {
			get: async ({ fileId, alt }) => {
				if (alt === "media") {
					const { Readable } = await import("node:stream");
					return { data: Readable.from(Buffer.alloc(100)) };
				}
				return { data: { id: fileId, size: "1000", mimeType: "video/mp4" } };
			},
		},
	});

	// Ensure auth client is mocked
	const authModule = await import("../services/google/auth.js");
	const originalGetAuth = authModule.getAuthenticatedClient;
	authModule.oauth2Client.setCredentials({ access_token: "mock-token" });

	try {
		// Valid range request
		const validRequest = {
			params: { id: TEST_VIDEO_ID },
			query: {},
			headers: { range: "bytes=0-499" },
			user: { id: TEST_USER_ID },
		};

		await getVideoFile(validRequest, mockResponse);
		assert.equal(capturedStatus, 206);
		assert.equal(capturedHeaders["Content-Range"], "bytes 0-499/1000");
		assert.equal(capturedHeaders["Content-Length"], 500);
		assert.equal(capturedHeaders["Accept-Ranges"], "bytes");

		// Suffix range request (last 200 bytes)
		const suffixRequest = {
			params: { id: TEST_VIDEO_ID },
			query: {},
			headers: { range: "bytes=-200" },
			user: { id: TEST_USER_ID },
		};

		await getVideoFile(suffixRequest, mockResponse);
		assert.equal(capturedStatus, 206);
		assert.equal(capturedHeaders["Content-Range"], "bytes 800-999/1000");
		assert.equal(capturedHeaders["Content-Length"], 200);

		// Invalid range request (out of bounds)
		const invalidRequest = {
			params: { id: TEST_VIDEO_ID },
			query: {},
			headers: { range: "bytes=1500-2000" },
			user: { id: TEST_USER_ID },
		};

		await getVideoFile(invalidRequest, mockResponse);
		assert.equal(capturedStatus, 416);
		assert.equal(capturedHeaders["Content-Range"], "bytes */1000");
	} finally {
		supabase.from = originalFrom;
		google.drive = originalDrive;
	}
});

test("recoverInterruptedJobs detects incomplete work and safely reconciles on startup", async () => {
	const state = {
		videos: [{
			id: "recovered-video-drive",
			user_id: TEST_USER_ID,
			source_type: "upload",
			status: "PROCESSING",
			storage_status: "UPLOADING",
			drive_file_id: "drive-confirmed-file-id",
			transcript_file_id: "transcript-id",
			thumbnail_file_id: "thumb-id",
			expires_at: new Date(Date.now() + 3600000).toISOString(),
		}],
		exports: [{
			id: "recovered-export-drive",
			video_id: "recovered-video-drive",
			status: "PROCESSING",
			drive_file_id: "drive-export-id",
		}],
	};

	const originalFrom = supabase.from;
	supabase.from = (table) => {
		return {
			select() {
				return this;
			},
			not() {
				return Promise.resolve({ data: state[table] || [], error: null });
			},
			in() {
				return Promise.resolve({ data: state[table] || [], error: null });
			},
			update(patch) {
				for (const row of state[table] || []) {
					Object.assign(row, patch);
				}
				return this;
			},
			eq() {
				return this;
			},
			maybeSingle() {
				return Promise.resolve({ data: state[table]?.[0] || null, error: null });
			},
		};
	};

	try {
		await recoverInterruptedJobs();
		// Interrupted export with confirmed drive_file_id is reconciled and marked READY
		assert.equal(state.exports[0].status, "READY");
	} finally {
		supabase.from = originalFrom;
	}
});
