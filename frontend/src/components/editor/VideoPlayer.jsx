import { forwardRef, useEffect, useState } from "react";

function formatTime(t) {
	if (!Number.isFinite(t)) return "0:00";

	const m = Math.floor(t / 60);
	const s = Math.floor(t % 60);

	return `${m}:${String(s).padStart(2, "0")}`;
}

const VideoPlayer = forwardRef(function VideoPlayer({ src, captionsOn }, ref) {
	const [current, setCurrent] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		const el = ref?.current;

		if (!el) return undefined;

		const onTime = () => setCurrent(el.currentTime);
		const onMeta = () => setDuration(el.duration || 0);
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);

		el.addEventListener("timeupdate", onTime);
		el.addEventListener("loadedmetadata", onMeta);
		el.addEventListener("play", onPlay);
		el.addEventListener("pause", onPause);

		return () => {
			el.removeEventListener("timeupdate", onTime);
			el.removeEventListener("loadedmetadata", onMeta);
			el.removeEventListener("play", onPlay);
			el.removeEventListener("pause", onPause);
		};
	}, [ref, src]);

	function togglePlay() {
		const el = ref?.current;

		if (!el) return;

		if (el.paused) {
			el.play();
		} else {
			el.pause();
		}
	}

	function skip(delta) {
		const el = ref?.current;

		if (!el) return;

		el.currentTime = Math.max(
			0,
			Math.min(duration, el.currentTime + delta),
		);
	}

	function seekBar(e) {
		const el = ref?.current;

		if (!el || !duration) return;

		const rect = e.currentTarget.getBoundingClientRect();

		const pct = (e.clientX - rect.left) / rect.width;

		el.currentTime = pct * duration;
	}

	return (
		<div className="cf-panel overflow-hidden w-full">
			{/* VIDEO */}
			<div className="relative bg-black aspect-video w-full">
				<video
					ref={ref}
					src={src}
					className="w-full h-full object-contain bg-black"
				/>

				{captionsOn && (
					<div className="absolute bottom-6 left-2 right-2 sm:left-0 sm:right-0 text-center pointer-events-none">
						<span className="bg-black/70 text-white text-[11px] sm:text-sm px-2 py-1 rounded">
							Captions on export
						</span>
					</div>
				)}
			</div>

			{/* CONTROLS */}
			<div className="px-2.5 sm:px-3 py-2 border-t border-cf-border">
				{/* PRIMARY CONTROLS */}
				<div className="flex items-center gap-2 sm:gap-3 min-w-0">
					<button
						onClick={togglePlay}
						className="w-7 h-7 shrink-0 flex items-center justify-center text-cf-text hover:text-cf-yellow"
					>
						{playing ? "⏸" : "▶"}
					</button>

					<button
						onClick={() => skip(-10)}
						className="text-cf-muted hover:text-cf-text text-xs sm:text-sm shrink-0"
						title="Back 10s"
					>
						⟲10
					</button>

					<button
						className="text-cf-muted hover:text-cf-text text-sm shrink-0"
						title="Volume"
					>
						🔊
					</button>

					{/* SEEK BAR */}
					<div
						onClick={seekBar}
						className="flex-1 min-w-[40px] h-1.5 rounded-full bg-cf-panel2 cursor-pointer relative"
					>
						<div
							className="h-full rounded-full bg-cf-yellow"
							style={{
								width: duration
									? `${(current / duration) * 100}%`
									: 0,
							}}
						/>
					</div>

					{/* TIME */}
					<span className="text-[10px] sm:text-[11px] text-cf-muted tabular-nums shrink-0 whitespace-nowrap">
						{formatTime(current)} / {formatTime(duration)}
					</span>
				</div>

				{/* SECONDARY CONTROLS */}
				<div className="flex items-center justify-end gap-4 mt-1.5 sm:mt-0 sm:absolute sm:right-3 sm:bottom-2.5">
					<button
						className="text-cf-muted hover:text-cf-text text-xs sm:text-sm"
						title="Captions"
					>
						CC
					</button>

					<button
						className="text-cf-muted hover:text-cf-text text-sm"
						title="Settings"
					>
						⚙
					</button>

					<button
						className="text-cf-muted hover:text-cf-text text-sm"
						title="Fullscreen"
						onClick={() => ref?.current?.requestFullscreen?.()}
					>
						⛶
					</button>
				</div>
			</div>
		</div>
	);
});

export default VideoPlayer;
