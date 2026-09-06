import fs from "fs";
import path from "path";

import { supabase } from "../../db/client.js";
import { deleteFile } from "../google/drive.js";
import { clearRuntimeExport, deleteExport, listExportsByVideoId } from "../../db/exports.js";
import { clearRuntimeVideo } from "../../db/videos.js";
import { DIRS as VIDEO_DIRS } from "../video/processing.js";
import { deleteTemporaryExportFiles } from "../export/processing.js";

async function deleteDriveFile(fileId) {
	if (!fileId) return;

	try {
		await deleteFile(fileId);
		console.log(`Deleted Drive file: ${fileId}`);
	} catch (error) {
		if (error?.response?.status === 404) {
			console.log(`Drive file already deleted: ${fileId}`);
			return;
		}

		throw error;
	}
}

function deleteLocalFilesByPrefix(directory, prefix) {
	if (!directory || !prefix || !fs.existsSync(directory)) {
		return 0;
	}

	let deleted = 0;

	for (const filename of fs.readdirSync(directory)) {
		if (!filename.startsWith(prefix)) {
			continue;
		}

		const filePath = path.join(directory, filename);

		try {
			if (!fs.statSync(filePath).isFile()) {
				continue;
			}

			fs.unlinkSync(filePath);
			deleted += 1;

			console.log(`Deleted local file: ${filePath}`);
		} catch (error) {
			if (error?.code === "ENOENT") {
				continue;
			}

			throw error;
		}
	}

	return deleted;
}

function deleteLocalVideoFiles(videoId) {
	let deleted = 0;

	deleted += deleteLocalFilesByPrefix(
		VIDEO_DIRS.uploads,
		videoId,
	);

	deleted += deleteLocalFilesByPrefix(
		VIDEO_DIRS.audio,
		videoId,
	);

	deleted += deleteLocalFilesByPrefix(
		VIDEO_DIRS.thumbnails,
		videoId,
	);

	deleted += deleteLocalFilesByPrefix(
		VIDEO_DIRS.transcripts,
		videoId,
	);

	return deleted;
}

async function cleanupExpiredExports() {
	const { data: exports, error } = await supabase
		.from("exports")
		.select("id, drive_file_id")
		.lte("expires_at", new Date().toISOString());

	if (error) throw error;

	let cleaned = 0;

	for (const exportJob of exports || []) {
		try {
			deleteTemporaryExportFiles(exportJob.id);
			await deleteDriveFile(exportJob.drive_file_id);

			const { error: deleteError } = await supabase
				.from("exports")
				.delete()
				.eq("id", exportJob.id);

			if (deleteError) {
				throw deleteError;
			}

			clearRuntimeExport(exportJob.id);
			cleaned += 1;

			console.log(`Deleted export record: ${exportJob.id}`);
		} catch (error) {
			console.error(
				`Failed to clean export ${exportJob.id}:`,
				error,
			);
		}
	}

	return cleaned;
}

async function cleanupExpiredVideos() {
	const { data: videos, error } = await supabase
		.from("videos")
		.select(
			"id, drive_file_id, drive_folder_id, thumbnail_file_id, transcript_file_id",
		)
		.not("expires_at", "is", null)
		.lte("expires_at", new Date().toISOString());

	if (error) throw error;

	let cleaned = 0;

	for (const video of videos || []) {
		try {
			await deleteVideoResources(video);

			const { error: deleteError } = await supabase
				.from("videos")
				.delete()
				.eq("id", video.id);

			if (deleteError) {
				throw deleteError;
			}

			clearRuntimeVideo(video.id);
			cleaned += 1;

			console.log(`Deleted video record: ${video.id}`);
		} catch (error) {
			console.error(
				`Failed to clean video ${video.id}:`,
				error,
			);
		}
	}

	return cleaned;
}

export async function deleteVideoResources(video) {
	const exports = await listExportsByVideoId(video.id);

	for (const exportJob of exports) {
		deleteTemporaryExportFiles(exportJob.id);
		await deleteDriveFile(exportJob.driveFileId);
		await deleteExport(exportJob.id);
		clearRuntimeExport(exportJob.id);
	}

	await deleteDriveFile(video.drive_file_id ?? video.driveFileId);
	await deleteDriveFile(video.thumbnail_file_id ?? video.thumbnailFileId);
	await deleteDriveFile(video.transcript_file_id ?? video.transcriptFileId);
	await deleteDriveFile(video.drive_folder_id ?? video.driveFolderId);
	deleteLocalVideoFiles(video.id);
}

export async function cleanupExpiredData() {
	console.log("Starting expired data cleanup...");

	const deletedExports = await cleanupExpiredExports();
	const deletedVideos = await cleanupExpiredVideos();

	console.log(
		`Cleanup complete: ${deletedExports} exports, ${deletedVideos} videos deleted.`,
	);
}
