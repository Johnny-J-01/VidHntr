import { supabase } from "./client.js";

const GUEST_DATA_LIFETIME_MS = 24 * 60 * 60 * 1000;
const LOCAL_RUNTIME_FIELDS = ["filePath", "audioPath", "thumbnailPath", "transcriptPath"];
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

function rememberRuntimePaths(id, video) {
    const next = { ...(runtimePaths.get(id) || {}) };
    for (const field of LOCAL_RUNTIME_FIELDS) {
        if (hasOwn(video, field)) next[field] = video[field];
    }
    runtimePaths.set(id, next);
}

function toVideoRecord(row) {
    if (!row) return null;
    return {
        id: row.id,
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
        driveFileId: row.drive_file_id,
        thumbnailFileId: row.thumbnail_file_id,
        transcriptFileId: row.transcript_file_id,
        ...runtimePaths.get(row.id),
    };
}

function toSupabaseVideo(video) {
    const createdAt = toTimestamp(video.createdAt) ?? Date.now();
    return {
        id: video.id,
        user_id: video.userId ?? null,
        source_type: video.sourceType,
        source_url: video.sourceUrl ?? null,
        filename: video.filename ?? null,
        title: video.title ?? null,
        duration: video.duration ?? null,
        status: video.status,
        progress: video.progress,
        drive_file_id: video.driveFileId ?? null,
        thumbnail_file_id: video.thumbnailFileId ?? null,
        transcript_file_id: video.transcriptFileId ?? null,
        youtube_id: video.youtubeId ?? null,
        transcript: video.transcript ?? null,
        error: video.error ?? null,
        created_at: toIsoTimestamp(createdAt),
        expires_at: toIsoTimestamp(video.expiresAt ?? createdAt + GUEST_DATA_LIFETIME_MS),
    };
}

function toSupabasePatch(patch) {
    const columnByField = {
        userId: "user_id", sourceType: "source_type", sourceUrl: "source_url",
        filename: "filename", title: "title", duration: "duration", status: "status",
        progress: "progress", driveFileId: "drive_file_id", thumbnailFileId: "thumbnail_file_id",
        transcriptFileId: "transcript_file_id", youtubeId: "youtube_id", transcript: "transcript",
        error: "error",
    };
    const update = {};
    for (const [field, column] of Object.entries(columnByField)) {
        if (hasOwn(patch, field)) update[column] = patch[field];
    }
    if (hasOwn(patch, "createdAt")) update.created_at = toIsoTimestamp(patch.createdAt);
    if (hasOwn(patch, "expiresAt")) update.expires_at = toIsoTimestamp(patch.expiresAt);
    return update;
}

async function upsertVideo(video) {
    rememberRuntimePaths(video.id, video);
    const { data, error } = await supabase.from("videos").upsert(toSupabaseVideo(video)).select().single();
    if (error) throw error;
    return toVideoRecord(data);
}

async function getVideo(id) {
    const { data, error } = await supabase.from("videos").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return toVideoRecord(data);
}

async function listVideos() {
    const { data, error } = await supabase.from("videos").select().order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(toVideoRecord);
}

async function patchVideo(id, patch) {
    rememberRuntimePaths(id, patch);
    const update = toSupabasePatch(patch);
    if (Object.keys(update).length === 0) return getVideo(id);
    const { data, error } = await supabase.from("videos").update(update).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return toVideoRecord(data);
}

export {
    upsertVideo,
    getVideo,
    listVideos,
    patchVideo,
};
