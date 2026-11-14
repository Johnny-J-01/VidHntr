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
	getVideoThumbnail: (id) => requestBlob(`/videos/${id}/thumbnail`),

	uploadVideo: async (file, title, onProgress) => {
		const { data: authData } = supabase
			? await supabase.auth.getSession()
			: { data: null };
		const form = new FormData();
		form.append("video", file);
		if (title) form.append("title", title);

		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open("POST", `${BASE}/videos/upload`);
			xhr.withCredentials = true;
			if (authData?.session?.access_token) {
				xhr.setRequestHeader("Authorization", `Bearer ${authData.session.access_token}`);
			}

			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable && onProgress) {
					onProgress(Math.round((event.loaded / event.total) * 100));
				}
			};
			xhr.onerror = () => reject(new Error("Network error while uploading video."));
			xhr.onabort = () => reject(new Error("Video upload was cancelled."));
			xhr.onload = () => {
				let data = {};
				try {
					data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
				} catch {
					// A non-JSON proxy error still receives the generic HTTP error below.
				}

				if (xhr.status >= 200 && xhr.status < 300) return resolve(data);

				const error = new Error(data.error || `Request failed (${xhr.status})`);
				error.code = data.code;
				error.status = xhr.status;
				error.ownerType = data.ownerType;
				reject(error);
			};
			xhr.send(form);
		});
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

	// Exports (Initiate job - returns 202 immediately)
	createExport: (payload) =>
		request("/exports", {
			method: "POST",
			body: JSON.stringify(payload),
		}),

	// Poll this endpoint instead of keeping a single connection open
	getExportStatus: (id) => request(`/exports/${id}/status`),

	downloadExport: (id) => requestBlob(`/exports/${id}/download`),

	cleanupTemporaryExports: (videoId) =>
		request(`/exports/video/${videoId}/temporary`, {
			method: "DELETE",
	}),
};
