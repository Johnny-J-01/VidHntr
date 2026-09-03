function formatPrecise(t) {
	const m = Math.floor(t / 60);
	const s = (t % 60).toFixed(1);

	return `${m}:${s.padStart(4, "0")}`;
}

export default function ClipControls({
	start,
	end,
	duration,
	onAdjustBefore,
	onAdjustAfter,
	onReset,
}) {
	const clipLen = Math.max(0, end - start);

	return (
		<div className="flex items-end justify-between gap-4 mt-3">
			<div className="min-w-0">
				<p className="text-[11px] text-cf-muted mb-1">Selected Clip</p>

				<p className="text-sm whitespace-nowrap">
					<span className="text-cf-yellow font-medium tabular-nums">
						{formatPrecise(start)}
					</span>

					<span className="text-cf-muted"> — </span>

					<span className="text-cf-yellow font-medium tabular-nums">
						{formatPrecise(end)}
					</span>
				</p>
			</div>

			<div className="text-right shrink-0">
				<p className="text-[11px] text-cf-muted mb-1">Duration</p>

				<span className="text-cf-yellow font-semibold text-sm tabular-nums">
					{clipLen.toFixed(1)}s
				</span>
			</div>
		</div>
	);
}

export function ContextControls({ onAdjustBefore, onAdjustAfter, onReset }) {
	return (
		<div className="min-w-0">
			<p className="text-[12px] font-medium mb-2">Context</p>

			<div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
				<div className="flex items-center gap-1.5 sm:gap-2">
					<span className="text-cf-muted">Before</span>

					<button
						onClick={() => onAdjustBefore(-5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded-cf bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						−
					</button>

					<span className="w-6 text-center tabular-nums">5s</span>

					<button
						onClick={() => onAdjustBefore(5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded-cf bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						+
					</button>
				</div>

				<div className="flex items-center gap-1.5 sm:gap-2">
					<span className="text-cf-muted">After</span>

					<button
						onClick={() => onAdjustAfter(-5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded-cf bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						−
					</button>

					<span className="w-6 text-center tabular-nums">5s</span>

					<button
						onClick={() => onAdjustAfter(5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded-cf bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						+
					</button>
				</div>

				<button
					onClick={onReset}
					className="cf-btn-ghost text-[11px] px-2.5 py-1.5 sm:py-1"
				>
					Reset
				</button>
			</div>
		</div>
	);
}
