import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../services/api.js";

const TERMINAL = new Set(["READY", "ERROR", "FAILED", "CLOSED", "EXPIRED"]);
const EXPORT_READY_MESSAGE =
	"Your export is ready to download. Saving a copy to storage…";
const EXPORT_STORED_MESSAGE =
	"Your export was saved to storage. Its three-minute retention period has started.";
const EXPORT_EXPIRED_MESSAGE =
	"This export has expired. Please create it again.";

export function useExport() {
	const [exportId, setExportId] = useState(null);
	const [status, setStatus] = useState(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);
	const [filename, setFilename] = useState(null);
	const [expiresAt, setExpiresAt] = useState(null);
	const [storageStatus, setStorageStatus] = useState("PENDING");
	const [storageError, setStorageError] = useState(null);

	const timer = useRef(null);
	const expiryTimer = useRef(null);
	const activeExportId = useRef(null);
	const readyNotifiedFor = useRef(null);
	const storedNotifiedFor = useRef(null);
	const retryCount = useRef(0);

	const markExpired = useCallback((id, message = EXPORT_EXPIRED_MESSAGE) => {
		if (activeExportId.current !== id) return;

		if (expiryTimer.current) {
			clearTimeout(expiryTimer.current);
			expiryTimer.current = null;
		}

		setStatus("EXPIRED");
		setError(message || EXPORT_EXPIRED_MESSAGE);
		toast.error(message || EXPORT_EXPIRED_MESSAGE, {
			id: `export-expired-${id}`,
		});
	}, []);

	const scheduleExpiry = useCallback(
		(id, expiry) => {
			if (expiryTimer.current) {
				clearTimeout(expiryTimer.current);
				expiryTimer.current = null;
			}

			const expiryMs = expiry ? new Date(expiry).getTime() : NaN;
			if (!Number.isFinite(expiryMs)) return;

			expiryTimer.current = setTimeout(
				() => markExpired(id),
				Math.max(0, expiryMs - Date.now()),
			);
		},
		[markExpired],
	);

	const poll = useCallback(
		(id) => {
			async function tick() {
				try {
					const data = await api.getExportStatus(id);

					if (activeExportId.current !== id) return;

					retryCount.current = 0;
					setStatus(data.status);
					setProgress(data.progress ?? 0);
					setError(data.error || null);
					setFilename(data.filename || null);
					setExpiresAt(data.expiresAt || null);
					setStorageStatus(data.storageStatus || "PENDING");
					setStorageError(data.storageError || null);

					if (
						data.status === "READY" &&
						readyNotifiedFor.current !== id
					) {
						readyNotifiedFor.current = id;
						toast.success(EXPORT_READY_MESSAGE, {
							id: `export-ready-${id}`,
						});
					}

					if (
						data.status === "READY" &&
						data.storageStatus === "STORED"
					) {
						if (storedNotifiedFor.current !== id) {
							storedNotifiedFor.current = id;
							toast.success(EXPORT_STORED_MESSAGE, {
								id: `export-stored-${id}`,
							});
						}
					}
					if (data.status === "READY" && data.expiresAt) {
						scheduleExpiry(id, data.expiresAt);
					}

					const storagePending =
						data.status === "READY" &&
						!["STORED", "FAILED"].includes(data.storageStatus);
					if (!TERMINAL.has(data.status) || storagePending) {
						timer.current = setTimeout(tick, 1500);
					}
				} catch (e) {
					if (activeExportId.current !== id) return;

					if (e.code === "EXPORT_EXPIRED") {
						markExpired(id, e.message);
						return;
					}

					if (e.code === "VIDEO_EXPIRED") {
						setStatus("ERROR");
						setError(e.message);
						return;
					}

					retryCount.current += 1;
					if (retryCount.current > 3) {
						setError(e.message || "Network error while checking export status.");
					}

					timer.current = setTimeout(tick, 2500);
				}
			}

			tick();
		},
		[markExpired, scheduleExpiry],
	);

	const startExport = useCallback(
		async (payload) => {
			setError(null);
			setStatus("QUEUED");
			setProgress(0);
			setFilename(null);
			setExpiresAt(null);
			setStorageStatus("PENDING");
			setStorageError(null);
			setExportId(null);
			retryCount.current = 0;
			readyNotifiedFor.current = null;
			storedNotifiedFor.current = null;

			if (timer.current) clearTimeout(timer.current);
			if (expiryTimer.current) clearTimeout(expiryTimer.current);
			timer.current = null;
			expiryTimer.current = null;
			activeExportId.current = null;

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
		if (timer.current) clearTimeout(timer.current);
		if (expiryTimer.current) clearTimeout(expiryTimer.current);
		timer.current = null;
		expiryTimer.current = null;
		activeExportId.current = null;
		readyNotifiedFor.current = null;
		storedNotifiedFor.current = null;
		retryCount.current = 0;

		setExportId(null);
		setStatus(null);
		setProgress(0);
		setError(null);
		setFilename(null);
		setExpiresAt(null);
		setStorageStatus("PENDING");
		setStorageError(null);
	}, []);

	const downloadExport = useCallback(async () => {
		if (!exportId) return;

		setError(null);
		try {
			const file = await api.downloadExport(exportId);
			const url = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename || "clip.mp4";
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (e) {
			if (e.code === "EXPORT_EXPIRED") {
				markExpired(exportId, e.message);
				return;
			}

			setError(e.message || "Failed to download export.");
		}
	}, [exportId, filename, markExpired]);

	useEffect(() => {
		return () => {
			if (timer.current) clearTimeout(timer.current);
			if (expiryTimer.current) clearTimeout(expiryTimer.current);
			activeExportId.current = null;
		};
	}, []);

	return {
		startExport,
		resetExport,
		downloadExport,
		exportId,
		status,
		progress,
		error,
		filename,
		expiresAt,
		storageStatus,
		storageError,
	};
}
