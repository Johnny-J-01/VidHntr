import { useCallback, useRef, useState } from "react";
import { api } from "../services/api.js";

const TERMINAL = new Set(["READY", "ERROR", "FAILED", "CLOSED"]);

export function useExport() {
	const [exportId, setExportId] = useState(null);
	const [status, setStatus] = useState(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);
	const [filename, setFilename] = useState(null);

	const timer = useRef(null);
	const activeExportId = useRef(null);
	const videoId = useRef(null);
	const retryCount = useRef(0);

	const poll = useCallback((id) => {
		async function tick() {
			try {
				const data = await api.getExportStatus(id);

				if (activeExportId.current !== id) {
					return;
				}

				retryCount.current = 0; // Reset consecutive error count on successful status check
				setStatus(data.status);
				setProgress(data.progress ?? 0);
				setError(data.error || null);
				setFilename(data.filename || null);

				if (!TERMINAL.has(data.status)) {
					timer.current = setTimeout(tick, 1500);
				}
			} catch (e) {
				if (activeExportId.current !== id) {
					return;
				}

				retryCount.current += 1;

				// Allow up to 3 consecutive transient network drops before displaying UI error
				if (retryCount.current > 3) {
					setError(e.message || "Network error while checking export status.");
				}

				timer.current = setTimeout(tick, 2500);
			}
		}

		tick();
	}, []);

	const startExport = useCallback(
		async (payload) => {
			setError(null);
			setStatus("QUEUED");
			setProgress(0);
			setFilename(null);
			setExportId(null);
			retryCount.current = 0;

			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}

			activeExportId.current = null;
			videoId.current = payload.videoId;

			try {
				const data = await api.createExport(payload);

				activeExportId.current = data.exportId;
				setExportId(data.exportId);

				poll(data.exportId);
			} catch (e) {
				activeExportId.current = null;
				setError(e.message || "Failed to start export.");
				setStatus("ERROR");
			}
		},
		[poll],
	);

	const resetExport = useCallback(() => {
		const currentVideoId = videoId.current;

		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}

		activeExportId.current = null;
		videoId.current = null;
		retryCount.current = 0;

		setExportId(null);
		setStatus(null);
		setProgress(0);
		setError(null);
		setFilename(null);

		if (currentVideoId) {
			api.cleanupTemporaryExports(currentVideoId).catch((error) => {
				console.error(
					"Failed to clean temporary exports:",
					error,
				);
			});
		}
	}, []);

	const downloadUrl = exportId
		? api.exportDownloadUrl(exportId)
		: null;

	return {
		startExport,
		resetExport,
		exportId,
		status,
		progress,
		error,
		downloadUrl,
		filename,
	};
}