import assert from "node:assert/strict";
import test from "node:test";

import {
	getYouTubeIngestionDisabledResponse,
	isYouTubeIngestionEnabled,
	YOUTUBE_INGESTION_DISABLED_CODE,
} from "../services/video/youtube-ingestion-config.js";

test("YouTube ingestion is disabled unless explicitly enabled", () => {
	assert.equal(isYouTubeIngestionEnabled({}), false);
	assert.equal(isYouTubeIngestionEnabled({ ENABLE_YOUTUBE_INGESTION: "false" }), false);
	assert.equal(isYouTubeIngestionEnabled({ ENABLE_YOUTUBE_INGESTION: "true" }), true);
	assert.equal(isYouTubeIngestionEnabled({ ENABLE_YOUTUBE_INGESTION: "TRUE" }), true);
});

test("disabled YouTube ingestion returns a stable API error", () => {
	const response = getYouTubeIngestionDisabledResponse();
	assert.equal(response.code, YOUTUBE_INGESTION_DISABLED_CODE);
	assert.match(response.error, /Download the video and upload it directly/);
});
