import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as videos from "../../db/videos.js";
import * as store from "../../db/exports.js";
import ytdlp from "../ytdlp/client.js";
import ffmpegSvc from "../ffmpeg/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "..", "storage");

const DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
	fs.mkdirSync(directory, {
		recursive: true,
	});
});

function deleteFile(filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		return;
	}

	try {
		fs.unlinkSync(filePath);
	} catch {}
}

export function deleteTemporaryExportFiles(exportId) {
	if (!exportId || !fs.existsSync(DIRS.exports)) {
		return 0;
	}

	let deleted = 0;

	for (const filename of fs.readdirSync(DIRS.exports)) {
		if (
			!filename.startsWith(`${exportId}_`) &&
			filename !== `${exportId}.srt`
		) {
			continue;
		}

		const filePath = path.join(DIRS.exports, filename);

		try {
			if (!fs.statSync(filePath).isFile()) {
				continue;
			}

			fs.unlinkSync(filePath);
			deleted += 1;
		} catch (error) {
			console.error(
				`Failed to delete temporary export file ${filePath}:`,
				error,
			);
		}
	}

	return deleted;
}

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

function buildExportFilename(filenameBase, width, height) {
	return `${sanitizeFilename(filenameBase)}_${width}x${height}.mp4`;
}

async function markExportError(exportId, message) {
	await store.patchExport(exportId, {
		status: "ERROR",
		progress: 0,
		error: message,
	});
}

async function runExportJob(exportId) {
	let outputPath = null;
	let captionsSrtPath = null;
	let temporaryVideoPath = null;
	let normalizedVideoPath = null;

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
		let exportStart = exp.start;
		let exportEnd = exp.end;

		if (video.sourceType === "upload") {
			sourcePath = video.filePath;

			if (!sourcePath || !fs.existsSync(sourcePath)) {
				throw new Error(
					"Original uploaded video is no longer available locally.",
				);
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
				DIRS.uploads,
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
				DIRS.uploads,
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

			try {
				const timing = await ffmpegSvc.probeTiming(
					normalizedVideoPath,
				);

				console.log(
					"\n================ NORMALIZED YOUTUBE TIMING ==================",
				);

				console.log("Export ID:", exportId);
				console.log("Video ID:", video.id);

				console.log("\nRequested original range:");
				console.log("  start:", exp.start);
				console.log("  end:", exp.end);
				console.log("  requested duration:", clipDuration);

				console.log("\nNormalized clip:");
				console.log("  file:", normalizedVideoPath);
				console.log(
					"  format start_time:",
					timing.formatStartTime,
				);
				console.log(
					"  format duration:",
					timing.formatDuration,
				);

				console.log("\nStreams:");

				for (const stream of timing.streams) {
					console.log({
						index: stream.index,
						type: stream.codecType,
						codec: stream.codecName,
						start_time: stream.startTime,
						duration: stream.duration,
						time_base: stream.timeBase,
						avg_frame_rate: stream.avgFrameRate,
						r_frame_rate: stream.rFrameRate,
					});
				}

				console.log(
					"\n=============================================================\n",
				);
			} catch (diagnosticError) {
				console.error(
					"Normalized timing diagnostic failed:",
					diagnosticError,
				);
			}
		} else {
			throw new Error("Unsupported video source type.");
		}

		if (!sourcePath || !fs.existsSync(sourcePath)) {
			throw new Error("Export source video is not available.");
		}

		const streams = await ffmpegSvc.probeStreams(sourcePath);

		if (!streams.hasVideo) {
			throw new Error(
				"The source file does not contain a video stream.",
			);
		}

		if (
			exp.captions === "burn" &&
			Array.isArray(video.transcript)
		) {
			captionsSrtPath = path.join(
				DIRS.exports,
				`${exportId}.srt`,
			);

			ffmpegSvc.buildSrtForRange(
				video.transcript,
				exp.start,
				exp.end,
				captionsSrtPath,
			);

			try {
				const srtContent = fs.readFileSync(
					captionsSrtPath,
					"utf8",
				);

				console.log(
					"\n================ SRT TIMING DIAGNOSTIC ====================",
				);

				console.log("Export ID:", exportId);
				console.log("Original start:", exp.start);
				console.log("Original end:", exp.end);
				console.log("Clip duration:", clipDuration);

				console.log("\nFirst SRT entries:");

				console.log(
					srtContent
						.split(/\r?\n\r?\n/)
						.slice(0, 5)
						.join("\n\n"),
				);

				console.log(
					"\n=============================================================\n",
				);
			} catch (diagnosticError) {
				console.error(
					"SRT diagnostic failed:",
					diagnosticError,
				);
			}
		}

		const filename = buildExportFilename(
			exp.filenameBase || video.title || "clip",
			exp.width,
			exp.height,
		);

		outputPath = path.join(
			DIRS.exports,
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
			deleteFile(outputPath);
			deleteFile(captionsSrtPath);
			deleteFile(temporaryVideoPath);
			deleteFile(normalizedVideoPath);
			return;
		}

		await store.patchExport(exportId, {
			status: "READY",
			progress: 100,
			outputPath,
			filename,
			error: null,
		});

		deleteFile(captionsSrtPath);
		deleteFile(temporaryVideoPath);
		deleteFile(normalizedVideoPath);

		console.log(`Export ${exportId} is ready: ${outputPath}`);
	} catch (error) {
		console.error(`Export ${exportId} failed:`, error);

		deleteFile(outputPath);
		deleteFile(captionsSrtPath);
		deleteFile(temporaryVideoPath);
		deleteFile(normalizedVideoPath);

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

export { DIRS, runExportJob };

export default {
	DIRS,
	runExportJob,
	deleteTemporaryExportFiles,
};