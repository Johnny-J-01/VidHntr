import UploadCard from "./UploadCard.jsx";
import YouTubeInput from "./YouTubeInput.jsx";
import VideoList from "./VideoList.jsx";

export default function SourcesPanel({
	videos,
	selectedId,
	onSelect,
	onUpload,
	onAddYouTube,
	onDelete,
	onRetry,
	storage,
}) {
	return (
		<aside className="w-full h-full min-w-0 bg-cf-bg flex flex-col overflow-hidden">
			<div className="p-3 sm:p-4 flex-1 min-h-0 min-w-0 flex flex-col">
				{/* HEADER */}
				<div className="flex items-center justify-between mb-3 shrink-0">
					<p className="text-[13px] font-semibold">Sources</p>
					<span className="text-cf-muted text-sm">⭱</span>
				</div>

				{/* UPLOAD */}
				<div className="w-full min-w-0 shrink-0">
					<UploadCard onUpload={onUpload} />
				</div>

				{/* YOUTUBE */}
				<div className="w-full min-w-0 shrink-0">
					<YouTubeInput onAdd={onAddYouTube} />
				</div>

				{/* VIDEO LIST */}
				<div className="flex-1 min-h-[120px] min-w-0 w-full overflow-hidden">
					<VideoList
						videos={videos}
						selectedId={selectedId}
						onSelect={onSelect}
						onDelete={onDelete}
						onRetry={onRetry}
					/>
				</div>
			</div>
		</aside>
	);
}
