import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-key";

const { supabase } = await import("../db/client.js");
const { requireExportAccess } = await import("../controllers/export.controller.js");
const { requireVideoAccess } = await import("../controllers/video/video-helpers.js");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const VIDEO_ID = "33333333-3333-3333-3333-333333333333";
const EXPORT_ID = "44444444-4444-4444-4444-444444444444";

function videoRow(expiresAt) {
	return {
		id: VIDEO_ID,
		user_id: USER_ID,
		guest_id: null,
		source_type: "upload",
		status: "READY",
		progress: 100,
		created_at: "2026-11-10T10:00:00.000Z",
		expires_at: expiresAt,
	};
}

function exportRow(expiresAt) {
	return {
		id: EXPORT_ID,
		video_id: VIDEO_ID,
		user_id: USER_ID,
		guest_id: null,
		status: "READY",
		created_at: "2026-11-10T11:00:00.000Z",
		expires_at: expiresAt,
	};
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

async function withDatabase(state, run) {
	const originalFrom = supabase.from;
	supabase.from = (table) => createQuery(state, table);

	try {
		return await run();
	} finally {
		supabase.from = originalFrom;
	}
}

test("expired video access returns the required 410 response and removes the record", async () => {
	const state = {
		videos: [videoRow(new Date(Date.now() - 1000).toISOString())],
		exports: [],
	};
	const response = createResponse();

	await withDatabase(state, async () => {
		const allowed = await requireVideoAccess(
			{ user: { id: USER_ID } },
			response,
			{
				id: VIDEO_ID,
				userId: USER_ID,
				guestId: null,
				expiresAt: Date.now() - 1000,
			},
		);

		assert.equal(allowed, false);
	});

	assert.equal(response.statusCode, 410);
	assert.deepEqual(response.body, {
		error: "This video has expired. Please upload it again.",
		code: "VIDEO_EXPIRED",
	});
	assert.equal(state.videos.length, 0);
});

test("unauthorized access does not clean another owner's expired video", async () => {
	const state = {
		videos: [videoRow(new Date(Date.now() - 1000).toISOString())],
		exports: [],
	};
	const response = createResponse();

	await withDatabase(state, async () => {
		const allowed = await requireVideoAccess(
			{ user: { id: OTHER_USER_ID } },
			response,
			{
				id: VIDEO_ID,
				userId: USER_ID,
				guestId: null,
				expiresAt: Date.now() - 1000,
			},
		);

		assert.equal(allowed, false);
	});

	assert.equal(response.statusCode, 403);
	assert.equal(state.videos.length, 1);
});

test("expired export access returns EXPORT_EXPIRED and deletes only that export", async () => {
	const state = {
		videos: [videoRow(new Date(Date.now() + 60_000).toISOString())],
		exports: [exportRow(new Date(Date.now() - 1000).toISOString())],
	};
	const response = createResponse();
	const exp = {
		id: EXPORT_ID,
		videoId: VIDEO_ID,
		userId: USER_ID,
		guestId: null,
		status: "READY",
		expiresAt: Date.now() - 1000,
	};

	await withDatabase(state, async () => {
		const result = await requireExportAccess(
			{ user: { id: USER_ID } },
			response,
			exp,
		);

		assert.equal(result, null);
	});

	assert.equal(response.statusCode, 410);
	assert.deepEqual(response.body, {
		error: "This export has expired. Please create it again.",
		code: "EXPORT_EXPIRED",
	});
	assert.equal(state.exports.length, 0);
	assert.equal(state.videos.length, 1);
});

test("active export access keeps the existing parent ownership check", async () => {
	const state = {
		videos: [videoRow(new Date(Date.now() + 60_000).toISOString())],
		exports: [exportRow(new Date(Date.now() + 60_000).toISOString())],
	};
	const response = createResponse();
	const exp = {
		id: EXPORT_ID,
		videoId: VIDEO_ID,
		userId: USER_ID,
		guestId: null,
		status: "READY",
		expiresAt: Date.now() + 60_000,
	};

	await withDatabase(state, async () => {
		const result = await requireExportAccess(
			{ user: { id: USER_ID } },
			response,
			exp,
		);

		assert.equal(result.id, VIDEO_ID);
	});

	assert.equal(response.statusCode, null);
	assert.equal(state.exports.length, 1);
});
