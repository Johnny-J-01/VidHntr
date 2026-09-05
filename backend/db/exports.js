import { supabase } from "./client.js";

const GUEST_DATA_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RUNTIME_FIELDS = [
	"filenameBase",
	"width",
	"height",
	"quality",
	"captions",
	"cropMode",
	"progress",
	"outputPath",
	"error",
];
const runtimeExports = new Map();

function hasOwn(object, property) {
	return Object.prototype.hasOwnProperty.call(object, property);
}

function toTimestamp(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function toIsoTimestamp(value) {
	const timestamp = toTimestamp(value);
	return timestamp === null ? null : new Date(timestamp).toISOString();
}

function rememberRuntimeFields(id, exportJob) {
	const next = { ...(runtimeExports.get(id) || {}) };
	for (const field of RUNTIME_FIELDS) {
		if (hasOwn(exportJob, field)) next[field] = exportJob[field];
	}
	runtimeExports.set(id, next);
}

function toExportRecord(row) {
	if (!row) return null;
	return {
		id: row.id,
		videoId: row.video_id,
		userId: row.user_id,
		start: row.start_time === null ? null : Number(row.start_time),
		end: row.end_time === null ? null : Number(row.end_time),
		status: row.status,
		driveFileId: row.drive_file_id,
		filename: row.filename,
		createdAt: toTimestamp(row.created_at),
		expiresAt: toTimestamp(row.expires_at),
		...runtimeExports.get(row.id),
	};
}

function toSupabaseExport(exportJob) {
	const createdAt = toTimestamp(exportJob.createdAt) ?? Date.now();
	return {
		id: exportJob.id,
		video_id: exportJob.videoId,
		user_id: exportJob.userId ?? null,
		start_time: exportJob.start,
		end_time: exportJob.end,
		status: exportJob.status,
		drive_file_id: exportJob.driveFileId ?? null,
		filename: exportJob.filename ?? null,
		created_at: toIsoTimestamp(createdAt),
		expires_at: toIsoTimestamp(
			exportJob.expiresAt ?? createdAt + GUEST_DATA_LIFETIME_MS,
		),
	};
}

function toSupabasePatch(patch) {
	const columnByField = {
		videoId: "video_id",
		userId: "user_id",
		start: "start_time",
		end: "end_time",
		status: "status",
		driveFileId: "drive_file_id",
		filename: "filename",
	};
	const update = {};
	for (const [field, column] of Object.entries(columnByField)) {
		if (hasOwn(patch, field)) update[column] = patch[field];
	}
	if (hasOwn(patch, "createdAt"))
		update.created_at = toIsoTimestamp(patch.createdAt);
	if (hasOwn(patch, "expiresAt"))
		update.expires_at = toIsoTimestamp(patch.expiresAt);
	return update;
}

async function upsertExport(exportJob) {
	rememberRuntimeFields(exportJob.id, exportJob);
	const { data, error } = await supabase
		.from("exports")
		.upsert(toSupabaseExport(exportJob))
		.select()
		.single();
	if (error) throw error;
	return toExportRecord(data);
}

async function getExport(id) {
	const { data, error } = await supabase
		.from("exports")
		.select()
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	return toExportRecord(data);
}

async function patchExport(id, patch) {
	rememberRuntimeFields(id, patch);
	const update = toSupabasePatch(patch);
	if (Object.keys(update).length === 0) return getExport(id);
	const { data, error } = await supabase
		.from("exports")
		.update(update)
		.eq("id", id)
		.select()
		.maybeSingle();
	if (error) throw error;
	return toExportRecord(data);
}

export { upsertExport, getExport, patchExport };
