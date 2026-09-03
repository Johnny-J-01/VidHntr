export default function UploadCard() {
	return (
		<div className="cf-panel border-dashed p-6 flex flex-col items-center justify-center gap-2 text-center">
			<div className="w-9 h-9 rounded-cf bg-cf-yellowDim text-cf-yellow flex items-center justify-center text-lg">
				⭱
			</div>

			<p className="text-sm font-medium">Upload Video</p>

			<p className="text-xs text-cf-muted">MP4, MOV, WebM up to 2GB</p>
		</div>
	);
}
