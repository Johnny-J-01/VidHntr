import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { supabase } from "./client.js";
import { AUTH_VIDEO_LIMIT, GUEST_VIDEO_LIMIT } from "../services/video/limits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "storage");

const LOCAL_DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	audio: path.join(STORAGE, "audio"),
	thumbnails: path.join(STORAGE, "thumbnails"),
	transcripts: path.join(STORAGE, "transcripts"),
};

const LOCAL_RUNTIME_FIELDS = [
	"filePath",
	"audioPath",
	"thumbnailPath",
	"transcriptPath",
];

const runtimePaths = new Map();

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

function findLocalFile(directory, id, extension = null) {
	if (!directory || !id || !fs.existsSync(directory)) {
		return null;
	}

	if (extension) {
		const exactPath = path.join(directory, `${id}${extension}`);

		return fs.existsSync(exactPath) ? exactPath : null;
	}

	const filename = fs.readdirSync(directory).find((name) => {
		return name.startsWith(`${id}.`);
	});

	return filename ? path.join(directory, filename) : null;
}

function recoverRuntimePaths(id, sourceType) {
	const recovered = {};

	if (sourceType === "upload") {
		const filePath = findLocalFile(LOCAL_DIRS.uploads, id);

		if (filePath) {
			recovered.filePath = filePath;
		}
	}

	const thumbnailPath = findLocalFile(
		LOCAL_DIRS.thumbnails,
		id,
		".jpg",
	);

	if (thumbnailPath) {
		recovered.thumbnailPath = thumbnailPath;
	}

	const audioPath = findLocalFile(LOCAL_DIRS.audio, id);

	if (audioPath) {
		recovered.audioPath = audioPath;
	}

	const transcriptPath = findLocalFile(
		LOCAL_DIRS.transcripts,
		id,
	);

	if (transcriptPath) {
		recovered.transcriptPath = transcriptPath;
	}

	return recovered;
}

function rememberRuntimePaths(id, video) {
	const current = runtimePaths.get(id) || {};
	const recovered = recoverRuntimePaths(id, video.sourceType);

	const next = {
		...recovered,
		...current,
	};

	for (const field of LOCAL_RUNTIME_FIELDS) {
		if (hasOwn(video, field)) {
			next[field] = video[field];
		}
	}

	for (const field of LOCAL_RUNTIME_FIELDS) {
		if (
			next[field] &&
			!fs.existsSync(next[field])
		) {
			delete next[field];
		}
	}

	runtimePaths.set(id, next);
}

function getRuntimePaths(id, sourceType) {
	const current = runtimePaths.get(id) || {};
	const recovered = recoverRuntimePaths(id, sourceType);

	const next = {
		...recovered,
		...current,
	};

	for (const field of LOCAL_RUNTIME_FIELDS) {
		if (
			next[field] &&
			!fs.existsSync(next[field])
		) {
			delete next[field];
		}
	}

	runtimePaths.set(id, next);

	return next;
}

function toVideoRecord(row) {
	if (!row) return null;

	const runtime = getRuntimePaths(
		row.id,
		row.source_type,
	);

	return {
		id: row.id,
		userId: row.user_id,
		guestId: row.guest_id,
		title: row.title,
		sourceType: row.source_type,
		sourceUrl: row.source_url,
		youtubeId: row.youtube_id,
		filename: row.filename,
		duration: row.duration === null ? null : Number(row.duration),
		status: row.status,
		progress: row.progress,
		transcript: row.transcript,
		error: row.error,
		createdAt: toTimestamp(row.created_at),
		expiresAt: toTimestamp(row.expires_at),
		driveFileId: row.drive_file_id,
		driveFolderId: row.drive_folder_id,
		thumbnailFileId: row.thumbnail_file_id,
		transcriptFileId: row.transcript_file_id,
		...runtime,
	};
}

