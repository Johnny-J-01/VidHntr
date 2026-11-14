import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-key";
process.env.GOOGLE_TOKEN_JSON ||= "{}";

const { google } = await import("googleapis");
const { supabase } = await import("../db/client.js");
const { deleteVideoCompletely } = await import("../services/storage/cleanup.js");

const VIDEO_ID = "33333333-3333-3333-3333-333333333333";
const EXPORT_ID = "44444444-4444-4444-4444-444444444444";

function createQuery(state, table) {
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
		then(resolve, reject) {
			return Promise.resolve(execute()).then(resolve, reject);
		},
	};
}

test("video deletion is source-first, retry-safe, and preserves the owner folder", async () => {
	const state = {
		videos: [{
			id: VIDEO_ID,
			status: "READY",
			drive_file_id: "source-drive",
			drive_folder_id: "shared-owner-folder",
			metadata_file_id: "metadata-drive",
			transcript_file_id: "transcript-drive",
			thumbnail_file_id: "thumbnail-drive",
		}],
		exports: [{
			id: EXPORT_ID,
			video_id: VIDEO_ID,
			drive_file_id: "export-drive",
			start_time: null,
			end_time: null,
			created_at: "2026-11-10T11:00:00.000Z",
			expires_at: null,
		}],
	};
	const driveDeleted = new Set();
	const failingDriveIds = new Set(["metadata-drive"]);
	const attempts = [];
	const originalFrom = supabase.from;
	const originalDrive = google.drive;

	supabase.from = (table) => createQuery(state, table);
	google.drive = () => ({
		files: {
			delete: async ({ fileId }) => {
				attempts.push(fileId);
				if (failingDriveIds.has(fileId)) {
					throw new Error("simulated Drive failure");
				}
				if (driveDeleted.has(fileId)) {
					const error = new Error("not found");
					error.response = { status: 404 };
					throw error;
				}
				driveDeleted.add(fileId);
				return { data: {} };
			},
		},
	});

	const video = {
		id: VIDEO_ID,
		driveFileId: "source-drive",
		driveFolderId: "shared-owner-folder",
		metadataFileId: "metadata-drive",
		transcriptFileId: "transcript-drive",
		thumbnailFileId: "thumbnail-drive",
	};

	try {
		await assert.rejects(
			deleteVideoCompletely(video),
			/simulated Drive failure/,
		);

		assert.deepEqual(attempts, ["source-drive", "metadata-drive"]);
		assert.equal(state.videos.length, 1);
		assert.equal(state.videos[0].drive_file_id, "source-drive");
		assert.equal(state.videos[0].metadata_file_id, "metadata-drive");
		assert.equal(state.exports.length, 1);

		failingDriveIds.clear();
		await deleteVideoCompletely(video);

		assert.deepEqual(attempts, [
			"source-drive",
			"metadata-drive",
			"source-drive",
			"metadata-drive",
			"transcript-drive",
			"thumbnail-drive",
			"export-drive",
		]);
		assert.equal(attempts.includes("shared-owner-folder"), false);
		assert.equal(state.videos.length, 0);
		assert.equal(state.exports.length, 0);
	} finally {
		supabase.from = originalFrom;
		google.drive = originalDrive;
	}
});
