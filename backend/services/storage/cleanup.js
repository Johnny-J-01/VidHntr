import fs from "fs";
import path from "path";

import { supabase } from "../../db/client.js";
import {
	clearRuntimeExport,
	deleteExport,
	listExportsByVideoId,
} from "../../db/exports.js";
import {
	clearRuntimeVideo,
	deleteVideo as deleteVideoRow,
	patchVideo,
} from "../../db/videos.js";
import {
	deleteFile,
	getApplicationRootFolder,
	listFiles,
} from "../google/drive.js";
import { deleteTemporaryExportFiles } from "../export/processing.js";
import { DIRS as VIDEO_DIRS } from "../video/processing.js";
import { VIDEO_EXPIRED_MESSAGE } from "./retention.js";

const INCOMPLETE_UPLOAD_TTL_MS = Math.max(
	1,
	Number.parseInt(process.env.INCOMPLETE_UPLOAD_TTL_HOURS || "6", 10) || 6,
) * 60 * 60 * 1000;
const ORPHAN_GRACE_MS = Math.max(
	5,
	Number.parseInt(process.env.DRIVE_ORPHAN_GRACE_MINUTES || "30", 10) || 30,
) * 60 * 1000;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

async function deleteDriveFile(fileId) {
	if (!fileId) return;
	await deleteFile(fileId);
	console.log(`Deleted Drive file or confirmed it was already absent: ${fileId}`);
}

