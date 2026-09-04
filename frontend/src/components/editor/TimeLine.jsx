import { useCallback, useEffect, useRef, useState } from "react";

function formatTickTime(t, totalDuration) {
	if (!Number.isFinite(t) || t < 0) return "0:00";

	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = Math.floor(t % 60);

	if (totalDuration >= 3600 || h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	return `${m}:${String(s).padStart(2, "0")}`;
}

function calculateTicks(duration, zoomLevel) {
	if (!duration || duration <= 0) return [];

	const visibleDuration = duration / zoomLevel;

	// Pick a clean step size so we have ~8 to 15 ticks visible in the view
	const steps = [
		0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
	];

	let chosenStep = steps[steps.length - 1];

	for (const step of steps) {
		if (visibleDuration / step <= 14) {
			chosenStep = step;
			break;
		}
	}

	const ticks = [];
	for (let t = 0; t <= duration; t += chosenStep) {
		ticks.push(t);
	}

	// Always ensure the duration end is included if not exact
	if (ticks[ticks.length - 1] < duration) {
		ticks.push(duration);
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
	const scrollContainerRef = useRef(null);

	const [dragging, setDragging] = useState(null);
	const [hoverTime, setHoverTime] = useState(null);
	const [hoverX, setHoverX] = useState(null);
	const [zoom, setZoom] = useState(1);

	const pctFor = useCallback(
		(t) => (duration ? (t / duration) * 100 : 0),
		[duration],
	);

	const timeFromClientX = useCallback(
		(clientX) => {
			if (!trackRef.current) return 0;

			const rect = trackRef.current.getBoundingClientRect();
			const pct = Math.max(
				0,
				Math.min(1, (clientX - rect.left) / rect.width),
			);

			return pct * duration;
		},
		[duration],
	);

	function handleMouseMove(e) {
		if (!trackRef.current || !duration) return;
		const rect = trackRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const pct = Math.max(0, Math.min(1, x / rect.width));

		setHoverTime(pct * duration);
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
				onChange(Math.max(0, Math.min(t, end - 0.1)), end);
			} else if (handle === "end") {
				onChange(start, Math.min(duration, Math.max(t, start + 0.1)));
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
		onSeek?.(t);
	}

	function handleWheel(e) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY < 0 ? 0.25 : -0.25;
			setZoom((prev) => Math.max(1, Math.min(20, prev + delta)));
		}
	}

	function zoomToClip() {
		if (!duration || end <= start) return;
		const clipLength = end - start;
		if (clipLength <= 0) return;

		const targetZoom = Math.max(1, Math.min(20, duration / clipLength));
		setZoom(targetZoom);

		// Center scroll container on clip
		setTimeout(() => {
			if (scrollContainerRef.current) {
				const centerPct = (start + clipLength / 2) / duration;
				const scrollWidth = scrollContainerRef.current.scrollWidth;
				const clientWidth = scrollContainerRef.current.clientWidth;
				scrollContainerRef.current.scrollLeft =
					centerPct * scrollWidth - clientWidth / 2;
			}
		}, 50);
	}

	const { ticks } = calculateTicks(duration, zoom);

	if (!duration) return null;

	return (
		<div className="w-full min-w-0 bg-cf-panel p-3 rounded-xl border border-cf-border flex flex-col gap-2">
			{/* TIMELINE TOOLBAR & ZOOM CONTROLS */}
			<div className="flex items-center justify-between gap-2 text-xs border-b border-cf-border pb-2 flex-wrap">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-cf-text text-[12px]">
						Timeline Ruler
					</span>
					<span className="text-[11px] text-cf-muted font-mono">
						(Total: {formatTickTime(duration, duration)})
					</span>
				</div>

				{/* ZOOM CONTROLS */}
				<div className="flex items-center gap-2">
					<span className="text-[11px] text-cf-muted">Zoom:</span>

					<button
						type="button"
						onClick={() =>
							setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))
						}
						disabled={zoom <= 1}
						className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40"
						title="Zoom Out"
					>
						−
					</button>

					<input
						type="range"
						min="1"
						max="20"
						step="0.5"
						value={zoom}
						onChange={(e) => setZoom(parseFloat(e.target.value))}
						className="w-16 sm:w-24 h-1 bg-cf-border rounded appearance-none accent-cf-yellow cursor-pointer"
					/>

					<button
						type="button"
						onClick={() =>
							setZoom((z) => Math.min(20, +(z + 0.5).toFixed(1)))
						}
						disabled={zoom >= 20}
						className="px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:border-cf-yellow/50 disabled:opacity-40"
						title="Zoom In"
					>
						+
					</button>

					<span className="text-[11px] font-mono text-cf-yellow w-8 text-center">
						{zoom}x
					</span>

					<button
						type="button"
						onClick={() => setZoom(1)}
						className="text-[11px] px-2 py-0.5 rounded bg-cf-panel2 border border-cf-border hover:text-cf-yellow"
						title="Fit to screen"
					>
						Fit
					</button>

					{end > start && (
						<button
							type="button"
							onClick={zoomToClip}
							className="text-[11px] px-2 py-0.5 rounded bg-cf-yellow/15 border border-cf-yellow/40 text-cf-yellow hover:bg-cf-yellow/25 transition-colors font-medium"
							title="Zoom into selected clip range"
						>
							Zoom Clip
						</button>
					)}
				</div>
			</div>

			{/* SCROLLABLE TRACK CONTAINER */}
			<div
				ref={scrollContainerRef}
				onWheel={handleWheel}
				className="w-full overflow-x-auto custom-scrollbar select-none"
			>
				<div
					style={{ width: `${zoom * 100}%` }}
					className="min-w-full flex flex-col relative py-1"
				>
					{/* TICKS / RULER LABELS */}
					<div className="relative h-6 w-full text-[10px] text-cf-muted font-mono overflow-hidden">
						{ticks.map((t) => {
							const pct = pctFor(t);
							return (
								<div
									key={t}
									className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
									style={{ left: `${pct}%` }}
								>
									<span className="text-[9px] sm:text-[10px] whitespace-nowrap">
										{formatTickTime(t, duration)}
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
										left: `${Math.max(25, Math.min(hoverX, trackRef.current?.clientWidth - 25 || hoverX))}px`,
									}}
								>
									{formatTickTime(hoverTime, duration)}
								</div>
							</>
						)}

						{/* SELECTED RANGE REGION */}
						<div
							className="absolute top-0 bottom-0 border-x-2 border-cf-yellow bg-cf-yellow/20 shadow-inner transition-all"
							style={{
								left: `${pctFor(start)}%`,
								width: `${pctFor(Math.max(0, end - start))}%`,
							}}
						>
							<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
								<span className="text-[10px] font-mono font-bold text-cf-yellow bg-black/60 px-1.5 py-0.5 rounded shadow">
									{(end - start).toFixed(1)}s
								</span>
							</div>
						</div>

						{/* PLAYHEAD MARKER */}
						<div
							className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30"
							style={{ left: `${pctFor(playhead)}%` }}
						>
							<div className="absolute -top-1.5 -left-[5px] w-3 h-3 rotate-45 bg-white shadow-sm" />
						</div>

						{/* START HANDLE */}
						<div
							onPointerDown={(e) => startDrag("start", e)}
							className="absolute top-0 bottom-0 w-3 bg-cf-yellow cursor-ew-resize rounded-l flex items-center justify-center touch-none z-20 group hover:brightness-125"
							style={{ left: `${pctFor(start)}%` }}
							title={`Start handle (${start.toFixed(1)}s)`}
						>
							<div className="w-0.5 h-4 bg-black/60 rounded" />
						</div>

						{/* END HANDLE */}
						<div
							onPointerDown={(e) => startDrag("end", e)}
							className="absolute top-0 bottom-0 w-3 -ml-3 bg-cf-yellow cursor-ew-resize rounded-r flex items-center justify-center touch-none z-20 group hover:brightness-125"
							style={{ left: `${pctFor(end)}%` }}
							title={`End handle (${end.toFixed(1)}s)`}
						>
							<div className="w-0.5 h-4 bg-black/60 rounded" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

