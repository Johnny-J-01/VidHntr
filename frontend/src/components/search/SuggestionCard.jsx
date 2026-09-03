function formatTime(t) {
	const m = Math.floor(t / 60);
	const s = Math.floor(t % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SuggestionCard({ suggestion, selected, onSelect }) {
	return (
		<button
			onClick={() => onSelect(suggestion)}
			className={`w-full text-left p-2.5 rounded-cf border transition ${
				selected
					? "border-cf-yellow bg-cf-yellowDim"
					: "border-cf-border hover:border-cf-yellow/40 hover:bg-cf-panel2"
			}`}
		>
			<div className="flex items-center gap-1.5 text-[12px] font-medium">
				<span>{suggestion.emoji}</span>
				<span>{suggestion.label}</span>
			</div>
			<div className="flex items-center justify-between mt-1">
				<span
					className={`text-[13px] tabular-nums ${selected ? "text-cf-yellow" : ""}`}
				>
					{formatTime(suggestion.start)}
				</span>
				<span className="text-[11px] text-cf-muted tabular-nums">
					{suggestion.duration}s
				</span>
			</div>
			<p className="text-[12px] text-cf-text/90 leading-snug mt-1 line-clamp-2">
				{suggestion.text}
			</p>
		</button>
	);
}
