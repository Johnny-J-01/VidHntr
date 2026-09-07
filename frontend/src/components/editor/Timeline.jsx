import { useCallback, useEffect, useRef, useState } from "react";

function formatTickTime(t, showHours = false) {
	if (!Number.isFinite(t) || t < 0) return "0:00";

	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = Math.floor(t % 60);

	if (showHours || h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	return `${m}:${String(s).padStart(2, "0")}`;
}

function calculateViewTicks(viewStart, viewEnd, duration) {
	const viewSpan = Math.max(1, viewEnd - viewStart);

	const steps = [
		1, 2, 5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200,
	];

	let chosenStep = steps[steps.length - 1];

	for (const step of steps) {
		if (viewSpan / step <= 12) {
			chosenStep = step;
			break;
		}
	}

	const firstTick = Math.ceil(viewStart / chosenStep) * chosenStep;
	const ticks = [];

	for (let t = firstTick; t <= viewEnd; t += chosenStep) {
		ticks.push(t);
	}

	return { ticks, step: chosenStep };
}

export default function Timeline({
	duration,
	start,
	end,
	playhead,
	onChange,
	onSeek,
}) {
	const trackRef = useRef(null);

	const [dragging, setDragging] = useState(null);
	const [hoverTime, setHoverTime] = useState(null);
	const [hoverX, setHoverX] = useState(null);

	// Adaptive Focused View Window state: [viewStart, viewEnd]
	const [viewRange, setViewRange] = useState(() => {
		if (!duration) return { start: 0, end: 100 };
		const initEnd = duration > 900 ? 900 : duration;
		return { start: 0, end: initEnd };
	});

	// Auto-focus view range around selected clip with padding proportional to video duration
	useEffect(() => {
		if (!duration) return;

		if (end > start) {
			const clipLen = end - start;
			const maxPad = Math.min(300, duration * 0.25);
			const minPad = Math.min(10, duration * 0.1);
			const padding = Math.max(minPad, Math.min(maxPad, clipLen * 1.5));

			const newViewStart = Math.max(0, start - padding);
			const newViewEnd = Math.min(duration, end + padding);

			setViewRange({ start: newViewStart, end: newViewEnd });
		} else {
			const defaultSpan = Math.min(duration, 900);
			setViewRange({ start: 0, end: defaultSpan });
		}
	}, [start, end, duration]);

	const viewStart = viewRange.start;
	const viewEnd = Math.max(viewStart + 1, viewRange.end);
	const viewSpan = viewEnd - viewStart;

	const pctFor = useCallback(
		(t) => {
			if (viewSpan <= 0) return 0;
			return ((t - viewStart) / viewSpan) * 100;
		},
		[viewStart, viewSpan],
	);

	const timeFromClientX = useCallback(
		(clientX) => {
			if (!trackRef.current) return viewStart;

			const rect = trackRef.current.getBoundingClientRect();
			const pct = Math.max(
				0,
				Math.min(1, (clientX - rect.left) / rect.width),
			);

			return viewStart + pct * viewSpan;
		},
		[viewStart, viewSpan],
	);

	function handleMouseMove(e) {
		if (!trackRef.current || !duration) return;
		const rect = trackRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const pct = Math.max(0, Math.min(1, x / rect.width));

		const t = Math.max(0, Math.min(duration, viewStart + pct * viewSpan));
		setHoverTime(t);
		setHoverX(x);
	}

	function handleMouseLeave() {
		setHoverTime(null);
		setHoverX(null);
	}

	const stateRef = useRef({
		start,
		end,
		duration,
		viewStart,
		viewSpan,
		onChange,
	});

	useEffect(() => {
		stateRef.current = {
			start,
			end,
			duration,
			viewStart,
			viewSpan,
			onChange,
		};
	}, [start, end, duration, viewStart, viewSpan, onChange]);

	function startDrag(handle, e) {
		e.stopPropagation();
		e.preventDefault();
		setDragging(handle);

		const target = e.currentTarget;
		const pointerId = e.pointerId;

		try {
			target.setPointerCapture(pointerId);
		} catch (err) {}

		function onMove(ev) {
			if (!trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			const pct = Math.max(
				0,
				Math.min(1, (ev.clientX - rect.left) / rect.width),
			);

			const {
				start: curStart,
				end: curEnd,
				duration: totalDuration,
				viewStart: curViewStart,
				viewSpan: curViewSpan,
				onChange: triggerChange,
			} = stateRef.current;

			const t = curViewStart + pct * curViewSpan;

			if (handle === "start") {
				const nextStart = Math.max(0, Math.min(t, curEnd - 0.1));
				triggerChange?.(nextStart, curEnd);
			} else if (handle === "end") {
				const nextEnd = Math.min(
					totalDuration,
					Math.max(t, curStart + 0.1),
				);
				triggerChange?.(curStart, nextEnd);
			}
		}

		function onUp(ev) {
			setDragging(null);
			try {
				target.releasePointerCapture(pointerId);
			} catch (err) {}
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		}

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
	}

	function clickTrack(e) {
		if (dragging) return;
		const t = timeFromClientX(e.clientX);
		onSeek?.(Math.max(0, Math.min(duration, t)));
	}

	function zoomView(factor) {
		const center = (viewStart + viewEnd) / 2;
		const newSpan = Math.max(5, Math.min(duration, viewSpan * factor));

		let newStart = Math.max(0, center - newSpan / 2);
		let newEnd = Math.min(duration, newStart + newSpan);

		if (newEnd >= duration) {
			newStart = Math.max(0, duration - newSpan);
		}

		setViewRange({ start: newStart, end: newEnd });
	}

	function panView(direction) {
		let currentSpan = viewSpan;
		// If currently showing full duration, automatically focus to 75% span to enable immediate panning
		if (currentSpan >= duration) {
			currentSpan = duration * 0.75;
		}

		const step = Math.max(1, currentSpan * 0.25) * direction;

		let newStart = viewStart + step;
		let newEnd = newStart + currentSpan;

		if (newStart < 0) {
			newStart = 0;
			newEnd = Math.min(duration, currentSpan);
		} else if (newEnd > duration) {
			newEnd = duration;
			newStart = Math.max(0, duration - currentSpan);
		}

		setViewRange({ start: newStart, end: newEnd });
	}

	function focusClipWindow() {
		if (end > start) {
			const clipLen = end - start;
			const maxPad = Math.min(300, duration * 0.25);
			const minPad = Math.min(10, duration * 0.1);
			const padding = Math.max(minPad, Math.min(maxPad, clipLen * 1.5));

			const newStart = Math.max(0, start - padding);
			const newEnd = Math.min(duration, end + padding);

			setViewRange({ start: newStart, end: newEnd });
		}
	}

	function fullOverview() {
		setViewRange({ start: 0, end: duration });
	}

	const { ticks } = calculateViewTicks(viewStart, viewEnd, duration);

	if (!duration) return null;

	return (
		<div className="w-full min-w-0 bg-cf-panel p-3 rounded-xl border border-cf-border flex flex-col gap-2">
			{/* DEFAULT TIMELINE CONTROL PANEL */}
			<div className="flex items-center justify-between gap-2 text-xs border-b border-cf-border pb-2 flex-wrap">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-semibold text-cf-text text-[12px]">
						Timeline Ruler
					</span>
					<span className="text-[11px] font-mono text-cf-yellow bg-cf-yellow/10 border border-cf-yellow/30 px-2 py-0.5 rounded">
						Window: {formatTickTime(viewStart)} –{" "}
						{formatTickTime(viewEnd)}
					</span>
					<span className="text-[11px] text-cf-muted font-mono">
						(Total: {formatTickTime(duration)})
					</span>
				</div>

				{/* DEFAULT CONTROL PANEL BUTTONS - ALWAYS AVAILABLE */}
				<div className="flex items-center gap-1.5 flex-wrap">
					<button
						type="button"
						onClick={() => panView(-1)}
						disabled={!duration}
						className="px-2.5 py-1 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 active:bg-cf-yellow/10 text-[11px] font-medium text-cf-text transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
						title="Pan left across timeline"
					>
						<span>←</span> Pan Left
					</button>

					<button
						type="button"
						onClick={() => panView(1)}
						disabled={!duration}
						className="px-2.5 py-1 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 active:bg-cf-yellow/10 text-[11px] font-medium text-cf-text transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
						title="Pan right across timeline"
					>
						Pan Right <span>→</span>
					</button>

					<button
						type="button"
						onClick={() => zoomView(0.7)}
						disabled={viewSpan <= 3}
						className="px-2 py-1 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 active:bg-cf-yellow/10 disabled:opacity-40 text-[11px] font-medium text-cf-text transition-colors cursor-pointer"
						title="Zoom In (Narrows timeline window)"
					>
						+ Zoom
					</button>

					<button
						type="button"
						onClick={() => zoomView(1.4)}
						disabled={viewSpan >= duration}
						className="px-2 py-1 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 active:bg-cf-yellow/10 disabled:opacity-40 text-[11px] font-medium text-cf-text transition-colors cursor-pointer"
						title="Zoom Out (Widens timeline window)"
					>
						− Zoom
					</button>

					{end > start && (
						<button
							type="button"
							onClick={focusClipWindow}
							className="text-[11px] px-2.5 py-1 rounded bg-cf-yellow/15 border border-cf-yellow/40 text-cf-yellow hover:bg-cf-yellow/25 transition-colors font-medium cursor-pointer"
							title="Focus view around selected clip"
						>
							🎯 Focus Clip
						</button>
					)}

					<button
						type="button"
						onClick={fullOverview}
						disabled={viewStart === 0 && viewEnd === duration}
						className="text-[11px] px-2 py-1 rounded bg-cf-panel2 border border-cf-border hover:text-cf-yellow disabled:opacity-40 transition-colors cursor-pointer"
						title="View entire video timeline"
					>
						Full Overview
					</button>
				</div>
			</div>

			{/* TIMELINE CANVAS & RULER */}
			<div className="w-full flex flex-col relative py-1 select-none">
				{/* TICKS / RULER LABELS */}
				<div className="relative h-6 w-full text-[10px] text-cf-muted font-mono overflow-hidden">
					{ticks.map((t) => {
						const pct = pctFor(t);
						if (pct < 0 || pct > 100) return null;
						return (
							<div
								key={t}
								className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
								style={{ left: `${pct}%` }}
							>
								<span className="text-[9px] sm:text-[10px] whitespace-nowrap">
									{formatTickTime(t)}
								</span>
								<div className="w-[1px] h-1.5 bg-cf-border mt-0.5" />
							</div>
						);
					})}
				</div>

				{/* TRACK CANVAS */}
				<div
					ref={trackRef}
					onPointerDown={clickTrack}
					onMouseMove={handleMouseMove}
					onMouseLeave={handleMouseLeave}
					className="relative h-12 rounded-lg bg-cf-panel2 border border-cf-border overflow-hidden cursor-pointer touch-none bg-[repeating-linear-gradient(90deg,#1c1c1c_0px,#1c1c1c_19px,#151515_19px,#151515_20px)]"
				>
					{/* HOVER CURSOR TIME LINE & TOOLTIP */}
					{hoverTime !== null && hoverX !== null && (
						<>
							<div
								className="absolute top-0 bottom-0 w-[1px] bg-cf-yellow/60 pointer-events-none z-10"
								style={{ left: `${hoverX}px` }}
							/>
							<div
								className="absolute top-1 -translate-x-1/2 bg-black/90 border border-cf-yellow/50 text-cf-yellow text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none z-20 shadow"
								style={{
									left: `${Math.max(30, Math.min(hoverX, trackRef.current?.clientWidth - 30 || hoverX))}px`,
								}}
							>
								{formatTickTime(hoverTime)}
							</div>
						</>
					)}

					{/* SELECTED RANGE REGION */}
					{end > start && (
						<div
							className="absolute top-0 bottom-0 border-x-2 border-cf-yellow bg-cf-yellow/20 shadow-inner transition-all"
							style={{
								left: `${Math.max(0, Math.min(100, pctFor(start)))}%`,
								width: `${Math.max(0, Math.min(100 - Math.max(0, pctFor(start)), pctFor(end) - Math.max(0, pctFor(start))))}%`,
							}}
						>
							<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
								<span className="text-[10px] font-mono font-bold text-cf-yellow bg-black/75 px-2 py-0.5 rounded shadow border border-cf-yellow/30">
									{(end - start).toFixed(1)}s
								</span>
							</div>
						</div>
					)}

					{/* PLAYHEAD MARKER */}
					{playhead >= viewStart && playhead <= viewEnd && (
						<div
							className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30 transition-all"
							style={{ left: `${pctFor(playhead)}%` }}
						>
							<div className="absolute -top-1.5 -left-[5px] w-3 h-3 rotate-45 bg-white shadow-sm" />
						</div>
					)}

					{/* START HANDLE */}
					<div
						onPointerDown={(e) => startDrag("start", e)}
						className="absolute top-0 bottom-0 w-5 -ml-2.5 bg-cf-yellow cursor-ew-resize rounded flex items-center justify-center touch-none z-40 group hover:brightness-125 shadow-xl border border-black/40 transition-transform active:scale-110"
						style={{
							left: `${Math.max(0, Math.min(100, pctFor(start)))}%`,
						}}
						title={`Start handle (${formatTickTime(start)})`}
					>
						<div className="w-0.5 h-4 bg-black/70 rounded" />
					</div>

					{/* END HANDLE */}
					<div
						onPointerDown={(e) => startDrag("end", e)}
						className="absolute top-0 bottom-0 w-5 -ml-2.5 bg-cf-yellow cursor-ew-resize rounded flex items-center justify-center touch-none z-40 group hover:brightness-125 shadow-xl border border-black/40 transition-transform active:scale-110"
						style={{
							left: `${Math.max(0, Math.min(100, pctFor(end)))}%`,
						}}
						title={`End handle (${formatTickTime(end)})`}
					>
						<div className="w-0.5 h-4 bg-black/70 rounded" />
					</div>
				</div>
			</div>
		</div>
	);
}
