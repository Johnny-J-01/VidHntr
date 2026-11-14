import { supabase } from "./client.js";

const RUNTIME_FIELDS = [
	"filenameBase",
	"width",
	"height",
	"quality",
	"captions",
	"cropMode",
	"formatPreset",
	"progress",
	"outputPath",
	"error",
	"storageStatus",
	"storageError",
	"metrics",
	"driveFileId",
	"driveUploadedAt",
	"expiresAt",
	"localReadyAt",
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
	if (value === null || value === undefined) return null;
	const timestamp = toTimestamp(value);

	return timestamp === null ? null : new Date(timestamp).toISOString();
}

function rememberRuntimeFields(id, exportJob) {
	const next = { ...(runtimeExports.get(id) || {}) };

	for (const field of RUNTIME_FIELDS) {
		if (hasOwn(exportJob, field)) {
			next[field] = exportJob[field];
		}
	}

	runtimeExports.set(id, next);
}

function toExportRecord(row) {
	if (!row) return null;

	return {
		id: row.id,
		videoId: row.video_id,
		userId: row.user_id,
		guestId: row.guest_id,
		start: row.start_time === null ? null : Number(row.start_time),
		end: row.end_time === null ? null : Number(row.end_time),
		status: row.status,
		driveFileId: row.drive_file_id,
		filename: row.filename,
		createdAt: toTimestamp(row.created_at),
		expiresAt: toTimestamp(row.expires_at),
		storageStatus: row.storage_status || "PENDING",
		outputPath: row.output_path || null,
		localReadyAt: toTimestamp(row.local_ready_at),
		driveUploadedAt: toTimestamp(row.drive_uploaded_at),
		storageError: row.storage_error || null,
		filenameBase: row.filename_base || null,
		width: row.width === null || row.width === undefined ? null : Number(row.width),
		height: row.height === null || row.height === undefined ? null : Number(row.height),
		quality: row.quality || "high",
		captions: row.captions || "off",
		cropMode: row.crop_mode || "fill",
		formatPreset: row.format_preset || null,
		progress: row.progress ?? 0,
		error: row.error || null,
		metrics: row.metrics || {},
		...runtimeExports.get(row.id),
	};
}

function toSupabaseExport(exportJob) {
	const createdAt = toTimestamp(exportJob.createdAt) ?? Date.now();

	return {
		id: exportJob.id,
		video_id: exportJob.videoId,
		user_id: exportJob.userId ?? null,
		guest_id: exportJob.guestId ?? null,
		start_time: exportJob.start,
		end_time: exportJob.end,
		status: exportJob.status,
		drive_file_id: exportJob.driveFileId ?? null,
		filename: exportJob.filename ?? null,
		created_at: toIsoTimestamp(createdAt),
		expires_at: toIsoTimestamp(exportJob.expiresAt),
		storage_status: exportJob.storageStatus || "PENDING",
		output_path: exportJob.outputPath ?? null,
		local_ready_at: toIsoTimestamp(exportJob.localReadyAt),
		drive_uploaded_at: toIsoTimestamp(exportJob.driveUploadedAt),
		storage_error: exportJob.storageError ?? null,
		filename_base: exportJob.filenameBase ?? null,
		width: exportJob.width ?? null,
		height: exportJob.height ?? null,
		quality: exportJob.quality ?? "high",
		captions: exportJob.captions ?? "off",
		crop_mode: exportJob.cropMode ?? "fill",
		format_preset: exportJob.formatPreset ?? null,
		progress: exportJob.progress ?? 0,
		error: exportJob.error ?? null,
		metrics: exportJob.metrics || {},
	};
}

function toSupabasePatch(patch) {
	const columnByField = {
		videoId: "video_id",
		userId: "user_id",
		guestId: "guest_id",
		start: "start_time",
		end: "end_time",
		status: "status",
		driveFileId: "drive_file_id",
		filename: "filename",
		storageStatus: "storage_status",
		outputPath: "output_path",
		storageError: "storage_error",
		filenameBase: "filename_base",
		width: "width",
		height: "height",
		quality: "quality",
		captions: "captions",
		cropMode: "crop_mode",
		formatPreset: "format_preset",
		progress: "progress",
		error: "error",
		metrics: "metrics",
	};

	const update = {};

	for (const [field, column] of Object.entries(columnByField)) {
		if (hasOwn(patch, field)) {
			update[column] = patch[field];
		}
	}

	for (const [field, column] of Object.entries({
		createdAt: "created_at",
		expiresAt: "expires_at",
		localReadyAt: "local_ready_at",
		driveUploadedAt: "drive_uploaded_at",
	})) {
		if (hasOwn(patch, field)) {
			update[column] = toIsoTimestamp(patch[field]);
		}
	}

	return update;
}

async function upsertExport(exportJob) {
	const payload = toSupabaseExport(exportJob);
	const { data, error } = await supabase
		.from("exports")
		.upsert(payload)
		.select()
		.single();

	if (error) throw error;
	rememberRuntimeFields(exportJob.id, exportJob);
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

async function listExportsByVideoId(videoId) {
	const { data, error } = await supabase
		.from("exports")
		.select()
		.eq("video_id", videoId)
		.order("created_at", { ascending: false });

	if (error) throw error;

	return (data || []).map(toExportRecord);
}

async function deleteExport(id) {
	const { error } = await supabase.from("exports").delete().eq("id", id);
	if (error) throw error;
}

async function patchExport(id, patch, { allowedStatuses } = {}) {
	const update = toSupabasePatch(patch);

	if (Object.keys(update).length === 0) return getExport(id);

	let query = supabase.from("exports").update(update).eq("id", id);
	if (allowedStatuses) query = query.in("status", allowedStatuses);
	const { data, error } = await query.select().maybeSingle();
	if (error) throw error;
	if (data) rememberRuntimeFields(id, patch);
	return toExportRecord(data);
}

// Call only after Drive returns a file ID. Keep its confirmation while a
// database finalization is retried, without presenting failed writes as stored.
function rememberExportDriveConfirmation(id, confirmation) {
	rememberRuntimeFields(id, { ...confirmation, storageStatus: "FINALIZING" });
}

function clearRuntimeExport(id) {
	runtimeExports.delete(id);
}

export {
	upsertExport,
	getExport,
	listExportsByVideoId,
	deleteExport,
	patchExport,
	rememberExportDriveConfirmation,
	clearRuntimeExport,
};
