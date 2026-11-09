export function canAccessVideo(request, video) {
	if (!video) return false;

	if (video.userId) {
		return Boolean(request.user && request.user.id === video.userId);
	}

	if (video.guestId) {
		return Boolean(!request.user && request.guestId === video.guestId);
	}

	return false;
}

export function canAccessExport(request, exportJob, video) {
	if (!exportJob || !video || exportJob.videoId !== video.id) return false;
	if (!canAccessVideo(request, video)) return false;

	if (video.userId) {
		return exportJob.userId === video.userId;
	}

	return exportJob.guestId === video.guestId;
}

export function canDeleteVideo(request, video) {
	if (!video) return false;

	// Guest uploads cannot be deleted by ANYONE (neither guests nor logged-in users)
	if (!video.userId) {
		return false;
	}

	// Logged-in uploads can ONLY be deleted by their authenticated owner
	return Boolean(request.user && request.user.id === video.userId);
}

export function publicVideo(video) {
	if (!video) return null;

	return {
		id: video.id,
		title: video.title,
		sourceType: video.sourceType,
		sourceUrl: video.sourceUrl || null,
		duration: video.duration || null,
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
		createdAt: video.createdAt,
		expiresAt: video.expiresAt,
		ownerType: video.userId ? "authenticated" : "guest",
		canDelete: false,
	};
}

export function requireVideoAccess(request, response, video) {
	if (!video) {
		response.status(404).json({ error: "Video not found." });
		return false;
	}
	if (!canAccessVideo(request, video)) {
		response.status(403).json({ error: "You cannot access this video." });
		return false;
	}
	return true;
}

export function publicVideoForRequest(request, video) {
	const result = publicVideo(video);
	return {
		...result,
		canDelete: canDeleteVideo(request, video),
	};
}

export function getYouTubeVideoId(url) {
	if (!url || typeof url !== "string") return null;

	try {
		const parsed = new URL(url);

		if (
			["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
				parsed.hostname,
			)
		) {
			const pathname = parsed.pathname;

			if (pathname === "/watch") {
				return parsed.searchParams.get("v");
			}

			if (pathname.startsWith("/embed/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/shorts/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/live/")) {
				return pathname.split("/")[2] || null;
			}
		}

		if (parsed.hostname === "youtu.be") {
			return parsed.pathname.split("/")[1] || null;
		}

		return null;
	} catch {
		return null;
	}
}

export function getTranscriptOrThrow(video) {
	if (!Array.isArray(video.transcript)) {
		const error = new Error(
			"This video is still processing. Try again once it is ready.",
		);

		error.status = 409;

		throw error;
	}

	return video.transcript;
}
