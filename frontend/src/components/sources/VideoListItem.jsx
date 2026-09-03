import { useVideoStatus } from "../../hooks/useVideoStatus.js";
import { api } from "../../services/api.js";

const STATUS_LABEL = {
	QUEUED: "Queued",
	DOWNLOADING: "Downloading…",
	EXTRACTING_AUDIO: "Preparing…",
	TRANSCRIBING: "Transcribing…",
	ANALYZING: "Analyzing…",
	READY: "Ready",
	ERROR: "Error",
};

export default function VideoListItem({ video, selected, onSelect }) {
	const { status, progress, error } = useVideoStatus(video.id, video.status);
	const isBusy = !["READY", "ERROR"].includes(status);
	const label = STATUS_LABEL[status] || status;

	return (
		<button
			onClick={() => onSelect(video.id)}
			className={`w-full text-left flex items-center gap-3 p-2 rounded-cf border transition ${
				selected
					? "border-cf-yellow bg-cf-yellowDim"
					: "border-transparent hover:border-cf-border hover:bg-cf-panel2"
			}`}
		>
			<div className="w-14 h-9 rounded-[6px] overflow-hidden bg-cf-panel2 border border-cf-border shrink-0 flex items-center justify-center text-cf-muted text-xs">
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
			<div className="min-w-0 flex-1">
				<p className="text-[13px] leading-tight truncate">
					{video.title}
				</p>
				<div className="flex items-center gap-1.5 mt-0.5">
					<span
						className={`w-1.5 h-1.5 rounded-full ${
							status === "READY"
								? "bg-emerald-400"
								: status === "ERROR"
									? "bg-red-400"
									: "bg-cf-yellow animate-pulse"
						}`}
					/>
					<span
						className={`text-[11px] ${status === "ERROR" ? "text-red-400" : "text-cf-muted"}`}
					>
						{status === "ERROR" && error ? error : label}
						{isBusy &&
						status !== "DOWNLOADING" &&
						status !== "QUEUED"
							? ` ${progress}%`
							: ""}
					</span>
				</div>
			</div>
			{isBusy && (
				<span className="text-cf-yellow text-xs shrink-0">◌</span>
			)}
		</button>
	);
}
