import { useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";

const TERMINAL = new Set(["READY", "ERROR"]);

export function useVideoStatus(videoId, initialStatus) {
	const [status, setStatus] = useState(initialStatus || "QUEUED");
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);
	const timer = useRef(null);

	useEffect(() => {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}

		if (!videoId) return undefined;

		let cancelled = false;

		async function poll() {
			try {
				const data = await api.getVideoStatus(videoId);

				if (cancelled) return;

				setStatus(data.status);
				setProgress(data.progress ?? 0);
				setError(data.error || null);

				if (!TERMINAL.has(data.status)) {
					timer.current = setTimeout(poll, 1800);
				}
			} catch (e) {
				if (!cancelled) {
					setError(e.message);
					timer.current = setTimeout(poll, 4000);
				}
			}
		}

		poll();

		return () => {
			cancelled = true;

			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
		};
	}, [videoId]);

	return { status, progress, error };
}
