export function useVideoStatus() {
	return {
		status: "QUEUED",
		progress: 0,
		error: null,
	};
}