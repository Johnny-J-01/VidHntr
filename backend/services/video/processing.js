import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as store from "../../db/videos.js";
import ytdlp from "../ytdlp/client.js";
import ffmpegSvc from "../ffmpeg/config.js";
import transcription from "../transcription/deepgram.js";
import {
	getGuestVideoFolder,
	uploadFile,
} from "../google/drive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "..", "storage");

const DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	audio: path.join(STORAGE, "audio"),
	transcripts: path.join(STORAGE, "transcripts"),
	thumbnails: path.join(STORAGE, "thumbnails"),
	exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
	fs.mkdirSync(directory, { recursive: true });
});

async function markError(videoId, message) {
	await store.patchVideo(videoId, {
		status: "ERROR",
		progress: 0,
		error: message,
	});
}

function parseSubtitleTimestamp(value) {
	const match = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);

	if (!match) {
		return null;
	}

	const hours = Number(match[1] || 0);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const milliseconds = Number(match[4]);

	return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function cleanSubtitleText(text) {
	return text
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\u200b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function parseSrtTranscript(filePath) {
	const content = fs.readFileSync(filePath, "utf8");
	const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
	const transcript = [];

	for (const block of blocks) {
		const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

		if (!lines.length) {
			continue;
		}

		const timestampIndex = lines.findIndex((line) => line.includes("-->"));

		if (timestampIndex === -1) {
			continue;
		}

		const timestampParts = lines[timestampIndex].split("-->").map((part) => part.trim());

		if (timestampParts.length !== 2) {
			continue;
		}

		const start = parseSubtitleTimestamp(timestampParts[0].split(" ")[0]);
		const end = parseSubtitleTimestamp(timestampParts[1].split(" ")[0]);

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			continue;
		}

		const text = cleanSubtitleText(lines.slice(timestampIndex + 1).join(" "));

		if (!text) {
			continue;
		}

		const previous = transcript[transcript.length - 1];

		if (previous && previous.start === start && previous.end === end && previous.text === text) {
			continue;
		}

		transcript.push({
			start,
			end,
			text,
		});
	}

	transcript.sort((a, b) => a.start - b.start);

	return transcript;
}

async function runAudioTranscriptionPipeline(videoId, audioPath, duration, thumbnailPath = null) {
	let transcript = [];

	await store.patchVideo(videoId, {
		status: "TRANSCRIBING",
		progress: 20,
		duration,
		audioPath,
		thumbnailPath,
		transcript: [],
		transcriptPath: null,
		error: null,
	});

	await transcription.transcribeAudio(
		audioPath,
		duration,
		async (pct) => {
			await store.patchVideo(videoId, {
				progress: 20 + Math.round(pct * 0.6),
			});
		},
		async (chunkSegments, info) => {
			transcript.push(...chunkSegments);
			transcript.sort((a, b) => a.start - b.start);

			await store.patchVideo(videoId, {
				transcript,
				transcriptPath: null,
				status: "TRANSCRIBING",
				progress: 20 + Math.round(info.progress * 0.6),
			});
		},
	);

	await store.patchVideo(videoId, {
		status: "ANALYZING",
		progress: 85,
		transcript,
		transcriptPath: null,
	});

	await store.patchVideo(videoId, {
		status: "READY",
		progress: 100,
		transcript,
		transcriptPath: null,
		thumbnailPath,
		error: null,
	});

	if (fs.existsSync(audioPath)) {
		try {
			fs.unlinkSync(audioPath);
		} catch {}
	}
}

