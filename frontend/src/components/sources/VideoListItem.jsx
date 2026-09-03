export default function VideoListItem() {
	return (
		<button
			type="button"
			className="w-full text-left flex items-center gap-3 p-2 rounded-cf border border-cf-border"
		>
			<div className="w-14 h-9 rounded-[6px] bg-cf-panel2 border border-cf-border shrink-0 flex items-center justify-center text-cf-muted text-xs">
				▶
			</div>

			<div className="min-w-0 flex-1">
				<p className="text-[13px] leading-tight truncate">
					No video selected
				</p>

				<div className="flex items-center gap-1.5 mt-0.5">
					<span className="w-1.5 h-1.5 rounded-full bg-cf-yellow" />
					<span className="text-[11px] text-cf-muted">Ready</span>
				</div>
			</div>
		</button>
	);
}
