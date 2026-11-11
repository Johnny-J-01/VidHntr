import fs from "fs";
import path from "path";

import * as store from "../../db/videos.js";
import ytdlp from "../ytdlp/client.js";
import ffmpegSvc from "../ffmpeg/config.js";
import { DIRS } from "./paths.js";
import { parseSrtTranscript } from "./subtitles.js";
import {
	completeVideoTranscription,
	markError,
	runAudioTranscriptionPipeline,
} from "./shared.js";

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

		await completeVideoTranscription(videoId, transcript, {
			duration,
			title,
			transcriptPath: null,
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

export { runYouTubePipeline, runYouTubeCaptionPipeline };