function toSupabaseVideo(video) {
	const createdAt = toTimestamp(video.createdAt) ?? Date.now();

	return {
		id: video.id,
		user_id: video.userId ?? null,
		guest_id: video.guestId ?? null,
		source_type: video.sourceType,
		source_url: video.sourceUrl ?? null,
		filename: video.filename ?? null,
		title: video.title ?? null,
		duration: video.duration ?? null,
		status: video.status,
		progress: video.progress ?? 0,
		drive_file_id: video.driveFileId ?? null,
		drive_folder_id: video.driveFolderId ?? null,
		thumbnail_file_id: video.thumbnailFileId ?? null,
		transcript_file_id: video.transcriptFileId ?? null,
		youtube_id: video.youtubeId ?? null,
		transcript: video.transcript ?? null,
		error: video.error ?? null,
		created_at: toIsoTimestamp(createdAt),
		expires_at: toIsoTimestamp(video.expiresAt ?? null),
	};
}

function toSupabasePatch(patch) {
	const columnByField = {
		userId: "user_id",
		guestId: "guest_id",
		sourceType: "source_type",
		sourceUrl: "source_url",
		filename: "filename",
		title: "title",
		duration: "duration",
		status: "status",
		progress: "progress",
		driveFileId: "drive_file_id",
		driveFolderId: "drive_folder_id",
		thumbnailFileId: "thumbnail_file_id",
		transcriptFileId: "transcript_file_id",
		youtubeId: "youtube_id",
		transcript: "transcript",
		error: "error",
	};

	const update = {};

	for (const [field, column] of Object.entries(columnByField)) {
		if (hasOwn(patch, field)) {
			update[column] = patch[field];
		}
	}

	if (hasOwn(patch, "createdAt")) {
		update.created_at = toIsoTimestamp(patch.createdAt);
	}

	if (hasOwn(patch, "expiresAt")) {
		update.expires_at = toIsoTimestamp(patch.expiresAt);
	}

	return update;
}

async function upsertVideo(video) {
	rememberRuntimePaths(video.id, video);

	const { data, error } = await supabase
		.from("videos")
		.upsert(toSupabaseVideo(video))
		.select()
		.single();

	if (error) throw error;

	return toVideoRecord(data);
}

async function reserveVideoSlot({ id, userId, guestId, sourceType, expiresAt }) {
	const { data, error } = await supabase.rpc("reserve_video_slot", {
		p_video_id: id,
		p_user_id: userId ?? null,
		p_guest_id: guestId ?? null,
		p_source_type: sourceType,
		p_expires_at: toIsoTimestamp(expiresAt),
		p_guest_limit: GUEST_VIDEO_LIMIT,
		p_auth_limit: AUTH_VIDEO_LIMIT,
	});

	if (error) throw error;
	return data?.[0] || null;
}

async function deleteVideo(id) {
	const { error } = await supabase.from("videos").delete().eq("id", id);
	if (error) throw error;
}

async function getVideo(id) {
	const { data, error } = await supabase
		.from("videos")
		.select()
		.eq("id", id)
		.maybeSingle();

	if (error) throw error;

	return toVideoRecord(data);
}

async function listVideos() {
	const { data, error } = await supabase
		.from("videos")
		.select()
		.order("created_at", { ascending: false });

	if (error) throw error;

	return (data || []).map(toVideoRecord);
}

async function patchVideo(id, patch) {
	const current = runtimePaths.get(id) || {};
	const next = {
		...current,
	};

	if (hasOwn(patch, "sourceType")) {
		const recovered = recoverRuntimePaths(id, patch.sourceType);

		Object.assign(next, recovered);
	}

	for (const field of LOCAL_RUNTIME_FIELDS) {
		if (hasOwn(patch, field)) {
			next[field] = patch[field];
		}
	}

	for (const field of LOCAL_RUNTIME_FIELDS) {
		if (
			next[field] &&
			!fs.existsSync(next[field])
		) {
			delete next[field];
		}
	}

	runtimePaths.set(id, next);

	const update = toSupabasePatch(patch);

	if (Object.keys(update).length === 0) {
		return getVideo(id);
	}

	const { data, error } = await supabase
		.from("videos")
		.update(update)
		.eq("id", id)
		.select()
		.maybeSingle();

	if (error) throw error;

	return toVideoRecord(data);
}

function clearRuntimeVideo(id) {
	runtimePaths.delete(id);
}

export {
	upsertVideo,
	reserveVideoSlot,
	deleteVideo,
	getVideo,
	listVideos,
	patchVideo,
	clearRuntimeVideo,
};