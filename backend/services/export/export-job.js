import fs from "fs";
import path from "path";

import * as videos from "../../db/videos.js";
import * as store from "../../db/exports.js";
import ytdlp from "../ytdlp/client.js";
import ffmpegSvc from "../ffmpeg/config.js";
import { getAuthenticatedClient } from "../google/auth.js";
import { downloadFileToPath } from "../google/drive.js";
import {
	ensureLocalSourceVideo,
	loadVideoTranscript,
	storeExportVideo,
} from "../storage/video-files.js";
import { exportExpiresAt } from "../video/limits.js";
import {
	DIRS,
	deleteFile,
	deleteExportWorkDir,
	getExportWorkDir,
} from "./export-files.js";

function sanitizeFilename(filename) {
	return (
		String(filename || "clip")
			.replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/\.+$/, "")
			.slice(0, 120) || "clip"
	);
}

export function buildExportFilename(filenameBase, width, height) {
	return `${sanitizeFilename(filenameBase)}_${width}x${height}.mp4`;
}

export async function markExportError(exportId, message) {
	await store.patchExport(exportId, {
		status: "ERROR",
		progress: 0,
		error: message,
	});
}

export async function runExportJob(exportId) {
	let outputPath = null;
	let captionsSrtPath = null;
	let temporaryVideoPath = null;
	let normalizedVideoPath = null;
	const workDir = getExportWorkDir(exportId);

	try {
		const exp = await store.getExport(exportId);

		if (!exp) {
			return;
		}

		if (exp.status === "CLOSED") {
			return;
		}

		const video = await videos.getVideo(exp.videoId);

		if (!video) {
			throw new Error("Source video no longer exists.");
		}

		const isYouTube =
			video.sourceType === "youtube" &&
			typeof video.sourceUrl === "string" &&
			video.sourceUrl.length > 0;

		const clipDuration = Math.max(
			0.1,
			Number(exp.end) - Number(exp.start),
		);

		await store.patchExport(exportId, {
			status: "PROCESSING",
			progress: 5,
			error: null,
		});

		let sourcePath = null;
		let inputOptions = [];
		let exportStart = exp.start;
		let exportEnd = exp.end;

		if (video.sourceType === "upload") {
			// Check if local file still exists
			if (video.filePath && fs.existsSync(video.filePath)) {
				sourcePath = video.filePath;
				console.log(`Using existing local video for export ${exportId}: ${sourcePath}`);
			} else if (video.driveFileId) {
				// Try remote Google Drive reading first
				try {
					const authClient = getAuthenticatedClient();
					const tokenResponse = await authClient?.getAccessToken?.();
					const token = tokenResponse?.token;

					if (token) {
						const remoteUrl = `https://www.googleapis.com/drive/v3/files/${video.driveFileId}?alt=media`;
						const remoteOptions = [
							"-headers",
							`Authorization: Bearer ${token}\r\n`,
							"-seekable",
							"1",
						];

						// Verify that FFmpeg/probe can read the remote stream
						await ffmpegSvc.probeStreams(remoteUrl, remoteOptions);
						sourcePath = remoteUrl;
						inputOptions = remoteOptions;
						console.log(`Using remote Google Drive input for export ${exportId}`);
					} else {
						throw new Error("Google Drive access token unavailable.");
					}
				} catch (remoteError) {
					console.warn(
						`Direct remote Google Drive reading failed for export ${exportId}; falling back to scoped local download:`,
						remoteError.message,
					);
					// Fallback: download original video into this export's isolated workDir ONLY
					const localFallbackPath = path.join(workDir, `${video.id}_source.mp4`);
					sourcePath = await downloadFileToPath(video.driveFileId, localFallbackPath);
				}
			} else {
				throw new Error("Original uploaded video is not available in Google Drive.");
			}

			await store.patchExport(exportId, {
				progress: 10,
			});
		} else if (isYouTube) {
			const temporaryId = `${video.id}-export-${exportId}`;

			await store.patchExport(exportId, {
				progress: 8,
			});

			const result = await ytdlp.downloadYouTubeVideoSection(
				video.sourceUrl,
				workDir,
				temporaryId,
				exp.start,
				exp.end,
				async (progress) => {
					await store.patchExport(exportId, {
						status: "PROCESSING",
						progress: Math.min(
							40,
							8 + Math.round(progress * 0.32),
						),
					});
				},
			);

			temporaryVideoPath = result.filePath;

			if (
				!temporaryVideoPath ||
				!fs.existsSync(temporaryVideoPath)
			) {
				throw new Error(
					"YouTube section download finished but the video file was not found.",
				);
			}

			normalizedVideoPath = path.join(
				workDir,
				`${temporaryId}-normalized.mp4`,
			);

			await store.patchExport(exportId, {
				progress: 42,
			});

			await ffmpegSvc.normalizeVideoSection(
				temporaryVideoPath,
				normalizedVideoPath,
				clipDuration,
			);

			if (!fs.existsSync(normalizedVideoPath)) {
				throw new Error(
					"FFmpeg normalization finished but the normalized video file was not created.",
				);
			}

			sourcePath = normalizedVideoPath;
			exportStart = 0;
			exportEnd = clipDuration;

			await store.patchExport(exportId, {
				progress: 50,
			});
		} else {
			throw new Error("Unsupported video source type.");
		}

		const isRemoteSource = typeof sourcePath === "string" && /^https?:\/\//i.test(sourcePath);
		if (!sourcePath || (!isRemoteSource && !fs.existsSync(sourcePath))) {
			throw new Error("Export source video is not available.");
		}

		const streams = await ffmpegSvc.probeStreams(sourcePath, inputOptions);

		if (!streams.hasVideo) {
			throw new Error(
				"The source file does not contain a video stream.",
			);
		}

		const transcript = exp.captions === "burn"
			? await loadVideoTranscript(video)
			: null;

		if (exp.captions === "burn" && Array.isArray(transcript)) {
			captionsSrtPath = path.join(
				workDir,
				`${exportId}.srt`,
			);

			ffmpegSvc.buildSrtForRange(
				transcript,
				exp.start,
				exp.end,
				captionsSrtPath,
			);
		}

		const filename = buildExportFilename(
			exp.filenameBase || video.title || "clip",
			exp.width,
			exp.height,
		);

		outputPath = path.join(
			workDir,
			`${exportId}_${filename}`,
		);

		await ffmpegSvc.exportClip({
			sourcePath,
			outputPath,
			start: exportStart,
			end: exportEnd,
			width: exp.width,
			height: exp.height,
			quality: exp.quality,
			cropMode: exp.cropMode || "fill",
			captionsSrtPath,
			inputOptions,
			onProgress: async (progress) => {
				const mappedProgress = isYouTube
					? 50 + Math.round(progress * 0.5)
					: 10 + Math.round(progress * 0.9);

				await store.patchExport(exportId, {
					status: "PROCESSING",
					progress: Math.min(99, mappedProgress),
				});
			},
		});

		if (!fs.existsSync(outputPath)) {
			throw new Error(
				"FFmpeg finished but the exported video file was not created.",
			);
		}

		const outputStats = fs.statSync(outputPath);

		if (outputStats.size <= 0) {
			throw new Error("The exported video file is empty.");
		}

		const latestExport = await store.getExport(exportId);

		if (!latestExport || latestExport.status === "CLOSED") {
			deleteExportWorkDir(exportId);
			return;
		}

		const driveFile = await storeExportVideo(video, latestExport, outputPath);
		const expiresAt = exportExpiresAt(Date.now());

		await store.patchExport(exportId, {
			status: "READY",
			progress: 100,
			driveFileId: driveFile.id,
			expiresAt,
			outputPath: null,
			filename,
			error: null,
		});

		deleteExportWorkDir(exportId);

		console.log(`Export ${exportId} is ready in Google Drive: ${driveFile.id}`);
	} catch (error) {
		console.error(`Export ${exportId} failed:`, error);

		deleteExportWorkDir(exportId);

		try {
			const currentExport = await store.getExport(exportId);

			if (currentExport?.status !== "CLOSED") {
				await markExportError(
					exportId,
					error.message || "Export failed.",
				);
			}
		} catch (statusError) {
			console.error(
				`Failed to update export ${exportId} after error:`,
				statusError,
			);
		}
	}
}
