import * as store from "../../db/videos.js";
import ai from "../../services/ai/client.js";
import { getTranscriptOrThrow, requireVideoAccess } from "./video-helpers.js";

export const searchVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

	try {
		const transcript = await getTranscriptOrThrow(video);
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

	if (!(await requireVideoAccess(request, response, video))) return;

	try {
		const transcript = await getTranscriptOrThrow(video);

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
