import { useEffect, useMemo, useRef, useState } from "react";

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

	// NEW: YouTube playback state
	const [youtubeInfo, setYoutubeInfo] = useState(null);
	const [youtubeLoading, setYoutubeLoading] = useState(false);
	const [youtubeError, setYoutubeError] = useState(null);

	const videoRef = useRef(null);

	// NEW: iframe reference for YouTube player
	const youtubeRef = useRef(null);

	const search = useSearch(selectedId);
	const exp = useExport();

	const suggestions = suggestionsByVideo[selectedId] || [];

	useEffect(() => {
		let cancelled = false;

		async function refresh() {
			try {
				const list = await api.listVideos();

				if (!cancelled) {
					setVideos(list);
				}

				return list;
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
			} catch (e) {
				// Ignore transient errors while polling.
			}
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
	}, [video]);

	function seekYouTube(time) {
		if (!youtubeRef.current) {
			return;
		}

		const iframe = youtubeRef.current;

		if (!iframe.contentWindow) {
			return;
		}

		iframe.contentWindow.postMessage(
			JSON.stringify({
				event: "command",
				func: "seekTo",
				args: [Number(time) || 0, true],
			}),
			"*",
		);
	}

	function selectVideo(id) {
		setSelectedId(id);
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

		setYoutubeInfo(null);
		setYoutubeError(null);
	}

	async function handleUpload(file) {
		const { videoId } = await api.uploadVideo(file, file.name);

		const list = await api.listVideos();

		setVideos(list);
		selectVideo(videoId);
	}

	async function handleAddYouTube(url) {
		const { videoId } = await api.addYouTube(url);

		const list = await api.listVideos();

		setVideos(list);
		selectVideo(videoId);
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

		/*
		 * Uploaded/local video
		 */
		if (video?.sourceType === "upload") {
			if (videoRef.current) {
				videoRef.current.currentTime = result.start;
			}
		}

		/*
		 * YouTube video
		 */
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

	const hasTranscript =
		Boolean(video?.transcriptPath) || Boolean(video?.hasTranscript);

	const canSearch = Boolean(video) && !isError;

	const hasPlayableSource =
		video?.sourceType === "upload" &&
		(Boolean(video?.filePath) || video?.sourceType === "upload");

	const isYouTube = video?.sourceType === "youtube";

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
									src={api.videoFileUrl(video.id)}
									captionsOn={captions === "burn"}
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
													YouTube playback unavailable
												</p>

												<p className="text-xs text-cf-muted">
													{youtubeError}
												</p>
											</div>
										</div>
									) : youtubeInfo ? (
										<iframe
											ref={youtubeRef}
											className="w-full h-full"
											src={`${youtubeInfo.embedUrl}?enablejsapi=1&origin=${encodeURIComponent(
												window.location.origin,
											)}`}
											title={video.title}
											allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
											allowFullScreen
										/>
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

										if (video.sourceType === "youtube") {
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
									/>

									{/* <div className="flex items-start justify-between gap-8 pt-2 border-t border-cf-border"> */}
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
					)
				}
				right={
					// <aside className="w-[340px] shrink-0 border-l border-cf-border bg-cf-bg flex flex-col h-full p-4">
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
								/>
							)}
						</div>
					</aside>
				}
			/>
			{/* {video && (
				<ExportModal
					open={exportOpen}
					onClose={() => setExportOpen(false)}
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
			)} */}
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
