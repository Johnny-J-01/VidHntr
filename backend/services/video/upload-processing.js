import fs from "fs";
import path from "path";

import * as store from "../../db/videos.js";
import ffmpegSvc from "../ffmpeg/config.js";
import {
	storeSourceVideo,
	storeVideoJsonFiles,
	storeVideoThumbnail,
} from "../storage/video-files.js";
import transcription from "../transcription/deepgram.js";
import {
	acquireFileLock,
	isFileLocked,
	releaseFileLock,
	safeDeleteLocalOriginal,
} from "./file-locks.js";
import { videoExpiresAtForOwner } from "./limits.js";
import { DIRS } from "./paths.js";
import { markError } from "./shared.js";

export async function checkAndFinalizeVideo(videoId) {
	const video = await store.getVideo(videoId);
	if (!video) return;

	// Condition 1: Original local video deletion check
	// - Original video successfully stored in Google Drive
	// - All initial processing operations that depend on local original completed
	// - No other active operation is using the local file
	const isStoredInDrive = Boolean(
		video.driveFileId && video.storageStatus === "STORED",
	);
	const isLocalOriginalInUse = video.filePath ? isFileLocked(video.filePath) : false;
	const initialDependentOpsFinished = Boolean(
		video.duration !== null &&
		(video.thumbnailStatus === "STORED" || video.thumbnailStatus === "FAILED" || video.thumbnailFileId) &&
		!isLocalOriginalInUse,
	);

	if (isStoredInDrive && initialDependentOpsFinished && video.filePath) {
		const wasDeleted = await safeDeleteLocalOriginal(video.filePath);
		if (wasDeleted) {
			console.log(
				`Safely removed local original video for ${videoId}: ${video.filePath}`,
			);
			await store.patchVideo(videoId, { filePath: null });
		}
	}

	// Condition 2: Overall READY status check
	// - Original video uploaded to Drive
	// - Metadata persisted
	// - Transcription completed and persisted
	// - Thumbnail generated and uploaded
	const storageComplete = Boolean(
		video.driveFileId && video.storageStatus === "STORED",
	);
	const transcriptionComplete = Boolean(
		video.transcriptionStatus === "COMPLETED" &&
		(Array.isArray(video.transcript) || video.transcriptFileId),
	);
	const thumbnailComplete = Boolean(
		video.thumbnailFileId || video.thumbnailStatus === "STORED",
	);
	const metadataComplete = video.duration !== null;

	if (
		storageComplete &&
		transcriptionComplete &&
		thumbnailComplete &&
		metadataComplete
	) {
		await store.patchVideo(videoId, {
			status: "READY",
			progress: 100,
			error: null,
		});

		try {
			await storeVideoJsonFiles({
				...video,
				status: "READY",
				progress: 100,
				error: null,
			});
		} catch (metaError) {
			console.warn(`Failed to update Drive metadata JSON for ${videoId}:`, metaError.message);
		}

		console.log(`Video ${videoId} initial processing complete. Status is READY.`);
	} else if (
		video.storageStatus === "FAILED" ||
		video.transcriptionStatus === "FAILED"
	) {
		const current = await store.getVideo(videoId);
		if (current && current.status !== "READY") {
			await store.patchVideo(videoId, {
				status: "ERROR",
				error: current.error || "Processing failed.",
			});
		}
	}
}

async function runDriveUploadOperation(video) {
	const videoId = video.id;

	try {
		console.log(`Operation A: Starting Drive upload for video ${videoId}`);

		await store.patchVideo(videoId, {
			storageStatus: "UPLOADING",
		});

		const { file: sourceDriveFile, folders } = await storeSourceVideo(video);
		const expiresAt = videoExpiresAtForOwner(video.userId, Date.now());

		const updated = await store.patchVideo(videoId, {
			driveFolderId: folders.owner.id,
			driveFileId: sourceDriveFile.id,
			storageStatus: "STORED",
			expiresAt,
		});

		const jsonFileIds = await storeVideoJsonFiles(updated);
		await store.patchVideo(videoId, jsonFileIds);

		console.log(`Operation A: Drive upload completed for video ${videoId} (Drive ID: ${sourceDriveFile.id})`);
	} catch (error) {
		console.error(`Operation A: Drive upload failed for video ${videoId}:`, error);

		await store.patchVideo(videoId, {
			storageStatus: "FAILED",
			error: `Google Drive upload failed: ${error.message}`,
		});
	} finally {
		if (video.filePath) {
			releaseFileLock(video.filePath);
		}
		await checkAndFinalizeVideo(videoId);
	}
}