function deleteLocalFilesByPrefix(directory, prefix) {
	if (!directory || !prefix || !fs.existsSync(directory)) return 0;

	let deleted = 0;
	for (const filename of fs.readdirSync(directory)) {
		if (!filename.startsWith(prefix)) continue;

		const filePath = path.join(directory, filename);
		try {
			if (!fs.statSync(filePath).isFile()) continue;
			fs.unlinkSync(filePath);
			deleted += 1;
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
	}

	return deleted;
}

function deleteLocalVideoFiles(videoId) {
	let deleted = 0;
	for (const directory of [
		VIDEO_DIRS.uploads,
		VIDEO_DIRS.audio,
		VIDEO_DIRS.thumbnails,
		VIDEO_DIRS.transcripts,
	]) {
		deleted += deleteLocalFilesByPrefix(directory, videoId);
	}
	return deleted;
}

function cleanupStaleIncomingUploads() {
	const directory = VIDEO_DIRS.incomingUploads;
	if (!directory || !fs.existsSync(directory)) return 0;

	const cutoff = Date.now() - INCOMPLETE_UPLOAD_TTL_MS;
	let deleted = 0;

	for (const filename of fs.readdirSync(directory)) {
		if (!filename.endsWith(".uploading")) continue;

		const filePath = path.join(directory, filename);
		try {
			const stats = fs.statSync(filePath);
			if (!stats.isFile() || stats.mtimeMs > cutoff) continue;
			fs.unlinkSync(filePath);
			deleted += 1;
		} catch (error) {
			if (error?.code !== "ENOENT") {
				console.error(`Failed to remove stale incomplete upload ${filePath}:`, error);
			}
		}
	}

	return deleted;
}

export async function deleteExportResources(exportJob) {
	deleteTemporaryExportFiles(exportJob.id);
	await deleteDriveFile(exportJob.driveFileId ?? exportJob.drive_file_id);
}

export async function deleteExportCompletely(exportJob) {
	await deleteExportResources(exportJob);
	await deleteExport(exportJob.id);
	clearRuntimeExport(exportJob.id);
}

async function cleanupAbandonedUploadReservations() {
	const cutoff = new Date(Date.now() - INCOMPLETE_UPLOAD_TTL_MS).toISOString();
	const { data: videos, error } = await supabase
		.from("videos")
		.select(
			"id, drive_file_id, metadata_file_id, thumbnail_file_id, transcript_file_id",
		)
		.eq("source_type", "upload")
		.is("expires_at", null)
		.lte("created_at", cutoff);

	if (error) throw error;

	let cleaned = 0;
	for (const video of videos || []) {
		try {
			await deleteVideoCompletely(video, "DELETING");
			cleaned += 1;
		} catch (error) {
			console.error(`Failed to release abandoned upload ${video.id}:`, error);
		}
	}

	return cleaned;
}

async function cleanupExpiredExports() {
	const { data: exports, error } = await supabase
		.from("exports")
		.select("id, drive_file_id")
		.not("expires_at", "is", null)
		.lte("expires_at", new Date().toISOString());

	if (error) throw error;

	let cleaned = 0;
	for (const exportJob of exports || []) {
		try {
			await deleteExportCompletely(exportJob);
			cleaned += 1;
		} catch (error) {
			console.error(`Failed to clean export ${exportJob.id}:`, error);
		}
	}

	return cleaned;
}

export async function deleteVideoResources(video) {
	await deleteDriveFile(video.driveFileId ?? video.drive_file_id);
	await deleteDriveFile(video.metadataFileId ?? video.metadata_file_id);
	await deleteDriveFile(video.transcriptFileId ?? video.transcript_file_id);
	await deleteDriveFile(video.thumbnailFileId ?? video.thumbnail_file_id);

	const exports = await listExportsByVideoId(video.id);
	for (const exportJob of exports) {
		await deleteExportCompletely(exportJob);
	}

	deleteLocalVideoFiles(video.id);
}

export async function deleteVideoCompletely(video, status = "EXPIRED") {
	await patchVideo(video.id, {
		status,
		error: status === "EXPIRED" ? VIDEO_EXPIRED_MESSAGE : null,
	});
	await deleteVideoResources(video);
	await deleteVideoRow(video.id);
	clearRuntimeVideo(video.id);
}

async function cleanupExpiredVideos() {
	const now = new Date().toISOString();
	const { data: videos, error } = await supabase
		.from("videos")
		.select(
			"id, drive_file_id, metadata_file_id, thumbnail_file_id, transcript_file_id",
		)
		.or(`expires_at.lte.${now},status.in.(EXPIRED,DELETING)`);

	if (error) throw error;

	let cleaned = 0;
	for (const video of videos || []) {
		try {
			await deleteVideoCompletely(video);
			cleaned += 1;
		} catch (error) {
			console.error(`Failed to clean video ${video.id}:`, error);
		}
	}

	return cleaned;
}

async function collectDriveFiles(folderId, files = []) {
	const children = await listFiles(folderId);

	for (const child of children) {
		if (child.mimeType === FOLDER_MIME_TYPE) {
			await collectDriveFiles(child.id, files);
		} else {
			files.push(child);
		}
	}

	return files;
}

async function listReferencedDriveFileIds() {
	const [videosResult, exportsResult] = await Promise.all([
		supabase
			.from("videos")
			.select("drive_file_id, metadata_file_id, thumbnail_file_id, transcript_file_id"),
		supabase.from("exports").select("drive_file_id"),
	]);

	if (videosResult.error) throw videosResult.error;
	if (exportsResult.error) throw exportsResult.error;

	const ids = new Set();
	for (const row of [...(videosResult.data || []), ...(exportsResult.data || [])]) {
		for (const value of Object.values(row)) {
			if (value) ids.add(value);
		}
	}

	return ids;
}

export async function cleanupOrphanedDriveFiles() {
	const rootFolder = await getApplicationRootFolder();
	const [referencedIds, driveFiles] = await Promise.all([
		listReferencedDriveFileIds(),
		collectDriveFiles(rootFolder.id),
	]);
	const cutoff = Date.now() - ORPHAN_GRACE_MS;
	let deleted = 0;

	for (const file of driveFiles) {
		const createdAt = Date.parse(file.createdTime);
		if (
			referencedIds.has(file.id) ||
			!Number.isFinite(createdAt) ||
			createdAt > cutoff
		) {
			continue;
		}

		try {
			await deleteDriveFile(file.id);
			deleted += 1;
		} catch (error) {
			console.error(`Failed to delete orphaned Drive file ${file.id}:`, error);
		}
	}

	return deleted;
}

export async function cleanupExpiredData() {
	console.log("Starting storage cleanup...");
	const deletedIncompleteUploads = cleanupStaleIncomingUploads();
	const deletedAbandonedUploads = await cleanupAbandonedUploadReservations();
	const deletedExports = await cleanupExpiredExports();
	const deletedVideos = await cleanupExpiredVideos();
	const deletedOrphans = await cleanupOrphanedDriveFiles();

	console.log(
		`Cleanup complete: ${deletedIncompleteUploads} incomplete files, ${deletedAbandonedUploads} abandoned uploads, ${deletedExports} exports, ${deletedVideos} videos, ${deletedOrphans} orphaned Drive files deleted.`,
	);
}
