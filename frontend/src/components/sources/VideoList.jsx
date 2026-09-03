import VideoListItem from "./VideoListItem.jsx";

export default function VideoList() {
	return (
		<div className="h-full">
			<p className="text-[11px] tracking-wide text-cf-muted mb-2 px-1">
				VIDEOS
			</p>

			<div className="flex flex-col gap-1 overflow-y-auto">
				<VideoListItem />
			</div>
		</div>
	);
}
