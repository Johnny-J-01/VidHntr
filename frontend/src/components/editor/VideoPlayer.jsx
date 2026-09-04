import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

function formatTime(t) {
	if (!Number.isFinite(t) || t < 0) return "0:00";

	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = Math.floor(t % 60);

	if (h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	return `${m}:${String(s).padStart(2, "0")}`;
}

const VideoPlayer = forwardRef(function VideoPlayer(
	{ src, captionsOn, onToggleCaptions, transcript = [] },
	ref,
) {
	const containerRef = useRef(null);
	const hideTimeoutRef = useRef(null);

	const [current, setCurrent] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [showSettings, setShowSettings] = useState(false);

	const [controlsVisible, setControlsVisible] = useState(true);
	const [centerFlash, setCenterFlash] = useState(null);

	// Compute synchronized caption segment for the exact current timestamp
	const currentCaption = useMemo(() => {
		if (!captionsOn || !Array.isArray(transcript) || transcript.length === 0) {
			return null;
		}

		// Direct timestamp match
		const seg = transcript.find(
			(s) => current >= Number(s.start) && current <= Number(s.end),
		);
		if (seg) return seg.text;

		// 0.8s smooth trailing buffer between sentences
		const recent = transcript.find(
			(s) => current >= Number(s.end) && current <= Number(s.end) + 0.8,
		);
		return recent ? recent.text : null;
	}, [captionsOn, transcript, current]);

	// Auto-hide controls logic
	function resetHideTimer() {
		setControlsVisible(true);

		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
		}

		if (playing && !showSettings) {
			hideTimeoutRef.current = setTimeout(() => {
				setControlsVisible(false);
			}, 3000);
		}
	}

	useEffect(() => {
		const el = ref?.current;
		if (!el) return undefined;

		const onTime = () => setCurrent(el.currentTime);
		const onMeta = () => setDuration(el.duration || 0);
		const onPlay = () => {
			setPlaying(true);
			resetHideTimer();
		};
		const onPause = () => {
			setPlaying(false);
			setControlsVisible(true);
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
		};

		el.addEventListener("timeupdate", onTime);
		el.addEventListener("loadedmetadata", onMeta);
		el.addEventListener("play", onPlay);
		el.addEventListener("pause", onPause);

		return () => {
			el.removeEventListener("timeupdate", onTime);
			el.removeEventListener("loadedmetadata", onMeta);
			el.removeEventListener("play", onPlay);
			el.removeEventListener("pause", onPause);
			if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
		};
	}, [ref, src, playing, showSettings]);

	function triggerCenterFlash(type) {
		setCenterFlash({ type, id: Date.now() });
		setTimeout(() => setCenterFlash(null), 600);
	}

	function togglePlay() {
		const el = ref?.current;
		if (!el) return;

		if (el.paused) {
			el.play();
			triggerCenterFlash("play");
		} else {
			el.pause();
			triggerCenterFlash("pause");
		}
	}

	function skip(delta) {
		const el = ref?.current;
		if (!el) return;

		el.currentTime = Math.max(
			0,
			Math.min(duration, el.currentTime + delta),
		);
		resetHideTimer();
	}

	function seekBar(e) {
		e.stopPropagation();
		const el = ref?.current;
		if (!el || !duration) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		el.currentTime = Math.max(0, Math.min(duration, pct * duration));
		resetHideTimer();
	}

	function toggleMute() {
		const el = ref?.current;
		if (!el) return;

		const nextMuted = !muted;
		setMuted(nextMuted);
		el.muted = nextMuted;
		resetHideTimer();
	}

	function changeVolume(v) {
		const el = ref?.current;
		if (!el) return;

		const safeV = Math.max(0, Math.min(1, v));
		setVolume(safeV);
		el.volume = safeV;

		if (safeV === 0) {
			setMuted(true);
			el.muted = true;
		} else if (muted) {
			setMuted(false);
			el.muted = false;
		}
		resetHideTimer();
	}

	function changeSpeed(rate) {
		const el = ref?.current;
		if (el) {
			el.playbackRate = rate;
		}
		setPlaybackRate(rate);
		setShowSettings(false);
		resetHideTimer();
	}

	function toggleFullscreen() {
		const target = containerRef.current || ref?.current;
		if (!target) return;

		if (document.fullscreenElement) {
			document.exitFullscreen?.();
		} else {
			target.requestFullscreen?.();
		}
		resetHideTimer();
	}

	function handleKeyDown(e) {
		if (
			e.target.tagName === "INPUT" ||
			e.target.tagName === "TEXTAREA" ||
			e.target.tagName === "SELECT"
		) {
			return;
		}

		if (e.key === " " || e.key.toLowerCase() === "k") {
			e.preventDefault();
			togglePlay();
		} else if (e.key.toLowerCase() === "f") {
			e.preventDefault();
			toggleFullscreen();
		} else if (e.key.toLowerCase() === "m") {
			e.preventDefault();
			toggleMute();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			skip(-5);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			skip(5);
		}
	}

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onMouseMove={resetHideTimer}
			onMouseLeave={() => {
				if (playing && !showSettings) {
					setControlsVisible(false);
				}
			}}
			className="cf-panel overflow-hidden w-full bg-black flex flex-col rounded-xl border border-cf-border relative group select-none outline-none"
		>
			{/* VIDEO CANVAS CONTAINER */}
			<div
				onClick={togglePlay}
				className="relative bg-black aspect-video w-full flex items-center justify-center cursor-pointer overflow-hidden"
			>
				<video
					ref={ref}
					src={src}
					className="w-full h-full object-contain bg-black"
				/>

				{/* CENTER PLAY/PAUSE ANIMATED FLASH INDICATOR */}
				{centerFlash && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
						<div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur border border-cf-yellow/60 flex items-center justify-center text-cf-yellow text-2xl shadow-2xl animate-ping opacity-90">
							{centerFlash.type === "play" ? "▶" : "⏸"}
						</div>
					</div>
				)}

				{/* SYNCHRONIZED CAPTIONS OVERLAY */}
				{captionsOn && (
					<div
						className={`absolute left-4 right-4 text-center pointer-events-none transition-all duration-300 z-20 ${
							controlsVisible ? "bottom-16" : "bottom-6"
						}`}
					>
						{currentCaption ? (
							<span className="bg-black/90 text-cf-yellow font-medium text-xs sm:text-sm md:text-base px-4 py-1.5 rounded-lg shadow-2xl border border-cf-yellow/40 backdrop-blur inline-block max-w-[90%] leading-relaxed">
								{currentCaption}
							</span>
						) : (
							<span className="bg-black/80 text-cf-muted font-medium text-xs px-3 py-1 rounded shadow border border-cf-border">
								Captions Enabled
							</span>
						)}
					</div>
				)}

				{/* YOUTUBE-STYLE OVERLAY CONTROLS TOOLBAR */}
				<div
					onClick={(e) => e.stopPropagation()}
					className={`absolute bottom-0 left-0 right-0 z-30 px-3 pb-2.5 pt-10 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col gap-2 transition-opacity duration-300 ${
						controlsVisible || !playing || showSettings
							? "opacity-100 pointer-events-auto"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{/* SEEK BAR */}
					<div
						onClick={seekBar}
						className="w-full h-1.5 hover:h-2.5 rounded-full bg-white/20 cursor-pointer relative overflow-hidden transition-all group/seek mb-1"
						title="Click to seek"
					>
						<div
							className="h-full rounded-full bg-cf-yellow transition-all"
							style={{
								width: duration
									? `${(current / duration) * 100}%`
									: 0,
							}}
						/>
					</div>

					<div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap sm:flex-nowrap">
						{/* PLAY / PAUSE */}
						<button
							type="button"
							onClick={togglePlay}
							className="w-7 h-7 shrink-0 flex items-center justify-center text-cf-text hover:text-cf-yellow rounded hover:bg-white/10 transition-colors"
							title={playing ? "Pause (Space)" : "Play (Space)"}
						>
							{playing ? "⏸" : "▶"}
						</button>

						{/* REWIND 10S */}
						<button
							type="button"
							onClick={() => skip(-10)}
							className="text-cf-muted hover:text-cf-text text-xs sm:text-sm shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10"
							title="Rewind 10s (←)"
						>
							⟲10
						</button>

						{/* FORWARD 10S */}
						<button
							type="button"
							onClick={() => skip(10)}
							className="text-cf-muted hover:text-cf-text text-xs sm:text-sm shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10"
							title="Forward 10s (→)"
						>
							⟳10
						</button>

						{/* VOLUME CONTROL */}
						<div className="relative shrink-0 flex items-center group/vol">
							<button
								type="button"
								onClick={toggleMute}
								className="text-cf-muted hover:text-cf-text text-sm p-1 rounded hover:bg-white/10"
								title={muted ? "Unmute (M)" : "Mute (M)"}
							>
								{muted || volume === 0
									? "🔇"
									: volume < 0.5
										? "🔉"
										: "🔊"}
							</button>

							<div className="hidden group-hover/vol:flex sm:flex items-center ml-1 w-16 sm:w-20">
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={muted ? 0 : volume}
									onChange={(e) =>
										changeVolume(parseFloat(e.target.value))
									}
									className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-cf-yellow"
									title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
								/>
							</div>
						</div>

						{/* TIME DISPLAY */}
						<span className="text-[10px] sm:text-[11px] text-cf-muted tabular-nums shrink-0 whitespace-nowrap font-mono">
							{formatTime(current)} / {formatTime(duration)}
						</span>

						{/* SECONDARY CONTROLS */}
						<div className="flex items-center gap-2 shrink-0 ml-auto">
							{/* CC BUTTON */}
							<button
								type="button"
								onClick={onToggleCaptions}
								className={`text-xs sm:text-sm px-2 py-0.5 rounded transition-colors font-medium ${
									captionsOn
										? "text-cf-yellow bg-cf-yellow/20 border border-cf-yellow/40"
										: "text-cf-muted hover:text-cf-text hover:bg-white/10"
								}`}
								title="Toggle Captions"
							>
								CC
							</button>

							{/* SETTINGS MENU */}
							<div className="relative">
								<button
									type="button"
									onClick={() =>
										setShowSettings((prev) => !prev)
									}
									className={`text-sm p-1 rounded hover:bg-white/10 transition-colors ${
										playbackRate !== 1
											? "text-cf-yellow font-bold"
											: "text-cf-muted hover:text-cf-text"
									}`}
									title="Playback Speed"
								>
									⚙ {playbackRate !== 1 && `${playbackRate}x`}
								</button>

								{showSettings && (
									<div className="absolute right-0 bottom-full mb-2 bg-black/95 backdrop-blur border border-cf-border rounded-lg shadow-2xl py-1.5 px-1 min-w-[130px] z-50 text-xs">
										<div className="px-2 py-1 text-[10px] font-semibold text-cf-muted border-b border-cf-border mb-1">
											PLAYBACK SPEED
										</div>
										{[0.5, 0.75, 1, 1.25, 1.5, 2].map(
											(rate) => (
												<button
													key={rate}
													type="button"
													onClick={() =>
														changeSpeed(rate)
													}
													className={`w-full text-left px-2.5 py-1 rounded flex items-center justify-between hover:bg-white/10 ${
														playbackRate === rate
															? "text-cf-yellow font-bold bg-cf-yellow/10"
															: "text-cf-text"
													}`}
												>
													<span>
														{rate === 1
															? "Normal (1x)"
															: `${rate}x`}
													</span>
													{playbackRate === rate && (
														<span>✓</span>
													)}
												</button>
											),
										)}
									</div>
								)}
							</div>

							{/* FULLSCREEN */}
							<button
								type="button"
								onClick={toggleFullscreen}
								className="text-cf-muted hover:text-cf-text text-sm p-1 rounded hover:bg-white/10"
								title="Toggle Fullscreen (F)"
							>
								⛶
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

export default VideoPlayer;



