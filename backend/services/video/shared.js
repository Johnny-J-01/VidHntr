import fs from "fs";

import * as store from "../../db/videos.js";
import { storeVideoJsonFiles } from "../storage/video-files.js";
import transcription from "../transcription/deepgram.js";

async function markError(videoId, message) {
	await store.patchVideo(videoId, {
		status: "ERROR",
		progress: 0,
		error: message,
	});
}

export async function completeVideoTranscription(
	videoId,
	transcript,
	runtimePatch = {},
) {
	const video = await store.getVideo(videoId);
	if (!video) throw new Error("Video was not found while saving its transcript.");

	const fileIds = await storeVideoJsonFiles(
		{
			...video,
			status: "READY",
			progress: 100,
			error: null,
		},
		transcript,
	);

	return store.patchVideo(videoId, {
		...runtimePatch,
		...fileIds,
		status: "READY",
		transcriptionStatus: "COMPLETED",
		progress: 100,
		transcript,
		error: null,
	});
}

async function runAudioTranscriptionPipeline(videoId, audioPath, duration, thumbnailPath = null) {
	let transcript = [];

	await store.patchVideo(videoId, {
		status: "TRANSCRIBING",
		transcriptionStatus: "PROCESSING",
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

	await completeVideoTranscription(videoId, transcript, { thumbnailPath });

	// Delete audio only after completeVideoTranscription succeeded
	if (fs.existsSync(audioPath)) {
		try {
			fs.unlinkSync(audioPath);
		} catch {}
	}
}

export { markError, runAudioTranscriptionPipeline };
