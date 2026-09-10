import { useEffect, useRef, useState, useMemo } from "react";

import { api } from "../services/api.js";
import { useSearch } from "../hooks/useSearch.js";
import { useExport } from "../hooks/useExport.js";
import AppShell from "../components/layout/AppShell.jsx";
import TopBar from "../components/layout/TopBar.jsx";
import SourcesPanel from "../components/sources/SourcesPanel.jsx";
import VideoPlayer from "../components/editor/VideoPlayer.jsx";
import Timeline from "../components/editor/Timeline.jsx";
import ClipControls, {
	ContextControls,
} from "../components/editor/ClipControls.jsx";
import CaptionControls from "../components/editor/CaptionControls.jsx";
import ResultsPanel from "../components/search/ResultsPanel.jsx";
import SuggestionsPanel from "../components/search/SuggestionsPanel.jsx";
import ExportButton from "../components/export/ExportButton.jsx";
import ExportModal from "../components/export/ExportModal.jsx";
import DeleteVideoModal from "../components/sources/DeleteVideoModal.jsx";
import { Toaster, toast } from "react-hot-toast";
import { ErrorBoundary } from "../components/ErrorBoundary";

const TERMINAL = new Set(["READY", "ERROR"]);

export default function ClipForge() {
	const [videos, setVideos] = useState([]);
	const [selectedId, setSelectedId] = useState(null);
	const [video, setVideo] = useState(null);

	const [rightMode, setRightMode] = useState("search");
	const [activeMood, setActiveMood] = useState(null);

	const [suggestionsByVideo, setSuggestionsByVideo] = useState({});
	const [suggestLoading, setSuggestLoading] = useState(false);
	const [suggestError, setSuggestError] = useState(null);

	const [clipStart, setClipStart] = useState(0);
	const [clipEnd, setClipEnd] = useState(0);
	const [originalRange, setOriginalRange] = useState({
		start: 0,
		end: 0,
	});
	const [selectedResultId, setSelectedResultId] = useState(null);
	const [playhead, setPlayhead] = useState(0);
	const [captions, setCaptions] = useState("off");

	const [exportOpen, setExportOpen] = useState(false);

	const [youtubeInfo, setYoutubeInfo] = useState(null);
	const [youtubeLoading, setYoutubeLoading] = useState(false);
	const [youtubeError, setYoutubeError] = useState(null);

	const [transcript, setTranscript] = useState([]);
	const [activeYouTubeCaption, setActiveYouTubeCaption] = useState(null);
	const [videoToDelete, setVideoToDelete] = useState(null);
	const [deletingVideo, setDeletingVideo] = useState(false);

	const videoRef = useRef(null);
	const youtubeRef = useRef(null);
	const youtubePlayerRef = useRef(null);
	const youtubeTimerRef = useRef(null);
	const ytTimeRef = useRef(0);
	const transcriptRef = useRef([]);
	const captionsRef = useRef("off");
	const lastPlayheadRef = useRef(0);

	const search = useSearch(selectedId);
	const exp = useExport();

	const suggestions = suggestionsByVideo[selectedId] || [];
	const isYouTube = video?.sourceType === "youtube";

	function showToast(message, tone = "success") {
		const options = { id: message };
		if (tone === "error") toast.error(message, options);
		else toast.success(message, options);
	}

	transcriptRef.current = transcript;
	captionsRef.current = captions;

	useEffect(() => {
		let cancelled = false;

		async function refresh() {
			try {
				const list = await api.listVideos();
				const safeList = Array.isArray(list) ? list : [];
				const now = Date.now();
				const validList = safeList.filter((v) => {
					let expiryMs = null;
					if (v.expiresAt) {
						expiryMs = new Date(v.expiresAt).getTime();
					} else if (v.createdAt) {
						expiryMs =
							new Date(v.createdAt).getTime() + 15 * 60 * 1000;
					}
					return !expiryMs || isNaN(expiryMs) || expiryMs > now;
				});

				if (!cancelled) {
					setVideos(validList);
				}

				return validList;
			} catch (e) {
				return [];
			}
		}

		refresh();

		const interval = setInterval(async () => {
			const list = await refresh();
			const stillBusy = list.some((v) => !TERMINAL.has(v.status));

			if (!stillBusy) {
				clearInterval(interval);
			}
		}, 2500);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	// Periodically remove expired videos from UI state and deselect if active
	useEffect(() => {
		const checkExpiration = () => {
			const now = Date.now();
			setVideos((prevVideos) => {
				let expiredSelected = false;
				const validVideos = prevVideos.filter((v) => {
					let expiryMs = null;
					if (v.expiresAt) {
						expiryMs = new Date(v.expiresAt).getTime();
					} else if (v.createdAt) {
						expiryMs =
							new Date(v.createdAt).getTime() + 15 * 60 * 1000;
					}

					const isExpired =
						expiryMs && !isNaN(expiryMs) && now >= expiryMs;
					if (isExpired && v.id === selectedId) {
						expiredSelected = true;
					}
					return !isExpired;
				});

				if (validVideos.length !== prevVideos.length) {
					if (expiredSelected) {
						setTimeout(() => {
							selectVideo(null);
							showToast(
								"The video has expired and was removed.",
								"error",
							);
						}, 0);
					}
					return validVideos;
				}
				return prevVideos;
			});
		};

		const timer = setInterval(checkExpiration, 1000);
		return () => clearInterval(timer);
	}, [selectedId]);

	useEffect(() => {
		if (!selectedId) {
			setVideo(null);
			return undefined;
		}

		let cancelled = false;
		let timer;

		async function poll() {
			try {
				const v = await api.getVideo(selectedId);

				if (cancelled) return;

				setVideo(v);

				if (!TERMINAL.has(v.status)) {
					timer = setTimeout(poll, 2000);
				}
			} catch (e) {}
		}

		poll();

		return () => {
			cancelled = true;

			if (timer) {
				clearTimeout(timer);
			}
		};
	}, [selectedId]);

	useEffect(() => {
		if (!selectedId) {
			setTranscript([]);
			return undefined;
		}

		let cancelled = false;

		async function loadTranscript() {
			try {
				const response = await api.getTranscript(selectedId);

				if (!cancelled && Array.isArray(response?.transcript)) {
					setTranscript(response.transcript);
				}
			} catch (e) {}
		}

		loadTranscript();

		let timer;

		if (
			video?.status &&
			video.status !== "READY" &&
			video.status !== "ERROR"
		) {
			timer = setInterval(loadTranscript, 2500);
		}

		return () => {
			cancelled = true;

			if (timer) {
				clearInterval(timer);
			}
		};
	}, [selectedId, video?.status]);

	useEffect(() => {
		if (!video || video.sourceType !== "youtube") {
			setYoutubeInfo(null);
			setYoutubeError(null);
			setYoutubeLoading(false);
			return undefined;
		}

		let cancelled = false;

		async function loadYouTubeInfo() {
			setYoutubeLoading(true);
			setYoutubeError(null);

			try {
				const data = await api.getYouTubeInfo(video.id);

				if (!cancelled) {
					setYoutubeInfo(data);
				}
			} catch (e) {
				if (!cancelled) {
					setYoutubeInfo(null);
					setYoutubeError(
						e.message || "Could not load YouTube video.",
					);
				}
			} finally {
				if (!cancelled) {
					setYoutubeLoading(false);
				}
			}
		}

		loadYouTubeInfo();

		return () => {
			cancelled = true;
		};
	}, [video?.id, video?.sourceType]);

	useEffect(() => {
		if (!isYouTube || !youtubeInfo || !youtubeRef.current) {
			return undefined;
		}

		let cancelled = false;
		let checkTimer = null;

		function startPlayer() {
			if (
				cancelled ||
				!youtubeRef.current ||
				!window.YT ||
				!window.YT.Player
			) {
				return;
			}

			if (youtubePlayerRef.current) {
				try {
					youtubePlayerRef.current.destroy();
				} catch (e) {}

				youtubePlayerRef.current = null;
			}

			youtubePlayerRef.current = new window.YT.Player(
				youtubeRef.current,
				{
					videoId: youtubeInfo.youtubeId,
					playerVars: { origin: window.location.origin },
					events: {
						onReady: () => {
							if (cancelled) return;

							if (youtubeTimerRef.current) {
								clearInterval(youtubeTimerRef.current);
							}

							youtubeTimerRef.current = setInterval(() => {
								const player = youtubePlayerRef.current;

								if (
									!player ||
									typeof player.getCurrentTime !== "function"
								) {
									return;
								}

								const time = Number(player.getCurrentTime());

								if (!Number.isFinite(time)) return;

								ytTimeRef.current = time;

								const t = transcriptRef.current;
								const caps = captionsRef.current;
								if (
									caps !== "off" &&
									Array.isArray(t) &&
									t.length > 0
								) {
									const seg = t.find(
										(s) =>
											time >= Number(s.start) &&
											time < Number(s.end),
									);
									setActiveYouTubeCaption(seg?.text ?? null);
								} else {
									setActiveYouTubeCaption(null);
								}

								if (
									Math.abs(time - lastPlayheadRef.current) >=
									0.25
								) {
									lastPlayheadRef.current = time;
									setPlayhead(time);
								}
							}, 100);
						},
					},
				},
			);
		}

		if (window.YT?.Player) {
			startPlayer();
		} else {
			const existingScript = document.querySelector(
				'script[src="https://www.youtube.com/iframe_api"]',
			);

			const previousReady = window.onYouTubeIframeAPIReady;

			window.onYouTubeIframeAPIReady = () => {
				if (typeof previousReady === "function") {
					previousReady();
				}

				startPlayer();
			};

			if (!existingScript) {
				const script = document.createElement("script");
				script.src = "https://www.youtube.com/iframe_api";
				document.body.appendChild(script);
			} else {
				checkTimer = setInterval(() => {
					if (window.YT?.Player) {
						clearInterval(checkTimer);
						checkTimer = null;
						startPlayer();
					}
				}, 100);
			}
		}

		return () => {
			cancelled = true;

			if (checkTimer) {
				clearInterval(checkTimer);
				checkTimer = null;
			}

			if (youtubeTimerRef.current) {
				clearInterval(youtubeTimerRef.current);
				youtubeTimerRef.current = null;
			}

			if (youtubePlayerRef.current) {
				try {
					youtubePlayerRef.current.destroy();
				} catch (e) {}

				youtubePlayerRef.current = null;
			}
		};
	}, [isYouTube, youtubeInfo]);

	function seekYouTube(time) {
		const player = youtubePlayerRef.current;

		if (!player || typeof player.seekTo !== "function") {
			return;
		}

		const nextTime = Number(time) || 0;

		player.seekTo(nextTime, true);
		lastPlayheadRef.current = nextTime;
		setPlayhead(nextTime);
	}

	function selectVideo(id) {
		setSelectedId(id);
		if (!id) setVideo(null);
		setRightMode("search");
		setActiveMood(null);

		search.reset();

		setSelectedResultId(null);

		setClipStart(0);
		setClipEnd(0);
		setOriginalRange({
			start: 0,
			end: 0,
		});

		setPlayhead(0);
		setCaptions("off");
		setActiveYouTubeCaption(null);

		lastPlayheadRef.current = 0;
		ytTimeRef.current = 0;

		setYoutubeInfo(null);
		setYoutubeError(null);
		setTranscript([]);
	}

	async function handleUpload(file) {
		try {
			const { videoId } = await api.uploadVideo(file, file.name);
			const list = await api.listVideos();
			const safeList = Array.isArray(list) ? list : [];
			const now = Date.now();
			const validList = safeList.filter((v) => {
				let expiryMs = null;
				if (v.expiresAt) {
					expiryMs = new Date(v.expiresAt).getTime();
				} else if (v.createdAt) {
					expiryMs = new Date(v.createdAt).getTime() + 15 * 60 * 1000;
				}
				return !expiryMs || isNaN(expiryMs) || expiryMs > now;
			});

			setVideos(validList);
			selectVideo(videoId);
			showToast(
				"Video upload started. Note: videos expire after 15 minutes.",
			);
		} catch (error) {
			showToast(
				error.code === "VIDEO_LIMIT_REACHED"
					? error.ownerType === "guest"
						? "Max upload limit reached, please login to upload more videos."
						: "Max videos limit reached, Please delete the uploaded videos to add more"
					: error.message,
				"error",
			);
		}
	}

	async function handleAddYouTube(url) {
		try {
			const { videoId } = await api.addYouTube(url);
			const list = await api.listVideos();
			const safeList = Array.isArray(list) ? list : [];
			const now = Date.now();
			const validList = safeList.filter((v) => {
				let expiryMs = null;
				if (v.expiresAt) {
					expiryMs = new Date(v.expiresAt).getTime();
				} else if (v.createdAt) {
					expiryMs = new Date(v.createdAt).getTime() + 15 * 60 * 1000;
				}
				return !expiryMs || isNaN(expiryMs) || expiryMs > now;
			});

			setVideos(validList);
			selectVideo(videoId);
			showToast("YouTube video creation started.");
		} catch (error) {
			showToast(
				error.code === "VIDEO_LIMIT_REACHED"
					? error.ownerType === "guest"
						? "Max upload limit reached, please login to upload more videos."
						: "Max videos limit reached, Please delete the uploaded videos to add more"
					: error.message,
				"error",
			);
		}
	}

	async function confirmDeleteVideo() {
		if (!videoToDelete) return;
		setDeletingVideo(true);
		try {
			await api.deleteVideo(videoToDelete.id);
			setVideos((current) =>
				current.filter((item) => item.id !== videoToDelete.id),
			);
			if (selectedId === videoToDelete.id) selectVideo(null);
			setVideoToDelete(null);
			showToast("Video deleted.");
		} catch (error) {
			showToast(error.message || "Video deletion failed.", "error");
		} finally {
			setDeletingVideo(false);
		}
	}

	function applyClip(result) {
		setClipStart(result.start);
		setClipEnd(result.end);

		setOriginalRange({
			start: result.start,
			end: result.end,
		});

		setSelectedResultId(result.id);
		setPlayhead(result.start);

		if (video?.sourceType === "upload") {
			if (videoRef.current) {
				videoRef.current.currentTime = result.start;
			}
		}

		if (video?.sourceType === "youtube") {
			seekYouTube(result.start);
		}
	}

	async function handleSearch(query) {
		setRightMode("search");
		setActiveMood(null);

		await search.search(query);
	}

	async function handleMood(mood) {
		setRightMode("search");
		setActiveMood(mood);

		await search.searchMood(mood.toLowerCase());
	}

	async function openSuggestions() {
		setRightMode("suggestions");

		if (suggestionsByVideo[selectedId] || !selectedId) {
			return;
		}

		setSuggestLoading(true);
		setSuggestError(null);

		try {
			const data = await api.getSuggestions(selectedId);

			setSuggestionsByVideo((prev) => ({
				...prev,
				[selectedId]: data.suggestions || [],
			}));
		} catch (e) {
			setSuggestError(e.message);
		} finally {
			setSuggestLoading(false);
		}
	}

	function adjustBefore(delta) {
		setClipStart((s) => {
			const next = s - delta;

			return Math.max(0, Math.min(next, clipEnd - 1));
		});
	}

	function adjustAfter(delta) {
		setClipEnd((e) => {
			const next = e + delta;
			const max = video?.duration || e + delta;

			return Math.min(max, Math.max(next, clipStart + 1));
		});
	}

	function resetRange() {
		setClipStart(originalRange.start);
		setClipEnd(originalRange.end);

		setPlayhead(originalRange.start);

		if (video?.sourceType === "upload") {
			if (videoRef.current) {
				videoRef.current.currentTime = originalRange.start;
			}
		}

		if (video?.sourceType === "youtube") {
			seekYouTube(originalRange.start);
		}
	}

	const storage = useMemo(
		() => ({
			used: "2.4 GB",
			total: "10 GB",
			percent: 24,
		}),
		[],
	);

	const isReady = video?.status === "READY";
	const isProcessing = video && !TERMINAL.has(video.status);
	const isError = video?.status === "ERROR";
	const canSearch = Boolean(video) && !isError;
	const hasPlayableSource = video?.sourceType === "upload";
	const hasClip = clipEnd > clipStart;

	return (
		<>
			<AppShell
				top={
					<TopBar
						onSearch={handleSearch}
						onMood={handleMood}
						activeMood={activeMood}
						disabled={!canSearch}
					/>
				}
				left={
					<SourcesPanel
						videos={videos}
						selectedId={selectedId}
						onSelect={selectVideo}
						onUpload={handleUpload}
						onAddYouTube={handleAddYouTube}
						onDelete={setVideoToDelete}
						storage={storage}
					/>
				}
				center={
					!video ? (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-cf-muted text-sm">
								Select a video to start finding moments.
							</p>
						</div>
					) : isError ? (
						<div className="flex-1 flex items-center justify-center px-8">
							<div className="text-center max-w-sm">
								<p className="text-sm mb-1">
									Something went wrong.
								</p>

								<p className="text-xs text-cf-muted">
									{video.error || "Video processing failed."}
								</p>
							</div>
						</div>
					) : (
						<ErrorBoundary onReset={() => selectVideo(null)}>
							<div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3 min-w-0">
										<button className="text-cf-muted hover:text-cf-text">
											←
										</button>

										<h1 className="text-[14px] font-medium truncate">
											{video.title}
										</h1>
									</div>

									<button className="text-cf-muted hover:text-cf-text">
										⋮
									</button>
								</div>

								{hasPlayableSource ? (
									<VideoPlayer
										ref={videoRef}
										videoId={video.id}
										captionsOn={captions === "burn"}
										transcript={transcript}
										onToggleCaptions={() =>
											setCaptions((prev) =>
												prev === "burn"
													? "off"
													: "burn",
											)
										}
										onTimeUpdate={(t) => setPlayhead(t)}
									/>
								) : isYouTube ? (
									<div className="aspect-video bg-black rounded overflow-hidden relative">
										{youtubeLoading ? (
											<div className="absolute inset-0 flex items-center justify-center">
												<p className="text-xs text-cf-muted">
													Loading YouTube video…
												</p>
											</div>
										) : youtubeError ? (
											<div className="absolute inset-0 flex items-center justify-center px-6">
												<div className="text-center">
													<p className="text-sm mb-1">
														YouTube playback
														unavailable
													</p>

													<p className="text-xs text-cf-muted">
														{youtubeError}
													</p>
												</div>
											</div>
										) : youtubeInfo ? (
											<>
												<div
													ref={youtubeRef}
													className="w-full h-full"
												/>

												{captions !== "off" && (
													<div className="absolute bottom-6 left-4 right-4 text-center pointer-events-none z-20">
														{activeYouTubeCaption ? (
															<span className="bg-black/90 text-cf-yellow font-medium text-xs sm:text-sm px-4 py-1.5 rounded-lg shadow-2xl border border-cf-yellow/40 backdrop-blur inline-block max-w-[90%] leading-relaxed">
																{
																	activeYouTubeCaption
																}
															</span>
														) : null}
													</div>
												)}
											</>
										) : null}
									</div>
								) : (
									<div className="aspect-video flex items-center justify-center border border-cf-border rounded">
										<div className="text-center px-6">
											<p className="text-sm mb-1">
												Video preview unavailable
											</p>

											<p className="text-xs text-cf-muted">
												{isProcessing
													? "The video is being prepared. You can already search the processed transcript."
													: "Video playback will be available when the source is prepared."}
											</p>
										</div>
									</div>
								)}

								{video.duration ? (
									<Timeline
										duration={video.duration}
										start={clipStart}
										end={clipEnd}
										playhead={playhead}
										onChange={(s, e) => {
											setClipStart(s);
											setClipEnd(e);
										}}
										onSeek={(t) => {
											setPlayhead(t);

											if (video.sourceType === "upload") {
												if (videoRef.current) {
													videoRef.current.currentTime =
														t;
												}
											}

											if (
												video.sourceType === "youtube"
											) {
												seekYouTube(t);
											}
										}}
									/>
								) : (
									<div className="text-xs text-cf-muted text-center py-2">
										Duration is being detected…
									</div>
								)}

								{isProcessing && (
									<div className="border border-cf-border rounded px-3 py-2">
										<div className="flex items-center justify-between">
											<span className="text-xs text-cf-muted">
												{video.status
													.toLowerCase()
													.replace("_", " ")}
											</span>

											<span className="text-xs text-cf-muted">
												{video.progress || 0}%
											</span>
										</div>

										<div className="mt-2 h-1 rounded bg-cf-border overflow-hidden">
											<div
												className="h-full bg-cf-yellow transition-all"
												style={{
													width: `${
														video.progress || 0
													}%`,
												}}
											/>
										</div>

										<p className="text-[11px] text-cf-muted mt-2">
											Search is available as soon as
											transcript chunks are processed.
										</p>
									</div>
								)}

								{hasClip && (
									<>
										<ClipControls
											start={clipStart}
											end={clipEnd}
											duration={video.duration}
											onChange={(s, e) => {
												setClipStart(s);
												setClipEnd(e);
											}}
										/>

										<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 sm:gap-8 pt-2 border-t border-cf-border">
											<ContextControls
												onAdjustBefore={adjustBefore}
												onAdjustAfter={adjustAfter}
												onReset={resetRange}
											/>

											<CaptionControls
												captions={captions}
												onChange={setCaptions}
											/>
										</div>

										<ExportButton
											onClick={() => setExportOpen(true)}
											disabled={!isReady || !hasClip}
										/>
									</>
								)}

								{!hasClip && (
									<p className="text-xs text-cf-muted text-center py-6">
										{isProcessing
											? "Search the processed transcript to find moments while the video is still being transcribed."
											: "Search for a moment or pick an AI suggestion to select a clip."}
									</p>
								)}
							</div>
						</ErrorBoundary>
					)
				}
				right={
					<aside className="w-full h-full border-l border-cf-border bg-cf-bg flex flex-col p-4">
						<div className="flex items-center gap-5 border-b border-cf-border mb-3 pb-2 text-[13px]">
							<button
								onClick={() => setRightMode("search")}
								className={`pb-1 ${
									rightMode === "search"
										? "text-cf-yellow border-b-2 border-cf-yellow"
										: "text-cf-muted"
								}`}
							>
								Search Results
							</button>

							<button
								onClick={openSuggestions}
								disabled={!isReady}
								className={`pb-1 ${
									rightMode === "suggestions"
										? "text-cf-yellow border-b-2 border-cf-yellow"
										: "text-cf-muted"
								} ${
									!isReady
										? "opacity-40 cursor-not-allowed"
										: ""
								}`}
							>
								AI Suggestions
							</button>
						</div>

						<div className="flex-1 min-h-0">
							{rightMode === "search" ? (
								<ResultsPanel
									results={search.results}
									loading={search.loading}
									error={search.error}
									query={search.lastQuery}
									selectedId={selectedResultId}
									onSelect={applyClip}
									thumbnailUrl={
										video
											? api.videoThumbnailUrl(video.id)
											: null
									}
								/>
							) : (
								<SuggestionsPanel
									suggestions={suggestions}
									loading={suggestLoading}
									error={suggestError}
									selectedId={selectedResultId}
									onSelect={applyClip}
									thumbnailUrl={
										video
											? api.videoThumbnailUrl(video.id)
											: null
									}
								/>
							)}
						</div>
					</aside>
				}
			/>
			<DeleteVideoModal
				video={videoToDelete}
				deleting={deletingVideo}
				onCancel={() => !deletingVideo && setVideoToDelete(null)}
				onConfirm={confirmDeleteVideo}
			/>
			<Toaster
				position="top-right"
				toastOptions={{
					duration: 4000,
					style: {
						background: "#171717",
						color: "#f4f4f5",
						border: "1px solid #363636",
						maxWidth: "min(24rem, calc(100vw - 2rem))",
						fontSize: "0.8125rem",
					},
					success: {
						iconTheme: { primary: "#facc15", secondary: "#171717" },
					},
				}}
			/>
			{video && exportOpen && (
				<ExportModal
					key={exp.exportId || "new-export"}
					open={true}
					onClose={() => {
						setExportOpen(false);
						exp.resetExport();
					}}
					onExport={(payload) =>
						exp.startExport({
							videoId: video.id,
							start: clipStart,
							end: clipEnd,
							...payload,
						})
					}
					defaultName={video.title}
					captions={captions}
					exportState={exp}
				/>
			)}
		</>
	);
}
