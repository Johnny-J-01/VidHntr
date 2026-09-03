import { forwardRef } from "react";

const VideoPlayer = forwardRef(function VideoPlayer() {
	return (
		<div className="aspect-video w-full bg-black flex items-center justify-center">
			<p className="text-sm text-cf-muted">Video Player</p>
		</div>
	);
});

export default VideoPlayer;
