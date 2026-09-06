const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers:
      options.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    ...options,
  });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");

  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    throw new Error(
      (data && data.error) || `Request failed (${res.status})`,
    );
  }

  return data;
}

export const api = {
  // Videos
  listVideos: () => request("/videos"),

  getVideo: (id) => request(`/videos/${id}`),

  getVideoStatus: (id) => request(`/videos/${id}/status`),

  getTranscript: (id) => request(`/videos/${id}/transcript`),

  uploadVideo: (file, title) => {
    const form = new FormData();

    form.append("video", file);

    if (title) {
      form.append("title", title);
    }

    return request("/videos/upload", {
      method: "POST",
      body: form,
    });
  },

  addYouTube: (url) =>
    request("/videos/youtube", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

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
    request(`/videos/${videoId}/suggestions`, {
      method: "POST",
    }),

  videoFileUrl: (id) => `${BASE}/videos/${id}/file`,

  videoThumbnailUrl: (id) => `${BASE}/videos/${id}/thumbnail`,

  // Exports
  createExport: (payload) =>
    request("/exports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getExportStatus: (id) => request(`/exports/${id}/status`),

  exportDownloadUrl: (id) => `${BASE}/exports/${id}/download`,

  cleanupTemporaryExports: (videoId) =>
    request(`/exports/video/${videoId}/temporary`, {
      method: "DELETE",
    }),
};
