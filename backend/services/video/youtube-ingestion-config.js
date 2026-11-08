export const YOUTUBE_INGESTION_DISABLED_CODE = "YOUTUBE_INGESTION_DISABLED";
export const YOUTUBE_INGESTION_DISABLED_MESSAGE =
	"Direct YouTube processing is unavailable on the hosted version. Download the video and upload it directly instead.";

export function isYouTubeIngestionEnabled(environment = process.env) {
	return String(environment.ENABLE_YOUTUBE_INGESTION || "").trim().toLowerCase() === "true";
}

export function getYouTubeIngestionDisabledResponse() {
	return {
		error: YOUTUBE_INGESTION_DISABLED_MESSAGE,
		code: YOUTUBE_INGESTION_DISABLED_CODE,
	};
}
