export default function TopBar() {
	return (
		<header className="shrink-0 border-b border-cf-border bg-cf-bg">
			<div className="px-4 lg:px-6 py-3">
				<div className="flex items-center justify-between">
					{/* LOGO */}
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-cf bg-cf-yellow flex items-center justify-center text-black text-base">
							🎬
						</div>

						<span className="font-semibold text-[15px] tracking-tight">
							ClipForge
						</span>
					</div>

					{/* PROFILE */}
					<div className="w-8 h-8 rounded-full bg-cf-panel2 border border-cf-border flex items-center justify-center text-xs text-cf-muted">
						K
					</div>
				</div>
			</div>
		</header>
	);
}
