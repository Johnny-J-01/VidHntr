import fs from "fs";
import path from "path";

import * as store from "../../db/videos.js";
import ffmpegSvc from "../ffmpeg/config.js";
import { getGuestVideoFolder, uploadFile } from "../google/drive.js";
import { DIRS } from "./paths.js";
import { markError, runAudioTranscriptionPipeline } from "./shared.js";

async function runProcessingPipeline(videoId) {
	let audioPath = null;
	let thumbnailPath = null;

	try {
		console.log(`Starting upload processing pipeline for video: ${videoId}`);

		const video = await store.getVideo(videoId);

		if (!video) {
			console.error(`Video ${videoId} was not found.`);
			return;
		}

		if (!video.filePath || !fs.existsSync(video.filePath)) {
			throw new Error("Source video file was not found.");
		}

		await store.patchVideo(videoId, {
			status: "EXTRACTING_AUDIO",
			progress: 5,
			error: null,
		});

		const duration = await ffmpegSvc.probeDuration(video.filePath);

		console.log(`Preparing Google Drive storage for video: ${videoId}`);

		const guestVideoFolder = await getGuestVideoFolder(videoId);

		console.log(`Uploading source video to Google Drive: ${video.filePath}`);

		const sourceDriveFile = await uploadFile({
			filePath: video.filePath,
			fileName: video.filename || path.basename(video.filePath),
			mimeType: "video/mp4",
			folderId: guestVideoFolder.id,
		});

		if (!sourceDriveFile?.id) {
			throw new Error("Source video could not be stored in Google Drive.");
		}

		console.log(`Source video stored in Google Drive: ${sourceDriveFile.id}`);

		await store.patchVideo(videoId, {
			driveFolderId: guestVideoFolder.id,
			driveFileId: sourceDriveFile.id,
			duration,
		});

		audioPath = path.join(DIRS.audio, `${videoId}.mp3`);

		await ffmpegSvc.extractAudio(video.filePath, audioPath);

		try {
			thumbnailPath = await ffmpegSvc.generateThumbnail(
				video.filePath,
				DIRS.thumbnails,
				videoId,
				Math.min(3, duration / 2),
			);
		} catch {
			thumbnailPath = null;
		}

		await runAudioTranscriptionPipeline(videoId, audioPath, duration, thumbnailPath);
	} catch (error) {
		console.error(`Video ${videoId} processing failed:`, error);

		if (audioPath && fs.existsSync(audioPath)) {
			try {
				fs.unlinkSync(audioPath);
			} catch {}
		}

		if (thumbnailPath && fs.existsSync(thumbnailPath)) {
			try {
				fs.unlinkSync(thumbnailPath);
			} catch {}
		}

		await markError(videoId, error.message || "Processing failed.");
	}
}

export { runProcessingPipeline };

