import { useEffect, useState } from "react";

const PRESETS = [
	{
		id: "youtube-shorts",
		label: "YouTube Shorts",
		ratio: "9:16",
		w: 1080,
		h: 1920,
	},
	{
		id: "instagram-reels",
		label: "Instagram Reels",
		ratio: "9:16",
		w: 1080,
		h: 1920,
	},
	{ id: "tiktok", label: "TikTok", ratio: "9:16", w: 1080, h: 1920 },
	{
		id: "generic-vertical",
		label: "Generic Vertical",
		ratio: "9:16",
		w: 1080,
		h: 1920,
	},
	{ id: "square", label: "Square", ratio: "1:1", w: 1080, h: 1080 },
	{ id: "landscape", label: "Landscape", ratio: "16:9", w: 1920, h: 1080 },
];

const QUALITIES = ["low", "medium", "high", "maximum"];

export default function ExportModal({
	open,
	onClose,
	onExport,
	defaultName,
	captions,
	exportState,
}) {
	const [name, setName] = useState(defaultName || "clip");
	const [presetId, setPresetId] = useState("tiktok");
	const [width, setWidth] = useState(1080);
	const [height, setHeight] = useState(1920);
	const [quality, setQuality] = useState("high");
	const [captionsMode, setCaptionsMode] = useState(captions || "off");
	const [cropMode, setCropMode] = useState("fill");
	useEffect(() => {
		if (!open) {
			setName(defaultName || "clip");
			setPresetId("tiktok");
			setWidth(1080);
			setHeight(1920);
			setQuality("high");
			setCaptionsMode(captions || "off");
			setCropMode("fill");
		}
	}, [open, defaultName, captions]);

	if (!open) return null;

	const preset = PRESETS.find((p) => p.id === presetId);

	function selectPreset(p) {
		setPresetId(p.id);
		setWidth(p.w);
		setHeight(p.h);
	}

	function submit() {
		onExport({
			name,
			preset: presetId,
			width,
			height,
			quality,
			captions: captionsMode,
			cropMode,
		});
	}

	const busy =
		exportState.status && !["READY", "ERROR"].includes(exportState.status);

	const done = exportState.status === "READY";

	return (
		<div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
			<div className="cf-panel w-full max-w-md p-5">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold">Export Clip</h2>

					<button
						onClick={onClose}
						className="text-cf-muted hover:text-cf-text"
					>
						✕
					</button>
				</div>

				<div className="flex flex-col gap-4">
					<div>
						<label className="text-[11px] text-cf-muted block mb-1">
							Clip name
						</label>

						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="cf-input w-full h-9 px-3 text-sm"
						/>
					</div>

					<div>
						<label className="text-[11px] text-cf-muted block mb-1.5">
							Platform preset
						</label>

						<div className="grid grid-cols-3 gap-1.5">
							{PRESETS.map((p) => (
								<button
									key={p.id}
									onClick={() => selectPreset(p)}
									className={`text-[11px] py-1.5 rounded-cf border transition ${
										presetId === p.id
											? "border-cf-yellow text-cf-yellow bg-cf-yellowDim"
											: "border-cf-border text-cf-muted hover:text-cf-text"
									}`}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="text-[11px] text-cf-muted block mb-1">
								Crop mode
							</label>

							<select
								value={cropMode}
								onChange={(e) => setCropMode(e.target.value)}
								className="cf-input w-full h-8 px-2 text-xs"
							>
								<option value="fill">
									Fill frame (crop to edges)
								</option>

								<option value="fit">
									Fit frame (keep everything, blurred
									background)
								</option>
							</select>
						</div>

						<div>
							<label className="text-[11px] text-cf-muted block mb-1">
								Captions
							</label>

							<select
								value={captionsMode}
								onChange={(e) =>
									setCaptionsMode(e.target.value)
								}
								className="cf-input w-full h-8 px-2 text-xs"
							>
								<option value="off">Off</option>
								<option value="burn">
									Auto captions (burn in)
								</option>
							</select>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-3">
						<div>
							<label className="text-[11px] text-cf-muted block mb-1">
								Aspect ratio
							</label>

							<input
								readOnly
								value={preset?.ratio}
								className="cf-input w-full h-8 px-2 text-xs"
							/>
						</div>

						<div>
							<label className="text-[11px] text-cf-muted block mb-1">
								Width
							</label>

							<input
								type="number"
								value={width}
								onChange={(e) =>
									setWidth(Number(e.target.value))
								}
								className="cf-input w-full h-8 px-2 text-xs"
							/>
						</div>

						<div>
							<label className="text-[11px] text-cf-muted block mb-1">
								Height
							</label>

							<input
								type="number"
								value={height}
								onChange={(e) =>
									setHeight(Number(e.target.value))
								}
								className="cf-input w-full h-8 px-2 text-xs"
							/>
						</div>
					</div>

					<div>
						<label className="text-[11px] text-cf-muted block mb-1.5">
							Quality
						</label>

						<div className="grid grid-cols-4 gap-1.5">
							{QUALITIES.map((q) => (
								<button
									key={q}
									onClick={() => setQuality(q)}
									className={`text-[11px] py-1.5 rounded-cf border capitalize transition ${
										quality === q
											? "border-cf-yellow text-cf-yellow bg-cf-yellowDim"
											: "border-cf-border text-cf-muted hover:text-cf-text"
									}`}
								>
									{q}
								</button>
							))}
						</div>
					</div>

					<p className="text-[11px] text-cf-muted">
						File will save as{" "}
						<span className="text-cf-text">
							{name || "clip"}_{width}x{height}.mp4
						</span>{" "}
						in your downloads.
					</p>

					{exportState.error && (
						<p className="text-[12px] text-red-400">
							{exportState.error}
						</p>
					)}

					{busy && (
						<div>
							<div className="h-1.5 rounded-full bg-cf-panel2 overflow-hidden mb-1">
								<div
									className="h-full bg-cf-yellow transition-all"
									style={{
										width: `${exportState.progress}%`,
									}}
								/>
							</div>

							<p className="text-[11px] text-cf-muted">
								{exportState.status.toLowerCase()}…{" "}
								{exportState.progress}%
							</p>
						</div>
					)}

					{done ? (
						<a
							href={exportState.downloadUrl}
							className="cf-btn-primary w-full py-2.5 text-sm text-center"
						>
							Download {exportState.filename || "clip"}
						</a>
					) : (
						<button
							onClick={submit}
							disabled={busy}
							className="cf-btn-primary w-full py-2.5 text-sm disabled:opacity-60"
						>
							{busy ? "Exporting…" : "Export Clip"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
