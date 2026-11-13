import { performance } from "node:perf_hooks";

export function createExportMetrics(createdAt) {
	const timings = {
		queueWaitMs: Math.max(0, Date.now() - Number(createdAt || Date.now())),
		sourceRetrievalMs: 0,
		ffprobeMs: 0,
		ffmpegMs: 0,
		captionPreparationMs: 0,
		localOutputPreparationMs: 0,
		driveUploadMs: null,
		totalExportMs: null,
	};
	const resources = [];

	return {
		timings,
		resources,
		async measure(stage, work) {
			const startedAt = performance.now();
			try {
				return await work();
			} finally {
				timings[stage] = (timings[stage] || 0) + performance.now() - startedAt;
			}
		},
		snapshot(details = {}) {
			return {
				version: 1,
				...Object.fromEntries(Object.entries(timings).map(([key, value]) => [
					key, value === null ? null : Math.round(value),
				])),
				resources,
				...details,
			};
		},
	};
}

export function safeExportError(error) {
	// FFmpeg/FFprobe error text may contain an authenticated command line.
	return String(error?.message || error || "Export failed.")
		.replace(/Bearer\s+[^\s'"\\]+/gi, "Bearer [REDACTED]")
		.slice(0, 4000);
}
