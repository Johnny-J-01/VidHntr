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

	// Auto-focus view range around selected clip with 3-7 minutes padding on selection change
	useEffect(() => {
		if (!duration) return;

		if (end > start) {
			const clipLen = end - start;
			// 3 to 7 minutes padding depending on clip length
			const padding = Math.max(180, Math.min(420, clipLen * 2.5));

			const newViewStart = Math.max(0, start - padding);
			const newViewEnd = Math.min(duration, end + padding);

			setViewRange({ start: newViewStart, end: newViewEnd });
		} else {
			// If no clip selected, default to initial 15-min view window or full video
			const defaultSpan = Math.min(duration, 900);
			setViewRange({ start: 0, end: defaultSpan });
		}
	}, [start, end, duration]);

	const viewStart = viewRange.start;
	const viewEnd = Math.max(viewStart + 1, viewRange.end);
	const viewSpan = viewEnd - viewStart;
	const isLongVideo = duration >= 1200; // >= 20 mins

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

	function startDrag(handle, e) {
		e.stopPropagation();
		setDragging(handle);

		function onMove(ev) {
			const t = timeFromClientX(ev.clientX);

			if (handle === "start") {
				const nextStart = Math.max(0, Math.min(t, end - 0.1));
				onChange(nextStart, end);

				// Auto expand view start if dragging near left edge
				if (nextStart < viewStart + 10 && viewStart > 0) {
					setViewRange((v) => ({
						...v,
						start: Math.max(0, v.start - 60),
					}));
				}
			} else if (handle === "end") {
				const nextEnd = Math.min(
					duration,
					Math.max(t, start + 0.1),
				);
				onChange(start, nextEnd);

				// Auto expand view end if dragging near right edge
				if (nextEnd > viewEnd - 10 && viewEnd < duration) {
					setViewRange((v) => ({
						...v,
						end: Math.min(duration, v.end + 60),
					}));
				}
			}
		}

		function onUp() {
			setDragging(null);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		}

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp, { once: true });
	}

	function clickTrack(e) {
		if (dragging) return;
		const t = timeFromClientX(e.clientX);
		onSeek?.(Math.max(0, Math.min(duration, t)));
	}

	function zoomView(factor) {
		const center = (viewStart + viewEnd) / 2;
		const newSpan = Math.max(30, Math.min(duration, viewSpan * factor));

		const newStart = Math.max(0, center - newSpan / 2);
		const newEnd = Math.min(duration, newStart + newSpan);

		setViewRange({ start: newStart, end: newEnd });
	}

	function panView(seconds) {
		const newStart = Math.max(0, Math.min(duration - viewSpan, viewStart + seconds));
		const newEnd = Math.min(duration, newStart + viewSpan);

		setViewRange({ start: newStart, end: newEnd });
	}

	function focusClipWindow() {
		if (end > start) {
			const clipLen = end - start;
			const padding = Math.max(180, Math.min(420, clipLen * 2.5));

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
			{/* TIMELINE TOOLBAR & ADAPTIVE VIEW CONTROLS */}
			<div className="flex items-center justify-between gap-2 text-xs border-b border-cf-border pb-2 flex-wrap">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-semibold text-cf-text text-[12px]">
						Timeline Ruler
					</span>
					<span className="text-[11px] font-mono text-cf-yellow bg-cf-yellow/10 border border-cf-yellow/30 px-2 py-0.5 rounded">
						Window: {formatTickTime(viewStart, isLongVideo)} –{" "}
						{formatTickTime(viewEnd, isLongVideo)}
					</span>
					<span className="text-[11px] text-cf-muted font-mono">
						(Full Video: {formatTickTime(duration, isLongVideo)})
					</span>
				</div>

				{/* ADAPTIVE VIEW & ZOOM BUTTONS */}
				<div className="flex items-center gap-1.5 flex-wrap">
					{isLongVideo && (
						<>
							<button
								type="button"
								onClick={() => panView(-120)}
								disabled={viewStart <= 0}
								className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40 text-[11px]"
								title="Pan 2 mins back"
							>
								← Pan
							</button>

							<button
								type="button"
								onClick={() => panView(120)}
								disabled={viewEnd >= duration}
								className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40 text-[11px]"
								title="Pan 2 mins forward"
							>
								Pan →
							</button>
						</>
					)}

					<button
						type="button"
						onClick={() => zoomView(0.7)}
						disabled={viewSpan <= 30}
						className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40 text-[11px]"
						title="Zoom In (Narrows timeline view window)"
					>
						+ Zoom
					</button>

					<button
						type="button"
						onClick={() => zoomView(1.4)}
						disabled={viewSpan >= duration}
						className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40 text-[11px]"
						title="Zoom Out (Widens timeline view window)"
					>
						− Zoom
					</button>

					{end > start && (
						<button
							type="button"
							onClick={focusClipWindow}
							className="text-[11px] px-2.5 py-0.5 rounded bg-cf-yellow/15 border border-cf-yellow/40 text-cf-yellow hover:bg-cf-yellow/25 transition-colors font-medium"
							title="Focus timeline view window around selected clip"
						>
							🎯 Focus Clip
						</button>
					)}

					<button
						type="button"
						onClick={fullOverview}
						className="text-[11px] px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:text-cf-yellow"
						title="View full video length"
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
									{formatTickTime(t, isLongVideo)}
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
								{formatTickTime(hoverTime, isLongVideo)}
							</div>
						</>
					)}

					{/* SELECTED RANGE REGION */}
					{end > start && (
						<div
							className="absolute top-0 bottom-0 border-x-2 border-cf-yellow bg-cf-yellow/20 shadow-inner transition-all"
							style={{
								left: `${Math.max(0, pctFor(start))}%`,
								width: `${Math.min(100, Math.max(0, pctFor(end) - Math.max(0, pctFor(start))))}%`,
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
					{start >= viewStart && start <= viewEnd && (
						<div
							onPointerDown={(e) => startDrag("start", e)}
							className="absolute top-0 bottom-0 w-3 bg-cf-yellow cursor-ew-resize rounded-l flex items-center justify-center touch-none z-20 group hover:brightness-125 shadow-lg"
							style={{ left: `${pctFor(start)}%` }}
							title={`Start handle (${formatTickTime(start, isLongVideo)})`}
						>
							<div className="w-0.5 h-4 bg-black/60 rounded" />
						</div>
					)}

					{/* END HANDLE */}
					{end >= viewStart && end <= viewEnd && (
						<div
							onPointerDown={(e) => startDrag("end", e)}
							className="absolute top-0 bottom-0 w-3 -ml-3 bg-cf-yellow cursor-ew-resize rounded-r flex items-center justify-center touch-none z-20 group hover:brightness-125 shadow-lg"
							style={{ left: `${pctFor(end)}%` }}
							title={`End handle (${formatTickTime(end, isLongVideo)})`}
						>
							<div className="w-0.5 h-4 bg-black/60 rounded" />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}


