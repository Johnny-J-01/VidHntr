import path from "path";

import * as store from "../../db/videos.js";
import {
	getTranscriptOrThrow,
	getYouTubeVideoId,
	publicVideoForRequest,
	requireVideoAccess,
} from "./video-helpers.js";

export const getYouTubeVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

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

	if (!requireVideoAccess(request, response, video)) return;

	return response.json({
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
	});
};

export const getVideoTranscript = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

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

	if (!requireVideoAccess(request, response, video)) return;

	if (!video.filePath) {
		return response.status(404).json({
			error: "Video file not found.",
		});
	}

	return response.sendFile(path.resolve(video.filePath));
};

export const getVideoThumbnail = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	if (!video.thumbnailPath) {
		return response.status(404).end();
	}

	return response.sendFile(path.resolve(video.thumbnailPath));
};

export const getVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	return response.json(publicVideoForRequest(request, video));
};
