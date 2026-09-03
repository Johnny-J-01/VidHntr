import UploadCard from "./UploadCard.jsx";
import YouTubeInput from "./YouTubeInput.jsx";
import VideoList from "./VideoList.jsx";

export default function SourcesPanel() {
	return (
		<aside className="w-full h-full min-w-0 bg-cf-bg flex flex-col overflow-hidden">
			<div className="p-4 flex-1 min-h-0 flex flex-col">
				<div className="flex items-center justify-between mb-3">
					<p className="text-[13px] font-semibold">Sources</p>
					<span className="text-cf-muted text-sm">⭱</span>
				</div>

				<UploadCard />
				<YouTubeInput />

				<div className="flex-1 min-h-0 mt-4">
					<VideoList />
				</div>
			</div>

			<div className="p-4 border-t border-cf-border">
				<div className="flex items-center justify-between text-[11px] text-cf-muted mb-1.5">
					<span>Storage</span>
					<span>0 / 0</span>
				</div>

				<div className="h-1.5 rounded-full bg-cf-panel2 overflow-hidden">
					<div className="h-full w-0 bg-cf-yellow" />
				</div>
			</div>
		</aside>
	);
}
