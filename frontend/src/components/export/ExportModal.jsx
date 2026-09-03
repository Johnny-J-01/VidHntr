export default function ExportModal() {
	return (
		<div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
			<div className="cf-panel w-full max-w-md p-5">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold">Export Clip</h2>

					<button type="button" className="text-cf-muted">
						✕
					</button>
				</div>

				<div className="flex flex-col gap-4">
					<div>
						<p className="text-[11px] text-cf-muted mb-1">
							Clip name
						</p>

						<div className="cf-input w-full h-9 px-3 text-sm flex items-center">
							clip
						</div>
					</div>

					<div>
						<p className="text-[11px] text-cf-muted mb-1.5">
							Platform preset
						</p>

						<div className="grid grid-cols-3 gap-1.5">
							<button
								type="button"
								className="text-[11px] py-1.5 rounded-cf border border-cf-yellow text-cf-yellow bg-cf-yellowDim"
							>
								TikTok
							</button>

							<button
								type="button"
								className="text-[11px] py-1.5 rounded-cf border border-cf-border text-cf-muted"
							>
								Instagram
							</button>

							<button
								type="button"
								className="text-[11px] py-1.5 rounded-cf border border-cf-border text-cf-muted"
							>
								YouTube
							</button>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<p className="text-[11px] text-cf-muted mb-1">
								Crop mode
							</p>

							<div className="cf-input w-full h-8 px-2 text-xs flex items-center">
								Fill frame
							</div>
						</div>

						<div>
							<p className="text-[11px] text-cf-muted mb-1">
								Captions
							</p>

							<div className="cf-input w-full h-8 px-2 text-xs flex items-center">
								Off
							</div>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-3">
						<div>
							<p className="text-[11px] text-cf-muted mb-1">
								Aspect ratio
							</p>

							<div className="cf-input w-full h-8 px-2 text-xs flex items-center">
								9:16
							</div>
						</div>

						<div>
							<p className="text-[11px] text-cf-muted mb-1">
								Width
							</p>

							<div className="cf-input w-full h-8 px-2 text-xs flex items-center">
								1080
							</div>
						</div>

						<div>
							<p className="text-[11px] text-cf-muted mb-1">
								Height
							</p>

							<div className="cf-input w-full h-8 px-2 text-xs flex items-center">
								1920
							</div>
						</div>
					</div>

					<div>
						<p className="text-[11px] text-cf-muted mb-1.5">
							Quality
						</p>

						<div className="grid grid-cols-4 gap-1.5">
							{["Low", "Medium", "High", "Maximum"].map(
								(quality) => (
									<button
										key={quality}
										type="button"
										className={`text-[11px] py-1.5 rounded-cf border ${
											quality === "High"
												? "border-cf-yellow text-cf-yellow bg-cf-yellowDim"
												: "border-cf-border text-cf-muted"
										}`}
									>
										{quality}
									</button>
								),
							)}
						</div>
					</div>

					<button
						type="button"
						className="cf-btn-primary w-full py-2.5 text-sm"
					>
						Export Clip
					</button>
				</div>
			</div>
		</div>
	);
}
