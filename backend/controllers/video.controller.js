import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

import * as store from "../db/videos.js";
import jobs from "../services/video/processing.js";
import ytdlp from "../services/ytdlp/client.js";
import ai from "../services/ai/client.js";

const ALLOWED_MIME = new Set([
	"video/mp4",
	"video/quicktime",
	"video/webm",
	"video/x-matroska",
]);

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const upload = multer({
	storage: multer.diskStorage({
		destination: (request, file, callback) =>
			callback(null, jobs.DIRS.uploads),

		filename: (request, file, callback) => {
			const id = request.videoId || (request.videoId = uuid());
			const ext = path.extname(file.originalname) || ".mp4";

			callback(null, `${id}${ext}`);
		},
	}),

	limits: {
		fileSize: MAX_SIZE_BYTES,
	},

	fileFilter: (request, file, callback) => {
		if (!ALLOWED_MIME.has(file.mimetype)) {
			callback(
				new Error("Unsupported file type. Upload MP4, MOV, or WebM."),
			);
			return;
		}

		callback(null, true);
	},
});

function publicVideo(video) {
	if (!video) return null;

	return {
		id: video.id,
		title: video.title,
		sourceType: video.sourceType,
		sourceUrl: video.sourceUrl || null,
		duration: video.duration || null,
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
		createdAt: video.createdAt,
		expiresAt: video.expiresAt,
	};
}

function getYouTubeVideoId(url) {
	if (!url || typeof url !== "string") return null;

	try {
		const parsed = new URL(url);

		if (
			["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
				parsed.hostname,
			)
		) {
			const pathname = parsed.pathname;

			if (pathname === "/watch") {
				return parsed.searchParams.get("v");
			}

			if (pathname.startsWith("/embed/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/shorts/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/live/")) {
				return pathname.split("/")[2] || null;
			}
		}

		if (parsed.hostname === "youtu.be") {
			return parsed.pathname.split("/")[1] || null;
		}

		return null;
	} catch {
		return null;
	}
}

function getTranscriptOrThrow(video) {
	if (!Array.isArray(video.transcript)) {
		const error = new Error(
			"This video is still processing. Try again once it is ready.",
		);

		error.status = 409;

		throw error;
	}

	return video.transcript;
}

export const uploadVideo = (request, response) => {
	upload.single("video")(request, response, async (error) => {
		if (error) {
			return response
				.status(400)
				.json({ error: error.message || "Upload failed." });
		}

		if (!request.file) {
			return response
				.status(400)
				.json({ error: "No video file was provided." });
		}

		const id = request.videoId;

		const title = (
			request.body.title ||
			request.file.originalname ||
			"Untitled video"
		).replace(/\.[^/.]+$/, "");

		const createdAt = Date.now();

		const video = {
			id,
			userId: request.user?.id ?? null,
			title,
			sourceType: "upload",
			sourceUrl: null,

			// Original filename is now preserved for Google Drive.
			filename: request.file.originalname,

			filePath: request.file.path,
			thumbnailPath: null,
			duration: null,

			status: "QUEUED",
			progress: 0,

			transcript: null,
			transcriptPath: null,

			createdAt,
			expiresAt: createdAt + 24 * 60 * 60 * 1000,
		};

		await store.upsertVideo(video);

		// Processing intentionally runs asynchronously.
		// The API immediately returns 202 while the pipeline continues.
		jobs.runProcessingPipeline(id);

		return response.status(202).json({
			videoId: id,
			status: "queued",
		});
	});
};

export const listVideos = async (request, response) =>
	response.json((await store.listVideos()).map(publicVideo));

export const createYouTubeVideo = async (request, response) => {
	const { url } = request.body || {};

	if (!ytdlp.isValidYouTubeUrl(url)) {
		return response
			.status(400)
			.json({ error: "That doesn't look like a valid YouTube URL." });
	}

	const id = uuid();
	const youtubeId = getYouTubeVideoId(url);
	const createdAt = Date.now();

	const video = {
		id,
		userId: request.user?.id ?? null,
		title: "YouTube video",
		sourceType: "youtube",
		sourceUrl: url,
		youtubeId,

		filePath: null,
		thumbnailPath: null,
		duration: null,

		status: "QUEUED",
		progress: 0,

		transcript: null,
		transcriptPath: null,

		createdAt,
		expiresAt: createdAt + 24 * 60 * 60 * 1000,
	};

	await store.upsertVideo(video);

	jobs.runYouTubePipeline(id, url);

	return response.status(202).json({
		videoId: id,
		status: "queued",
	});
};

export const getYouTubeVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	if (video.sourceType !== "youtube") {
		return response
			.status(400)
			.json({ error: "This video is not a YouTube video." });
	}

	const youtubeId =
		video.youtubeId || getYouTubeVideoId(video.sourceUrl);

	if (!youtubeId) {
		return response
			.status(400)
			.json({ error: "Could not determine the YouTube video ID." });
	}

	return response.json({
		videoId: video.id,
		youtubeId,
		sourceUrl: video.sourceUrl,
		embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
	});
};

export const getVideoStatus = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	return response.json({
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
	});
};

export const getVideoTranscript = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	try {
		const transcript = getTranscriptOrThrow(video);

		return response.json({
			videoId: video.id,
			transcript,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error: error.message || "Failed to load transcript.",
		});
	}
};

export const getVideoFile = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video || !video.filePath) {
		return response.status(404).json({
			error: "Video file not found.",
		});
	}

	return response.sendFile(path.resolve(video.filePath));
};

export const getVideoThumbnail = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video || !video.thumbnailPath) {
		return response.status(404).end();
	}

	return response.sendFile(path.resolve(video.thumbnailPath));
};

export const searchVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	try {
		const transcript = getTranscriptOrThrow(video);
		const { query, mood } = request.body || {};

		let results;

		if (mood) {
			results = await ai.searchByMood(
				transcript,
				mood,
				video.duration || 0,
			);
		} else {
			if (!query || !query.trim()) {
				return response
					.status(400)
					.json({ error: "Enter something to search for." });
			}

			results = await ai.semanticSearch(
				transcript,
				query.trim(),
				video.duration || 0,
			);
		}

		return response.json({
			videoId: video.id,
			query: query || mood,
			results,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error:
				error.message ||
				"Something went wrong while searching this video.",
		});
	}
};

export const getVideoSuggestions = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	try {
		const transcript = getTranscriptOrThrow(video);

		const suggestions = await ai.suggestClips(
			transcript,
			video.duration || 0,
		);

		return response.json({
			videoId: video.id,
			suggestions,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error:
				error.message ||
				"Something went wrong while analyzing this video.",
		});
	}
};

export const getVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	return response.json(publicVideo(video));
};
