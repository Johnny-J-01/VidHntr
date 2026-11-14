import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-key";

const { supabase } = await import("../db/client.js");
const { listVideos } = await import("../db/videos.js");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const GUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function createVideoRow(id) {
	return {
		id,
		user_id: null,
		guest_id: null,
		source_type: "upload",
		status: "READY",
		progress: 100,
		created_at: "2026-01-01T00:00:00.000Z",
		expires_at: null,
	};
}

function createQueryStub(rows) {
	const filters = [];
	const query = {
		select() {
			return this;
		},
		order() {
			return this;
		},
		eq(column, value) {
			filters.push(["eq", column, value]);
			return this;
		},
		is(column, value) {
			filters.push(["is", column, value]);
			return this;
		},
		then(resolve, reject) {
			return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
		},
	};

	return { query, filters };
}

async function mockVideoQuery(rows, run) {
	const originalFrom = supabase.from;
	const { query, filters } = createQueryStub(rows);
	const tables = [];

	supabase.from = (table) => {
		tables.push(table);
		return query;
	};

	try {
		const result = await run();
		return { result, filters, tables };
	} finally {
		supabase.from = originalFrom;
	}
}

test("listVideos filters authenticated users by user_id in Supabase", async () => {
	const { result, filters, tables } = await mockVideoQuery(
		[createVideoRow("user-video")],
		() => listVideos({ userId: USER_ID, guestId: null }),
	);

	assert.deepEqual(tables, ["videos"]);
	assert.deepEqual(filters, [
		["eq", "user_id", USER_ID],
		["is", "guest_id", null],
	]);
	assert.deepEqual(result.map((video) => video.id), ["user-video"]);
});

test("listVideos filters guests by guest_id in Supabase", async () => {
	const { result, filters, tables } = await mockVideoQuery(
		[createVideoRow("guest-video")],
		() => listVideos({ userId: null, guestId: GUEST_ID }),
	);

	assert.deepEqual(tables, ["videos"]);
	assert.deepEqual(filters, [
		["is", "user_id", null],
		["eq", "guest_id", GUEST_ID],
	]);
	assert.deepEqual(result.map((video) => video.id), ["guest-video"]);
});

test("listVideos returns no rows when no verified owner is available", async () => {
	const originalFrom = supabase.from;
	let queryStarted = false;
	supabase.from = () => {
		queryStarted = true;
		return createQueryStub([]).query;
	};

	try {
		assert.deepEqual(await listVideos(), []);
		assert.deepEqual(await listVideos({ userId: null, guestId: null }), []);
		assert.equal(queryStarted, false);
	} finally {
		supabase.from = originalFrom;
	}
});
