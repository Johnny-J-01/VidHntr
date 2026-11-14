import fs from "fs";
import path from "path";

import * as store from "../../db/videos.js";
import ffmpegSvc from "../ffmpeg/config.js";
import {
	storeSourceVideo,
	storeVideoJsonFiles,
	storeVideoThumbnail,
} from "../storage/video-files.js";
import { videoExpiresAtForOwner } from "./limits.js";
import { DIRS } from "./paths.js";
import { markError, runAudioTranscriptionPipeline } from "./shared.js";

async function runProcessingPipeline(videoId) {
	let audioPath = null;
	let thumbnailPath = null;
	let retentionStarted = false;

	try {
		console.log(`Starting upload processing pipeline for video: ${videoId}`);

		let video = await store.getVideo(videoId);
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
		const { file: sourceDriveFile, folders } = await storeSourceVideo(video);
		const expiresAt = videoExpiresAtForOwner(video.userId, Date.now());

		video = await store.patchVideo(videoId, {
			driveFolderId: folders.owner.id,
			driveFileId: sourceDriveFile.id,
			duration,
			expiresAt,
		});
		retentionStarted = true;

		const jsonFileIds = await storeVideoJsonFiles(video);
		video = await store.patchVideo(videoId, jsonFileIds);

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

		if (thumbnailPath) {
			const thumbnailFile = await storeVideoThumbnail(video, thumbnailPath);
			await store.patchVideo(videoId, {
				thumbnailFileId: thumbnailFile.id,
			});
		}

		await runAudioTranscriptionPipeline(videoId, audioPath, duration, thumbnailPath);
	} catch (error) {
		console.error(`Video ${videoId} processing failed:`, error);

		for (const temporaryPath of [audioPath, thumbnailPath]) {
			if (temporaryPath && fs.existsSync(temporaryPath)) {
				try {
					fs.unlinkSync(temporaryPath);
				} catch {}
			}
		}

		if (!retentionStarted) {
			try {
				await store.patchVideo(videoId, { expiresAt: Date.now() });
			} catch (expiryError) {
				console.error(`Failed to release upload slot for ${videoId}:`, expiryError);
			}
		}

		await markError(videoId, error.message || "Processing failed.");
	}
}

export { runProcessingPipeline };
