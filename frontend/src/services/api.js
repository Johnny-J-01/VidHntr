import { supabase } from "./supabase.js";

const API_HOST = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, "") : "";
const BASE = `${API_HOST}/api`;

async function request(path, options = {}) {
	const { data: authData } = supabase
		? await supabase.auth.getSession()
		: { data: null };
	const headers = new Headers(options.headers);

	if (!(options.body instanceof FormData)) {
		headers.set("Content-Type", "application/json");
	}

	if (authData?.session?.access_token) {
		headers.set(
			"Authorization",
			`Bearer ${authData.session.access_token}`,
		);
	}

	const res = await fetch(`${BASE}${path}`, {
		...options,
		headers,
		credentials: "include",
	});

	const isJson = res.headers
		.get("content-type")
		?.includes("application/json");

	const data = isJson ? await res.json().catch(() => ({})) : null;

	if (!res.ok) {
		const error = new Error((data && data.error) || `Request failed (${res.status})`);
		error.code = data?.code;
		error.status = res.status;
		error.ownerType = data?.ownerType;
		throw error;
	}

	return data;
}

async function requestBlob(path) {
	const { data: authData } = supabase
		? await supabase.auth.getSession()
		: { data: null };
	const headers = new Headers();

	if (authData?.session?.access_token) {
		headers.set("Authorization", `Bearer ${authData.session.access_token}`);
	}

	const response = await fetch(`${BASE}${path}`, {
		headers,
		credentials: "include",
	});

	if (!response.ok) {
		const data = await response.json().catch(() => ({}));
		throw new Error(data.error || `Request failed (${response.status})`);
	}

	return response.blob();
}

export const api = {
	listVideos: () => request("/videos"),
	getVideo: (id) => request(`/videos/${id}`),
	getVideoStatus: (id) => request(`/videos/${id}/status`),
	getTranscript: (id) => request(`/videos/${id}/transcript`),
	getVideoFile: (id) => requestBlob(`/videos/${id}/file`),

	uploadVideo: (file, title) => {
		const form = new FormData();
		form.append("video", file);
		if (title) form.append("title", title);
		return request("/videos/upload", { method: "POST", body: form });
	},

	addYouTube: (url) =>
		request("/videos/youtube", {
			method: "POST",
			body: JSON.stringify({ url }),
		}),

	deleteVideo: (id) => request(`/videos/${id}`, { method: "DELETE" }),
	getYouTubeInfo: (id) => request(`/videos/${id}/youtube`),

	search: (videoId, query) =>
		request(`/videos/${videoId}/search`, {
			method: "POST",
			body: JSON.stringify({ query }),
		}),

	searchByMood: (videoId, mood) =>
		request(`/videos/${videoId}/search`, {
			method: "POST",
			body: JSON.stringify({ mood }),
		}),

	getSuggestions: (videoId) =>
		request(`/videos/${videoId}/suggestions`, { method: "POST" }),

	videoFileUrl: (id) => `${BASE}/videos/${id}/file`,
	videoThumbnailUrl: (id) => `${BASE}/videos/${id}/thumbnail`,

	// Exports (Initiate job - returns 202 immediately)
	createExport: (payload) =>
		request("/exports", {
			method: "POST",
			body: JSON.stringify(payload),
		}),

	// Poll this endpoint instead of keeping a single connection open
	getExportStatus: (id) => request(`/exports/${id}/status`),

	exportDownloadUrl: (id) => `${BASE}/exports/${id}/download`,

	cleanupTemporaryExports: (videoId) =>
		request(`/exports/video/${videoId}/temporary`, {
			method: "DELETE",
		}),
};

// Example polling pattern for your frontend export trigger:
async function handleExportWithPolling(payload, onProgress) {
  // 1. Trigger the background export job
  const { exportId } = await api.createExport(payload);
  
  // 2. Poll for status until completed or failed
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // check every 2 seconds
    const statusData = await api.getExportStatus(exportId);
    
    if (onProgress) {
      onProgress(statusData.progress, statusData.status);
    }
    
    if (statusData.status === "READY") {
      return exportId;
    }
    
    if (statusData.status === "FAILED" || statusData.status === "CLOSED") {
      throw new Error(statusData.error || "Export processing failed.");
    }
  }
}