function formatTime(t) {
	const m = Math.floor(t / 60);
	const s = Math.floor(t % 60);

	return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ResultCard({
	result,
	selected,
	onSelect,
	thumbnailUrl,
}) {
	return (
		<button
			onClick={() => onSelect(result)}
			className={`w-full min-w-0 text-left flex gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-cf border transition ${
				selected
					? "border-cf-yellow bg-cf-yellowDim"
					: "border-cf-border hover:border-cf-yellow/40 hover:bg-cf-panel2"
			}`}
		>
			{/* THUMBNAIL */}
			<div className="w-[60px] h-[42px] sm:w-16 sm:h-11 rounded-[6px] overflow-hidden bg-cf-panel2 border border-cf-border shrink-0 flex items-center justify-center text-cf-muted">
				{thumbnailUrl ? (
					<img
						src={thumbnailUrl}
						alt=""
						className="w-full h-full object-cover"
					/>
				) : (
					"▶"
				)}
			</div>

			{/* CONTENT */}
			<div className="min-w-0 flex-1">
				{/* TIME + DURATION */}
				<div className="flex items-center justify-between gap-2 min-w-0">
					<span
						className={`text-[12px] sm:text-[13px] font-medium tabular-nums shrink-0 ${
							selected ? "text-cf-yellow" : ""
						}`}
					>
						{formatTime(result.start)}
					</span>

					<span className="text-[10px] sm:text-[11px] text-cf-muted tabular-nums shrink-0">
						{result.duration}s
					</span>
				</div>

				{/* RESULT TEXT */}
				<p className="text-[11px] sm:text-[12px] text-cf-text/90 leading-snug mt-0.5 line-clamp-2 break-words">
					{result.text}
				</p>

				{/* TAGS */}
				{result.tags?.length > 0 && (
					<div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
						{result.tags.map((t) => (
							<span
								key={t}
								className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-cf-yellowDim text-cf-yellow whitespace-nowrap shrink-0"
							>
								{t}
							</span>
						))}
					</div>
				)}
			</div>
		</button>
	);
}
