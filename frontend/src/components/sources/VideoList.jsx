import VideoListItem from "./VideoListItem.jsx";

export default function VideoList({
	videos,
	selectedId,
	onSelect,
	onDelete,
	onRetry,
}) {
	return (
		<div className="mt-4">
			<p className="text-[11px] tracking-wide text-cf-muted mb-2 px-1">
				VIDEOS
			</p>
			<div
				className="flex flex-col gap-1 overflow-y-auto pr-1"
				style={{ maxHeight: "calc(100vh - 480px)" }}
			>
				{videos.length === 0 && (
					<p className="text-[12px] text-cf-muted px-1 py-2">
						No videos yet. Upload one or paste a YouTube link.
					</p>
				)}
				{videos.map((v) => (
					<VideoListItem
						key={v.id}
						video={v}
						selected={v.id === selectedId}
						onSelect={onSelect}
						onDelete={onDelete}
						onRetry={onRetry}
					/>
				))}
			</div>
		</div>
	);
}