async function runLocalProcessingOperation(video) {
	const videoId = video.id;
	let audioPath = null;
	let thumbnailPath = null;

	try {
		console.log(`Operation B: Starting local processing for video ${videoId}`);

		await store.patchVideo(videoId, {
			status: "PROCESSING",
			progress: 10,
			error: null,
		});

		// A. Extract metadata using FFprobe
		const metadata = await ffmpegSvc.probeMetadata(video.filePath);
		const duration = metadata.duration || (await ffmpegSvc.probeDuration(video.filePath)) || 0;

		await store.patchVideo(videoId, {
			duration,
			metadata,
			progress: 15,
		});

		// B. Extract Audio
		audioPath = path.join(DIRS.audio, `${videoId}.mp3`);
		await ffmpegSvc.extractAudio(video.filePath, audioPath);

		// D. Generate Thumbnail
		try {
			thumbnailPath = await ffmpegSvc.generateThumbnail(
				video.filePath,
				DIRS.thumbnails,
				videoId,
				Math.min(3, duration / 2),
			);
		} catch (thumbError) {
			console.warn(`Thumbnail generation failed for video ${videoId}:`, thumbError.message);
			thumbnailPath = null;
		}

		// Initial operations depending on local original (probe, audio extract, thumbnail) are now done!
		if (video.filePath) {
			releaseFileLock(video.filePath);
		}

		// Upload thumbnail to Drive if generated
		if (thumbnailPath && fs.existsSync(thumbnailPath)) {
			try {
				await store.patchVideo(videoId, { thumbnailStatus: "UPLOADING" });
				const thumbnailFile = await storeVideoThumbnail(video, thumbnailPath);
				await store.patchVideo(videoId, {
					thumbnailFileId: thumbnailFile.id,
					thumbnailStatus: "STORED",
					thumbnailPath: null,
				});

				// Delete temporary local thumbnail after successful Drive upload
				try {
					await fs.promises.unlink(thumbnailPath);
					thumbnailPath = null;
				} catch {}
			} catch (thumbUploadError) {
				console.error(`Thumbnail upload failed for video ${videoId}:`, thumbUploadError);
				await store.patchVideo(videoId, {
					thumbnailStatus: "FAILED",
				});
				// Retain local thumbnail for retry
			}
		}

		// C. Transcribe using Deepgram
		await store.patchVideo(videoId, {
			transcriptionStatus: "PROCESSING",
			progress: 25,
		});

		let transcript = [];

		await transcription.transcribeAudio(
			audioPath,
			duration,
			async (pct) => {
				await store.patchVideo(videoId, {
					progress: 25 + Math.round(pct * 0.55),
				});
			},
			async (chunkSegments, info) => {
				transcript.push(...chunkSegments);
				transcript.sort((a, b) => a.start - b.start);

				await store.patchVideo(videoId, {
					transcript,
					progress: 25 + Math.round(info.progress * 0.55),
				});
			},
		);

		await store.patchVideo(videoId, {
			status: "PROCESSING",
			progress: 85,
			transcript,
		});

		// Persist transcript in Supabase
		const persistedVideo = await store.patchVideo(videoId, {
			transcript,
			transcriptionStatus: "COMPLETED",
			progress: 90,
		});

		// Persist transcript in Google Drive JSON
		try {
			const jsonFileIds = await storeVideoJsonFiles(persistedVideo, transcript);
			await store.patchVideo(videoId, jsonFileIds);
		} catch (jsonError) {
			console.warn(`Failed to store transcript JSON in Drive for ${videoId}:`, jsonError.message);
		}

		// IMPORTANT: Delete extracted audio ONLY after transcript persistence succeeded!
		if (audioPath && fs.existsSync(audioPath)) {
			try {
				await fs.promises.unlink(audioPath);
				audioPath = null;
			} catch {}
		}

		console.log(`Operation B: Local processing completed for video ${videoId}`);
	} catch (error) {
		console.error(`Operation B: Local processing failed for video ${videoId}:`, error);

		// Ensure lock is released if an early error occurred
		if (video.filePath) {
			releaseFileLock(video.filePath);
		}

		await store.patchVideo(videoId, {
			transcriptionStatus: "FAILED",
			error: `Processing failed: ${error.message}`,
		});
		// Audio is retained on failure for retry
	} finally {
		await checkAndFinalizeVideo(videoId);
	}
}

async function runProcessingPipeline(videoId) {
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

		// Acquire locks for both concurrent operations
		acquireFileLock(video.filePath); // Lock for Drive upload
		acquireFileLock(video.filePath); // Lock for Local processing

		await store.patchVideo(videoId, {
			status: "PROCESSING",
			storageStatus: "PENDING",
			transcriptionStatus: "PENDING",
			thumbnailStatus: "PENDING",
			progress: 5,
			error: null,
		});

		// Start two independent concurrent operations
		const uploadPromise = runDriveUploadOperation(video);
		const localProcessingPromise = runLocalProcessingOperation(video);

		// Concurrently wait for both to complete or fail
		await Promise.allSettled([uploadPromise, localProcessingPromise]);
	} catch (error) {
		console.error(`Video ${videoId} processing setup failed:`, error);
		await markError(videoId, error.message || "Processing failed.");
	}
}

export { runProcessingPipeline };
