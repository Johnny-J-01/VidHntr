import { useCallback, useRef, useState } from "react";

function formatTime(t) {
	if (!Number.isFinite(t)) return "0:00";

	const m = Math.floor(t / 60);
	const s = (t % 60).toFixed(1);

	return `${m}:${s.padStart(4, "0")}`;
}

function tickLabels(duration) {
	if (!duration) return [];

	const step = duration > 600 ? 120 : duration > 180 ? 30 : 10;

	const ticks = [];

	for (let t = 0; t <= duration; t += step) {
		ticks.push(t);
	}

	return ticks;
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

	function startDrag(handle, e) {
		e.stopPropagation();

		setDragging(handle);

		function onMove(ev) {
			const t = timeFromClientX(ev.clientX);

			if (handle === "start") {
				onChange(Math.min(t, end - 1), end);
			} else {
				onChange(start, Math.max(t, start + 1));
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

	if (!duration) return null;

	return (
		<div className="w-full min-w-0">
			{/* TIMELINE LABELS */}
			<div className="overflow-hidden mb-1">
				<div className="flex justify-between gap-3 text-[9px] sm:text-[10px] text-cf-muted px-0.5 min-w-max">
					{tickLabels(duration).map((t) => (
						<span key={t}>{formatTime(t)}</span>
					))}
				</div>
			</div>

			{/* TRACK */}
			<div
				ref={trackRef}
				onPointerDown={clickTrack}
				className="relative h-10 sm:h-12 rounded-cf bg-cf-panel2 border border-cf-border overflow-hidden cursor-pointer touch-none bg-[repeating-linear-gradient(90deg,#1a1a1a_0px,#1a1a1a_38px,#161616_38px,#161616_40px)]"
			>
				{/* SELECTED RANGE */}
				<div
					className="absolute top-0 bottom-0 border-y-2 border-cf-yellow bg-cf-yellow/15"
					style={{
						left: `${pctFor(start)}%`,
						width: `${pctFor(end - start)}%`,
					}}
				/>

				{/* PLAYHEAD */}
				<div
					className="absolute top-0 bottom-0 w-[2px] bg-cf-yellow pointer-events-none"
					style={{
						left: `${pctFor(playhead)}%`,
					}}
				/>

				<div
					className="absolute -top-1 w-2.5 h-2.5 rotate-45 bg-cf-yellow pointer-events-none"
					style={{
						left: `calc(${pctFor(playhead)}% - 5px)`,
					}}
				/>

				{/* START HANDLE */}
				<div
					onPointerDown={(e) => startDrag("start", e)}
					className="absolute top-0 bottom-0 w-3 sm:w-2 -ml-1 bg-cf-yellow cursor-ew-resize rounded-l touch-none"
					style={{
						left: `${pctFor(start)}%`,
					}}
				/>

				{/* END HANDLE */}
				<div
					onPointerDown={(e) => startDrag("end", e)}
					className="absolute top-0 bottom-0 w-3 sm:w-2 -ml-1 bg-cf-yellow cursor-ew-resize rounded-r touch-none"
					style={{
						left: `${pctFor(end)}%`,
					}}
				/>
			</div>
		</div>
	);
}
