import { useEffect, useState } from "react";
import { useVideoStatus } from "../../hooks/useVideoStatus.js";

const STATUS_LABEL = {
	QUEUED: "Queued",
	DOWNLOADING: "Downloading…",
	EXTRACTING_AUDIO: "Preparing…",
	TRANSCRIBING: "Transcribing…",
	ANALYZING: "Analyzing…",
	READY: "Ready",
	ERROR: "Error",
};

function getExpirationMs(video) {
	if (!video) return null;
	if (video.expiresAt) {
		const ms = new Date(video.expiresAt).getTime();
		if (!isNaN(ms)) return ms;
	}
	if (video.createdAt) {
		const ms = new Date(video.createdAt).getTime();
		if (!isNaN(ms)) return ms + 15 * 60 * 1000;
	}
	return null;
}

function formatCountdown(seconds) {
	if (seconds === null || seconds === undefined) return "";
	if (seconds <= 0) return "Expired";
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoListItem({
	video,
	selected,
	onSelect,
	onDelete,
	onRetry,
	onExpire,
}) {
	const { status, progress, error } = useVideoStatus(video.id, video.status);
	const isBusy = !["READY", "ERROR"].includes(status);
	const isError = status === "ERROR";
	const label = STATUS_LABEL[status] || status;

	const [timeLeft, setTimeLeft] = useState(() => {
		const ms = getExpirationMs(video);
		return ms ? Math.max(0, Math.floor((ms - Date.now()) / 1000)) : null;
	});

	useEffect(() => {
		const expiryMs = getExpirationMs(video);
		if (!expiryMs) {
			setTimeLeft(null);
			return;
		}

		const updateTimer = () => {
			const remaining = Math.max(
				0,
				Math.floor((expiryMs - Date.now()) / 1000),
			);
			setTimeLeft(remaining);
			if (remaining <= 0 && onExpire) {
				onExpire(video.id);
			}
		};

		updateTimer();
		const interval = setInterval(updateTimer, 1000);

		return () => clearInterval(interval);
	}, [video, onExpire]);

	return (
		<div
			className={`w-full text-left flex items-center justify-between gap-2 p-2 rounded-cf border transition ${
				selected
					? "border-cf-yellow bg-cf-yellowDim"
					: "border-transparent hover:border-cf-border hover:bg-cf-panel2"
			}`}
		>
			{/* Main Select Button */}
			<button
				type="button"
				onClick={() => onSelect(video.id)}
				className="min-w-0 flex flex-1 items-center gap-2.5 text-left"
			>
				{/* Thumbnail */}
				<div className="w-12 h-8 rounded-[6px] overflow-hidden bg-cf-panel2 border border-cf-border shrink-0 flex items-center justify-center text-cf-muted text-xs">
					{video.thumbnailUrl ? (
						<img
							src={video.thumbnailUrl}
							alt=""
							className="w-full h-full object-cover"
						/>
					) : (
						"▶"
					)}
				</div>

				{/* Title and Animated/Static Status */}
				<div className="min-w-0 flex-1">
					<p className="text-[13px] leading-tight truncate font-medium text-white">
						{video.title}
					</p>

					<div className="flex items-center gap-1.5 mt-1">
						{isBusy ? (
							<svg
								className="w-3 h-3 text-cf-yellow animate-spin shrink-0"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
						) : (
							<span
								className={`w-1.5 h-1.5 rounded-full shrink-0 ${
									status === "READY"
										? "bg-emerald-400"
										: "bg-red-400"
								}`}
							/>
						)}

						<span
							className={`text-[11px] truncate ${
								isError
									? "text-red-400"
									: isBusy
										? "text-cf-yellow"
										: "text-cf-muted"
							}`}
						>
							{isError && error ? error : label}
							{isBusy &&
							status !== "DOWNLOADING" &&
							status !== "QUEUED"
								? ` ${progress}%`
								: ""}
						</span>
					</div>
				</div>
			</button>

			{/* Action Group (Far Right) */}
			<div className="flex items-center gap-1 shrink-0">
				{video.ownerType === "guest" && (
					<span className="rounded border border-cf-border px-1.5 py-0.5 text-[10px] text-cf-muted mr-1">
						Guest
					</span>
				)}

				{timeLeft !== null && (
					<span
						className={`rounded border px-1.5 py-0.5 text-[10px] font-mono mr-1 ${
							timeLeft <= 60
								? "border-red-500/40 text-red-400 bg-red-500/10 animate-pulse"
								: "border-cf-border text-cf-muted"
						}`}
						title="Time until video expires"
					>
						⏱ {formatCountdown(timeLeft)}
					</span>
				)}

				{/* Retry Button (Appears on Error or when onRetry is provided) */}
				{(isError || onRetry) && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							if (onRetry) onRetry(video);
						}}
						className="rounded p-1 text-cf-muted hover:bg-amber-500/10 hover:text-cf-yellow transition-colors"
						title={`Retry processing ${video.title}`}
						aria-label={`Retry ${video.title}`}
					>
						<svg
							className="w-3.5 h-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
							<path d="M21 3v5h-5" />
						</svg>
					</button>
				)}

				{/* Delete Button */}
				{video.canDelete && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(video);
						}}
						className="rounded p-1 text-cf-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
						title={`Delete ${video.title}`}
						aria-label={`Delete ${video.title}`}
					>
						✕
					</button>
				)}
			</div>
		</div>
	);
}