import { useEffect, useState } from "react";

function formatDetailed(t, duration) {
	if (!Number.isFinite(t) || t < 0) return "0:00.0";

	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = (t % 60).toFixed(1);

	if (duration >= 3600 || h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${s.padStart(4, "0")}`;
	}

	return `${m}:${s.padStart(4, "0")}`;
}

function parseTimeStringToSeconds(str) {
	if (!str || typeof str !== "string") return null;

	const parts = str.trim().split(":");
	if (parts.length === 1) {
		const val = parseFloat(parts[0]);
		return Number.isFinite(val) ? val : null;
	}

	if (parts.length === 2) {
		const m = parseFloat(parts[0]);
		const s = parseFloat(parts[1]);
		if (Number.isFinite(m) && Number.isFinite(s)) {
			return m * 60 + s;
		}
	}

	if (parts.length === 3) {
		const h = parseFloat(parts[0]);
		const m = parseFloat(parts[1]);
		const s = parseFloat(parts[2]);
		if (
			Number.isFinite(h) &&
			Number.isFinite(m) &&
			Number.isFinite(s)
		) {
			return h * 3600 + m * 60 + s;
		}
	}

	return null;
}

export default function ClipControls({ start, end, duration, onChange }) {
	const clipLen = Math.max(0, end - start);

	const [startInput, setStartInput] = useState("");
	const [endInput, setEndInput] = useState("");

	useEffect(() => {
		setStartInput(formatDetailed(start, duration));
	}, [start, duration]);

	useEffect(() => {
		setEndInput(formatDetailed(end, duration));
	}, [end, duration]);

	function handleStartBlur() {
		const parsed = parseTimeStringToSeconds(startInput);
		if (parsed !== null && onChange) {
			const safeStart = Math.max(0, Math.min(parsed, end - 0.1));
			onChange(safeStart, end);
		} else {
			setStartInput(formatDetailed(start, duration));
		}
	}

	function handleEndBlur() {
		const parsed = parseTimeStringToSeconds(endInput);
		if (parsed !== null && onChange) {
			const maxLimit = duration || parsed + 1000;
			const safeEnd = Math.min(maxLimit, Math.max(parsed, start + 0.1));
			onChange(start, safeEnd);
		} else {
			setEndInput(formatDetailed(end, duration));
		}
	}

	function nudgeStart(delta) {
		if (!onChange) return;
		const next = Math.max(0, Math.min(start + delta, end - 0.1));
		onChange(next, end);
	}

	function nudgeEnd(delta) {
		if (!onChange) return;
		const maxLimit = duration || end + delta;
		const next = Math.min(maxLimit, Math.max(end + delta, start + 0.1));
		onChange(start, next);
	}

	return (
		<div className="flex flex-col gap-3 p-3 rounded-xl border border-cf-border bg-cf-panel mt-2">
			<div className="flex items-center justify-between border-b border-cf-border pb-2">
				<p className="text-[12px] font-semibold text-cf-text">
					Clip Range Settings
				</p>

				<div className="flex items-center gap-1.5 text-xs">
					<span className="text-cf-muted text-[11px]">
						Clip Duration:
					</span>
					<span className="text-cf-yellow font-bold font-mono px-2 py-0.5 rounded bg-cf-yellow/10 border border-cf-yellow/30">
						{clipLen.toFixed(1)}s (
						{formatDetailed(clipLen, duration)})
					</span>
				</div>
			</div>

			{/* START & END TIME INPUTS + MICRO NUDGE BUTTONS */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{/* START TIME */}
				<div className="flex flex-col gap-1.5 p-2 rounded-lg bg-cf-panel2 border border-cf-border">
					<div className="flex items-center justify-between text-[11px]">
						<span className="text-cf-muted font-medium">
							START TIME
						</span>
						<span className="text-cf-yellow font-mono text-[10px]">
							{start.toFixed(1)}s
						</span>
					</div>

					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => nudgeStart(-1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Subract 1 second"
						>
							-1s
						</button>
						<button
							type="button"
							onClick={() => nudgeStart(-0.1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Subtract 0.1 second"
						>
							-0.1s
						</button>

						<input
							type="text"
							value={startInput}
							onChange={(e) => setStartInput(e.target.value)}
							onBlur={handleStartBlur}
							onKeyDown={(e) => e.key === "Enter" && handleStartBlur()}
							className="flex-1 min-w-[70px] text-center font-mono text-xs h-7 rounded bg-black/50 border border-cf-border text-cf-yellow focus:outline-none focus:border-cf-yellow"
							placeholder="0:00.0"
						/>

						<button
							type="button"
							onClick={() => nudgeStart(0.1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Add 0.1 second"
						>
							+0.1s
						</button>
						<button
							type="button"
							onClick={() => nudgeStart(1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Add 1 second"
						>
							+1s
						</button>
					</div>
				</div>

				{/* END TIME */}
				<div className="flex flex-col gap-1.5 p-2 rounded-lg bg-cf-panel2 border border-cf-border">
					<div className="flex items-center justify-between text-[11px]">
						<span className="text-cf-muted font-medium">
							END TIME
						</span>
						<span className="text-cf-yellow font-mono text-[10px]">
							{end.toFixed(1)}s
						</span>
					</div>

					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => nudgeEnd(-1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Subtract 1 second"
						>
							-1s
						</button>
						<button
							type="button"
							onClick={() => nudgeEnd(-0.1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Subtract 0.1 second"
						>
							-0.1s
						</button>

						<input
							type="text"
							value={endInput}
							onChange={(e) => setEndInput(e.target.value)}
							onBlur={handleEndBlur}
							onKeyDown={(e) => e.key === "Enter" && handleEndBlur()}
							className="flex-1 min-w-[70px] text-center font-mono text-xs h-7 rounded bg-black/50 border border-cf-border text-cf-yellow focus:outline-none focus:border-cf-yellow"
							placeholder="0:00.0"
						/>

						<button
							type="button"
							onClick={() => nudgeEnd(0.1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Add 0.1 second"
						>
							+0.1s
						</button>
						<button
							type="button"
							onClick={() => nudgeEnd(1)}
							className="px-1.5 py-1 text-xs rounded bg-cf-panel border border-cf-border hover:border-cf-yellow/50 text-cf-muted hover:text-cf-text"
							title="Add 1 second"
						>
							+1s
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function ContextControls({ onAdjustBefore, onAdjustAfter, onReset }) {
	return (
		<div className="min-w-0">
			<p className="text-[12px] font-medium mb-2 text-cf-text">
				Extend Context Padding
			</p>

			<div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
				<div className="flex items-center gap-1.5 sm:gap-2">
					<span className="text-cf-muted">Before:</span>

					<button
						type="button"
						onClick={() => onAdjustBefore(-5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						−
					</button>

					<span className="w-6 text-center tabular-nums font-mono text-cf-yellow">
						5s
					</span>

					<button
						type="button"
						onClick={() => onAdjustBefore(5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						+
					</button>
				</div>

				<div className="flex items-center gap-1.5 sm:gap-2">
					<span className="text-cf-muted">After:</span>

					<button
						type="button"
						onClick={() => onAdjustAfter(-5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						−
					</button>

					<span className="w-6 text-center tabular-nums font-mono text-cf-yellow">
						5s
					</span>

					<button
						type="button"
						onClick={() => onAdjustAfter(5)}
						className="w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50"
					>
						+
					</button>
				</div>

				<button
					type="button"
					onClick={onReset}
					className="cf-btn-ghost text-[11px] px-2.5 py-1"
				>
					Reset Clip
				</button>
			</div>
		</div>
	);
}