async function runYouTubeCaptionPipeline(videoId, url, duration, title, language) {
	const subtitleId = `${videoId}-youtube-subtitles`;
	const subtitleLanguage = language ? `${language}.*,en.*` : "en.*";
	let subtitlePath = null;

	try {
		await store.patchVideo(videoId, {
			status: "TRANSCRIBING",
			progress: 15,
			duration,
			title,
			error: null,
		});

		const subtitleResult = await ytdlp.downloadYouTubeSubtitles(
			url,
			DIRS.transcripts,
			subtitleId,
			subtitleLanguage,
			async (progress) => {
				await store.patchVideo(videoId, {
					progress: 15 + Math.round(progress * 0.65),
				});
			},
		);

		subtitlePath = subtitleResult.filePath;

		const transcript = parseSrtTranscript(subtitlePath);

		if (!transcript.length) {
			throw new Error("YouTube captions contained no usable transcript segments.");
		}

		await store.patchVideo(videoId, {
			status: "ANALYZING",
			progress: 85,
			duration,
			title,
			transcript,
			transcriptPath: null,
			error: null,
		});

		await store.patchVideo(videoId, {
			status: "READY",
			progress: 100,
			duration,
			title,
			transcript,
			transcriptPath: null,
			error: null,
		});

		return true;
	} catch (error) {
		console.warn(`YouTube captions unavailable for ${videoId}. Falling back to Deepgram:`, error.message);
		return false;
	} finally {
		if (subtitlePath && fs.existsSync(subtitlePath)) {
			try {
				fs.unlinkSync(subtitlePath);
			} catch {}
		}

		const subtitlePrefix = `${subtitleId}.`;

		try {
			for (const file of fs.readdirSync(DIRS.transcripts)) {
				if (file.startsWith(subtitlePrefix)) {
					try {
						fs.unlinkSync(path.join(DIRS.transcripts, file));
					} catch {}
				}
			}
		} catch {}
	}
}

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

async function runYouTubePipeline(videoId, url) {
	let audioPath = null;

	try {
		console.log(`Starting YouTube processing pipeline for video: ${videoId}`);

		await store.patchVideo(videoId, {
			status: "DOWNLOADING",
			progress: 2,
			sourceType: "youtube",
			sourceUrl: url,
			filePath: null,
			driveFileId: null,
			error: null,
		});

		let metadata = null;

		try {
			metadata = await ytdlp.fetchMetadata(url);
		} catch (error) {
			console.warn(`Could not fetch YouTube metadata for ${videoId}:`, error.message);
		}

		const title = metadata?.title || "YouTube video";
		const duration = metadata?.duration && Number.isFinite(Number(metadata.duration)) ? Number(metadata.duration) : 0;
		const language = metadata?.language || metadata?.original_language || null;

		await store.patchVideo(videoId, {
			sourceType: "youtube",
			sourceUrl: url,
			filePath: null,
			driveFileId: null,
			title,
			duration: duration || null,
			status: "TRANSCRIBING",
			progress: 10,
			error: null,
		});

		const captionsWorked = await runYouTubeCaptionPipeline(
			videoId,
			url,
			duration,
			title,
			language,
		);

		if (captionsWorked) {
			console.log(`YouTube captions successfully processed for video: ${videoId}`);
			return;
		}

		console.log(`Falling back to Deepgram audio transcription for YouTube video: ${videoId}`);

		await store.patchVideo(videoId, {
			status: "DOWNLOADING",
			progress: 10,
			sourceType: "youtube",
			sourceUrl: url,
			filePath: null,
			driveFileId: null,
			title,
			duration: duration || null,
			error: null,
		});

		const audioResult = await ytdlp.downloadYouTubeAudio(
			url,
			DIRS.audio,
			videoId,
			async (progress) => {
				await store.patchVideo(videoId, {
					progress: Math.min(20, 10 + Math.round(progress * 0.1)),
				});
			},
		);

		audioPath = audioResult.filePath;

		if (!audioPath || !fs.existsSync(audioPath)) {
			throw new Error("YouTube audio download finished but the audio file was not found.");
		}

		let resolvedDuration = duration;

		if (!resolvedDuration) {
			resolvedDuration = await ffmpegSvc.probeDuration(audioPath);
		}

		if (!resolvedDuration) {
			throw new Error("Could not determine the YouTube video duration.");
		}

		await store.patchVideo(videoId, {
			sourceType: "youtube",
			sourceUrl: url,
			filePath: null,
			driveFileId: null,
			title,
			duration: resolvedDuration,
			status: "TRANSCRIBING",
			progress: 20,
			error: null,
		});

		await runAudioTranscriptionPipeline(
			videoId,
			audioPath,
			resolvedDuration,
			null,
		);
	} catch (error) {
		console.error(`YouTube ${videoId} processing failed:`, error);

		if (audioPath && fs.existsSync(audioPath)) {
			try {
				fs.unlinkSync(audioPath);
			} catch {}
		}

		await markError(videoId, error.message || "We could not process this YouTube video.");
	}
}

export {
	DIRS,
	runProcessingPipeline,
	runYouTubePipeline,
};

export default {
	DIRS,
	runProcessingPipeline,
	runYouTubePipeline,
};